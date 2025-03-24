const fs = require('fs');
const path = require('path');
const log = require('electron-log');

class ConfigBuilder {
    constructor(workDir) {
        this.workDir = workDir;
    }
    
    /**
     * Cria o arquivo config.json com as configurações para o YouHost
     * @param {Object} config - Configurações a serem salvas
     * @returns {String} - Caminho para o arquivo config.json
     */
    buildConfig(config) {
        const configPath = path.join(this.workDir, 'config.json');
        
        // Construir o objeto de configuração
        const configJson = {
            mainURL: config.mainURL,
            siteFiles: config.siteFiles,
            startTrigger: config.startTrigger,
            triggerParams: config.triggerParams
        };
        
        // Adicionar parâmetros específicos (se não existirem)
        if (!configJson.triggerParams.port && config.mainURL) {
            try {
                const url = new URL(config.mainURL);
                configJson.triggerParams.port = url.port || 
                    (url.protocol === 'https:' ? '443' : '80');
            } catch (error) {
                log.warn('URL inválida, usando porta padrão 8081');
                configJson.triggerParams.port = 8081;
            }
        }
        
        // Salvar como JSON formatado
        fs.writeFileSync(configPath, JSON.stringify(configJson, null, 4));
        log.info('Arquivo config.json gerado:', configPath);
        
        return configPath;
    }
    
    /**
     * Valida a configuração e retorna erros se houverem
     * @param {Object} config - Configuração a ser validada 
     * @returns {Array} - Lista de erros, vazia se tudo estiver correto
     */
    validateConfig(config) {
        const errors = [];
        
        // Verificar campos obrigatórios
        if (!config.mainURL) {
            errors.push('URL principal não informada');
        } else {
            try {
                // Verificar se a URL é válida
                new URL(config.mainURL);
            } catch (error) {
                errors.push('URL principal inválida');
            }
        }
        
        if (!config.siteFiles) {
            errors.push('Diretório do site não informado');
        } else if (!fs.existsSync(config.siteFiles)) {
            errors.push(`Diretório do site não existe: ${config.siteFiles}`);
        }
        
        if (!config.startTrigger) {
            errors.push('Comando de inicialização não informado');
        }
        
        return errors;
    }
    
    /**
     * Sugere configurações com base no tipo de projeto
     * @param {Object} projectInfo - Informações do projeto
     * @param {String} siteFilesPath - Caminho para os arquivos do site
     * @returns {Object} - Configuração sugerida
     */
    suggestConfig(projectInfo, siteFilesPath) {
        const suggestedConfig = {
            mainURL: `http://localhost:${projectInfo.defaultPort || 8081}`,
            siteFiles: siteFilesPath,
            startTrigger: projectInfo.command || '',
            triggerParams: {
                port: projectInfo.defaultPort || 8081
            }
        };
        
        // Personalizar para tipos de projeto específicos
        switch (projectInfo.type) {
            case 'expo':
                suggestedConfig.startTrigger = 'BROWSER=none npx expo start --web --port [port] --no-open';
                break;
            case 'react':
                suggestedConfig.triggerParams.HOST = 'localhost';
                break;
            case 'angular':
                suggestedConfig.triggerParams.host = 'localhost';
                break;
        }
        
        return suggestedConfig;
    }
}

module.exports = ConfigBuilder;