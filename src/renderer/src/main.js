import { createApp, computed, onMounted, onUnmounted, reactive } from 'vue';

const state = reactive({
  addressInput: 'https://example.com',
  contexts: [],
  activeContextId: null,
  pollingId: null,

  platforms: [],
  accounts: [],
  hotspots: [],
  schedules: [],
  generatedContent: null,

  accountForm: { platform: '抖音', nickname: '', aiEnabled: true },
  generationForm: { hotspotId: '', type: '文章', tone: '专业' },
  scheduleForm: { accountId: '', contentType: '文章', publishAt: '' },
});

const activeContext = computed(() => state.contexts.find((ctx) => ctx.id === state.activeContextId) || null);

async function refreshContexts() {
  const payload = await window.isolatedBrowser.listContexts();
  state.contexts = payload.contexts;
  state.activeContextId = payload.activeContextId;
  if (activeContext.value?.currentUrl) state.addressInput = activeContext.value.currentUrl;
}

async function refreshMatrix() {
  const [p, a, h, s] = await Promise.all([
    window.accountMatrix.getPlatforms(),
    window.accountMatrix.listAccounts(),
    window.accountMatrix.listHotspots(),
    window.accountMatrix.listSchedules(),
  ]);
  state.platforms = p.platforms;
  state.accounts = a.accounts;
  state.hotspots = h.hotspots;
  state.schedules = s.schedules;

  if (!state.accountForm.platform && state.platforms.length) {
    state.accountForm.platform = state.platforms[0];
  }
}

async function addTab() {
  const result = await window.isolatedBrowser.createContext('https://example.com');
  if (result.ok) await refreshContexts();
}

async function switchTab(id) {
  await window.isolatedBrowser.switchContext(id);
  await refreshContexts();
}

async function closeTab(id) {
  await window.isolatedBrowser.closeContext(id);
  await refreshContexts();
}

async function navigateActiveTab() {
  if (!state.activeContextId) return;
  await window.isolatedBrowser.navigateContext(state.activeContextId, state.addressInput);
  await refreshContexts();
}

async function submitAccount() {
  if (!state.accountForm.nickname.trim()) return;
  await window.accountMatrix.addAccount(state.accountForm);
  state.accountForm.nickname = '';
  await refreshMatrix();
}

async function collectHotspots() {
  await window.accountMatrix.collectHotspots();
  await refreshMatrix();
  if (!state.generationForm.hotspotId && state.hotspots.length) {
    state.generationForm.hotspotId = state.hotspots[0].id;
  }
}

async function generateContent() {
  if (!state.generationForm.hotspotId) return;
  const result = await window.accountMatrix.generateContent(state.generationForm);
  if (result.ok) state.generatedContent = result.content;
}

async function createSchedule() {
  if (!state.scheduleForm.accountId || !state.scheduleForm.publishAt) return;
  await window.accountMatrix.schedulePublish(state.scheduleForm);
  await refreshMatrix();
}

const App = {
  setup() {
    onMounted(async () => {
      await refreshContexts();
      await refreshMatrix();
      state.pollingId = window.setInterval(refreshContexts, 1200);
    });

    onUnmounted(() => {
      if (state.pollingId) window.clearInterval(state.pollingId);
    });

    return {
      state,
      activeContext,
      addTab,
      switchTab,
      closeTab,
      navigateActiveTab,
      submitAccount,
      collectHotspots,
      generateContent,
      createSchedule,
    };
  },
  template: `
    <main style="font-family: Inter, -apple-system, sans-serif; height: 100vh; display: flex; flex-direction: column; background: #f7f7f9;">
      <section style="height: 44px; border-bottom: 1px solid #d8d8dc; display: flex; align-items: center; gap: 8px; padding: 6px 10px; overflow-x: auto; background: #ececf1;">
        <button @click="addTab" style="height: 30px; min-width: 30px; border: 1px solid #c5c5cc; border-radius: 8px; background: #fff;">+</button>
        <div v-for="ctx in state.contexts" :key="ctx.id"
          :style="{display:'inline-flex',alignItems:'center',gap:'6px',minWidth:'200px',maxWidth:'260px',padding:'6px 8px',borderRadius:'8px',border:'1px solid #c5c5cc',background:ctx.id===state.activeContextId?'#fff':'#e4e4ea'}">
          <button @click="switchTab(ctx.id)" style="border:none;background:transparent;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;cursor:pointer;">
            {{ ctx.title || '新标签页' }}
          </button>
          <button @click="closeTab(ctx.id)" style="border:none;background:transparent;cursor:pointer;">✕</button>
        </div>
      </section>

      <section style="height: 56px; border-bottom: 1px solid #d8d8dc; display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #fff;">
        <input v-model="state.addressInput" @keyup.enter="navigateActiveTab" placeholder="输入网址，例如 openai.com"
          style="flex: 1; height: 34px; border-radius: 8px; border: 1px solid #cfcfd6; padding: 0 12px;" />
        <button @click="navigateActiveTab" style="height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid #bbb; background: #fff; cursor: pointer;">访问</button>
      </section>

      <section style="height: 220px; border-bottom: 1px solid #e4e4ea; background: #fff; overflow: auto; padding: 10px 12px;">
        <h3 style="margin: 0 0 8px;">多平台账号矩阵管理模板（优先：抖音 / 小红书 / 头条）</h3>
        <div style="display:grid;grid-template-columns: 1.1fr 1fr 1fr; gap:12px;">
          <div style="border:1px solid #e8e8ed;border-radius:8px;padding:10px;">
            <strong>1) 添加账号</strong>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <select v-model="state.accountForm.platform" style="height:30px;">
                <option v-for="p in state.platforms" :key="p" :value="p">{{ p }}</option>
              </select>
              <input v-model="state.accountForm.nickname" placeholder="账号昵称" style="height:28px;flex:1;" />
              <button @click="submitAccount">添加</button>
            </div>
            <div style="margin-top:8px;font-size:12px;color:#666;">已添加：{{ state.accounts.length }} 个</div>
          </div>

          <div style="border:1px solid #e8e8ed;border-radius:8px;padding:10px;">
            <strong>2) 热点收集 + AI 生成</strong>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <button @click="collectHotspots">收集热点</button>
              <select v-model="state.generationForm.hotspotId" style="flex:1;height:30px;">
                <option value="">请选择热点</option>
                <option v-for="h in state.hotspots" :key="h.id" :value="h.id">{{ h.platform }} | {{ h.topic }}</option>
              </select>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <select v-model="state.generationForm.type"><option>文章</option><option>视频脚本</option><option>图片文案</option></select>
              <input v-model="state.generationForm.tone" placeholder="语气，如专业/活泼" style="flex:1;" />
              <button @click="generateContent">生成</button>
            </div>
          </div>

          <div style="border:1px solid #e8e8ed;border-radius:8px;padding:10px;">
            <strong>3) 自动发送（定时）</strong>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <select v-model="state.scheduleForm.accountId" style="flex:1;">
                <option value="">选择账号</option>
                <option v-for="a in state.accounts" :key="a.id" :value="a.id">{{ a.platform }} - {{ a.nickname }}</option>
              </select>
              <select v-model="state.scheduleForm.contentType"><option>文章</option><option>视频</option><option>图片</option></select>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <input type="datetime-local" v-model="state.scheduleForm.publishAt" style="flex:1;" />
              <button @click="createSchedule">定时发布</button>
            </div>
            <div style="margin-top:8px;font-size:12px;color:#666;">任务数：{{ state.schedules.length }}</div>
          </div>
        </div>

        <div v-if="state.generatedContent" style="margin-top:10px; border:1px dashed #ccd; border-radius:8px; padding:8px; font-size:12px;">
          <div><strong>AI 生成标题：</strong>{{ state.generatedContent.title }}</div>
          <pre style="white-space:pre-wrap; margin:6px 0 0;">{{ state.generatedContent.body }}</pre>
        </div>
      </section>

      <section style="flex: 1; display: grid; place-items: center; color: #8a8a93; font-size: 13px;">
        当前标签 partition：{{ activeContext?.partition || '-' }}；每个标签使用独立存储环境（Cookie / LocalStorage / Cache 完全隔离）。
      </section>
    </main>
  `,
};

createApp(App).mount('#app');
