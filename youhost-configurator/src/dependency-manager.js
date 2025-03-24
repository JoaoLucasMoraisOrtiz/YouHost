const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const log = require('electron-log');

class DependencyManager {
    constructor(workDir) {
        this.workDir = workDir;
        this.scriptDir = path.join(workDir, 'installer-scripts');
        
        // Cria o diretório de scripts
        if (!fs.existsSync(this.scriptDir)) {
            fs.mkdirSync(this.scriptDir, { recursive: true });
        }
        
        // Gerenciadores de pacotes por sistema operacional
        this.packageManagers = {
            'linux': {
                'apt': 'apt-get install -y',
                'apt-get': 'apt-get install -y',
                'yum': 'yum install -y',
                'dnf': 'dnf install -y',
                'pacman': 'pacman -S --noconfirm',
                'zypper': 'zypper install -y',
                'snap': 'snap install',
                'flatpak': 'flatpak install -y'
            },
            'darwin': {
                'brew': 'brew install',
                'port': 'port install',
                'mas': 'mas install'
            },
            'win32': {
                'choco': 'choco install -y',
                'scoop': 'scoop install',
                'winget': 'winget install -e'
            }
        };
    }
    
    /**
     * Detecta o gerenciador de pacotes disponível no sistema
     * @param {String} targetOS - Sistema operacional alvo
     * @returns {Object} - Gerenciadores de pacotes disponíveis
     */
    getAvailablePackageManagers(targetOS) {
        const availableManagers = {};
        const managers = this.packageManagers[targetOS] || {};
        
        for (const [name, cmd] of Object.entries(managers)) {
            availableManagers[name] = {
                command: cmd,
                available: true, // Por padrão, presumimos que está disponível
                isDefault: false
            };
        }
        
        // Definir gerenciadores padrão por SO
        if (targetOS === 'linux') {
            if (availableManagers.apt) availableManagers.apt.isDefault = true;
            else if (availableManagers.dnf) availableManagers.dnf.isDefault = true;
            else if (availableManagers.pacman) availableManagers.pacman.isDefault = true;
        } else if (targetOS === 'darwin') {
            if (availableManagers.brew) availableManagers.brew.isDefault = true;
        } else if (targetOS === 'win32') {
            if (availableManagers.choco) availableManagers.choco.isDefault = true;
        }
        
        return availableManagers;
    }
    
    /**
     * Sugere dependências com base no tipo de projeto
     * @param {String} projectType - Tipo de projeto
     * @param {String} targetOS - Sistema operacional alvo
     * @returns {Array} - Lista de dependências sugeridas
     */
    suggestDependencies(projectType, targetOS) {
        const suggestions = [];
        
        switch (projectType) {
            case 'expo':
            case 'react':
            case 'next':
            case 'vue':
            case 'angular':
            case 'express':
            case 'generic-npm':
                suggestions.push({
                    name: 'nodejs',
                    displayName: 'Node.js',
                    description: 'JavaScript runtime environment',
                    version: 'LTS',
                    required: true,
                    packageNames: {
                        'apt': 'nodejs npm',
                        'yum': 'nodejs npm',
                        'dnf': 'nodejs npm',
                        'pacman': 'nodejs npm',
                        'brew': 'node',
                        'choco': 'nodejs-lts'
                    }
                });
                break;
                
            case 'php':
            case 'laravel':
                suggestions.push({
                    name: 'php',
                    displayName: 'PHP',
                    description: 'PHP scripting language',
                    version: '8.1',
                    required: true,
                    packageNames: {
                        'apt': 'php8.1-cli php8.1-common php8.1-curl',
                        'yum': 'php php-cli php-common',
                        'dnf': 'php php-cli php-common',
                        'pacman': 'php',
                        'brew': 'php',
                        'choco': 'php'
                    }
                });
                break;
                
            case 'java':
            case 'spring':
                suggestions.push({
                    name: 'java',
                    displayName: 'Java JRE',
                    description: 'Java Runtime Environment',
                    version: '17',
                    required: true,
                    packageNames: {
                        'apt': 'openjdk-17-jre',
                        'yum': 'java-17-openjdk',
                        'dnf': 'java-17-openjdk',
                        'pacman': 'jre17-openjdk',
                        'brew': 'openjdk@17',
                        'choco': 'openjdk'
                    }
                });
                break;
        }
        
        return suggestions;
    }
    
    /**
     * Gera scripts de instalação para as dependências
     * @param {Array} dependencies - Lista de dependências a instalar
     * @param {String} packageManager - Gerenciador de pacotes a usar
     * @param {String} targetOS - Sistema operacional alvo
     * @returns {Object} - Caminhos para os scripts gerados
     */
    generateInstallationScripts(dependencies, packageManager, targetOS) {
        const scripts = {};
        
        // Script de pré-instalação (verificações)
        const preInstallScript = this.createPreInstallScript(packageManager, targetOS);
        scripts.preInstall = preInstallScript;
        
        // Script de instalação principal
        const installScript = this.createInstallScript(dependencies, packageManager, targetOS);
        scripts.install = installScript;
        
        // Script de pós-instalação (verificação)
        const postInstallScript = this.createPostInstallScript(dependencies, targetOS);
        scripts.postInstall = postInstallScript;
        
        return scripts;
    }
    
    /**
     * Cria script de pré-instalação para verificar e instalar o gerenciador de pacotes
     * @param {String} packageManager - Gerenciador de pacotes a verificar/instalar
     * @param {String} targetOS - Sistema operacional alvo
     * @returns {String} - Caminho para o script
     */
    createPreInstallScript(packageManager, targetOS) {
        let script = '';
        
        if (targetOS === 'linux') {
            script = `#!/bin/bash
echo "Verificando gerenciador de pacotes: ${packageManager}"

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar se o gerenciador de pacotes está instalado
if ! command_exists ${packageManager}; then
    echo "Gerenciador de pacotes ${packageManager} não encontrado!"
    
    # Verificar qual gerenciador base está disponível
    if command_exists apt-get; then
        echo "Usando apt-get para instalar pacotes básicos"
        sudo apt-get update
        # Se precisar instalar outro gerenciador, faça aqui
    elif command_exists dnf; then
        echo "Usando dnf para instalar pacotes básicos"
        sudo dnf check-update
        # Se precisar instalar outro gerenciador, faça aqui
    elif command_exists pacman; then
        echo "Usando pacman para instalar pacotes básicos"
        sudo pacman -Sy
        # Se precisar instalar outro gerenciador, faça aqui
    else
        echo "ERRO: Não foi possível encontrar um gerenciador de pacotes suportado!"
        exit 1
    fi
fi

echo "Preparação concluída!"
`;
        } else if (targetOS === 'darwin') {
            script = `#!/bin/bash
echo "Verificando gerenciador de pacotes: ${packageManager}"

# Função para verificar se um comando existe
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verificar se o Homebrew está instalado (caso seja o gerenciador escolhido)
if [ "${packageManager}" = "brew" ] && ! command_exists brew; then
    echo "Homebrew não encontrado. Tentando instalar..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    if ! command_exists brew; then
        echo "ERRO: Falha ao instalar o Homebrew!"
        exit 1
    fi
fi

echo "Preparação concluída!"
`;
        } else if (targetOS === 'win32') {
            script = `@echo off
echo Verificando gerenciador de pacotes: ${packageManager}

REM Verificar se o Chocolatey está instalado (caso seja o gerenciador escolhido)
if "${packageManager}"=="choco" (
    where choco >nul 2>nul
    if %ERRORLEVEL% neq 0 (
        echo Chocolatey não encontrado. Tentando instalar...
        @powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))"
        
        REM Verificar se a instalação foi bem-sucedida
        where choco >nul 2>nul
        if %ERRORLEVEL% neq 0 (
            echo ERRO: Falha ao instalar o Chocolatey!
            exit /b 1
        )
    )
)

echo Preparação concluída!
`;
        }
        
        // Salvar o script
        const scriptPath = path.join(this.scriptDir, `pre-install-${targetOS}.${targetOS === 'win32' ? 'bat' : 'sh'}`);
        fs.writeFileSync(scriptPath, script);
        
        // Tornar o script executável em sistemas Unix
        if (targetOS !== 'win32') {
            fs.chmodSync(scriptPath, 0o755);
        }
        
        return scriptPath;
    }
    
    /**
     * Cria script de instalação para as dependências
     * @param {Array} dependencies - Lista de dependências
     * @param {String} packageManager - Gerenciador de pacotes
     * @param {String} targetOS - Sistema operacional alvo
     * @returns {String} - Caminho para o script
     */
    createInstallScript(dependencies, packageManager, targetOS) {
        let script = '';
        const managerCmd = this.packageManagers[targetOS]?.[packageManager] || '';
        
        if (!managerCmd) {
            throw new Error(`Gerenciador de pacotes não suportado: ${packageManager} para ${targetOS}`);
        }
        
        if (targetOS === 'linux' || targetOS === 'darwin') {
            script = `#!/bin/bash
echo "Instalando dependências com ${packageManager}..."

`;
            
            // Para gerenciadores como apt, precisamos fazer update antes
            if (['apt', 'apt-get', 'dnf', 'yum', 'pacman'].includes(packageManager)) {
                const updateCmd = packageManager === 'pacman' ? 'sudo pacman -Sy' : 
                                 (packageManager === 'apt' || packageManager === 'apt-get') ? 'sudo apt-get update' :
                                 (packageManager === 'dnf' || packageManager === 'yum') ? 'sudo dnf check-update' : '';
                
                if (updateCmd) {
                    script += `# Atualizar índices de pacotes
${updateCmd}
if [ $? -ne 0 ]; then
    echo "ATENÇÃO: Erro ao atualizar índices de pacotes"
    # Continuar mesmo com erro
fi

`;
                }
            }
            
            // Instalar cada dependência
            dependencies.forEach(dep => {
                const packageName = dep.packageNames[packageManager] || dep.name;
                
                script += `# Instalar ${dep.displayName}
echo "Instalando ${dep.displayName}..."
sudo ${managerCmd} ${packageName}
if [ $? -ne 0 ]; then
    echo "ERRO: Falha ao instalar ${dep.displayName}!"
    ${dep.required ? 'exit 1' : 'echo "Continuando apesar do erro, pois essa dependência não é obrigatória"'}
fi

`;
            });
            
            script += `echo "Instalação concluída!"
`;
        } else if (targetOS === 'win32') {
            script = `@echo off
echo Instalando dependências com ${packageManager}...

`;
            
            // Instalar cada dependência
            dependencies.forEach(dep => {
                const packageName = dep.packageNames[packageManager] || dep.name;
                
                script += `REM Instalar ${dep.displayName}
echo Instalando ${dep.displayName}...
${managerCmd} ${packageName}
if %ERRORLEVEL% neq 0 (
    echo ERRO: Falha ao instalar ${dep.displayName}!
    ${dep.required ? 'exit /b 1' : 'echo Continuando apesar do erro, pois essa dependência não é obrigatória'}
)

`;
            });
            
            script += `echo Instalação concluída!
`;
        }
        
        // Salvar o script
        const scriptPath = path.join(this.scriptDir, `install-${targetOS}.${targetOS === 'win32' ? 'bat' : 'sh'}`);
        fs.writeFileSync(scriptPath, script);
        
        // Tornar o script executável em sistemas Unix
        if (targetOS !== 'win32') {
            fs.chmodSync(scriptPath, 0o755);
        }
        
        return scriptPath;
    }
    
    /**
     * Cria script de pós-instalação para verificar dependências
     * @param {Array} dependencies - Lista de dependências a verificar
     * @param {String} targetOS - Sistema operacional alvo
     * @returns {String} - Caminho para o script
     */
    createPostInstallScript(dependencies, targetOS) {
        let script = '';
        
        if (targetOS === 'linux' || targetOS === 'darwin') {
            script = `#!/bin/bash
echo "Verificando dependências instaladas..."

# Verificar cada dependência
`;
            
            // Comandos para verificar cada tipo de dependência
            dependencies.forEach(dep => {
                switch (dep.name) {
                    case 'nodejs':
                        script += `# Verificar Node.js
echo "Verificando Node.js..."
node --version
if [ $? -ne 0 ]; then
    echo "AVISO: Node.js não parece estar instalado corretamente!"
    ${dep.required ? 'exit 1' : ''}
else
    echo "Node.js está instalado e funcionando"
fi

`;
                        break;
                    case 'php':
                        script += `# Verificar PHP
echo "Verificando PHP..."
php --version
if [ $? -ne 0 ]; then
    echo "AVISO: PHP não parece estar instalado corretamente!"
    ${dep.required ? 'exit 1' : ''}
else
    echo "PHP está instalado e funcionando"
fi

`;
                        break;
                    case 'java':
                        script += `# Verificar Java
echo "Verificando Java..."
java -version
if [ $? -ne 0 ]; then
    echo "AVISO: Java não parece estar instalado corretamente!"
    ${dep.required ? 'exit 1' : ''}
else
    echo "Java está instalado e funcionando"
fi

`;
                        break;
                }
            });
            
            script += `echo "Verificação concluída!"
`;
        } else if (targetOS === 'win32') {
            script = `@echo off
echo Verificando dependências instaladas...

`;
            
            // Comandos para verificar cada tipo de dependência
            dependencies.forEach(dep => {
                switch (dep.name) {
                    case 'nodejs':
                        script += `REM Verificar Node.js
echo Verificando Node.js...
node --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo AVISO: Node.js não parece estar instalado corretamente!
    ${dep.required ? 'exit /b 1' : ''}
) else (
    echo Node.js está instalado e funcionando
)

`;
                        break;
                    case 'php':
                        script += `REM Verificar PHP
echo Verificando PHP...
php --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo AVISO: PHP não parece estar instalado corretamente!
    ${dep.required ? 'exit /b 1' : ''}
) else (
    echo PHP está instalado e funcionando
)

`;
                        break;
                    case 'java':
                        script += `REM Verificar Java
echo Verificando Java...
java -version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo AVISO: Java não parece estar instalado corretamente!
    ${dep.required ? 'exit /b 1' : ''}
) else (
    echo Java está instalado e funcionando
)

`;
                        break;
                }
            });
            
            script += `echo Verificação concluída!
`;
        }
        
        // Salvar o script
        const scriptPath = path.join(this.scriptDir, `post-install-${targetOS}.${targetOS === 'win32' ? 'bat' : 'sh'}`);
        fs.writeFileSync(scriptPath, script);
        
        // Tornar o script executável em sistemas Unix
        if (targetOS !== 'win32') {
            fs.chmodSync(scriptPath, 0o755);
        }
        
        return scriptPath;
    }
    
    /**
     * Modifica o instalador para incluir os scripts de instalação de dependências
     * @param {String} installerPath - Caminho para o instalador
     * @param {Object} scripts - Caminhos para os scripts de instalação
     * @param {String} targetOS - Sistema operacional alvo
     */
    async integrateScriptsWithInstaller(electronBuilderDir, scripts, targetOS) {
        // Esta implementação depende do tipo de instalador
        // Para simplicidade, vamos integrar adicionando arquivos NSIS customizados para Windows
        // ou scripts para Linux/macOS
        
        // Para Windows (NSIS)
        if (targetOS === 'win32') {
            const nsisScriptPath = path.join(electronBuilderDir, 'installer.nsh');
            const nsisScript = `
!macro customInit
  ; Executar o script de pré-instalação
  ExecWait '"$TEMP\\pre-install-win32.bat"'
!macroend

!macro customInstall
  ; Copiar scripts para o diretório temporário
  CopyFiles "$INSTDIR\\resources\\installer-scripts\\pre-install-win32.bat" "$TEMP"
  CopyFiles "$INSTDIR\\resources\\installer-scripts\\install-win32.bat" "$TEMP"
  CopyFiles "$INSTDIR\\resources\\installer-scripts\\post-install-win32.bat" "$TEMP"
  
  ; Executar o script de instalação
  ExecWait '"$TEMP\\install-win32.bat"'
  
  ; Executar o script de pós-instalação
  ExecWait '"$TEMP\\post-install-win32.bat"'
!macroend
`;
            fs.writeFileSync(nsisScriptPath, nsisScript);
        }
        
        // Para Linux/macOS, adicionar scripts ao Makefile ou pkg-scripts
        // Em uma implementação mais avançada, você precisaria customizar
        // os scripts de instalação específicos de cada tipo de instalador
    }
    
    /**
     * Modifica o package.json para incluir scripts de instalação como recursos
     * @param {String} packageJsonPath - Caminho para o package.json
     * @param {Object} scripts - Caminhos para os scripts
     */
    async updatePackageJson(packageJsonPath, scripts) {
        if (!fs.existsSync(packageJsonPath)) {
            throw new Error(`Arquivo package.json não encontrado: ${packageJsonPath}`);
        }
        
        // Lê o arquivo original
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Adiciona caminho dos scripts no extraResources para serem incluídos no build
        if (!packageJson.build) {
            packageJson.build = {};
        }
        
        if (!packageJson.build.extraResources) {
            packageJson.build.extraResources = [];
        }
        
        // Adicionar diretório de scripts como recurso extra
        const scriptsRelativePath = path.relative(path.dirname(packageJsonPath), this.scriptDir);
        packageJson.build.extraResources.push({
            "from": scriptsRelativePath,
            "to": "installer-scripts"
        });
        
        // Escreve o arquivo atualizado
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
        
        log.info(`package.json atualizado para incluir scripts de instalação`);
    }
}

module.exports = DependencyManager;