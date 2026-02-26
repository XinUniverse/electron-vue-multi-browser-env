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
  taskLogs: [],
  publishMetrics: [],
  dashboardStats: null,
  recentFailures: [],
  contentAssets: [],
  generatedContent: null,
  errorMessage: '',

  accountForm: { platform: '抖音', nickname: '', aiEnabled: true },
  generationForm: { hotspotId: '', type: '文章', tone: '专业' },
  scheduleForm: { accountId: '', contentType: '文章', publishAt: '', contentAssetId: '' },
  scheduleFilter: 'all',
  logLimit: 100,
  metricLimit: 50,
  snapshotText: '',
});

const activeContext = computed(() => state.contexts.find((ctx) => ctx.id === state.activeContextId) || null);

function readResult(result, fallback = {}) {
  if (!result?.ok) {
    state.errorMessage = result?.error || '操作失败';
    return null;
  }
  state.errorMessage = '';
  return { ...fallback, ...result };
}

async function refreshContexts() {
  const payload = readResult(await window.isolatedBrowser.listContexts());
  if (!payload) return;
  state.contexts = payload.contexts;
  state.activeContextId = payload.activeContextId;
  if (activeContext.value?.currentUrl) state.addressInput = activeContext.value.currentUrl;
}

async function refreshMatrix() {
  const [p0, a0, h0, s0, l0, m0, d0, f0, c0] = await Promise.all([
    window.accountMatrix.getPlatforms(),
    window.accountMatrix.listAccounts(),
    window.accountMatrix.listHotspots(),
    window.accountMatrix.listSchedules({ status: state.scheduleFilter }),
    window.accountMatrix.listTaskLogs({ limit: state.logLimit }),
    window.accountMatrix.listPublishMetrics({ limit: state.metricLimit }),
    window.accountMatrix.getDashboardStats(),
    window.accountMatrix.getRecentFailures({ limit: 10 }),
    window.accountMatrix.listContentAssets({ limit: 20 }),
  ]);

  const p = readResult(p0);
  const a = readResult(a0);
  const h = readResult(h0);
  const s = readResult(s0);
  const l = readResult(l0);
  const m = readResult(m0);
  const d = readResult(d0);
  const f = readResult(f0);
  const c = readResult(c0);
  if (!p || !a || !h || !s || !l || !m || !d || !f || !c) return;

  state.platforms = p.platforms;
  state.accounts = a.accounts;
  state.hotspots = h.hotspots;
  state.schedules = s.schedules;
  state.taskLogs = l.logs;
  state.publishMetrics = m.metrics;
  state.dashboardStats = d.stats;
  state.recentFailures = f.failures;
  state.contentAssets = c.assets;

  if (!state.accountForm.platform && state.platforms.length) state.accountForm.platform = state.platforms[0];
}

async function addTab() {
  const result = readResult(await window.isolatedBrowser.createContext('https://example.com'));
  if (result) await refreshContexts();
}

async function switchTab(id) {
  readResult(await window.isolatedBrowser.switchContext(id));
  await refreshContexts();
}

async function closeTab(id) {
  readResult(await window.isolatedBrowser.closeContext(id));
  await refreshContexts();
}

async function navigateActiveTab() {
  if (!state.activeContextId) return;
  readResult(await window.isolatedBrowser.navigateContext(state.activeContextId, state.addressInput));
  await refreshContexts();
}

async function submitAccount() {
  if (!state.accountForm.nickname.trim()) return;
  const result = readResult(await window.accountMatrix.addAccount(state.accountForm));
  if (!result) return;
  state.accountForm.nickname = '';
  await refreshMatrix();
}

async function setAccountStatus(id, status) {
  readResult(await window.accountMatrix.updateAccountStatus({ id, status }));
  await refreshMatrix();
}

async function removeAccount(id) {
  readResult(await window.accountMatrix.deleteAccount({ id }));
  await refreshMatrix();
}

async function collectHotspots() {
  const result = readResult(await window.accountMatrix.collectHotspots());
  if (!result) return;
  await refreshMatrix();
  if (!state.generationForm.hotspotId && state.hotspots.length) state.generationForm.hotspotId = state.hotspots[0].id;
}

async function generateContent() {
  if (!state.generationForm.hotspotId) return;
  const result = readResult(await window.accountMatrix.generateContent(state.generationForm));
  if (result?.content) state.generatedContent = result.content;
}


async function saveGeneratedContent() {
  if (!state.generatedContent) return;
  const result = readResult(await window.accountMatrix.saveGeneratedContent(state.generatedContent));
  if (result) await refreshMatrix();
}

async function deleteContentAsset(id) {
  readResult(await window.accountMatrix.deleteContentAsset({ id }));
  if (state.scheduleForm.contentAssetId === id) state.scheduleForm.contentAssetId = '';
  await refreshMatrix();
}

async function createSchedule() {
  if (!state.scheduleForm.accountId || !state.scheduleForm.publishAt) return;
  const result = readResult(await window.accountMatrix.schedulePublish(state.scheduleForm));
  if (result) await refreshMatrix();
}

async function cancelSchedule(id) {
  readResult(await window.accountMatrix.cancelSchedule({ id }));
  await refreshMatrix();
}

async function retrySchedule(id) {
  readResult(await window.accountMatrix.retrySchedule({ id }));
  await refreshMatrix();
}

async function executeScheduleNow(id) {
  readResult(await window.accountMatrix.executeScheduleNow({ id }));
  await refreshMatrix();
}

async function clearTaskLogs() {
  readResult(await window.accountMatrix.clearTaskLogs());
  await refreshMatrix();
}

async function clearPublishMetrics() {
  readResult(await window.accountMatrix.clearPublishMetrics());
  await refreshMatrix();
}

async function exportSnapshot() {
  const result = readResult(await window.accountMatrix.exportSnapshot());
  if (!result) return;
  state.snapshotText = JSON.stringify(result.snapshot, null, 2);
}

async function importSnapshot(mode = 'merge') {
  if (!state.snapshotText.trim()) return;
  let snapshot;
  try {
    snapshot = JSON.parse(state.snapshotText);
  } catch {
    state.errorMessage = '快照 JSON 格式错误';
    return;
  }
  const result = readResult(await window.accountMatrix.importSnapshot({ snapshot, mode }));
  if (result) await refreshMatrix();
}

const App = {
  setup() {
    onMounted(async () => {
      await refreshContexts();
      await refreshMatrix();
      state.pollingId = window.setInterval(async () => {
        await refreshContexts();
        await refreshMatrix();
      }, 1500);
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
      setAccountStatus,
      removeAccount,
      collectHotspots,
      generateContent,
      saveGeneratedContent,
      deleteContentAsset,
      createSchedule,
      cancelSchedule,
      retrySchedule,
      refreshMatrix,
      executeScheduleNow,
      clearTaskLogs,
      clearPublishMetrics,
      exportSnapshot,
      importSnapshot,
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

      <section v-if="state.errorMessage" style="padding: 6px 12px; font-size: 12px; color: #b42318; background: #fef3f2; border-bottom: 1px solid #fecdca;">
        {{ state.errorMessage }}
      </section>

      <section style="padding: 8px 12px; font-size: 12px; border-bottom: 1px solid #ddd; background: #fff; display: flex; gap: 14px; flex-wrap: wrap;">
        <span>账号总数: {{ state.dashboardStats?.accountCount || 0 }}</span>
        <span>活跃账号: {{ state.dashboardStats?.activeAccountCount || 0 }}</span>
        <span>任务总数: {{ state.dashboardStats?.scheduleCount || 0 }}</span>
        <span>进行中: {{ state.dashboardStats?.pendingCount || 0 }}</span>
        <span>成功: {{ state.dashboardStats?.successCount || 0 }}</span>
        <span>失败: {{ state.dashboardStats?.failedCount || 0 }}</span>
      </section>

      <section style="height: 330px; border-bottom: 1px solid #e4e4ea; background: #fff; overflow: auto; padding: 10px 12px;">
        <h3 style="margin: 0 0 8px;">增强版账号矩阵管理</h3>
        <div style="display:grid;grid-template-columns: 1.1fr 1fr 1fr; gap:12px;">
          <div style="border:1px solid #e8e8ed;border-radius:8px;padding:10px;">
            <strong>1) 账号管理（增/禁用/删除）</strong>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <select v-model="state.accountForm.platform" style="height:30px;">
                <option v-for="p in state.platforms" :key="p" :value="p">{{ p }}</option>
              </select>
              <input v-model="state.accountForm.nickname" placeholder="账号昵称" style="height:28px;flex:1;" />
              <button @click="submitAccount">添加</button>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <select v-model="state.scheduleFilter" @change="refreshMatrix">
                <option value="all">全部</option><option value="scheduled">scheduled</option><option value="retrying">retrying</option><option value="running">running</option><option value="success">success</option><option value="failed">failed</option><option value="cancelled">cancelled</option>
              </select>
            </div>
            <div style="margin-top:8px; max-height:90px; overflow:auto; font-size:12px;">
              <div v-for="a in state.accounts" :key="a.id" style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                <span style="flex:1;">{{ a.platform }}-{{ a.nickname }} ({{ a.status }})</span>
                <button @click="setAccountStatus(a.id, a.status === 'active' ? 'disabled' : 'active')">切换状态</button>
                <button @click="removeAccount(a.id)">删除</button>
              </div>
            </div>
          </div>

          <div style="border:1px solid #e8e8ed;border-radius:8px;padding:10px;">
            <strong>2) 热点 + AI 生成</strong>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <button @click="collectHotspots">收集热点</button>
              <select v-model="state.generationForm.hotspotId" style="flex:1;height:30px;">
                <option value="">请选择热点</option>
                <option v-for="h in state.hotspots" :key="h.id" :value="h.id">{{ h.platform }} | {{ h.topic }}</option>
              </select>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <select v-model="state.generationForm.type"><option>文章</option><option>视频脚本</option><option>图片文案</option></select>
              <input v-model="state.generationForm.tone" placeholder="语气" style="flex:1;" />
              <button @click="generateContent">生成</button>
              <button @click="saveGeneratedContent">保存素材</button>
            </div>
          </div>

          <div style="border:1px solid #e8e8ed;border-radius:8px;padding:10px;">
            <strong>3) 发布任务（创建/取消/重试）</strong>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <select v-model="state.scheduleForm.accountId" style="flex:1;">
                <option value="">选择账号</option>
                <option v-for="a in state.accounts" :key="a.id" :value="a.id">{{ a.platform }} - {{ a.nickname }}</option>
              </select>
              <select v-model="state.scheduleForm.contentType"><option>文章</option><option>视频</option><option>图片</option><option>模拟鉴权失败</option></select>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <select v-model="state.scheduleForm.contentAssetId" style="flex:1;">
                <option value="">无素材(按类型发布)</option>
                <option v-for="asset in state.contentAssets" :key="asset.id" :value="asset.id">{{ asset.type }} | {{ asset.title }}</option>
              </select>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <input type="datetime-local" v-model="state.scheduleForm.publishAt" style="flex:1;" />
              <button @click="createSchedule">定时发布</button>
            </div>
            <div style="margin-top:8px;display:flex;gap:8px;">
              <select v-model="state.scheduleFilter" @change="refreshMatrix">
                <option value="all">全部</option><option value="scheduled">scheduled</option><option value="retrying">retrying</option><option value="running">running</option><option value="success">success</option><option value="failed">failed</option><option value="cancelled">cancelled</option>
              </select>
            </div>
            <div style="margin-top:8px; max-height:90px; overflow:auto; font-size:12px;">
              <div v-for="task in state.schedules.slice(0, 6)" :key="task.id" style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                <span style="flex:1;">{{ task.contentType }} / {{ task.status }} / retry={{ task.retryCount }}</span>
                <button @click="cancelSchedule(task.id)">取消</button>
                <button @click="retrySchedule(task.id)">重试</button>
                <button @click="executeScheduleNow(task.id)">立即执行</button>
              </div>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns: 1fr 1fr; gap:12px; margin-top:10px;">
          <div v-if="state.generatedContent" style="border:1px dashed #ccd; border-radius:8px; padding:8px; font-size:12px;">
            <div><strong>AI 标题：</strong>{{ state.generatedContent.title }}</div>
            <pre style="white-space:pre-wrap; margin:6px 0 0;">{{ state.generatedContent.body }}</pre>
          </div>

          <div style="border:1px dashed #ccd; border-radius:8px; padding:8px; font-size:12px; max-height:120px; overflow:auto;">
            <div><strong>素材库（最近）</strong></div>
            <div v-for="asset in state.contentAssets" :key="asset.id" style="display:flex;gap:6px;align-items:center;">
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ asset.type }} | {{ asset.title }}</span>
              <button @click="deleteContentAsset(asset.id)">删除</button>
            </div>
          </div>

          <div style="border:1px dashed #ccd; border-radius:8px; padding:8px; font-size:12px; max-height:120px; overflow:auto;">
            <div style="display:flex;justify-content:space-between;gap:8px;"><strong>任务日志</strong><div><input type="number" min="10" max="500" v-model.number="state.logLimit" style="width:68px;" @change="refreshMatrix" /><button @click="clearTaskLogs">清空</button></div></div>
            <div v-for="log in state.taskLogs" :key="log.id" :style="{color: log.level === 'error' ? '#b42318' : '#344054'}">
              [{{ log.level }}] {{ log.message }}
            </div>
          </div>
        </div>

        <div style="margin-top:10px;border:1px dashed #ccd; border-radius:8px; padding:8px; font-size:12px; max-height:88px; overflow:auto;">
          <div style="display:flex;justify-content:space-between;gap:8px;"><strong>发布指标（最近）</strong><div><input type="number" min="10" max="500" v-model.number="state.metricLimit" style="width:68px;" @change="refreshMatrix" /><button @click="clearPublishMetrics">清空</button></div></div>
          <div v-for="metric in state.publishMetrics" :key="metric.id">
            {{ metric.platform }} | success={{ metric.success }} | latency={{ metric.latencyMs }}ms | code={{ metric.errorCode || '-' }}
          </div>
        </div>


        <div style="margin-top:10px;border:1px dashed #f3c7c7; border-radius:8px; padding:8px; font-size:12px; max-height:88px; overflow:auto; background:#fff7f7;">
          <div><strong>最近失败任务（Top10）</strong></div>
          <div v-for="f in state.recentFailures" :key="f.id">
            {{ f.contentType }} | retry={{ f.retryCount }} | {{ f.errorMessage || '-' }}
          </div>
        </div>

        <div style="margin-top:10px;border:1px dashed #b9d8ff; border-radius:8px; padding:8px; font-size:12px; background:#f5faff;">
          <div style="display:flex;justify-content:space-between;align-items:center; gap:8px;">
            <strong>数据快照（备份/恢复）</strong>
            <div style="display:flex; gap:6px;">
              <button @click="exportSnapshot">导出</button>
              <button @click="importSnapshot('merge')">导入合并</button>
              <button @click="importSnapshot('replace')">导入覆盖</button>
            </div>
          </div>
          <textarea v-model="state.snapshotText" placeholder="导出的快照 JSON 会显示在这里，也可粘贴后导入" style="margin-top:8px;width:100%;height:88px;font-size:12px;"></textarea>
        </div>
      </section>

      <section style="flex: 1; display: grid; place-items: center; color: #8a8a93; font-size: 13px; padding: 4px 12px;">
        当前标签 partition：{{ activeContext?.partition || '-' }}；每个标签使用独立存储环境（Cookie / LocalStorage / Cache 完全隔离）。
      </section>
    </main>
  `,
};

createApp(App).mount('#app');
