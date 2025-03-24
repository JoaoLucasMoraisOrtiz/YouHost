const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const log = require('electron-log');

class ElectronBuilder {
    constructor(workDir, sourceElectronDir) {
        this.workDir = workDir;
        this.sourceElectronDir = sourceElectronDir;
        this.youhostDir = path.join(workDir, 'youhost');
        this.electronDir = path.join(this.youhostDir, 'electron');
    }
    
    /**
     * Prepara o ambiente para construir o aplicativo Electron
     * @returns {Promise<void>}
     */
    async prepare() {
        // Criar diretórios
        if (!fs.existsSync(this.youhostDir)) {
            fs.mkdirSync(this.youhostDir, { recursive: true });
        }
        
        if (!fs.existsSync(this.electronDir)) {
            fs.mkdirSync(this.electronDir, { recursive: true });
        }
        
        // Copiar os arquivos necessários do YouHost para o diretório de trabalho
        const filesToCopy = [
            'main.js',
            'server-manager.js',
            'package.json',
            'assets'
        ];
        
        for (const file of filesToCopy) {
            const sourcePath = path.join(this.sourceElectronDir, file);
            const targetPath = path.join(this.electronDir, file);
            
            if (fs.existsSync(sourcePath)) {
                if (fs.statSync(sourcePath).isDirectory()) {
                    fs.mkdirSync(targetPath, { recursive: true });
                    fs.cpSync(sourcePath, targetPath, { recursive: true });
                } else {
                    fs.copyFileSync(sourcePath, targetPath);
                }
            } else {
                log.warn(`Arquivo ou diretório não encontrado: ${sourcePath}`);
            }
        }
        
        // Copiar o arquivo config.json para o diretório raiz do youhost
        fs.copyFileSync(
            path.join(this.workDir, 'config.json'),
            path.join(this.youhostDir, 'config.json')
        );
        
        log.info('Preparação do ambiente concluída');
    }
    
    /**
     * Instala as dependências do Electron
     * @returns {Promise<void>}
     */
    async installDependencies() {
        log.info('Instalando dependências do electron...');
        await this.executeCommand('npm install', { cwd: this.electronDir });
        log.info('Dependências instaladas com sucesso');
    }
    
    /**
     * Executa o build do aplicativo Electron
     * @param {String} targetOS - Sistema operacional alvo (win32, darwin, linux)
     * @returns {Promise<String>} - Caminho para o diretório de saída
     */
    async buildApp(targetOS) {
        log.info(`Criando build para ${targetOS}...`);
        let buildCommand = 'npm run build';
        
        // Cross-platform build
        if (targetOS !== process.platform) {
            switch (targetOS) {
                case 'win32':
                    buildCommand = 'npx electron-builder --win';
                    break;
                case 'darwin':
                    buildCommand = 'npx electron-builder --mac';
                    break;
                case 'linux':
                    buildCommand = 'npx electron-builder --linux';
                    break;
            }
        }
        
        await this.executeCommand(buildCommand, { cwd: this.electronDir });
        log.info('Build do Electron concluído');
        
        return path.join(this.electronDir, 'release');
    }
    
    /**
     * Função auxiliar para executar comandos shell
     * @param {String} command - Comando a ser executado
     * @param {Object} options - Opções para o comando
     * @returns {Promise<String>} - Saída do comando
     */
    executeCommand(command, options = {}) {
        return new Promise((resolve, reject) => {
            exec(command, options, (error, stdout, stderr) => {
                if (error) {
                    log.error(`Erro ao executar comando: ${command}`, error);
                    log.error(`Stdout: ${stdout}`);
                    log.error(`Stderr: ${stderr}`);
                    reject(error);
                    return;
                }
                
                log.info(`Comando executado: ${command}`);
                log.debug(`Stdout: ${stdout}`);
                resolve(stdout);
            });
        });
    }
    
    /**
     * Personaliza o app Electron com o nome e ícone do projeto
     * @param {String} appName - Nome do aplicativo
     * @param {String} iconPath - Caminho para o ícone (opcional)
     */
    customizeApp(appName, iconPath = null) {
        try {
            // Personalizar package.json
            const packageJsonPath = path.join(this.electronDir, 'package.json');
            if (fs.existsSync(packageJsonPath)) {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                
                // Atualizar nome e informações do produto
                packageJson.name = appName.toLowerCase().replace(/\s+/g, '-');
                
                if (packageJson.build) {
                    packageJson.build.productName = appName;
                    packageJson.build.appId = `com.${appName.toLowerCase().replace(/\s+/g, '')}.app`;
                }
                
                // Salvar alterações
                fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
            }
            
            // Copiar ícone personalizado, se fornecido
            if (iconPath && fs.existsSync(iconPath)) {
                const assetsDir = path.join(this.electronDir, 'assets');
                if (!fs.existsSync(assetsDir)) {
                    fs.mkdirSync(assetsDir, { recursive: true });
                }
                
                fs.copyFileSync(iconPath, path.join(assetsDir, 'mainIcon.png'));
            }
            
            log.info('Aplicativo personalizado com sucesso');
        } catch (error) {
            log.error('Erro ao personalizar aplicativo:', error);
        }
    }
}

module.exports = ElectronBuilder;