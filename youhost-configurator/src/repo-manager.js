const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const log = require('electron-log');

class RepoManager {
    constructor(workDir) {
        this.workDir = workDir;
    }
    
    /**
     * Clona um repositório GitHub no diretório de trabalho
     * @param {Object} config - Configuração com repo, token e frontendPath
     * @returns {String} - Caminho para os arquivos do frontend
     */
    async cloneRepository(config) {
        const git = simpleGit();
        const repoUrl = config.token ? 
            `https://${config.token}@github.com/${config.repo.replace('https://github.com/', '')}` :
            config.repo;
        
        log.info('Clonando repositório:', config.repo);
        
        try {
            // Criar o diretório de repositório
            const repoDir = path.join(this.workDir, 'repo');
            if (!fs.existsSync(repoDir)) {
                fs.mkdirSync(repoDir, { recursive: true });
            }
            
            // Clonar o repositório
            await git.clone(repoUrl, repoDir);
            log.info('Repositório clonado com sucesso');
            
            // Se existir uma pasta frontend específica, mova apenas ela
            if (config.frontendPath) {
                const frontendFullPath = path.join(repoDir, config.frontendPath);
                const targetPath = path.join(this.workDir, 'frontend');
                
                if (fs.existsSync(frontendFullPath)) {
                    // Copia apenas a pasta do frontend
                    fs.mkdirSync(targetPath, { recursive: true });
                    fs.cpSync(frontendFullPath, targetPath, { recursive: true });
                    log.info('Pasta frontend copiada:', frontendFullPath);
                    
                    return targetPath;
                } else {
                    throw new Error(`Pasta do frontend não encontrada: ${config.frontendPath}`);
                }
            } else {
                // Se não, use o repositório inteiro
                return repoDir;
            }
        } catch (error) {
            log.error('Erro ao clonar repositório:', error);
            throw new Error(`Falha ao clonar repositório: ${error.message}`);
        }
    }
    
    /**
     * Verifica se há package.json no diretório e retorna informações
     * @param {String} dir - Diretório para verificar
     * @returns {Object} - Informações sobre o projeto
     */
    getProjectInfo(dir) {
        try {
            const packagePath = path.join(dir, 'package.json');
            if (fs.existsSync(packagePath)) {
                const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                
                return {
                    name: packageJson.name || 'unknown',
                    version: packageJson.version || '1.0.0',
                    hasPackageJson: true,
                    scripts: packageJson.scripts || {},
                    dependencies: {
                        ...packageJson.dependencies || {},
                        ...packageJson.devDependencies || {}
                    }
                };
            }
            
            return {
                name: 'unknown',
                version: '1.0.0',
                hasPackageJson: false,
                scripts: {},
                dependencies: {}
            };
        } catch (error) {
            log.error('Erro ao obter informações do projeto:', error);
            return {
                name: 'unknown',
                version: '1.0.0',
                hasPackageJson: false,
                scripts: {},
                dependencies: {},
                error: error.message
            };
        }
    }
    
    /**
     * Detecta automaticamente o tipo de projeto e comandos adequados
     * @param {String} dir - Diretório do projeto 
     * @returns {Object} - Informações sobre o tipo de projeto
     */
    detectProjectType(dir) {
        const info = this.getProjectInfo(dir);
        
        // Verificar por framework específico na lista de dependências
        const deps = info.dependencies;
        
        if (deps.expo || deps['expo-cli']) {
            return {
                type: 'expo',
                command: 'BROWSER=none npx expo start --web --port [port] --no-open',
                defaultPort: 8081
            };
        } else if (deps.react && !deps.next) {
            return {
                type: 'react',
                command: 'npm start -- --port [port]',
                defaultPort: 3000
            };
        } else if (deps.next) {
            return {
                type: 'next',
                command: 'npm run dev -- -p [port]',
                defaultPort: 3000
            };
        } else if (deps.vue || deps['@vue/cli-service']) {
            return {
                type: 'vue',
                command: 'npm run serve -- --port [port]',
                defaultPort: 8080
            };
        } else if (deps.angular || deps['@angular/core']) {
            return {
                type: 'angular',
                command: 'ng serve --port [port]',
                defaultPort: 4200
            };
        } else if (deps.express) {
            return {
                type: 'express',
                command: 'node app.js', // Sem porta padrão, depende da implementação
                defaultPort: 3000
            };
        }
        
        // Verificar scripts disponíveis
        const scripts = info.scripts;
        if (scripts.start) {
            return {
                type: 'generic-npm',
                command: 'npm start',
                defaultPort: 3000
            };
        } else if (scripts.dev) {
            return {
                type: 'generic-npm',
                command: 'npm run dev',
                defaultPort: 3000
            };
        } else if (scripts.serve) {
            return {
                type: 'generic-npm',
                command: 'npm run serve',
                defaultPort: 3000
            };
        }
        
        // Tipo desconhecido
        return {
            type: 'unknown',
            command: '',
            defaultPort: 8080
        };
    }
}

module.exports = RepoManager;