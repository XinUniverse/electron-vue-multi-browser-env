import { app, BrowserWindow, BrowserView, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MatrixService } from './services/matrix-service.js';
import { registerIpcHandlers } from './ipc/register-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contexts = new Map();
let mainWindow;
let activeContextId = null;
let schedulerId = null;

const chromeHeight = 120;
const sidebarWidth = 0;
// const matrixService = new MatrixService({ baseDir: app.getPath('userData') });
const matrixService = new MatrixService({ baseDir: path.join(process.cwd(), 'data') });

function normalizeUrl(inputUrl) {
  if (!inputUrl) return 'https://baidu.com';
  const value = inputUrl.trim();
  if (!value) return 'https://baidu.com';
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `https://${value}`;
}

function getViewBounds() {
  if (!mainWindow) return { x: 0, y: chromeHeight, width: 1000, height: 600 };
  const [width, height] = mainWindow.getContentSize();
  return {
    x: sidebarWidth,
    y: chromeHeight,
    width: Math.max(320, width - sidebarWidth),
    height: Math.max(200, height - chromeHeight),
  };
}

function serializeContext({ id, partition, view }) {
  return {
    id,
    partition,
    currentUrl: view.webContents.getURL(),
    title: view.webContents.getTitle() || '新标签页',
    isLoading: view.webContents.isLoading(),
  };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  } else {
    mainWindow.loadURL('http://127.0.0.1:5173');
  }

  mainWindow.on('resize', () => {
    if (!activeContextId || !contexts.has(activeContextId)) return;
    contexts.get(activeContextId).view.setBounds(getViewBounds());
  });

  mainWindow.on('closed', () => {
    contexts.forEach(({ view }) => {
      if (!view.webContents.isDestroyed()) view.webContents.destroy();
    });
    contexts.clear();
  });
}

function createIsolatedContext(url = 'https://example.com') {
  const id = randomUUID();
  const partition = `persist:ctx-${id}`;

  session.fromPartition(partition, { cache: true });
  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      autoplayPolicy: 'document-user-activation-required',
    },
  });

  view.setAutoResize({ width: true, height: true });
  view.setBounds(getViewBounds());
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.loadURL(normalizeUrl(url));

  contexts.set(id, { id, partition, view });
  return { id, partition, url: normalizeUrl(url) };
}

function attachContext(id) {
  const ctx = contexts.get(id);
  if (!ctx || !mainWindow) return false;

  if (activeContextId && contexts.has(activeContextId)) {
    mainWindow.removeBrowserView(contexts.get(activeContextId).view);
  }

  mainWindow.addBrowserView(ctx.view);
  ctx.view.setBounds(getViewBounds());
  activeContextId = id;
  return true;
}

function closeContext(id) {
  const ctx = contexts.get(id);
  if (!ctx || !mainWindow) return false;

  if (activeContextId === id) {
    mainWindow.removeBrowserView(ctx.view);
    activeContextId = null;
  }

  if (!ctx.view.webContents.isDestroyed()) ctx.view.webContents.destroy();
  contexts.delete(id);

  if (!activeContextId && contexts.size > 0) attachContext([...contexts.keys()][0]);
  return true;
}

function navigateContext(id, url) {
  const ctx = contexts.get(id);
  if (!ctx) return false;
  ctx.view.webContents.loadURL(normalizeUrl(url));
  return true;
}



app.whenReady().then(() => {
  createMainWindow();

  const first = createIsolatedContext('https://baidu.com');
  attachContext(first.id);

  schedulerId = setInterval(() => {
    matrixService.runDueTasks().catch((error) => {
      console.error('scheduler runDueTasks error:', error);
    });
  }, 1000);

  registerIpcHandlers({
    ipcMain,
    matrixService,
    contextApi: {
      createIsolatedContext,
      attachContext,
      closeContext,
      navigateContext,
      listContexts: () => [...contexts.values()].map(serializeContext),
      getActiveContextId: () => activeContextId,
    },
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (schedulerId) clearInterval(schedulerId);
  if (process.platform !== 'darwin') app.quit();
});
