const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os'); // Adicione esta linha

// Variável global para janela de carregamento
let loadingScreen;
let mainWindow;

// Função para carregar o arquivo de configuração
function loadConfig() {
  try {
    // Isso precisa ser relativo ao app.asar
    const configPath = path.join(app.getAppPath(), '../config.json');
    
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    } else {
      console.error('Arquivo de configuração não encontrado:', configPath);
      return { mainURL: "http://localhost:8081" };
    }
  } catch (error) {
    console.error('Erro ao carregar o arquivo de configuração:', error);
    // Retornar configuração padrão em caso de erro
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

function createWindow() {
  // Cria a tela de carregamento primeiro
  createLoadingScreen();
  
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
      
      // Remover o arquivo temporário HTML
      const tempPath = path.join(__dirname, 'loading.html');
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  });

  // (Opcional) Abre o DevTools para debug
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

// Fecha o aplicativo quando todas as janelas são fechadas (exceto no macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Recria a janela se o app for ativado e nenhuma janela estiver aberta (comum no macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
