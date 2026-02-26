<script setup>
import { ref, onMounted } from 'vue';

const contexts = ref([]);
const activeContextId = ref(null);
const urlInput = ref('');
const isLoading = ref(false);

const loadContexts = async () => {
  const result = await window.isolatedBrowser.listContexts();
  if (result.ok) {
    contexts.value = result.contexts;
    activeContextId.value = result.activeContextId;
    const activeCtx = contexts.value.find(c => c.id === activeContextId.value);
    if (activeCtx) {
      urlInput.value = activeCtx.currentUrl;
    }
  }
};

const createContext = async () => {
  isLoading.value = true;
  await window.isolatedBrowser.createContext(urlInput.value || 'https://baidu.com');
  await loadContexts();
  isLoading.value = false;
};

const switchContext = async (id) => {
  await window.isolatedBrowser.switchContext(id);
  await loadContexts();
};

const closeContext = async (id) => {
  await window.isolatedBrowser.closeContext(id);
  await loadContexts();
};

const navigate = async () => {
  if (!activeContextId.value) return;
  await window.isolatedBrowser.navigateContext(activeContextId.value, urlInput.value);
  await loadContexts();
};

onMounted(() => {
  loadContexts();
});
</script>

<template>
  <div class="app-shell">
    <div class="glass" style="padding: 12px;">
      <div class="address-row">
        <input 
          v-model="urlInput" 
          @keyup.enter="navigate"
          placeholder="Enter URL..." 
          class="url-input"
          style="flex: 1; padding: 8px; border-radius: 8px; border: 1px solid #ccc;"
        />
        <button @click="navigate" class="primary-button">Go</button>
        <button @click="createContext" class="primary-button">+ New Tab</button>
      </div>
      
      <div class="tabs-row" style="margin-top: 10px;">
        <div 
          v-for="ctx in contexts" 
          :key="ctx.id"
          class="tab-item"
          :class="{ active: ctx.id === activeContextId }"
          @click="switchContext(ctx.id)"
          style="padding: 6px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.5);"
        >
          <span>{{ ctx.title || 'New Tab' }}</span>
          <span @click.stop="closeContext(ctx.id)" style="font-size: 12px; color: red;">x</span>
        </div>
      </div>
    </div>
    
    <div style="flex: 1; display: flex; justify-content: center; align-items: center; color: #666;">
      Browser View Area (Managed by Main Process)
    </div>
  </div>
</template>

<style scoped>
.tab-item.active {
  background: #fff !important;
  font-weight: bold;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
</style>
