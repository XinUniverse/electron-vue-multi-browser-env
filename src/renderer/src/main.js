import { createApp, computed, onMounted, onUnmounted, reactive } from 'vue';
import './styles.css';

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

const statCards = computed(() => {
  const stats = state.dashboardStats || {};
  return [
    { label: '账号总数', value: stats.accountCount || 0 },
    { label: '活跃账号', value: stats.activeAccountCount || 0 },
    { label: '任务总数', value: stats.scheduleCount || 0 },
    { label: '进行中', value: stats.pendingCount || 0 },
    { label: '成功', value: stats.successCount || 0 },
    { label: '失败', value: stats.failedCount || 0 },
  ];
});

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
      statCards,
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
    <main class="app-shell">
      <div class="bg-orb bg-orb-a"></div>
      <div class="bg-orb bg-orb-b"></div>
      <section class="glass tabs-row">
        <button class="icon-button" @click="addTab">+</button>
        <div v-for="ctx in state.contexts" :key="ctx.id" class="tab-pill" :class="{ active: ctx.id===state.activeContextId }">
          <button @click="switchTab(ctx.id)" class="tab-title">{{ ctx.title || '新标签页' }}</button>
          <button @click="closeTab(ctx.id)" class="tab-close">✕</button>
        </div>
      </section>

      <section class="glass address-row">
        <input class="glass-input" v-model="state.addressInput" @keyup.enter="navigateActiveTab" placeholder="输入网址，例如 openai.com" />
        <button class="primary-button" @click="navigateActiveTab">访问</button>
      </section>

      <section v-if="state.errorMessage" class="glass error-banner">{{ state.errorMessage }}</section>

      <section class="stats-grid">
        <article v-for="item in statCards" :key="item.label" class="glass stat-card">
          <div class="stat-label">{{ item.label }}</div>
          <div class="stat-value">{{ item.value }}</div>
        </article>
      </section>

      <section class="glass workspace">
        <h3>增强版账号矩阵管理</h3>
        <div class="three-column">
          <div class="glass panel">
            <strong>1) 账号管理（增/禁用/删除）</strong>
            <div class="row mt-8">
              <select v-model="state.accountForm.platform" class="glass-input">
                <option v-for="p in state.platforms" :key="p" :value="p">{{ p }}</option>
              </select>
              <input class="glass-input" v-model="state.accountForm.nickname" placeholder="账号昵称" />
              <button class="primary-button" @click="submitAccount">添加</button>
            </div>
            <div class="row mt-8">
              <select class="glass-input" v-model="state.scheduleFilter" @change="refreshMatrix">
                <option value="all">全部</option><option value="scheduled">scheduled</option><option value="retrying">retrying</option><option value="running">running</option><option value="success">success</option><option value="failed">failed</option><option value="cancelled">cancelled</option>
              </select>
            </div>
            <div class="list-box mt-8">
              <div v-for="a in state.accounts" :key="a.id" class="list-row">
                <span>{{ a.platform }}-{{ a.nickname }} ({{ a.status }})</span>
                <button class="ghost-button" @click="setAccountStatus(a.id, a.status === 'active' ? 'disabled' : 'active')">切换状态</button>
                <button class="ghost-button danger" @click="removeAccount(a.id)">删除</button>
              </div>
            </div>
          </div>

          <div class="glass panel">
            <strong>2) 热点 + AI 生成</strong>
            <div class="row mt-8">
              <button class="primary-button" @click="collectHotspots">收集热点</button>
              <select class="glass-input" v-model="state.generationForm.hotspotId">
                <option value="">请选择热点</option>
                <option v-for="h in state.hotspots" :key="h.id" :value="h.id">{{ h.platform }} | {{ h.topic }}</option>
              </select>
            </div>
            <div class="row mt-8">
              <select class="glass-input" v-model="state.generationForm.type"><option>文章</option><option>视频脚本</option><option>图片文案</option></select>
              <input class="glass-input" v-model="state.generationForm.tone" placeholder="语气" />
              <button class="primary-button" @click="generateContent">生成</button>
              <button class="ghost-button" @click="saveGeneratedContent">保存素材</button>
            </div>
          </div>

          <div class="glass panel">
            <strong>3) 发布任务（创建/取消/重试）</strong>
            <div class="row mt-8">
              <select class="glass-input" v-model="state.scheduleForm.accountId">
                <option value="">选择账号</option>
                <option v-for="a in state.accounts" :key="a.id" :value="a.id">{{ a.platform }} - {{ a.nickname }}</option>
              </select>
              <select class="glass-input" v-model="state.scheduleForm.contentType"><option>文章</option><option>视频</option><option>图片</option><option>模拟鉴权失败</option></select>
            </div>
            <div class="row mt-8">
              <select class="glass-input" v-model="state.scheduleForm.contentAssetId">
                <option value="">无素材(按类型发布)</option>
                <option v-for="asset in state.contentAssets" :key="asset.id" :value="asset.id">{{ asset.type }} | {{ asset.title }}</option>
              </select>
            </div>
            <div class="row mt-8">
              <input class="glass-input" type="datetime-local" v-model="state.scheduleForm.publishAt" />
              <button class="primary-button" @click="createSchedule">定时发布</button>
            </div>
            <div class="list-box mt-8">
              <div v-for="task in state.schedules.slice(0, 6)" :key="task.id" class="list-row">
                <span>{{ task.contentType }} / {{ task.status }} / retry={{ task.retryCount }}</span>
                <button class="ghost-button" @click="cancelSchedule(task.id)">取消</button>
                <button class="ghost-button" @click="retrySchedule(task.id)">重试</button>
                <button class="ghost-button" @click="executeScheduleNow(task.id)">立即执行</button>
              </div>
            </div>
          </div>
        </div>

        <div class="two-column mt-12">
          <div v-if="state.generatedContent" class="glass panel-sm">
            <div><strong>AI 标题：</strong>{{ state.generatedContent.title }}</div>
            <pre>{{ state.generatedContent.body }}</pre>
          </div>
          <div class="glass panel-sm">
            <div><strong>素材库（最近）</strong></div>
            <div v-for="asset in state.contentAssets" :key="asset.id" class="list-row">
              <span>{{ asset.type }} | {{ asset.title }}</span>
              <button class="ghost-button danger" @click="deleteContentAsset(asset.id)">删除</button>
            </div>
          </div>
          <div class="glass panel-sm">
            <div class="list-head"><strong>任务日志</strong><div><input class="glass-input w70" type="number" min="10" max="500" v-model.number="state.logLimit" @change="refreshMatrix" /><button class="ghost-button" @click="clearTaskLogs">清空</button></div></div>
            <div v-for="log in state.taskLogs" :key="log.id" :class="['log-line', log.level === 'error' ? 'is-error' : '']">[{{ log.level }}] {{ log.message }}</div>
          </div>
          <div class="glass panel-sm">
            <div class="list-head"><strong>发布指标（最近）</strong><div><input class="glass-input w70" type="number" min="10" max="500" v-model.number="state.metricLimit" @change="refreshMatrix" /><button class="ghost-button" @click="clearPublishMetrics">清空</button></div></div>
            <div v-for="metric in state.publishMetrics" :key="metric.id" class="log-line">{{ metric.platform }} | success={{ metric.success }} | latency={{ metric.latencyMs }}ms | code={{ metric.errorCode || '-' }}</div>
          </div>
        </div>

        <div class="two-column mt-12">
          <div class="glass panel-sm tint-red">
            <div><strong>最近失败任务（Top10）</strong></div>
            <div v-for="f in state.recentFailures" :key="f.id" class="log-line">{{ f.contentType }} | retry={{ f.retryCount }} | {{ f.errorMessage || '-' }}</div>
          </div>
          <div class="glass panel-sm tint-blue">
            <div class="list-head"><strong>数据快照（备份/恢复）</strong>
              <div>
                <button class="ghost-button" @click="exportSnapshot">导出</button>
                <button class="ghost-button" @click="importSnapshot('merge')">导入合并</button>
                <button class="ghost-button" @click="importSnapshot('replace')">导入覆盖</button>
              </div>
            </div>
            <textarea class="glass-input" v-model="state.snapshotText" placeholder="导出的快照 JSON 会显示在这里，也可粘贴后导入"></textarea>
          </div>
        </div>
      </section>

      <section class="glass footer-note">当前标签 partition：{{ activeContext?.partition || '-' }}；每个标签使用独立存储环境（Cookie / LocalStorage / Cache 完全隔离）。</section>
    </main>
  `,
};

createApp(App).mount('#app');
