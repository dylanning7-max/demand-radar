# Demand Radar（需求雷达）｜项目参考文档（给 AI / Codex 用）

> 目的：自用挖掘需求。通过输入 URL 抓取网页正文（通用提取），生成“需求卡（Need Card）”，可保存、可回看；支持手动“Pull Now”以及 Cron 定时任务，且二者走同一套后端 Job Runner。

## 0. 当前决策（已拍板）
- 技术栈：Next.js（App Router）+ Node/TypeScript
- 数据库：Neon（托管 PostgreSQL）+ 部署 Vercel
- MVP v0：仅做“任意网页正文”的通用提取（best-effort），不追求全网 100% 覆盖
- 关键约束：**Pull Now 按钮与 Cron 定时任务必须调用同一套 Job Runner 方法**
- 新增（工程规则）：
  - 先走 Readability；失败/过短降级走 **Jina Reader**
  - `evidence_quote` 必须是输入文本的**逐字子串**（否则置空）
  - URL **归一化 + 幂等 Upsert**（避免重复记录）
  - Vercel 可能有超时限制：`runJob` 一次只处理 1 条（或严格 timebox），并支持断点续跑（step 字段）

---

## 1. 产品目标（MVP v0）
### 1.1 用户故事（自用）
- 我在首页粘贴一个 URL，点击 Analyze，系统抓取正文并生成一条需求分析结果（需求卡）。
- 我在首页点 Pull Now，系统按配置执行一次“拉取需求”任务，并记录 job run 状态。
- 我在配置页设置定时任务开关/频率；Cron 到点自动跑，与 Pull Now 完全同逻辑。

### 1.2 v0 不做
- 不做多平台适配器（先不做 Reddit/V2EX 评论抓取适配）
- 不做复杂爬虫对抗（验证码/登录/反爬）
- 不做全量评论抓取（评论在 v0 暂时不作为通用能力）
- 不做多用户体系（默认单用户自用）

---

## 2. 前端页面（必须）
### 2.1 `/config` 配置页（Form）
最小配置项：
- schedule_enabled: boolean
- schedule_interval_minutes: number（例如 60 / 180 / 1440）
- max_content_chars: number（默认 12000）
- include_comments: boolean（v0 可保留但默认 false）
- comment_max_items: number（默认 30）
- cron_secret: string（用于 Cron 触发鉴权）

展示字段：
- last_job_run_at
- last_job_status
- last_job_error（如有）

交互：
- 保存配置（Save）
- 生成/重置 cron_secret（可选）

### 2.2 `/` 首页
组件：
- URL 输入框（http/https 校验）
- Analyze 按钮（分析单条 URL）
- Pull Now 按钮（触发 job runner）
- 状态展示区（fetching/extracting/llm/done/failed）
- 结果展示：需求卡（Need Card）+ 原文链接

可选：
- 最近分析记录列表（last 10）

---

## 3. 后端架构（关键：统一 Job Runner）
### 3.1 核心服务函数（必须）
`runJob(jobName: "pull_demands", trigger: "manual" | "cron")`

要求：
- Pull Now 与 Cron 必须调用同一个 `runJob`
- 写入 job_runs，记录状态与日志
- 幂等：允许重复调用，不产生脏数据；至少保证 job_runs 可追踪
- 超时友好（Vercel 环境）：
  - 单次 job **最多处理 1 条**（或严格 timebox）
  - 支持断点续跑：`url_analyses.step` 记录执行到哪一步

### 3.2 API 路由（最小集合）
- `GET /api/config`：读取配置
- `POST /api/config`：保存配置
- `POST /api/analyze-url`：分析单条 URL（抓取→提取→LLM→存储）
- `POST /api/jobs/pull-now`：手动触发 `runJob("pull_demands", "manual")`
- `POST /api/cron/run`：Cron 调用入口（校验 cron_secret）→ `runJob("pull_demands", "cron")`

---

## 4. 数据模型（Neon Postgres）
> MVP 不追求复杂。重点是能存配置、分析记录、job runs。

### 4.1 app_config（单行）
- id (pk, 固定为 1 或 uuid)
- schedule_enabled boolean
- schedule_interval_minutes int
- max_content_chars int
- include_comments boolean
- comment_max_items int
- cron_secret text
- updated_at timestamptz

### 4.2 url_analyses（分析记录）
- id uuid pk
- url text
- url_normalized text（归一化后的 URL，用于去重）
- url_hash text（可选：对 url_normalized 做 hash）
- status text (queued|running|success|failed)
- step text nullable（fetched|extracted|analyzed）
- fetched_at timestamptz
- title text nullable
- content_text text nullable（提取后的正文，按 max_content_chars 截断）
- need_card_json jsonb nullable（LLM 输出）
- extractor_used text nullable（"readability" | "jina"）
- extracted_len int nullable
- fail_reason text nullable
- error text nullable
- created_at timestamptz

索引/约束（建议）：
- UNIQUE(url_normalized) 或 UNIQUE(url_hash)
- (created_at) 普通索引（用于最近记录列表）

### 4.3 jobs（可选，或写死）
- name text pk（如 "pull_demands"）
- enabled boolean

### 4.4 job_runs（必须）
- id uuid pk
- job_name text
- trigger text ("manual"|"cron")
- status text ("running"|"success"|"failed")
- started_at timestamptz
- finished_at timestamptz nullable
- log text nullable
- error text nullable

---

## 5. “通用正文提取”策略（v0）
### 5.1 Pipeline（Analyze URL）
1) URL Normalize（必做）：
   - 去掉常见追踪参数（utm_*, gclid, fbclid 等）
   - 输出 `url_normalized`（用于幂等）
2) Fetch：HTTP GET（超时、最大响应大小限制）
   - 带标准 Chrome User-Agent
3) Extract（优先）：Readability（基于 JSDOM 的正文抽取）
4) Clean：
   - 去脚本/样式
   - 合并空白、去导航噪声
   - 截断到 max_content_chars
5) Heuristic：
   - extracted_len < 阈值（如 800）→ 标记 likely_js_app
   - fail_reason（建议：`LIKELY_JS_RENDER` / `TOO_SHORT` / `FETCH_FAILED`）
6) Fallback（降级一次）：
   - 当 `FETCH_FAILED` 或 `LIKELY_JS_RENDER/TOO_SHORT` 时，尝试 **Jina Reader**
   - `extractor_used="jina"`，重新计算 extracted_len
7) LLM：
   - 输出严格 JSON（Need Card Schema）
   - **证据强制**：`evidence_quote` 必须是 sourceText 的逐字子串；找不到则返回 null
8) Validate（后端二次校验）：
   - 若 `evidence_quote != null && !sourceText.includes(evidence_quote)`：
     - 将 evidence_quote 置为 null
     - fail_reason 追加/设为 `QUOTE_NOT_FOUND`
9) Save（幂等 Upsert）：
   - 以 `url_normalized` 为键 upsert：
     - 重新分析同一 URL → UPDATE（而不是 INSERT 新行）
   - 记录 step：fetched → extracted → analyzed

### 5.2 v0 兜底（前端提示）
当 fail_reason=LIKELY_JS_RENDER / TOO_SHORT / FETCH_FAILED：
- 提示：该站可能需要 JS 渲染/登录/反爬，暂时抓不到
- 提供兜底入口：
  - v0：仅提示
  - v0.1：加“粘贴正文再分析”或“headless 渲染重试”

---

## 6. Need Card（需求卡）JSON Schema（v0）
字段尽量少，保证可排序可复盘：
- pain: string（一句话痛点）
- who: string（角色/人群）
- job: string（要完成的任务）
- trigger: string（触发场景）
- workaround: string（现有替代方案）
- wtp_signal: "none" | "weak" | "strong"（付费信号强弱）
- evidence_quote: string | null（最关键一句原文证据，**必须逐字来自 sourceText**）
- source_url: string（原 URL）

Prompt 约束（必须写进提示词）：
- evidence_quote MUST be a direct, verbatim substring from the provided source text.
- Do not paraphrase. If no direct evidence exists, return null.

---

## 7. 验收标准（MVP Done）
- 配置页可保存并读取配置
- 首页输入 URL，能成功提取常见文章页正文并产出 Need Card
- Pull Now 与 Cron 都调用同一个 runJob，并写 job_runs 可追踪
- 提取失败可明确提示 fail_reason（不会无响应/黑盒）
- 去重有效：同一 URL 反复分析不会产生多条重复记录（upsert 生效）
- quote 校验有效：evidence_quote 不会“编造”（不在原文即置空）

---

## 8. 后续路线（不做但记录）
- v0.1：失败兜底（手动粘贴正文 / headless 渲染重试）
- v1：Source Adapter（HN/V2EX 等）+ 评论漏斗 + 聚类
- v1.5：聚类看板 + Top themes 排序（频次/付费/热度）
