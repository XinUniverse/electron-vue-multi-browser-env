# 需求文档：平台 API 集成

## 简介

本文档定义了将当前模拟实现的平台适配器升级为真实平台 API 对接的功能需求。系统当前已具备完整的账号矩阵管理、热点采集、AI 内容生成和定时发布功能，但平台发布功能使用模拟实现。本次升级将实现与抖音、小红书、头条三大平台的真实 API 对接，提供可靠的自动发布能力。

## 术语表

- **Platform_Adapter**：平台适配器，封装特定平台的 API 调用逻辑
- **Real_Mode**：真实模式，使用平台真实 API 进行发布
- **Mock_Mode**：模拟模式，使用模拟数据进行发布测试
- **Publish_Task**：发布任务，包含账号、内容、发布时间等信息的待执行任务
- **Content_Asset**：内容资产，AI 生成的可发布素材
- **Human_Takeover**：人工接管，当自动发布遇到验证码等情况时由人工介入处理
- **Rate_Limit**：限流，平台对 API 调用频率的限制
- **Captcha**：验证码，平台的风控验证机制
- **Retry_Strategy**：重试策略，发布失败后的自动重试机制
- **Content_Compliance**：内容合规，发布前的敏感词和格式检查
- **Publish_Metric**：发布指标，记录发布成功率、延迟等数据

## 需求

### 需求 1：平台 API 配置管理

**用户故事：** 作为系统管理员，我希望能够配置各平台的 API 凭证和参数，以便系统能够调用真实的平台接口。

#### 验收标准

1. THE System SHALL 支持通过环境变量配置每个平台的 API 凭证（appId、appSecret）
2. THE System SHALL 支持配置每个平台的 API 端点 URL
3. THE System SHALL 支持配置每个平台的请求超时时间
4. THE System SHALL 支持配置平台适配器的运行模式（mock/real）
5. WHEN 配置缺失或无效时，THE System SHALL 返回明确的错误信息并阻止 API 调用

### 需求 2：抖音平台 API 对接

**用户故事：** 作为内容运营，我希望系统能够通过抖音开放平台 API 自动发布内容，以便实现抖音账号的自动化运营。

#### 验收标准

1. THE Douyin_Adapter SHALL 实现抖音开放平台的鉴权流程
2. WHEN 发布图文内容时，THE Douyin_Adapter SHALL 调用抖音图文发布 API
3. WHEN 发布视频内容时，THE Douyin_Adapter SHALL 调用抖音视频发布 API
4. THE Douyin_Adapter SHALL 处理抖音平台返回的错误码并映射为统一错误类型
5. THE Douyin_Adapter SHALL 遵守抖音平台的 API 调用频率限制
6. WHEN API 调用成功时，THE Douyin_Adapter SHALL 返回抖音平台的内容 ID

### 需求 3：小红书平台 API 对接

**用户故事：** 作为内容运营，我希望系统能够通过小红书开放平台 API 自动发布内容，以便实现小红书账号的自动化运营。

#### 验收标准

1. THE Xiaohongshu_Adapter SHALL 实现小红书开放平台的鉴权流程
2. WHEN 发布笔记内容时，THE Xiaohongshu_Adapter SHALL 调用小红书笔记发布 API
3. THE Xiaohongshu_Adapter SHALL 处理小红书平台返回的错误码并映射为统一错误类型
4. THE Xiaohongshu_Adapter SHALL 遵守小红书平台的 API 调用频率限制
5. WHEN API 调用成功时，THE Xiaohongshu_Adapter SHALL 返回小红书平台的笔记 ID

### 需求 4：头条平台 API 对接

**用户故事：** 作为内容运营，我希望系统能够通过头条开放平台 API 自动发布内容，以便实现头条账号的自动化运营。

#### 验收标准

1. THE Toutiao_Adapter SHALL 实现头条开放平台的鉴权流程
2. WHEN 发布文章内容时，THE Toutiao_Adapter SHALL 调用头条文章发布 API
3. THE Toutiao_Adapter SHALL 处理头条平台返回的错误码并映射为统一错误类型
4. THE Toutiao_Adapter SHALL 遵守头条平台的 API 调用频率限制
5. WHEN API 调用成功时，THE Toutiao_Adapter SHALL 返回头条平台的文章 ID

### 需求 5：统一错误处理

**用户故事：** 作为开发者，我希望系统能够统一处理各平台的错误响应，以便提供一致的错误处理逻辑。

#### 验收标准

1. THE System SHALL 定义统一的错误码枚举（AUTH_FAILED、RATE_LIMIT、INVALID_PAYLOAD、TIMEOUT、CAPTCHA_REQUIRED、CONTENT_VIOLATION）
2. WHEN 平台返回鉴权失败错误时，THE System SHALL 映射为 AUTH_FAILED 错误
3. WHEN 平台返回限流错误时，THE System SHALL 映射为 RATE_LIMIT 错误
4. WHEN 平台返回参数错误时，THE System SHALL 映射为 INVALID_PAYLOAD 错误
5. WHEN API 请求超时时，THE System SHALL 映射为 TIMEOUT 错误
6. WHEN 平台要求验证码时，THE System SHALL 映射为 CAPTCHA_REQUIRED 错误
7. WHEN 平台返回内容违规错误时，THE System SHALL 映射为 CONTENT_VIOLATION 错误

### 需求 6：验证码与风控处理

**用户故事：** 作为内容运营，当自动发布遇到验证码或风控时，我希望系统能够通知我并支持人工介入，以便完成发布任务。

#### 验收标准

1. WHEN 平台返回验证码要求时，THE System SHALL 将任务状态标记为 captcha_required
2. WHEN 任务状态为 captcha_required 时，THE System SHALL 通过告警通道通知运营人员
3. THE System SHALL 提供人工接管接口，允许运营人员手动完成验证后继续任务
4. WHEN 人工接管完成时，THE System SHALL 将任务状态更新为 scheduled 并重新执行
5. WHEN 人工接管超时（24小时）时，THE System SHALL 将任务标记为 failed

### 需求 7：发布前内容合规检查

**用户故事：** 作为系统管理员，我希望系统在发布前检查内容合规性，以便避免发布违规内容导致账号受限。

#### 验收标准

1. THE System SHALL 在发布前检查内容是否包含敏感词
2. THE System SHALL 支持配置敏感词词库
3. WHEN 内容包含敏感词时，THE System SHALL 阻止发布并返回 CONTENT_VIOLATION 错误
4. THE System SHALL 检查内容格式是否符合平台要求（标题长度、正文长度、图片数量等）
5. WHEN 内容格式不符合要求时，THE System SHALL 阻止发布并返回 INVALID_PAYLOAD 错误

### 需求 8：增强的重试策略

**用户故事：** 作为系统管理员，我希望系统能够智能地重试失败的发布任务，以便提高发布成功率。

#### 验收标准

1. THE System SHALL 支持配置不同错误类型的重试策略
2. WHEN 遇到 RATE_LIMIT 错误时，THE System SHALL 等待指定时间后重试
3. WHEN 遇到 TIMEOUT 错误时，THE System SHALL 立即重试
4. WHEN 遇到 AUTH_FAILED 错误时，THE System SHALL 不重试并立即标记为 failed
5. WHEN 遇到 CAPTCHA_REQUIRED 错误时，THE System SHALL 不自动重试并等待人工接管
6. THE System SHALL 记录每次重试的时间和原因
7. WHEN 重试次数超过配置的最大值时，THE System SHALL 标记任务为 failed

### 需求 9：发布结果追踪

**用户故事：** 作为内容运营，我希望能够查看每次发布的详细结果，以便了解发布状态和排查问题。

#### 验收标准

1. THE System SHALL 记录每次发布的请求参数
2. THE System SHALL 记录每次发布的响应数据
3. THE System SHALL 记录每次发布的平台返回 ID
4. THE System SHALL 记录每次发布的耗时
5. THE System SHALL 支持通过任务 ID 查询发布详情
6. THE System SHALL 支持查询最近的发布失败记录

### 需求 10：发布数据分析

**用户故事：** 作为矩阵负责人，我希望能够查看发布数据的统计分析，以便评估自动化运营效果。

#### 验收标准

1. THE System SHALL 统计每个平台的发布成功率
2. THE System SHALL 统计每个平台的平均发布耗时
3. THE System SHALL 统计各类错误的发生频率
4. THE System SHALL 支持按时间范围查询统计数据
5. THE System SHALL 提供发布趋势图表数据（成功数、失败数按日期分组）

### 需求 11：平滑迁移支持

**用户故事：** 作为开发者，我希望系统能够支持从模拟模式平滑切换到真实模式，以便逐步验证和上线功能。

#### 验收标准

1. THE System SHALL 支持为每个平台独立配置运行模式（mock/real）
2. WHEN 平台配置为 mock 模式时，THE System SHALL 使用模拟实现
3. WHEN 平台配置为 real 模式时，THE System SHALL 使用真实 API
4. THE System SHALL 在日志中明确标识当前使用的模式
5. THE System SHALL 支持在运行时通过配置文件切换模式（无需重启应用）
