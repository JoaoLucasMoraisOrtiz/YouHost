const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const log = require('electron-log');
const Store = require('electron-store');
const simpleGit = require('simple-git');

// No main.js, substitua as funções diretas pelos módulos
const RepoManager = require('./src/repo-manager');
const ConfigBuilder = require('./src/config-builder');
const ElectronBuilder = require('./src/electron-builder');
const InstallerCreator = require('./src/installer-creator');
const DependencyManager = require('./src/dependency-manager');

// Configurações persistentes
const store = new Store();

// Variáveis globais
let mainWindow;
let currentStep = 1;
let configData = {
  repo: '',
  token: '',
  frontendPath: '',
  mainURL: 'http://localhost:8081',
  startTrigger: '',
  triggerParams: {},
  targetOS: process.platform
};

// Diretório de trabalho temporário
const workDir = path.join(app.getPath('temp'), 'youhost-builder');

// Configuração de logging
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs/main.log');
log.catchErrors();

// Criação da janela principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets/images/icon.png')
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => mainWindow = null);
  
  // Carregar dados salvos se existirem
  const savedConfig = store.get('lastConfig');
  if (savedConfig) {
    configData = { ...configData, ...savedConfig };
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('load-config', configData);
    });
  }
}

// Inicialização do app
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Handlers de IPC para comunicação com o renderer
ipcMain.on('save-config', (event, data) => {
  configData = { ...configData, ...data };
  store.set('lastConfig', configData);
  event.reply('config-saved', true);
});

ipcMain.on('select-directory', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    event.reply('directory-selected', result.filePaths[0]);
  }
});

ipcMain.on('get-package-managers', (event, targetOS) => {
  const dependencyManager = new DependencyManager(workDir);
  const managers = dependencyManager.getAvailablePackageManagers(targetOS);
  event.reply('package-managers', managers);
});

ipcMain.on('get-suggested-dependencies', (event, projectType, targetOS) => {
  const dependencyManager = new DependencyManager(workDir);
  const suggestions = dependencyManager.suggestDependencies(projectType, targetOS);
  event.reply('suggested-dependencies', suggestions);
});

ipcMain.on('open-file-location', (event, filePath) => {
  if (fs.existsSync(filePath)) {
    const dirPath = path.dirname(filePath);
    shell.openPath(dirPath);
  }
});

ipcMain.on('start-process', async (event) => {
  try {
    // Passo 1: Preparar diretório de trabalho
    await prepareWorkDirectory();
    
    // Instanciar os gerenciadores
    const repoManager = new RepoManager(workDir);
    const configBuilder = new ConfigBuilder(workDir);
    const electronBuilder = new ElectronBuilder(workDir, path.join(__dirname, '..', 'electron'));
    const installerCreator = new InstallerCreator(workDir);
    const dependencyManager = new DependencyManager(workDir);
    
    // Passo 2: Clonar o repositório
    event.reply('update-progress', { step: 'clone', message: 'Clonando repositório...' });
    configData.siteFiles = await repoManager.cloneRepository(configData);
    
    // Detectar o tipo de projeto
    const projectInfo = repoManager.detectProjectType(configData.siteFiles);
    configData.projectType = projectInfo.type;
    
    // Passo 3: Construir arquivo config.json
    event.reply('update-progress', { step: 'config', message: 'Gerando arquivo de configuração...' });
    const configPath = configBuilder.buildConfig(configData);
    
    // Passo 3.5: Gerar scripts de instalação para dependências
    if (configData.dependencies && configData.dependencies.length > 0 && configData.packageManager) {
      event.reply('update-progress', { 
        step: 'dependencies', 
        message: 'Gerando scripts de instalação de dependências...' 
      });
      
      const scripts = dependencyManager.generateInstallationScripts(
        configData.dependencies,
        configData.packageManager,
        configData.targetOS
      );
      
      // Integrar scripts com o instalador
      await dependencyManager.integrateScriptsWithInstaller(
        electronBuilder.electronDir,
        scripts,
        configData.targetOS
      );
      
      // Atualizar package.json para incluir scripts como recursos
      const packageJsonPath = path.join(electronBuilder.electronDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        await dependencyManager.updatePackageJson(packageJsonPath, scripts);
      }
    }
    
    // Passo 4: Build do aplicativo Electron
    event.reply('update-progress', { step: 'build', message: 'Compilando aplicativo...' });
    await electronBuilder.prepare();
    await electronBuilder.installDependencies();
    await electronBuilder.buildApp(configData.targetOS);
    
    // Passo 5: Criar instalador
    event.reply('update-progress', { step: 'installer', message: 'Criando instalador...' });
    const installerPath = installerCreator.findInstallerPath(configData.targetOS);
    const finalPath = installerCreator.copyInstallerToAccessibleLocation(installerPath);
    installerCreator.createReadme(finalPath, 'YouHostAppBase', configData.targetOS);
    
    // Sucesso!
    event.reply('process-complete', {
      success: true,
      message: 'Aplicativo criado com sucesso!',
      installerPath: finalPath
    });
  } catch (error) {
    log.error('Erro durante o processo:', error);
    event.reply('process-error', {
      message: `Erro: ${error.message}`
    });
  }
});

// Funções de processamento
async function prepareWorkDirectory() {
  // Limpar e criar diretório de trabalho
  if (fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  fs.mkdirSync(workDir, { recursive: true });
  log.info('Diretório de trabalho preparado:', workDir);
}

async function cloneRepository() {
  const git = simpleGit();
  const repoUrl = configData.token ? 
    `https://${configData.token}@github.com/${configData.repo.replace('https://github.com/', '')}` :
    configData.repo;
  
  log.info('Clonando repositório:', configData.repo);
  
  try {
    await git.clone(repoUrl, path.join(workDir, 'repo'));
    log.info('Repositório clonado com sucesso');
    
    // Se existir uma pasta frontend específica, mova apenas ela
    if (configData.frontendPath) {
      const frontendFullPath = path.join(workDir, 'repo', configData.frontendPath);
      const targetPath = path.join(workDir, 'frontend');
      
      if (fs.existsSync(frontendFullPath)) {
        // Copia apenas a pasta do frontend
        fs.mkdirSync(targetPath, { recursive: true });
        fs.cpSync(frontendFullPath, targetPath, { recursive: true });
        log.info('Pasta frontend copiada:', frontendFullPath);
        
        // Atualiza o caminho do frontend para o config.json
        configData.siteFiles = targetPath;
      } else {
        throw new Error(`Pasta do frontend não encontrada: ${configData.frontendPath}`);
      }
    } else {
      // Se não, use o repositório inteiro
      configData.siteFiles = path.join(workDir, 'repo');
    }
  } catch (error) {
    log.error('Erro ao clonar repositório:', error);
    throw new Error(`Falha ao clonar repositório: ${error.message}`);
  }
}

async function buildConfigFile() {
  const configPath = path.join(workDir, 'config.json');
  
  // Construir o objeto de configuração
  const config = {
    mainURL: configData.mainURL,
    siteFiles: configData.siteFiles,
    startTrigger: configData.startTrigger,
    triggerParams: configData.triggerParams
  };
  
  // Salvar como JSON
  fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
  log.info('Arquivo config.json gerado:', configPath);
  
  return configPath;
}

async function buildElectronApp() {
  // Copiar os arquivos do YouHost para o diretório de trabalho
  const youhostDir = path.join(workDir, 'youhost');
  fs.mkdirSync(youhostDir, { recursive: true });
  
  // Copiar os arquivos do electron
  const electronDir = path.join(youhostDir, 'electron');
  fs.mkdirSync(electronDir, { recursive: true });
  
  // Copiar os arquivos necessários do YouHost para o diretório de trabalho
  const sourceElectronDir = path.join(__dirname, '..', 'electron');
  
  // Lista de arquivos e diretórios a serem copiados
  const filesToCopy = [
    'main.js',
    'server-manager.js',
    'package.json',
    'assets'
  ];
  
  for (const file of filesToCopy) {
    const sourcePath = path.join(sourceElectronDir, file);
    const targetPath = path.join(electronDir, file);
    
    if (fs.existsSync(sourcePath)) {
      if (fs.statSync(sourcePath).isDirectory()) {
        fs.mkdirSync(targetPath, { recursive: true });
        fs.cpSync(sourcePath, targetPath, { recursive: true });
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }
  
  // Copiar o arquivo config.json para o diretório raiz do youhost
  fs.copyFileSync(
    path.join(workDir, 'config.json'),
    path.join(youhostDir, 'config.json')
  );
  
  // Executar npm install no diretório electron
  log.info('Instalando dependências do electron...');
  await executeCommand('npm install', { cwd: electronDir });
  
  // Executar o build para o sistema operacional alvo
  log.info(`Criando build para ${configData.targetOS}...`);
  let buildCommand = 'npm run build';
  
  if (configData.targetOS !== process.platform) {
    // Cross-platform build usando electron-builder
    switch (configData.targetOS) {
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
  
  await executeCommand(buildCommand, { cwd: electronDir });
  log.info('Build do Electron concluído');
  
  // Caminho para o aplicativo compilado
  return path.join(electronDir, 'release');
}

async function createInstaller() {
  // Caminho para o instalador gerado pelo electron-builder
  let installerPath;
  
  switch (configData.targetOS) {
    case 'win32':
      installerPath = path.join(workDir, 'youhost', 'electron', 'release', 'YouHostAppBase Setup.exe');
      break;
    case 'darwin':
      installerPath = path.join(workDir, 'youhost', 'electron', 'release', 'YouHostAppBase.dmg');
      break;
    case 'linux':
      installerPath = path.join(workDir, 'youhost', 'electron', 'release', 'YouHostAppBase.AppImage');
      break;
  }
  
  // Verificar se o instalador foi gerado
  if (fs.existsSync(installerPath)) {
    // Copiar para um local mais acessível
    const targetPath = path.join(app.getPath('desktop'), path.basename(installerPath));
    fs.copyFileSync(installerPath, targetPath);
    log.info('Instalador criado em:', targetPath);
    return targetPath;
  } else {
    throw new Error('Falha ao criar o instalador. Arquivo não encontrado.');
  }
}

// Função auxiliar para executar comandos shell
function executeCommand(command, options = {}) {
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