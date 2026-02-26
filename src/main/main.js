import { app, BrowserWindow, BrowserView, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contexts = new Map();
let mainWindow;
let activeContextId = null;

const defaultBounds = { x: 260, y: 80, width: 1000, height: 620 };

function normalizeUrl(inputUrl) {
  if (!inputUrl) return 'https://example.com';
  if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
    return inputUrl;
  }
  return `https://${inputUrl}`;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
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

  mainWindow.on('closed', () => {
    contexts.forEach(({ view }) => {
      if (!view.webContents.isDestroyed()) {
        view.webContents.destroy();
      }
    });
    contexts.clear();
  });
}

function createIsolatedContext(url) {
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

  view.setBounds(defaultBounds);
  view.setAutoResize({ width: true, height: true });

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
  ctx.view.setBounds(defaultBounds);
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

  if (!ctx.view.webContents.isDestroyed()) {
    ctx.view.webContents.destroy();
  }
  contexts.delete(id);

  if (!activeContextId && contexts.size > 0) {
    attachContext([...contexts.keys()][0]);
  }
  return true;
}

app.whenReady().then(() => {
  createMainWindow();

  ipcMain.handle('contexts:create', (_, { url }) => {
    const ctx = createIsolatedContext(url);
    attachContext(ctx.id);
    return { ok: true, context: ctx };
  });

  ipcMain.handle('contexts:switch', (_, { id }) => ({ ok: attachContext(id) }));

  ipcMain.handle('contexts:close', (_, { id }) => ({ ok: closeContext(id) }));

  ipcMain.handle('contexts:list', () => ({
    contexts: [...contexts.values()].map(({ id, partition, view }) => ({
      id,
      partition,
      currentUrl: view.webContents.getURL(),
    })),
    activeContextId,
  }));

  ipcMain.on('view:resize', (_, bounds) => {
    if (!activeContextId || !contexts.has(activeContextId)) return;
    const ctx = contexts.get(activeContextId);
    ctx.view.setBounds(bounds);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
