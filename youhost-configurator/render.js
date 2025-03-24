const { ipcRenderer } = require('electron');

console.log('Renderer script loaded');

// Estado da aplicação
let currentStep = 1;
let configData = {
  repo: '',
  token: '',
  frontendPath: '',
  mainURL: 'http://localhost:8081',
  startTrigger: 'BROWSER=none npx expo start --web --port [port]',
  triggerParams: { port: 8081 },
  targetOS: process.platform,
  packageManager: '',
  dependencies: []
};

// Elementos DOM
document.addEventListener('DOMContentLoaded', () => {
  // Inicialização
  setupEventListeners();
  showStep(1);
  
  // Carregar opções de SO
  const targetOSRadios = document.querySelectorAll('input[name="targetOS"]');
  if (targetOSRadios) {
    targetOSRadios.forEach(radio => {
      if (radio.value === process.platform) {
        radio.checked = true;
      }
    });
  }
});

// Mostrar etapa atual
function showStep(stepNumber) {
  // Atualiza classes de etapas
  const steps = document.querySelectorAll('.step');
  if (steps) {
    steps.forEach(step => {
      if (parseInt(step.dataset.step) <= stepNumber) {
        step.classList.add('active');
      } else {
        step.classList.remove('active');
      }
    });
  }

  // Mostra o painel atual
  const stepPanes = document.querySelectorAll('.step-pane');
  if (stepPanes) {
    stepPanes.forEach(pane => pane.classList.remove('active'));
    const currentPane = document.getElementById(`step${stepNumber}`);
    if (currentPane) {
      currentPane.classList.add('active');
    }
  }
  
  currentStep = stepNumber;
  
  // Se estamos na etapa de dependências, carregue os gerenciadores de pacotes
  if (stepNumber === 3) {
    loadPackageManagers(configData.targetOS);
    // Solicitar dependências sugeridas se o tipo de projeto for detectado
    if (configData.projectType) {
      ipcRenderer.send('get-suggested-dependencies', configData.projectType, configData.targetOS);
    }
  }
}

// Salvar dados do formulário
function saveStepData() {
  switch(currentStep) {
    case 1:
      const repoInput = document.getElementById('repo');
      const tokenInput = document.getElementById('token');
      const frontendPathInput = document.getElementById('frontendPath');
      
      if (repoInput) configData.repo = repoInput.value;
      if (tokenInput) configData.token = tokenInput.value;
      if (frontendPathInput) configData.frontendPath = frontendPathInput.value;
      break;
      
    case 2:
      const mainURLInput = document.getElementById('mainURL');
      const startTriggerInput = document.getElementById('startTrigger');
      
      if (mainURLInput) configData.mainURL = mainURLInput.value;
      if (startTriggerInput) configData.startTrigger = startTriggerInput.value;
      
      // Coletando parâmetros
      configData.triggerParams = {};
      const paramRows = document.querySelectorAll('.param-row');
      if (paramRows) {
        paramRows.forEach(row => {
          const nameInput = row.querySelector('.param-name');
          const valueInput = row.querySelector('.param-value');
          if (nameInput && valueInput && nameInput.value && valueInput.value) {
            configData.triggerParams[nameInput.value] = valueInput.value;
          }
        });
      }
      
      // Sistema operacional alvo
      const osRadios = document.querySelectorAll('input[name="targetOS"]');
      if (osRadios) {
        osRadios.forEach(radio => {
          if (radio.checked) {
            configData.targetOS = radio.value;
          }
        });
      }
      break;
      
    case 3: // Etapa de dependências
      const packageManagerSelect = document.getElementById('packageManager');
      if (packageManagerSelect) {
        configData.packageManager = packageManagerSelect.value;
      }
      configData.dependencies = collectDependencies();
      break;
  }
  
  // Salvar na store através do main process
  ipcRenderer.send('save-config', configData);
}

// Carregar dados do formulário
function loadFormData() {
  // Etapa 1: Repositório
  const repoInput = document.getElementById('repo');
  const tokenInput = document.getElementById('token');
  const frontendPathInput = document.getElementById('frontendPath');
  
  if (repoInput) repoInput.value = configData.repo || '';
  if (tokenInput) tokenInput.value = configData.token || '';
  if (frontendPathInput) frontendPathInput.value = configData.frontendPath || '';
  
  // Etapa 2: Configuração
  const mainURLInput = document.getElementById('mainURL');
  const startTriggerInput = document.getElementById('startTrigger');
  
  if (mainURLInput) mainURLInput.value = configData.mainURL || 'http://localhost:8081';
  if (startTriggerInput) startTriggerInput.value = configData.startTrigger || 'BROWSER=none npx expo start --web --port [port]';
  
  // Preencher parâmetros
  const paramContainer = document.getElementById('triggerParams');
  if (paramContainer) {
    paramContainer.innerHTML = ''; // Limpar parâmetros anteriores
    
    if (configData.triggerParams) {
      Object.entries(configData.triggerParams).forEach(([name, value]) => {
        addParamRow(name, value);
      });
    }
    
    // Adicionar um vazio se não houver parâmetros
    if (paramContainer.children.length === 0) {
      addParamRow('port', '8081');
    }
  }
  
  // Selecionar sistema operacional
  const osRadios = document.querySelectorAll('input[name="targetOS"]');
  if (osRadios) {
    osRadios.forEach(radio => {
      if (radio.value === configData.targetOS) {
        radio.checked = true;
      }
    });
  }
  
  // Etapa 3: Dependências
  // Será carregado quando a etapa for mostrada
}

// Atualizar resumo
function updateSummary() {
  const elements = {
    repo: document.getElementById('summary-repo'),
    frontend: document.getElementById('summary-frontend'),
    url: document.getElementById('summary-url'),
    command: document.getElementById('summary-command'),
    params: document.getElementById('summary-params'),
    os: document.getElementById('summary-os'),
    dependencies: document.getElementById('summary-dependencies')
  };
  
  if (elements.repo) elements.repo.textContent = configData.repo || '-';
  if (elements.frontend) elements.frontend.textContent = configData.frontendPath || 'Repositório completo';
  if (elements.url) elements.url.textContent = configData.mainURL || 'http://localhost:8081';
  if (elements.command) elements.command.textContent = configData.startTrigger || '-';
  
  if (elements.params) {
    if (configData.triggerParams && Object.keys(configData.triggerParams).length > 0) {
      elements.params.innerHTML = '';
      Object.entries(configData.triggerParams).forEach(([name, value]) => {
        const param = document.createElement('div');
        param.textContent = `${name} = ${value}`;
        elements.params.appendChild(param);
      });
    } else {
      elements.params.textContent = 'Nenhum';
    }
  }
  
  if (elements.os) {
    let osName = 'Desconhecido';
    switch(configData.targetOS) {
      case 'win32': osName = 'Windows'; break;
      case 'darwin': osName = 'macOS'; break;
      case 'linux': osName = 'Linux'; break;
    }
    elements.os.textContent = osName;
  }
  
  if (elements.dependencies) {
    if (configData.dependencies && configData.dependencies.length > 0) {
      elements.dependencies.innerHTML = '';
      configData.dependencies.forEach(dep => {
        const depEl = document.createElement('div');
        depEl.textContent = `${dep.displayName || dep.name} ${dep.required ? '(obrigatório)' : '(opcional)'}`;
        elements.dependencies.appendChild(depEl);
      });
    } else {
      elements.dependencies.textContent = 'Nenhuma';
    }
  }
}

// Adicionar linha de parâmetro
function addParamRow(name = '', value = '') {
  const paramContainer = document.getElementById('triggerParams');
  if (!paramContainer) return;
  
  const row = document.createElement('div');
  row.className = 'param-row';
  
  row.innerHTML = `
    <input type="text" placeholder="nome" class="param-name" value="${name}">
    <input type="text" placeholder="valor" class="param-value" value="${value}">
    <button class="btn-icon remove-param">-</button>
  `;
  
  paramContainer.appendChild(row);
  
  // Adicionar handler para remover
  const removeBtn = row.querySelector('.remove-param');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      paramContainer.removeChild(row);
    });
  }
}

// Configurar event listeners
function setupEventListeners() {
  // Botões de navegação entre etapas
  const nextToStep2Btn = document.getElementById('nextToStep2');
  const backToStep1Btn = document.getElementById('backToStep1');
  const nextToStep3Btn = document.getElementById('nextToStep3');
  const backToStep2Btn = document.getElementById('backToStep2');
  const nextToStep4Btn = document.getElementById('nextToStep4');
  const backToStep3Btn = document.getElementById('backToStep3');
  const startBuildBtn = document.getElementById('startBuild'); 
  const backToStep4Btn = document.getElementById('backToStep4');
  const resetFormBtn = document.getElementById('resetForm');
  
  if (nextToStep2Btn) {
    console.log('Found nextToStep2Btn');
    nextToStep2Btn.addEventListener('click', () => {
      console.log('nextToStep2Btn clicked');
      saveStepData();
      showStep(2);
      loadFormData();
    });
  }
  
  if (backToStep1Btn) {
    backToStep1Btn.addEventListener('click', () => {
      saveStepData();
      showStep(1);
    });
  }
  
  if (nextToStep3Btn) {
    nextToStep3Btn.addEventListener('click', () => {
      saveStepData();
      showStep(3);
    });
  }
  
  if (backToStep2Btn) {
    backToStep2Btn.addEventListener('click', () => {
      saveStepData();
      showStep(2);
    });
  }
  
  if (nextToStep4Btn) {
    nextToStep4Btn.addEventListener('click', () => {
      saveStepData();
      updateSummary();
      showStep(4);
    });
  }
  
  if (backToStep3Btn) {
    backToStep3Btn.addEventListener('click', () => {
      saveStepData();
      showStep(3);
    });
  }
  
  if (backToStep4Btn) {
    backToStep4Btn.addEventListener('click', () => {
      showStep(4);
    });
  }
  
  if (startBuildBtn) {
    startBuildBtn.addEventListener('click', () => {
      saveStepData();
      showStep(5);
      // Iniciar processo de build
      ipcRenderer.send('start-process');
    });
  }
  
  if (resetFormBtn) {
    resetFormBtn.addEventListener('click', () => {
      configData = {
        repo: '',
        token: '',
        frontendPath: '',
        mainURL: 'http://localhost:8081',
        startTrigger: 'BROWSER=none npx expo start --web --port [port]',
        triggerParams: { port: 8081 },
        targetOS: process.platform,
        packageManager: '',
        dependencies: []
      };
      
      loadFormData();
      showStep(1);
    });
  }
  
  // Adicionar parâmetro
  const addParamBtn = document.getElementById('addParam');
  if (addParamBtn) {
    addParamBtn.addEventListener('click', () => {
      addParamRow();
    });
  }
  
  // Adicionar dependência
  const addDependencyBtn = document.getElementById('addDependency');
  if (addDependencyBtn) {
    addDependencyBtn.addEventListener('click', () => {
      addDependency();
    });
  }
  
  // Abrir pasta do instalador
  const openInstallerFolderBtn = document.getElementById('openInstallerFolder');
  if (openInstallerFolderBtn) {
    openInstallerFolderBtn.addEventListener('click', () => {
      const path = document.getElementById('installerPath')?.textContent;
      if (path) {
        ipcRenderer.send('open-file-location', path);
      }
    });
  }
}

// Funções para gerenciamento de dependências
function loadPackageManagers(targetOS) {
  const select = document.getElementById('packageManager');
  if (!select) return;
  
  select.innerHTML = '';
  
  // Solicitamos os gerenciadores disponíveis ao processo principal
  ipcRenderer.send('get-package-managers', targetOS);
}

// Adiciona uma nova dependência à lista
function addDependency(depData = null) {
  const dependenciesList = document.getElementById('dependencies-list');
  if (!dependenciesList) return;
  
  const template = document.querySelector('.dependency-template');
  if (!template) return;
  
  const templateItem = template.querySelector('.dependency-item');
  if (!templateItem) return;
  
  const item = templateItem.cloneNode(true);
  
  if (depData) {
    item.querySelector('.dep-required').checked = depData.required;
    item.querySelector('.dep-name').value = depData.name;
    item.querySelector('.dep-display-name').value = depData.displayName;
    item.querySelector('.dep-description').value = depData.description;
    item.querySelector('.dep-version').value = depData.version;
    
    // Preencher nomes de pacotes
    if (depData.packageNames) {
      for (const [pm, pkgName] of Object.entries(depData.packageNames)) {
        const input = item.querySelector(`.pkg-${pm}`);
        if (input) {
          input.value = pkgName;
        }
      }
    }
  }
  
  // Handler para remover dependência
  const removeBtn = item.querySelector('.remove-dep');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      dependenciesList.removeChild(item);
    });
  }
  
  dependenciesList.appendChild(item);
}

// Coleta todas as dependências configuradas
function collectDependencies() {
  const dependencies = [];
  const items = document.querySelectorAll('#dependencies-list .dependency-item');
  
  items.forEach(item => {
    const requiredInput = item.querySelector('.dep-required');
    const nameInput = item.querySelector('.dep-name');
    const displayNameInput = item.querySelector('.dep-display-name');
    const descriptionInput = item.querySelector('.dep-description');
    const versionInput = item.querySelector('.dep-version');
    
    if (!nameInput || !nameInput.value) return;
    
    const dep = {
      name: nameInput.value,
      displayName: displayNameInput ? displayNameInput.value : nameInput.value,
      description: descriptionInput ? descriptionInput.value : '',
      version: versionInput ? versionInput.value : '',
      required: requiredInput ? requiredInput.checked : false,
      packageNames: {}
    };
    
    // Coletar nomes de pacotes
    const packageNameInputs = item.querySelectorAll('.package-names input');
    packageNameInputs.forEach(input => {
      if (input.value && input.className.startsWith('pkg-')) {
        const pmName = input.className.replace('pkg-', '');
        dep.packageNames[pmName] = input.value;
      }
    });
    
    dependencies.push(dep);
  });
  
  return dependencies;
}

// Event listeners para mensagens do processo principal
ipcRenderer.on('load-config', (event, data) => {
  configData = data;
  loadFormData();
});

ipcRenderer.on('config-saved', (event, success) => {
  console.log('Configuração salva:', success);
});

ipcRenderer.on('directory-selected', (event, path) => {
  console.log('Diretório selecionado:', path);
});

ipcRenderer.on('package-managers', (event, managers) => {
  const select = document.getElementById('packageManager');
  if (!select) return;
  
  select.innerHTML = '';
  
  for (const [name, info] of Object.entries(managers)) {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (info.isDefault) {
      option.selected = true;
    }
    select.appendChild(option);
  }
  
  // Salvar o selecionado no configData
  if (select.value) {
    configData.packageManager = select.value;
  }
});

ipcRenderer.on('suggested-dependencies', (event, dependencies) => {
  // Limpar lista atual
  const dependenciesList = document.getElementById('dependencies-list');
  if (dependenciesList) {
    dependenciesList.innerHTML = '';
  }
  
  // Adicionar dependências sugeridas
  dependencies.forEach(dep => {
    addDependency(dep);
  });
});

ipcRenderer.on('update-progress', (event, data) => {
  const progressElement = document.getElementById('buildProgress');
  const messageElement = document.getElementById('progressMessage');
  
  if (!progressElement || !messageElement) return;
  
  // Atualizar a barra de progresso
  switch(data.step) {
    case 'clone': progressElement.style.width = '20%'; break;
    case 'config': progressElement.style.width = '40%'; break;
    case 'dependencies': progressElement.style.width = '60%'; break;
    case 'build': progressElement.style.width = '80%'; break;
    case 'installer': progressElement.style.width = '100%'; break;
  }
  
  // Atualizar mensagem
  messageElement.textContent = data.message;
});

ipcRenderer.on('process-complete', (event, data) => {
  const successEl = document.getElementById('buildSuccess');
  const errorEl = document.getElementById('buildError');
  const installerPathEl = document.getElementById('installerPath');
  
  if (!successEl || !errorEl || !installerPathEl) return;
  
  successEl.style.display = 'block';
  errorEl.style.display = 'none';
  installerPathEl.textContent = data.installerPath;
});

ipcRenderer.on('process-error', (event, data) => {
  const successEl = document.getElementById('buildSuccess');
  const errorEl = document.getElementById('buildError');
  const errorMessageEl = document.getElementById('errorMessage');
  
  if (!successEl || !errorEl || !errorMessageEl) return;
  
  successEl.style.display = 'none';
  errorEl.style.display = 'block';
  errorMessageEl.textContent = data.message;
});