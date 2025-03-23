const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ServerManager = require('./server-manager'); // Nome atualizado

// Variáveis globais
let loadingScreen;
let mainWindow;
let serverManager; // Nome atualizado

// Modifique a função loadConfig()
function loadConfig() {
  try {
    // Lista de possíveis locais para o config.json
    const possiblePaths = [
      path.join(app.getAppPath(), '../config.json'),                     // Relativo ao app.asar
      path.join(path.dirname(app.getPath('exe')), 'config.json'),        // Junto ao executável
      path.join(path.dirname(app.getPath('exe')), '../config.json'),     // Um nível acima do executável
      path.join(path.dirname(app.getPath('exe')), 'resources/config.json') // Na pasta resources
    ];
    
    // Verifique todos os possíveis caminhos
    for (const configPath of possiblePaths) {
      console.log(`Tentando carregar config.json de: ${configPath}`);
      if (fs.existsSync(configPath)) {
        console.log(`Arquivo de configuração encontrado em: ${configPath}`);
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
      }
    }
    
    console.error('Arquivo de configuração não encontrado em nenhum local conhecido');
    return { mainURL: "http://localhost:8081" };
  } catch (error) {
    console.error('Erro ao carregar o arquivo de configuração:', error);
    return { mainURL: "http://localhost:8081" };
  }
}

function createLoadingScreen() {
  loadingScreen = new BrowserWindow({
    width: 400,
    height: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Caminho para o ícone
  const iconPath = path.join(app.getAppPath(), 'assets', 'mainIcon.png');

  // Crie um HTML simples para exibir a imagem
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: transparent;
          }
          img {
            max-width: 100%;
            max-height: 100%;
          }
        </style>
      </head>
      <body>
        <img src="${iconPath}" alt="Loading">
      </body>
    </html>
  `;

  // Use o diretório temporário do sistema
  const tempPath = path.join(os.tmpdir(), `youhost-loading-${Date.now()}.html`);
  fs.writeFileSync(tempPath, htmlContent);
  
  // Carregue o HTML
  loadingScreen.loadFile(tempPath);
  loadingScreen.center();
}

// Função assíncrona para criar a janela principal
async function createWindow() {
  // Cria a tela de carregamento primeiro
  createLoadingScreen();
  
  // Inicializa o gerenciador de servidor
  const configPath = path.join(app.getAppPath(), '../config.json');
  serverManager = new ServerManager(configPath);
  
  // Inicia o servidor
  console.log("Iniciando servidor...");
  await serverManager.startServer();
  console.log("Servidor iniciado, criando janela principal...");
  
  // Carrega a configuração
  const config = loadConfig();
  
  // Cria a janela principal com dimensões definidas
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Não mostrar ainda
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Carrega a URL do site a partir do arquivo de configuração
  mainWindow.loadURL(config.mainURL);

  // Quando a página principal terminar de carregar, fecha a tela de carregamento
  mainWindow.webContents.once('did-finish-load', () => {
    // Mostrar janela principal
    mainWindow.show();
    
    // Fechar tela de carregamento
    if (loadingScreen) {
      loadingScreen.close();
      loadingScreen = null;
    }
  });

  // Quando a janela principal for fechada
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

// Fecha o aplicativo quando todas as janelas são fechadas
app.on('window-all-closed', () => {
  // Para o servidor ao fechar o aplicativo
  if (serverManager) {
    console.log("Parando o servidor...");
    serverManager.stopServer();
  }
  
  if (process.platform !== 'darwin') app.quit();
});

// Recria a janela se o app for ativado e nenhuma janela estiver aberta
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Antes de sair, certifique-se de parar o servidor
app.on('before-quit', () => {
  if (serverManager) {
    console.log("Parando o servidor antes de sair...");
    serverManager.stopServer();
  }
});