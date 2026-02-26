# 开发任务拆分与完成状态

基于 `docs/requirements.md` 进行任务拆分，并对当前版本状态进行标记。

## A. 隔离浏览器（FR-1）

- [x] A1. 支持新建/切换/关闭标签页。
- [x] A2. 每个标签页使用独立 `persist:ctx-<uuid>` partition。
- [x] A3. 地址栏输入网址并访问，自动补全 `https://`。
- [x] A4. 关闭标签释放 BrowserView 资源。

## B. 账号矩阵（FR-2）

- [x] B1. 平台默认支持抖音/小红书/头条。
- [x] B2. 支持新增账号（平台、昵称、AI开关、状态）。
- [x] B3. 支持账号列表查询。

## C. 热点采集（FR-3）

- [x] C1. 提供采集入口。
- [x] C2. 热点数据包含平台、主题、热度、采集时间。
- [x] C3. 热点可被后续 AI 生成功能选择。

## D. AI 内容生成（FR-4）

- [x] D1. 支持基于热点生成文章/视频脚本/图片文案。
- [x] D2. 支持语气参数输入。
- [x] D3. 返回标题、正文、生成时间并可预览。

## E. 定时发布（FR-5）

- [x] E1. 创建定时发布任务（账号、内容类型、发布时间）。
- [x] E2. 增加任务状态流转：scheduled/running/success/failed。
- [x] E3. 增加任务执行日志查看。

## F. 工程质量与可维护性（NFR + 任务拆解）

- [x] F1. Electron 安全基线（contextIsolation/nodeIntegration/sandbox）。
- [x] F2. IPC 命名空间规范（contexts:*, matrix:*）。
- [x] F3. 将矩阵业务逻辑从 main 拆分到独立服务模块（`matrix-service`）。
- [x] F4. 增加 IPC 入参校验（`validators`）。
- [x] F5. 增加调度器轮询执行器与日志。
- [x] F6. 使用本地持久化存储替代纯内存（当前为 JSON 文件持久化）。
- [ ] F7. 升级到 SQLite 存储（依赖可用后执行）。
- [ ] F8. 增加单元测试（matrix-service / validators / scheduler）。

## G. 当前未完成项与下一步开发

1. **G1 - SQLite 存储落地**（对应 F7）
   - 新增 DB 层与迁移脚本。
   - 用 SQLite 替代 JSON 持久化。

2. **G2 - 自动化测试补齐**（对应 F8）
   - 增加服务层单元测试。
   - 增加关键 IPC 集成测试。

