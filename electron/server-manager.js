const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');

class ServerManager {
    constructor(configPath) {
        this.configPath = configPath;
        this.serverProcess = null;
        this.lockFilePath = path.join(os.tmpdir(), 'youhost-server-lock.json');
        this.instanceCount = 0;
    }

    // Carrega a configuração
    loadConfig() {
        try {
            // Use o mesmo método de verificação de vários caminhos
            const { app } = require('electron');
            const possiblePaths = [
                this.configPath,                                                   // Caminho fornecido no construtor
                path.join(app.getAppPath(), '../config.json'),                     // Relativo ao app.asar
                path.join(path.dirname(app.getPath('exe')), 'config.json'),        // Junto ao executável
                path.join(path.dirname(app.getPath('exe')), '../config.json'),     // Um nível acima do executável
                path.join(path.dirname(app.getPath('exe')), 'resources/config.json') // Na pasta resources
            ];

            for (const configPath of possiblePaths) {
                console.log(`ServerManager tentando carregar config.json de: ${configPath}`);
                if (fs.existsSync(configPath)) {
                    console.log(`ServerManager encontrou configuração em: ${configPath}`);
                    const configData = fs.readFileSync(configPath, 'utf8');
                    return JSON.parse(configData);
                }
            }

            console.error('ServerManager: Arquivo de configuração não encontrado em nenhum local');
            return { 
                mainURL: "http://localhost:8081", 
                siteFiles: "",
                startTrigger: "BROWSER=none expo start --web --port [port]"
            };
        } catch (error) {
            console.error('Erro ao carregar o arquivo de configuração:', error);
            return { 
                mainURL: "http://localhost:8081", 
                siteFiles: "",
                startTrigger: "BROWSER=none expo start --web --port [port]"
            };
        }
    }

    // Extrai a porta da URL
    getPortFromURL(urlString) {
        try {
            const parsedUrl = new URL(urlString);
            return parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
        } catch (error) {
            console.error('Erro ao extrair porta da URL:', error);
            return '8081'; // Porta padrão
        }
    }

    // Verifica se o servidor já está em execução
    isServerRunning() {
        try {
            if (fs.existsSync(this.lockFilePath)) {
                const lockData = JSON.parse(fs.readFileSync(this.lockFilePath, 'utf8'));
                return lockData.running;
            }
            return false;
        } catch (error) {
            console.error('Erro ao verificar o status do servidor:', error);
            return false;
        }
    }

    // Atualiza o arquivo de lock
    updateLockFile(running, increment = 0) {
        try {
            let lockData = { running, count: 1 };

            if (fs.existsSync(this.lockFilePath)) {
                lockData = JSON.parse(fs.readFileSync(this.lockFilePath, 'utf8'));
                lockData.running = running;
                lockData.count += increment;
            }

            this.instanceCount = lockData.count;
            fs.writeFileSync(this.lockFilePath, JSON.stringify(lockData));
        } catch (error) {
            console.error('Erro ao atualizar o arquivo de lock:', error);
        }
    }

    // Prepara o comando substituindo todos os placeholders
    prepareCommand(commandTemplate, config) {
        let command = commandTemplate;
        
        // Primeiro, trata o caso especial do [port] se não estiver definido em triggerParams
        if (!config.triggerParams || !config.triggerParams.port) {
            const port = this.getPortFromURL(config.mainURL);
            command = command.replace(/\[port\]/g, port);
        }
        
        // Agora, substitui todos os parâmetros definidos em triggerParams
        if (config.triggerParams) {
            console.log('Substituindo parâmetros:', JSON.stringify(config.triggerParams));
            
            // Itera sobre todas as chaves em triggerParams
            Object.keys(config.triggerParams).forEach(paramKey => {
                const paramValue = config.triggerParams[paramKey];
                const regex = new RegExp(`\\[${paramKey}\\]`, 'g');
                
                // Substitui todas as ocorrências do placeholder
                command = command.replace(regex, paramValue);
                console.log(`Substituído [${paramKey}] por ${paramValue}`);
            });
        }
        
        // Verifica se ainda existem placeholders não substituídos e avisa
        const remainingPlaceholders = command.match(/\[\w+\]/g);
        if (remainingPlaceholders) {
            console.warn('Atenção: Placeholders não substituídos:', remainingPlaceholders);
        }
        
        return command;
    }

    // Inicializa e inicia o servidor
    async startServer() {
        const config = this.loadConfig();

        if (!config.siteFiles) {
            console.error('Diretório do site não configurado');
            return false;
        }

        if (!config.startTrigger) {
            console.error('Comando de inicialização não configurado');
            return false;
        }

        // Verifica se o servidor já está rodando
        if (this.isServerRunning()) {
            console.log('Servidor já está em execução. Incrementando contador...');
            this.updateLockFile(true, 1);
            return true;
        }

        const siteDir = path.resolve(config.siteFiles);
        console.log(`Diretório do projeto: ${siteDir}`);

        // Verifica se o diretório existe
        if (!fs.existsSync(siteDir)) {
            console.error(`Diretório não encontrado: ${siteDir}`);
            return false;
        }

        // Prepara o comando com os valores reais
        const startCommand = this.prepareCommand(config.startTrigger, config);
        console.log(`Comando de inicialização: ${startCommand}`);

        try {
            // Marca como executando no arquivo de lock
            this.updateLockFile(true, 1);

            console.log(`Iniciando servidor em: ${siteDir} com comando: ${startCommand}`);

            // Detecta o sistema operacional
            const platform = process.platform;
            console.log(`Sistema operacional detectado: ${platform}`);

            // Executa o comando
            this.serverProcess = spawn(startCommand, {
                cwd: siteDir,
                shell: true,
                detached: true,
                stdio: 'pipe'
            });

            // Logs do processo
            this.serverProcess.stdout.on('data', (data) => {
                console.log(`Servidor: ${data}`);
            });

            this.serverProcess.stderr.on('data', (data) => {
                console.error(`Servidor Erro: ${data}`);
            });

            this.serverProcess.on('close', (code) => {
                console.log(`Processo do servidor encerrado com código: ${code}`);
                if (this.serverProcess) {
                    this.serverProcess = null;
                    this.updateLockFile(false);
                }
            });

            // Espera até que o serviço esteja pronto
            console.log('Aguardando inicialização do servidor...');
            await new Promise((resolve) => setTimeout(resolve, 10000));
            console.log('Servidor iniciado com sucesso!');
            return true;
        } catch (error) {
            console.error('Erro ao iniciar o servidor:', error);
            this.updateLockFile(false);
            return false;
        }
    }

    // Finaliza o processo do servidor
    stopServer() {
        // Decrementa o contador no arquivo de lock
        this.updateLockFile(true, -1);

        // Se ainda houver outras instâncias rodando, não encerre o servidor
        if (this.instanceCount > 0) {
            console.log(`Mantendo servidor em execução. ${this.instanceCount} instâncias ativas.`);
            return;
        }

        console.log('Finalizando processo do servidor...');

        if (this.serverProcess) {
            // Em Windows, precisamos usar um método diferente para matar o processo
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', this.serverProcess.pid, '/f', '/t']);
            } else {
                process.kill(-this.serverProcess.pid, 'SIGINT');
            }

            this.serverProcess = null;
        }

        // Atualiza o arquivo de lock para indicar que o servidor não está mais executando
        this.updateLockFile(false);
    }
}

module.exports = ServerManager;