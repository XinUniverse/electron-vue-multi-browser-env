import { createApp, onMounted, onUnmounted, reactive } from 'vue';

const state = reactive({
  newUrl: 'https://example.com',
  contexts: [],
  activeContextId: null,
});

async function refreshContexts() {
  const payload = await window.isolatedBrowser.listContexts();
  state.contexts = payload.contexts;
  state.activeContextId = payload.activeContextId;
}

async function addContext() {
  const result = await window.isolatedBrowser.createContext(state.newUrl);
  if (result.ok) {
    state.newUrl = 'https://example.com';
    await refreshContexts();
  }
}

async function switchContext(id) {
  await window.isolatedBrowser.switchContext(id);
  await refreshContexts();
}

async function closeContext(id) {
  await window.isolatedBrowser.closeContext(id);
  await refreshContexts();
}

function resizeBrowserArea() {
  const topOffset = 80;
  const leftOffset = 260;
  const bounds = {
    x: leftOffset,
    y: topOffset,
    width: Math.max(300, window.innerWidth - leftOffset - 20),
    height: Math.max(200, window.innerHeight - topOffset - 20),
  };
  window.isolatedBrowser.resizeActiveView(bounds);
}

const App = {
  setup() {
    onMounted(async () => {
      await refreshContexts();
      window.addEventListener('resize', resizeBrowserArea);
      resizeBrowserArea();
    });

    onUnmounted(() => {
      window.removeEventListener('resize', resizeBrowserArea);
    });

    return { state, addContext, switchContext, closeContext };
  },
  template: `
    <main style="font-family: sans-serif; height: 100vh; overflow: hidden;">
      <header style="height: 64px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #ddd; padding: 8px 12px;">
        <strong>Electron + Vue 隔离浏览器</strong>
        <input v-model="state.newUrl" style="flex: 1; padding: 8px;" placeholder="输入 URL" />
        <button @click="addContext" style="padding: 8px 12px;">新建隔离会话</button>
      </header>

      <section style="display: flex; height: calc(100vh - 64px);">
        <aside style="width: 240px; border-right: 1px solid #ddd; overflow: auto; padding: 8px;">
          <h3>会话列表</h3>
          <div v-if="state.contexts.length === 0" style="color: #666; font-size: 13px;">
            暂无会话，请先创建。
          </div>
          <div
            v-for="ctx in state.contexts"
            :key="ctx.id"
            :style="{border: '1px solid #ddd', borderRadius: '8px', padding: '8px', marginBottom: '8px', background: ctx.id === state.activeContextId ? '#eef6ff' : '#fff'}"
          >
            <div style="font-size: 12px; color: #444; word-break: break-all;">{{ ctx.partition }}</div>
            <div style="font-size: 12px; color: #777; margin: 4px 0; word-break: break-all;">{{ ctx.currentUrl || 'about:blank' }}</div>
            <div style="display: flex; gap: 6px;">
              <button @click="switchContext(ctx.id)">切换</button>
              <button @click="closeContext(ctx.id)">关闭</button>
            </div>
          </div>
        </aside>
        <div style="flex: 1; display: grid; place-items: center; color: #666;">
          浏览内容由 BrowserView 承载。每个会话使用独立 partition，Cookie/Storage/Cache 完全隔离。
        </div>
      </section>
    </main>
  `,
};

createApp(App).mount('#app');
