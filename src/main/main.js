import { app, BrowserWindow, BrowserView, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contexts = new Map();
let mainWindow;
let activeContextId = null;

const chromeHeight = 120;
const sidebarWidth = 0;

const accountStore = {
  accounts: [],
  hotspots: [],
  schedules: [],
};

const defaultPlatforms = ['抖音', '小红书', '头条'];

function normalizeUrl(inputUrl) {
  if (!inputUrl) return 'https://example.com';
  const value = inputUrl.trim();
  if (!value) return 'https://example.com';
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

function collectHotspots() {
  const now = new Date().toISOString();
  accountStore.hotspots = [
    { id: randomUUID(), platform: '抖音', topic: 'AIGC短视频脚本自动化', heat: 97, collectedAt: now },
    { id: randomUUID(), platform: '小红书', topic: '春季穿搭爆款笔记', heat: 92, collectedAt: now },
    { id: randomUUID(), platform: '头条', topic: 'AI提效工具测评', heat: 89, collectedAt: now },
  ];
  return accountStore.hotspots;
}

function generateContent({ hotspotId, type = '文章', tone = '专业' }) {
  const hotspot = accountStore.hotspots.find((item) => item.id === hotspotId);
  if (!hotspot) return null;

  const title = `【${hotspot.platform}】${hotspot.topic} - ${type}模板`;
  const body = `基于热点「${hotspot.topic}」自动生成${type}内容，语气：${tone}。\n1. 开场吸引\n2. 核心观点\n3. 行动引导`;
  return {
    id: randomUUID(),
    hotspotId,
    type,
    tone,
    title,
    body,
    createdAt: new Date().toISOString(),
  };
}

app.whenReady().then(() => {
  createMainWindow();

  const first = createIsolatedContext('https://example.com');
  attachContext(first.id);

  ipcMain.handle('contexts:create', (_, { url }) => {
    const ctx = createIsolatedContext(url);
    attachContext(ctx.id);
    return { ok: true, context: ctx };
  });
  ipcMain.handle('contexts:switch', (_, { id }) => ({ ok: attachContext(id) }));
  ipcMain.handle('contexts:close', (_, { id }) => ({ ok: closeContext(id) }));
  ipcMain.handle('contexts:navigate', (_, { id, url }) => ({ ok: navigateContext(id, url) }));
  ipcMain.handle('contexts:list', () => ({ contexts: [...contexts.values()].map(serializeContext), activeContextId }));

  ipcMain.handle('matrix:getPlatforms', () => ({ platforms: defaultPlatforms }));
  ipcMain.handle('matrix:listAccounts', () => ({ accounts: accountStore.accounts }));
  ipcMain.handle('matrix:addAccount', (_, payload) => {
    const account = {
      id: randomUUID(),
      platform: payload.platform,
      nickname: payload.nickname,
      aiEnabled: Boolean(payload.aiEnabled),
      status: payload.status || 'active',
      createdAt: new Date().toISOString(),
    };
    accountStore.accounts.push(account);
    return { ok: true, account };
  });

  ipcMain.handle('matrix:collectHotspots', () => ({ hotspots: collectHotspots() }));
  ipcMain.handle('matrix:listHotspots', () => ({ hotspots: accountStore.hotspots }));

  ipcMain.handle('matrix:generateContent', (_, payload) => {
    const content = generateContent(payload);
    if (!content) return { ok: false, error: 'hotspot not found' };
    return { ok: true, content };
  });

  ipcMain.handle('matrix:schedulePublish', (_, payload) => {
    const task = {
      id: randomUUID(),
      accountId: payload.accountId,
      contentType: payload.contentType,
      publishAt: payload.publishAt,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };
    accountStore.schedules.push(task);
    return { ok: true, task };
  });
  ipcMain.handle('matrix:listSchedules', () => ({ schedules: accountStore.schedules }));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
