const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const log = require('electron-log');

class InstallerCreator {
    constructor(workDir) {
        this.workDir = workDir;
    }
    
    /**
     * Localiza o instalador gerado pelo electron-builder
     * @param {String} targetOS - Sistema operacional alvo
     * @param {String} appName - Nome do aplicativo
     * @returns {String|null} - Caminho para o instalador ou null se não encontrado
     */
    findInstallerPath(targetOS, appName = 'YouHostAppBase') {
        const releaseDir = path.join(this.workDir, 'youhost', 'electron', 'release');
        let installerPath = null;
        
        // Nomes de arquivos esperados por SO
        switch (targetOS) {
            case 'win32':
                installerPath = path.join(releaseDir, `${appName} Setup.exe`);
                if (!fs.existsSync(installerPath)) {
                    // Tentar padrão alternativo
                    const exeFiles = fs.readdirSync(releaseDir).filter(f => f.endsWith('.exe'));
                    if (exeFiles.length > 0) {
                        installerPath = path.join(releaseDir, exeFiles[0]);
                    }
                }
                break;
                
            case 'darwin':
                installerPath = path.join(releaseDir, `${appName}.dmg`);
                if (!fs.existsSync(installerPath)) {
                    // Tentar padrão alternativo
                    const dmgFiles = fs.readdirSync(releaseDir).filter(f => f.endsWith('.dmg'));
                    if (dmgFiles.length > 0) {
                        installerPath = path.join(releaseDir, dmgFiles[0]);
                    }
                }
                break;
                
            case 'linux':
                installerPath = path.join(releaseDir, `${appName}.AppImage`);
                if (!fs.existsSync(installerPath)) {
                    // Tentar padrões alternativos
                    const appImageFiles = fs.readdirSync(releaseDir).filter(f => 
                        f.endsWith('.AppImage') || f.endsWith('.deb') || f.endsWith('.rpm')
                    );
                    if (appImageFiles.length > 0) {
                        installerPath = path.join(releaseDir, appImageFiles[0]);
                    }
                }
                break;
        }
        
        // Se não encontrou pelo nome específico, tenta encontrar qualquer instalador
        if (!installerPath || !fs.existsSync(installerPath)) {
            log.warn(`Instalador não encontrado pelo nome esperado: ${installerPath}`);
            
            // Procurar por qualquer arquivo que pareça um instalador
            try {
                const files = fs.readdirSync(releaseDir);
                const installerExtensions = {
                    'win32': ['.exe', '.msi'],
                    'darwin': ['.dmg', '.pkg'],
                    'linux': ['.AppImage', '.deb', '.rpm', '.snap']
                };
                
                const matchingFiles = files.filter(file => 
                    installerExtensions[targetOS]?.some(ext => file.endsWith(ext))
                );
                
                if (matchingFiles.length > 0) {
                    installerPath = path.join(releaseDir, matchingFiles[0]);
                    log.info(`Encontrado instalador alternativo: ${installerPath}`);
                }
            } catch (error) {
                log.error('Erro ao procurar por instaladores alternativos:', error);
            }
        }
        
        if (installerPath && fs.existsSync(installerPath)) {
            return installerPath;
        }
        
        return null;
    }
    
    /**
     * Copia o instalador para uma localização mais acessível
     * @param {String} installerPath - Caminho para o instalador
     * @param {String} destinationType - Tipo de destino ('desktop', 'downloads', 'custom')
     * @param {String} customPath - Caminho personalizado (se destinationType for 'custom')
     * @returns {String} - Caminho para o instalador copiado
     */
    copyInstallerToAccessibleLocation(installerPath, destinationType = 'desktop', customPath = null) {
        if (!installerPath || !fs.existsSync(installerPath)) {
            throw new Error('Instalador não encontrado');
        }
        
        let targetDir;
        
        switch (destinationType) {
            case 'desktop':
                targetDir = app.getPath('desktop');
                break;
            case 'downloads':
                targetDir = app.getPath('downloads');
                break;
            case 'custom':
                targetDir = customPath;
                break;
            default:
                targetDir = app.getPath('desktop');
        }
        
        if (!targetDir || !fs.existsSync(targetDir)) {
            throw new Error(`Diretório de destino inválido: ${targetDir}`);
        }
        
        const fileName = path.basename(installerPath);
        const targetPath = path.join(targetDir, fileName);
        
        // Copiar o arquivo
        fs.copyFileSync(installerPath, targetPath);
        log.info(`Instalador copiado para: ${targetPath}`);
        
        return targetPath;
    }
    
    /**
     * Cria um arquivo README com instruções de instalação
     * @param {String} targetPath - Caminho onde o instalador foi salvo
     * @param {String} appName - Nome do aplicativo
     * @param {String} targetOS - Sistema operacional alvo
     */
    createReadme(targetPath, appName, targetOS) {
        const readmePath = path.join(path.dirname(targetPath), `${appName}-README.txt`);
        
        let instructions = `# ${appName} - Instruções de Instalação\n\n`;
        
        switch (targetOS) {
            case 'win32':
                instructions += `
Para instalar ${appName} no Windows:

1. Dê um duplo clique no arquivo "${path.basename(targetPath)}"
2. Siga as instruções na tela para completar a instalação
3. Após a instalação, você encontrará o aplicativo no menu Iniciar

Se receber um aviso de segurança, clique em "Mais informações" e depois em "Executar assim mesmo".
`;
                break;
                
            case 'darwin':
                instructions += `
Para instalar ${appName} no macOS:

1. Dê um duplo clique no arquivo "${path.basename(targetPath)}"
2. Arraste o ícone do aplicativo para a pasta Aplicativos
3. Na primeira execução, clique com o botão direito no aplicativo e selecione "Abrir"
4. Confirme que deseja abrir o aplicativo

Se o macOS impedir a execução, vá em Preferências do Sistema > Segurança e Privacidade e clique em "Abrir Assim Mesmo".
`;
                break;
                
            case 'linux':
                instructions += `
Para instalar ${appName} no Linux:

1. Dê permissão de execução ao arquivo: chmod +x "${path.basename(targetPath)}"
2. Execute o arquivo: ./"${path.basename(targetPath)}"

Em algumas distribuições Linux, você pode instalar o aplicativo clicando duas vezes no arquivo.

Alternativamente, se o arquivo for um .deb ou .rpm, use o gerenciador de pacotes da sua distribuição:
- Debian/Ubuntu: sudo dpkg -i "${path.basename(targetPath)}"
- Red Hat/Fedora: sudo rpm -i "${path.basename(targetPath)}"
`;
                break;
        }
        
        fs.writeFileSync(readmePath, instructions);
        log.info(`Arquivo README criado em: ${readmePath}`);
        
        return readmePath;
    }
}

module.exports = InstallerCreator;