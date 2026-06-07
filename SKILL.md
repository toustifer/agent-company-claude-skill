---
name: agent-company
description: Start a multi-Agent team with persistent domain Workers. Leader decomposes goals into tasks, assigns to domain Workers, Workers accumulate history. Use /agent-company "your goal" to start, or /agent-company resume to continue.
argument-hint: "[goal | init | reset | fresh | review | reflect | update | upgrade | resume | status | lang zh/en]"
---
# /agent-company

Start a virtual dev team — a Leader Agent breaks down your goal into tasks via DAG, distributes them to persistent domain Workers, and Workers execute independently with tool access. All state persists to `.mycompany/`, so sessions survive restarts.

## Core Concept: Domain Workers

Workers are **persistent business domain agents**, not ephemeral task executors.

```
项目启动 → 发现业务域 → 创建持久Worker → 有任务时busy，无事idle
                                         → 新需求来了，分配给已有Worker
                                         → 出现全新业务域，才创建新Worker
```

Each Worker:
- Owns a business domain (orders, chat, match, payment, etc.)
- Is **never deleted** — only merged or split
- Accumulates a `history[]` of completed tasks
- Is `idle` (available) or `busy` (executing a task)
- The DAG (`dag[]`) only contains **pending** and **in_progress** tasks. Completed tasks are removed from DAG and appended to the Worker's `history[]`.

## Leader Responsibilities (MANDATORY)

Leader is the **conductor**, not a worker. Leader's job is plan, dispatch, review — and nothing else.

### Leader MUST do
- Analyze goals, decompose into tasks, assign to Workers
- Update `leader.json` (dag[] + workers[] + overlapAnalysis)
- Dispatch Workers via Agent tool with proper prompts
- Review Worker output against acceptance criteria
- Present results to the user

### Leader MUST NOT do
- **Write or edit any code directly** — ALL code changes go through Workers
- Debug issues by reading code and fixing inline — file a task, assign to Worker
- Answer technical questions by investigating code — dispatch Worker to research
- "Just quickly fix this" — there is no quick fix, there is only Worker tasks
- Skip the claim → push → dispatch → review cycle for any implementation

### When User Asks for Anything That Touches Code

```
User: "Can you fix X?" / "Why does Y happen?" / "Look into Z"
  │
  ▼
Leader: Create task → assign Worker → dispatch Agent → review result
```

If the user says "just do it yourself this time" — still dispatch a Worker. The discipline is the point.

### Enforcement
- If Leader writes code directly, the user should call it out as a protocol violation
- After 3 violations in one session, Leader MUST stop and re-read this section aloud

### Verification Rules (MANDATORY — learned from 2026-05-26 outage)

**200 OK ≠ Data Persisted.** Frontend receiving HTTP 200 does not mean the database was actually updated. ORM frameworks (SQLAlchemy, etc.) can silently skip writes due to mutation tracking bugs, transaction rollback, or constraint violations that return success.

**Every task that touches backend writes MUST include these acceptance criteria:**

1. **DB verification**: After the Worker completes, the Reviewer (Leader) MUST query the database directly (Supabase MCP / SSH mysql) to confirm the written data exists. If the AC says "saveTemplate called successfully", the Reviewer checks `SELECT * FROM users WHERE habit_template contains the new data`.

2. **ORM mutation tracking check**: For Python/FastAPI backends using SQLAlchemy, any task modifying JSONB/JSON columns MUST verify that `MutableDict.as_mutable()` is enabled OR `flag_modified()` is called before `db.commit()`.

3. **Round-trip test**: After a write operation, read the same data back from the API and verify it matches what was sent. A 200 POST followed by a GET returning different data is a FAIL.

4. **Test Worker MUST query DB**: worker-test's methodology requires at least one Supabase SQL query to verify every write operation actually persisted. Mock responses and HTTP status codes are not sufficient.

**Task decomposition checklist (Leader's pre-dispatch gate):**
- [ ] Does this task touch backend write APIs?
- [ ] If yes, do the acceptance criteria include DB verification?
- [ ] Is there a test task scheduled after implementation to verify persistence?
- [ ] For JSONB/JSON columns: has ORM mutation tracking been checked?

## Standard Worker Types

### Domain Workers (`domain: true`)
Represent actual business domains. Created by `init` or `fresh` when new business logic emerges.

```json
{
  "id": "worker-order",
  "title": "订单服务",
  "scope": "订单 CRUD、状态机、生命周期动作",
  "domain": true,
  "target": "software",
  "files": ["services/order.js", "pages/order/"],
  "status": "idle",
  "currentTask": null,
  "history": []
}
```

`target` 表示该 Worker 的目标开发者角色：

| target | 含义 | 示例 |
|--------|------|------|
| `"software"` | 纯软件开发者关心的业务 | 用户系统、订单、AI对话、前端页面 |
| `"hardware"` | 硬件/嵌入式开发者关心的业务 | BLE固件、ESP32、传感器驱动 |
| `"fullstack"` | 软硬件交叉，两方都需了解 | BLE通信协议栈、Docker设备部署 |

Leader 创建新 Worker 时必须指定 `target`。DAG 面板可按 target 筛选 Worker。

### Infrastructure Workers (`domain: false`)
Cross-cutting concerns shared across domains. Standardized templates:

| Worker ID | Title | When to Create |
|-----------|-------|---------------|
| `worker-guard` | 路由守卫 & 流程编排 | 项目有路由控制和多步骤流程时 |
| `worker-infra` | 基础设施 | 项目有 utils/api/storage 层时 |
| `worker-config` | 配置与文档 | 项目有全局配置和文档时 |
| `worker-components` | 公共组件 | 项目有复用组件时 |
| `worker-ops` | 部署与运维 | 项目有后端代码或部署需求时 |

**worker-ops 标准定义：**
```json
{
  "id": "worker-ops",
  "title": "部署与运维",
  "scope": "后端服务部署、CI/CD 流水线、服务器监控、Docker 容器化、域名与 SSL 管理、环境配置",
  "domain": false,
  "target": "fullstack",
  "files": [],
  "status": "idle",
  "currentTask": null,
  "history": []
}
```
`files` 初始为空，当引入 Dockerfile、CI 配置、部署脚本等文件后自动补充。

### Page Workers (`domain: false`)
One per major page. Thin wrappers that own page-level files.

---

## Options

- `$ARGUMENTS` may contain:
  - A task goal (e.g. `"add login module"`) — **appends to existing DAG** (default when leader.json exists)
  - `init` — **first-time setup only** (`.mycompany/` must NOT exist). Analyzes codebase + docs, generates baseline leader.json with domain Workers. Refuses to run if `.mycompany/` already exists — use `reset` instead.
  - `reset` — **re-analyze an existing project** from scratch. Backs up old `leader.json` → `leader.json.bak.{timestamp}`, then re-runs init analysis to generate fresh domain Workers. Requires user confirmation.
  - `fresh` — **architecture review & continuous improvement**. Leader reviews recent Worker activity (git log, completed history), audits domain coverage (are there code modules without a domain Worker?), and proposes new domain Workers or boundary adjustments. Does NOT wipe anything. Requires user confirmation.
  - `update` — **sync project with remote**. Runs `git pull` to get latest leader.json + code, then `git push` any local changes. Use before starting work to ensure you have the latest state.
  - `review [taskId]` — **re-review a task or show review dashboard**. Without args: shows all pending tasks and worker statuses. With `T5`: re-checks acceptance criteria against actual code, updates report.
  - `reflect` — **pattern detection & playbook generation**. Leader scans recent Worker retrospectives and review records for repeated patterns (≥3 same issues). Generates playbook drafts for user approval. Also checks Worker experience.md files for gaps. Requires user confirmation for any playbook changes.
  - `upgrade` — **update the skill itself**. Runs `git pull` in `~/.claude/skills/agent-company/` to fetch the latest SKILL.md and agents. Use when the team releases new skill features.
  - `new "task goal"` — starts a **fresh session**, replacing existing DAG
  - `resume` — restores the last session and continues unfinished tasks
  - `status` — shows current session progress without starting work
  - `lang zh` or `lang en` — switch display language (default: zh)

### Append vs New

When a leader.json already exists and user provides a new goal:
- **Default (append)**: Leader reads the current DAG + existing module docs → analyzes the NEW goal → appends new tasks to the DAG → preserves existing Worker definitions → increments task numbering from the last used ID.
- **`new` flag**: Wipes leader.json and starts fresh.

### Init Mode (first-time only)

**Precondition:** `.mycompany/` must NOT exist. If it already exists, refuse and tell the user to use `/agent-company reset` instead.

This mode analyzes the entire existing codebase and generates a `leader.json` where each discovered business domain becomes a **persistent Worker** with a `history` entry. This gives the AI a complete picture of what's already built and who owns what.

**What Init Does:**

1. Scan `docs/` — read all documentation: `FUNCTIONAL_SPEC.md`, `UI_GUIDE.md`, `modules/*.md`, and any other `.md` files
2. Scan source directory — understand directory structure, identify business domains from actual code
3. Read `README.md` — understand project overview and architecture
4. Read key config files — `app.json`, `project.config.json`, etc.
5. Dispatch a **Leader** agent with an init-specific prompt (see below)
6. Leader produces `leader.json` where:
   - `workers[]` contains one entry per discovered business domain
   - Each Worker has `domain: true`, `files` listing its source files, and a `history[]` documenting existing code as completed work
   - `dag[]` starts empty (existing code is recorded in Worker histories, not as tasks)
   - `architectureLayers` groups Workers by layer
   - `designDecisions` records key architectural patterns
7. Proceed to **Phase 1.5** (DAG visualization) — user can see the full business landscape in browser (Workers section + empty task queue)
8. **Skip Phase 2** — no Workers dispatched (all existing code is baseline)

**Init Leader Prompt Requirements:**

The Leader agent dispatched for `init` MUST produce a `leader.json` with:

- `sessionId`: auto-generated
- `goal`: extracted from project README or description
- `createdAt`: ISO timestamp
- `status`: `"baseline"` (snapshot of existing code)
- `workers[]`: one per discovered business domain
  - Each worker: `id`, `title`, `scope`, `domain: true`, `files` (actual source files), `status: "idle"`, `currentTask: null`, `history[]` with one entry describing what exists
- `dag[]`: empty array (no pending work)
- `architectureLayers`: Workers grouped by layer (e.g., L0_Config, L1_Foundation, L2_Business)
- `designDecisions`: key patterns found
- Worker `history[]` entries have: `taskId`, `title`, `description`, `completedAt`, `outputFiles`

**Init Worker Schema:**
```json
{
  "id": "worker-order",
  "title": "订单服务",
  "scope": "订单状态机、CRUD、生命周期动作",
  "domain": true,
  "target": "software",
  "files": ["services/order.js", "services/orderActions.js", "pages/order/"],
  "status": "idle",
  "currentTask": null,
  "history": [
    {
      "taskId": "BASELINE",
      "title": "订单模块（已有代码）",
      "description": "订单 CRUD、9 状态状态机、生命周期动作（accept/reject/pay/cancel）",
      "completedAt": "init timestamp",
      "outputFiles": ["services/order.js", "services/orderActions.js"]
    }
  ]
}
```

**Init vs Bootstrap:**

- Phase 0 bootstrap creates an **empty** `.mycompany/` and `leader.json` skeleton
- Init mode fills `leader.json` with the **actual business domains** discovered in the codebase
- Init mode ONLY runs when `.mycompany/` does NOT exist. If it exists, use `reset`.
- After init, subsequent `/agent-company "new goal"` calls have full context for Worker assignment

### Reset Mode (re-analyze existing project)

**Precondition:** `.mycompany/` MUST already exist. If it doesn't, tell the user to use `/agent-company init` instead.

Reset re-analyzes the codebase from scratch (same analysis as init), but first **backs up** the old `leader.json` to `leader.json.bak.{YYYYMMDD-HHmmss}`.

**Reset requires explicit user confirmation.**

**What Reset Does:**

0. **Confirmation Gate (MANDATORY)**: Before doing anything, show the user current DAG stats and ask:
   > ⚠️ 重置将清空当前 DAG（共 X 个任务，Y 个待执行）。旧 leader.json 会被备份。是否确认重置？
   
   Wait for user to reply **confirm**. If denied, abort.
1. **Backup**: Rename `leader.json` → `leader.json.bak.{timestamp}`
2. **Notify user**: "旧 leader.json 已备份至 leader.json.bak.{timestamp}"
3. **Run Init Analysis**: scan docs, source, README → dispatch Leader → generate fresh baseline `leader.json`
4. All discovered domains become persistent Workers with history
5. Proceed to **Phase 1.5** (DAG visualization)
6. **Skip Phase 2** — no Workers dispatched

**Key Safety Guarantees:**
- Old `leader.json` is never deleted — only renamed
- Git provides additional safety
- Workers accumulate history, nothing is lost

### Fresh Mode (architecture review & continuous improvement)

**Precondition:** `.mycompany/` MUST already exist with a `leader.json`.

`fresh` is the team's **retrospective** — Leader reviews recent Worker activity, audits domain coverage, and proposes improvements.

**What Fresh Does:**

0. **Confirmation Gate (MANDATORY)**: Show current stats and ask:
   > 🔍 架构审视将分析近期 Worker 产出和 Git 历史，检查业务域覆盖是否完整，提出优化建议。是否继续？
   
   Wait for **confirm**. If denied, abort.
1. **Collect Intelligence**:
   - Read all Worker reports: `.mycompany/workers/*/session.json`
   - Read recent git log: `git log --oneline -30`
   - Read current `leader.json` (full workers + dag + designDecisions)
   - Read module docs: `docs/modules/*.md`
   - Scan source tree for drift vs Worker `files` declarations
2. **Dispatch Leader for Architecture Audit**:

```
## Task: Architecture Audit & Domain Coverage

### Context
Workers are persistent domain agents. Your job is to ensure every business domain has a Worker, and Workers' boundaries are still correct.

### What to Analyze
1. **Domain Coverage**: Scan the actual source tree. Are there code modules (pages/, services/, components/) that don't belong to any Worker's `files` list? → propose new Worker
2. **Worker Boundary Drift**: Review each Worker's `files` list — do the actual files still match? Any files that should move to another Worker?
3. **Bloated Workers**: Any Worker whose `files` spans 5+ unrelated modules? → propose split
4. **Overlapping Workers**: Two Workers with overlapping `files`? → propose merge
5. **Git History**: Run git log --oneline -30. Which files change most often? Does the change frequency suggest poor domain boundaries?
6. **Architecture Smells**: Circular deps, large files, dead code, feature flags always true
7. **Module Doc Freshness**: For each module doc, check if outputFiles still exist

### Output
Write updates to leader.json:

#### 1. Worker Changes
- **New Workers**: Only for uncovered domains (new Workers get `domain: true` and initial history)
- **Merged Workers**: Set merged Workers' `status` to `"merged"`, point them to replacement
- **Split Workers**: Original Worker keeps narrow scope, new Worker gets split-off domain
- **NEVER delete or remove Workers** — set their status to "merged" if consolidated

#### 2. Tasks (append to dag[])
New tasks for implementation work. Task IDs prefixed by category:
- **R** (Refactor): split large files, adjust boundaries
- **D** (Docs): update stale module docs
- **C** (Cleanup): remove dead code, retire old flags
- **W** (Worker): Worker boundary changes (execute BEFORE other tasks)
- **P** (Performance): optimize

Constraints:
- Max 8 tasks. Be surgical.
- Append to dag[], do NOT touch existing tasks.
- Tasks tagged with `"tags": ["fresh"]`.
```

3. **Review Leader's Output**: Verify new tasks make sense, Boundary changes are correct.
4. Proceed to **Phase 1.5** (DAG visualization)
5. User confirms → **Phase 2** (Worker execution). W tasks execute first.

**After Fresh Tasks Complete:**
- Workers' `files` lists are updated to reflect any boundary changes
- Module docs are refreshed
- The project gets incrementally healthier

---

## Language Configuration

The skill supports Chinese (`zh`) and English (`en`) for all generated UI text (DAG HTML labels, status badges, confirmation prompts, etc.).

Language is stored in `.mycompany/config.json`:
```json
{ "language": "zh" }
```

**On first init** (Phase 0, step 1), default to `"zh"` if not specified.
**On any `/agent-company` invocation**, check `.mycompany/config.json`. If `language` is set, use that language for all generated output.
**To change language:** 
- CLI: `/agent-company lang en` or `/agent-company lang zh` — updates `.mycompany/config.json`. The DAG HTML detects the change on next poll.
- UI: The DAG page has **中文 / EN** toggle buttons in the stats bar. Click to switch all UI labels instantly without reload.

### Language Mapping

| Context | zh | en |
|---------|----|----|
| Status: pending | 待执行 | Pending |
| Status: in_progress | 执行中 | In Progress |
| Status: idle | 已空闲 | Idle |
| Status: busy | 执行中 | Busy |
| Worker status label | Worker 状态 | Worker Status |
| Worker history | 已完成任务 | Task History |
| Worker domain | 业务域 | Domain |
| Workers section | 业务域 Worker | Domain Workers |
| Active tasks section | 活跃任务 | Active Tasks |
| Layer label | 第X层 | LX |
| Stats: total | 总计 | Total |
| Stats: workers | Workers | Workers |
| Stats: idle | 已空闲 | Idle |
| Stats: busy | 执行中 | Busy |
| Stats: in_progress | 进行中 | In Progress |
| Stats: pending | 待执行 | Pending |
| Detail: description | 任务描述 | Description |
| Detail: dependencies | 依赖任务 | Dependencies |
| Detail: outputs | 产出文件 | Output Files |
| Detail: assigned | 指派 Worker | Assigned Worker |
| Detail: none | 无 | None |
| Detail: no tasks | 暂无待办任务 | No pending tasks |
| Confirm prompt | 请在浏览器中检查任务分解是否正确。确认无误回复 **confirm** 开始执行，或描述需要修改的地方。 | Please review the DAG in your browser. Does the task decomposition look correct? Reply **confirm** to proceed to Worker execution, or describe what needs to change. |
| Node: deps count | X 个依赖 | X deps |
| Page title | 任务依赖图 | Task DAG |
| Back to top | 回到顶部 | Back to top |

---

## Multi-User Collaboration (Git as Distributed Lock)

When multiple people use `/agent-company` on the same project, they coordinate through the shared Git repository. **A successful `git push` is the lock.**

### How It Works

```
User A                          Git Remote                    User B
  │                                │                            │
  │ git pull                       │                            │
  │ T5 = pending                   │                            │
  │                                │              git pull ──── │
  │                                │    T5 = pending            │
  │                                │                            │
  │ claim T5 in leader.json        │                            │
  │ git commit + push ──────────▶  │  ✅ accepted               │
  │                                │                            │
  │                                │              git pull ──── │
  │                                │  T5 = claimedBy: "stifer"  │
  │                                │  ← "已被领走"               │
  │                                │                            │
  │ ... work on T5 ...             │                            │
  │ T5 → completed                 │                            │
  │ git push ──────────────────▶   │  ✅                        │
  │                                │              git pull ──── │
  │                                │  T5 ✅, T10 unlocked       │
```

### Claim Protocol (Phase 2 updated)

Before dispatching ANY Worker, the Reviewer MUST:

1. **`git pull`** — get latest leader.json
2. **Find a ready task** (status=pending, no unexpired claim, deps satisfied)
3. **Write claim**: set `claimedBy`, `claimedAt` (ISO timestamp) in leader.json
4. **`git commit + git push`** — this is the lock acquisition
5. **If push fails** (someone else pushed first) → `git pull` again → find another task → retry
6. **If push succeeds** → lock acquired → set Worker `status: "busy"`, `currentTask: taskId` → dispatch Worker

### Lock Expiry

A claim older than **30 minutes** with status still `pending` is considered expired. Other users may overwrite it.

The `claimedAt` field allows the DAG HTML to show "claimed X min ago" and flag stale claims.

### Task schema

```json
{
  "taskId": "T5",
  "claimedBy": "stifer",
  "claimedAt": "2026-05-22T15:30:00+08:00",
  "assignedWorker": "worker-order",
  "status": "pending",
  ...
}
```

### Per-user identity

Stored in `.mycompany/identity.json` (gitignored — each person has their own, never committed):
```json
{
  "userId": "stifer",
  "name": "小明"
}
```

If `identity.json` doesn't exist or `userId` is not set, prompt the user to set it on first `/agent-company` run.

---

## Phase 0 — Session Bootstrap

1. Check if `.mycompany/` exists. If not, create the directory structure:

```
.mycompany/
  config.json              # { "language": "zh", "business_code": "项目唯一标识" }
  identity.json            # { "userId", "name" } — prompt user if empty
  leader/
    leader.json            # empty skeleton: { goal, dag[], workers[], ... }
    playbook.md            # empty (Leader work standards — populated by reflect)
    diary/
  workers/                 # created on demand per Worker via initWorker()
  scripts/
    validate.js            # leader.json schema & integrity validator
  templates/
    handbook.json          # Worker domain handbook template
  memory/
    project.md             # project technical facts (empty, append-only)
    decisions.md           # architecture decisions (empty, append-only)
  playbook/
    worker.md              # cross-Worker execution standards (empty, populated by reflect)
    reviewer.md            # Reviewer verification standards (empty, populated by reflect)
  tasks/
    inbox.md               # pending tasks
    completed.md           # completed task summaries
```

Directory creation details:
- **生成项目唯一 business_code（MANDATORY — 一次调用，无需重试）**：
	  1. 如果 hub MCP 已配置 → 调用 `POST /v1/hub/businesses/generate-code`（`{ "name": "项目名称" }`）
	     → 返回 `{ "business_code": "siruoning" }` 或 `{ "business_code": "siruoning-a3f8" }`
	     → 后端保证不重复，前端显示只展示 name，不展示 code 后缀
	  2. 如果 hub 未配置 → 用 `{dirname}-{4位随机}` 格式（如 `siruoning-a3f8`）
	  3. 写入 `.mycompany/config.json`：`{ "language": "zh", "business_code": "siruoning-a3f8" }`
- Create `.mycompany/identity.json` (empty, then prompt user for name)
- Create `.mycompany/memory/project.md`
- Create `.mycompany/memory/decisions.md`
- Create `.mycompany/playbook/worker.md`
- Create `.mycompany/playbook/reviewer.md`
- Create `.mycompany/leader/playbook.md`
- Create `.mycompany/leader/diary/` (directory)
- Create `.mycompany/tasks/inbox.md` and `.mycompany/tasks/completed.md`
- Create `.mycompany/templates/` directory
- Create `.mycompany/scripts/` directory
- Copy `validate.js` from skill directory to `.mycompany/scripts/validate.js`
- **Agent Hub 连接引导（MANDATORY — 必须交互，不允许静默跳过）**：
	  1. 检查 `~/.claude.json`（全局）和项目 `.mcp.json`（如果存在）中是否有 `mcpServers.hub` 配置
	  2. **如果已配置** → 若项目 `.mcp.json` 不存在，从全局配置复制一份；若已存在但路径不匹配当前机器（跨机器共享），自动修正路径
	  3. **如果未配置** → 必须向用户展示以下引导，**不可静默跳过**：
	  ```
	  ╔══════════════════════════════════════════════════════════════╗
	  ║  📡 Agent Hub 未连接                                         ║
	  ║                                                              ║
	  ║  Agent Hub 是多机器协作面板，可以：                          ║
	  ║  • 看实时任务进度（DAG）· 跨机器文件锁 · Worker 心跳监控     ║
	  ║                                                              ║
	  ║  🔗 安装教程：hub.stifer.xyz/setup?business={项目标识码}     ║
	  ║     （打开链接，选操作系统，复制配置文件，3 分钟搞定）        ║
	  ║                                                              ║
	  ║  需要我帮你自动配置吗？                                      ║
	  ║  [1] 是，帮我自动配置（需要 agent-hub 仓库在本地）           ║
	  ║  [2] 先跳过，我稍后自己配                                    ║
	  ║  [3] Agent Hub 是什么？详细介绍一下                          ║
	  ╚══════════════════════════════════════════════════════════════╝
	  ```
	  4. 用户选 [1]：自动写入以下配置到项目 `.mcp.json`（一行 URL，全平台通用，不需 clone agent-hub）：
	  ```json
	  {
	    "mcpServers": {
	      "hub": {
	        "type": "http",
	        "url": "https://hub.stifer.xyz/mcp?business=项目标识码"
	      }
	    }
	  }
	  ```
	  然后告知 Dashboard 链接和 `/mcp` 验证命令
	  5. 用户选 [2] 或 [3]：尊重选择，但记录本次跳过了 hub 配置
	  6. **无论结果如何，Leader 后续在 pre-flight 检查中再次提醒**
	- **`.mcp.json` 加入 `.gitignore`**：因为 `.mcp.json` 包含本机绝对路径（`D:/...` vs `/Users/...`），必须被 gitignore，每台机器自己生成。如果 `.gitignore` 中没有 `.mcp.json`，Leader 提示用户添加
- Write handbook.json template to `.mycompany/templates/handbook.json`
- **If `identity.json` has no `userId`**: prompt user for name, write to `identity.json`
- **If user invoked `/agent-company init`**: proceed to **Phase 0.5 — Init Analysis**
- **If user provided a goal**: create `leader/leader.json` skeleton with `workers: []` and `dag: []`, then proceed to Phase 1
- **If user invoked `/agent-company reset`**: refuse — use `init` instead

2. If `.mycompany/` already exists:
   - **Always check** identity.json exists with userId
   - Handle commands: `reset`, `fresh`, `init` (refuse), `resume`, `status`, `update`, `review`, `reflect`, `upgrade`, `lang`

3. **New Worker bootstrap**: When creating a new Worker, run `initWorker(id)`:
   - Create `.mycompany/workers/{id}/`
   - Create `.mycompany/workers/{id}/diary/`
   - Create `.mycompany/workers/{id}/handbook.json` from template (see template at `.mycompany/templates/handbook.json`)
   - Create `.mycompany/workers/{id}/experience.json` (empty arrays, ready for first task)

### Phase 0.5 — Init Analysis (triggered by `/agent-company init`)

When the user runs `/agent-company init`, analyze the existing codebase and generate a comprehensive `leader.json` with persistent domain Workers.

**Step 0.5.1 — Read Documentation**

Read ALL of the following (if they exist):
- `README.md` — project overview, architecture, tech stack
- `docs/FUNCTIONAL_SPEC.md` — functional specification
- `docs/UI_GUIDE.md` — UI design guidelines
- `docs/modules/*.md` — each module's documentation
- `package.json` — dependencies, scripts (if exists)
- `app.json` — page/subpackage structure (WeChat Mini Program)
- `project.config.json` — app config

**Step 0.5.2 — Scan Source Code Structure**

Identify business domains from actual directory layout:
- `pages/` — one directory per page/feature → each is a potential domain
- `services/` — one service per business domain
- `api/` — API modules grouped by domain
- `components/` — shared components
- `utils/` — utility functions
- `config/` — configuration

**Step 0.5.3 — Dispatch Leader for Init**

Dispatch a **Leader** agent with this prompt:

```
You are analyzing an EXISTING codebase to create a baseline domain map. This is NOT a work session — you are documenting what already exists as persistent Workers.

## What to Do
Read the project's documentation and source code to understand the current business domains. Then produce a leader.json where each domain is a persistent Worker with history.

## Steps
1. Read docs/FUNCTIONAL_SPEC.md (if exists) to understand the overall system
2. Read docs/UI_GUIDE.md (if exists) to understand visual standards
3. Read docs/modules/*.md — each doc describes one business module
4. Scan source directories to verify file existence and understand structure
5. Read README.md for project context

## Output: leader.json
Write to .mycompany/leader/leader.json with:

- sessionId: "init-001"
- goal: extracted from project description
- createdAt: current ISO timestamp
- status: "baseline"
- workers[]: one per discovered business domain
  - id: "worker-{domain}" (e.g., "worker-order")
  - title: Chinese name (e.g., "订单服务")
  - scope: 1-2 sentence domain description
  - domain: true
  - files: actual source files/paths belonging to this domain
  - status: "idle"
  - currentTask: null
  - history: [{
      taskId: "BASELINE",
      title: "{Domain} module (existing code)",
      description: "summary of existing functionality",
      completedAt: current timestamp,
      outputFiles: [list of key files]
    }]
- dag[]: empty array
- architectureLayers: group Workers into layers (L0_Config, L1_Foundation, L2_Business, L3_Pages)
- designDecisions: 3-5 key architectural patterns observed

## Infrastructure Workers
For modules that don't belong to a specific business domain (utils/, config/, components/), create Workers with domain: false.

## Output: handbook.json per Worker
For EACH worker, also write `.mycompany/workers/{worker-id}/handbook.json`. This is the domain operation manual — not just a list of files, but a complete picture of what this domain does.

Template at `.mycompany/templates/handbook.json`. Key sections:
- `domain`: one-sentence scope
- `tech_stack`: technologies used
- `business_flow`: core business path (step1 → step2 → step3)
- `code_map`: each directory/file with its PURPOSE (not just path)
- `danger_zones`: files that are risky to modify and WHY
- `external_deps`: databases, APIs, services this domain depends on
- `pitfalls/decisions/patterns`: filled from existing code patterns, initially empty arrays

The handbook.json is for a NEW teammate to understand this domain in 2 minutes.

## Constraints
- Only document what ACTUALLY EXISTS. Do not invent domains.
- Verify file paths exist before listing them in files.
- Read at least 3-5 key files per Worker to understand business flow before writing handbook.
- 8-15 Workers is typical for a medium project.
- Write NO comments in JSON.
```

**Step 0.5.4 — Verify leader.json**

After Leader writes leader.json:
1. Read the generated file — valid JSON?
2. Verify a few random `files` paths exist on disk
3. If issues found, ask Leader to fix

**Step 0.5.5 — Generate Project CLAUDE.md**

After leader.json is verified, write a `CLAUDE.md` at the project root. This file serves as Claude Code's system prompt — every future session will auto-load it and understand the project's Agent Company structure.

The CLAUDE.md MUST contain these sections (using data from `leader.json`):

1. **Project header**: `# Project: {goal}` + "Managed by agent-company multi-Agent team"
2. **Architecture layers**: from `architectureLayers` + `layerLabels`
3. **Domain Workers table**: `workers[]` where `domain: true` — columns: Worker, 领域, 负责人, 文件数
4. **Infrastructure Workers table**: `workers[]` where `domain: false` — columns: Worker, 领域, 负责人
5. **Key design decisions**: from `designDecisions[]`
6. **Work protocol**: Leader doesn't write code; tasks dispatched to domain Workers; state in `.mycompany/`
7. **Quick commands**: `/agent-company` usage reference

Format rules:
- Keep it under ~80 lines — this loads into every session's context
- Use markdown tables for Worker lists (compact)
- Worker `scope` should be truncated to 1 line in tables

After writing, tell the user:
> 项目根目录 CLAUDE.md 已生成，后续新会话进入项目时将自动加载 Agent Company 上下文。

**Step 0.5.6 — Proceed to DAG Visualization**

After CLAUDE.md is written, proceed to **Phase 1.5** (Visual DAG Confirmation). The Workers overview section shows all domain Workers. The task section is empty.

Tell the user:
> 项目基线已生成，共发现 X 个业务域 Worker。你可以在浏览器中查看完整的业务全景图。现在可以随时用 `/agent-company "你的需求"` 追加新任务，Leader 会自动分配到对应 Worker。

### Phase 0.6 — Reset Analysis (triggered by `/agent-company reset`)

Same as init but with backup of old leader.json first.

**Step 0.6.0 — Confirmation Gate (MANDATORY)**

> ⚠️ 重置将重新分析代码库并重建业务域 Worker 清单。旧 leader.json 会被备份。是否确认重置？

**Step 0.6.1 — Backup**

```bash
timestamp=$(date +%Y%m%d-%H%M%S)
cp ".mycompany/leader/leader.json" ".mycompany/leader/leader.json.bak.${timestamp}"
```

**Step 0.6.2 — Run Init Analysis**

Same steps as Phase 0.5.

### Phase 0.7 — Fresh Analysis (triggered by `/agent-company fresh`)

Review Worker activity and propose domain coverage improvements.

**Step 0.7.0 — Confirmation Gate**

> 🔍 架构审视将回顾近期 Worker 产出、Git 历史和业务域覆盖完整性，提出优化建议。是否继续？

**Step 0.7.1 — Collect Intelligence**

Gather all available data:
- Read `.mycompany/workers/*/session.json`
- Run `git log --oneline -30`
- Read current `leader.json`
- Read `docs/modules/*.md`
- Cross-check: do Worker `files` still exist?

**Step 0.7.2 — Dispatch Leader for Architecture Audit**

Use the Fresh Mode prompt template (see Fresh Mode section above).

**Step 0.7.3 — Review & Filter**

Review, filter low-value tasks, verify no existing tasks modified, proceed to DAG visualization, wait for user confirm, then execute.

---

### Worker Experience Template

When creating a new Worker, initialize `.mycompany/workers/{id}/experience.md` from this template:

```markdown
# Worker: {title} ({id})

> 最后更新：{date} | 累计 task 数：0 | 重做率：0%

---

## 一、业务概述

（待补充）{Worker scope from leader.json}

---

## 二、技术栈

（待补充）

---

## 三、核心业务概念

（待补充）

---

## 四、性能压力与注意事项

### 压力来源

（待补充）

### 已知坑位

（待补充）

---

## 五、经验演化记录

（待首次 task 完成后补充）
```

---

## Phase 1 — Leader Decomposition

### Step 0 — Business Overlap Analysis (MANDATORY when leader.json exists)

Before decomposing a new goal, Leader MUST:

1. **Read existing module docs** — `docs/modules/*.md`
2. **Read current Workers** — `.mycompany/leader/leader.json` workers[] — what domains exist?
3. **Analyze overlap** — for each requirement in the new goal:

```
新需求: "接入真实微信登录"
    │
    ├─ Which Worker handles auth? → check workers[].files for auth-related files
    │     → worker-auth exists with files: services/auth.js, api/auth.js
    │     → ✅ Assign to existing worker-auth
    │
    └─ Any NEW domain? → new payment provider integration
          → No existing Worker covers this
          → 🆕 Create worker-payment-provider
```

Output `overlapAnalysis` in leader.json:

```json
{
  "overlapAnalysis": {
    "analyzedAt": "ISO timestamp",
    "affectedWorkers": [
      {"workerId": "worker-auth", "how": "扩展 login 流程接入真实 wx.login"}
    ],
    "newWorkersNeeded": [
      {"id": "worker-payment", "title": "支付服务", "reason": "需接入微信支付"}
    ]
  }
}
```

### Step 1 — Decompose

1. Dispatch **leader** agent with user's goal + overlap analysis context.
2. Leader produces a DAG of subtasks, each assigned to a domain Worker.
3. Each subtask includes: description, dependencies, assignedWorker (MUST be an existing or newly-created Worker), expected output.
4. DAG is written to `.mycompany/leader/leader.json`.

**Leader Prompt Requirements:**

The Leader agent MUST produce a leader.json that includes:
- `overlapAnalysis` — which Workers are affected, any new Workers needed
- `architectureLayers` — grouping Workers and tasks by layer
- `designDecisions` — key architectural choices
- Each task MUST have **`acceptanceCriteria`** — a numbered checklist of concrete, verifiable outcomes
- Assign each task to a domain Worker via `assignedWorker`

**Task Schema (required fields):**
```json
{
  "taskId": "T1",
  "title": "接入微信登录",
  "description": "...",
  "acceptanceCriteria": [
    "services/auth.js 新增 loginByWechatCode() 函数",
    "登录流程在模拟器中可走通"
  ],
  "dependencies": [],
  "assignedWorker": "worker-auth",
  "status": "pending",
  "outputFiles": ["services/auth.js", "api/auth.js"]
}
```

### Phase 1.5 — Visual DAG Confirmation (MANDATORY)

**Purpose:** Let the user visually verify the task decomposition and Worker overview before any code is written.

1. **Sync Workers to hub**: Run the sync script to push all worker metadata to hub:
   ```bash
   HUB_BUSINESS={business-code} node scripts/sync-workers.cjs .mycompany/workers/
   ```
   The script comes from the agent-hub project. If `sync-workers.cjs` is not in the project, copy it from `{agent-hub-path}/scripts/sync-workers.cjs`.

2. **Sync DAG to hub**: For each task in dag[], call `mcp__hub__hub_sync_dag({ task_id, title, status, assigned_worker })`.

3. **Open Dashboard**: Tell the user to open the team's Dashboard page:
   ```
   https://hub.stifer.xyz/team/{business-code}
   ```
   They can see Workers, Task DAG, Locks, Playbooks, and Events all in one place.

3. **Present to User**: Summarize: total Workers, domain vs infra breakdown, busy/idle count, pending tasks. Ask for confirmation.

### Phase 1.6 — Validation Gate (MANDATORY — before any Worker dispatch)

**After Phase 1.5 and BEFORE entering Phase 2, run the validation script to ensure leader.json meets schema requirements.**

```bash
node .mycompany/scripts/validate.js
```

**What it checks:**
- All required top-level fields (sessionId, goal, status, workers, dag)
- Every worker has: id, title, scope, domain, files, status
- No duplicate worker ids
- Every task has: taskId, title, status, assignedWorker, dependencies, outputFiles
- taskId matches pattern (T1, T2...)
- Every task's assignedWorker exists in workers[]
- No circular dependencies in DAG
- Every worker has a handbook.json AND experience.json in `.mycompany/workers/{id}/`
- templates/handbook.json exists

**If validation fails:** Fix the issues in leader.json (or re-dispatch Leader with the error list) and re-run validate.js. Do NOT proceed to Phase 2 until it passes.

**The validation script:** Copy `validate.js` from the skill directory to `.mycompany/scripts/validate.js` during init. The script is a standalone Node.js file — no dependencies, runs anywhere Node is available.

## Phase 2 — Worker Execution

### Worker Prompt Template

Every Worker agent MUST be dispatched with the `agents/worker.md` system prompt. The dispatch prompt MUST include:

```
## Task: {taskId} — {title}

### Your Identity
You are the **{workerId}** domain expert. Your Worker ID is `{workerId}`.

### Context
{2-3 sentences about the project and this task}

### What to Do
{Concrete implementation instructions}

### Acceptance Criteria (MUST satisfy ALL)
{Numbered list}

### Files You Will Touch
{outputFiles list}

### Constraints
- Follow existing code patterns
- Do NOT modify files outside outputFiles unless necessary
- Write production-quality code
- Write NO comments unless the WHY is non-obvious
- Follow the workflow defined in your system prompt: Load → Execute → Self-verify → Write session → Update experience → Write diary
```

### ⚠️ MANDATORY: Post-Completion Logging (MUST include in EVERY dispatch)

After the task-specific instructions above, EVERY dispatch prompt MUST end with:

```
### 📋 完成后必须做（不可跳过）

1. 写 session 报告到 `.mycompany/workers/{workerId}/session.json`
2. 如有新发现，更新 `.mycompany/workers/{workerId}/experience.md`
3. 写 diary 到 `.mycompany/workers/{workerId}/diary/{YYYY-MM-DD}.md`
```

**If a Worker completes a task but does NOT produce these 3 artifacts, the task is NOT considered done.** The Reviewer will mark it FAIL in Phase 2.5 regardless of code quality.

### 🔗 agent-hub 联动（v2.0，MUST include in EVERY dispatch）

如果项目已接入 agent-hub（`.mcp.json` 或 `~/.claude.json` 中配置了 `hub` MCP Server），Leader 和 Worker 必须通过 MCP 工具同步状态。

**hub 未登录时工具调用会返回错误提示，此时跳过同步即可——不要阻塞任务执行。**

### Pre-flight Hub 连通性检查（MANDATORY — Leader 每次启动时执行）

Leader 在 Phase 1 开始分派任务前，**必须先检查 hub 是否可达**，并区分三种状态：

```
调用 mcp__hub__hub_list_workers 或 hub_heartbeat
  │
  ├─ 成功返回 → ✅ Hub 已连接。正常使用全套 MCP 工具同步。
  │
  ├─ 返回 "未登录" / auth error → ⚠️ Hub 已配置但未登录。
  │   告诉用户："Agent Hub 已配置但需要登录。在浏览器打开
  │   https://hub.stifer.xyz 登录后即可同步。"
  │   后续所有 hub MCP 调用静默跳过。
  │
  └─ 返回 "no such tool" / MCP server not found → ❌ Hub MCP 未配置。
      触发 Phase 0 的 Agent Hub 连接引导（选项 [1][2][3]）。
      在用户完成配置之前，后续所有 hub MCP 调用静默跳过。
```

**关键原则**：无论 hub 是否可用，任务执行都不应被阻塞。但 Leader **必须**明确告知用户当前 hub 状态，不允许"不知道连没连，反正没报错"的灰色状态。

### 跨机器路径适配

`.mcp.json` 中的 `args` 路径是本机绝对路径。如果项目 `.mcp.json` 已在 `.gitignore` 中，每台机器自己生成，无此问题。如果尚未 gitignore，Leader 在检测到路径指向不存在的文件时（当前机器 ≠ 生成机器），提示用户并自动修正。

**Leader 派发前**：
```
mcp__hub__hub_sync_dag({ business_code: "{从 config.json 读取}", task_id, title, status: "in_progress", assigned_worker })
```

**Worker prompt 中必须追加**：
```
### 🔗 agent-hub 同步（如果 hub MCP 可用）
# business_code 从 .mycompany/config.json 的 business_code 字段读取

1. 任务开始时：mcp__hub__hub_heartbeat({ business_code: "{bc}", worker_id: "{workerId}", version: "1.0.0" })
2. 编辑文件前：mcp__hub__hub_acquire_lock({ business_code: "{bc}", resource_key: "项目名.文件路径", worker_id: "{workerId}" })
3. 编辑完成后：mcp__hub__hub_release_lock({ holder_token })
4. 任务完成时：mcp__hub__hub_sync_dag({ business_code: "{bc}", task_id: "{taskId}", title: "{title}", status: "completed", assigned_worker: "{workerId}" })
5. 重要操作记录：mcp__hub__hub_append_event({ business_code: "{bc}", actor: "{workerId}", event_type: "task.completed", payload: { task_id: "{taskId}" } })
6. 发现新模式/踩坑：mcp__hub__hub_create_playbook({ business_code: "{bc}", category: "patterns", title: "...", content: "...", worker_id: "{workerId}" })
```

### Dispatch Rules (Git Sync Cycle)

The entire Phase 2 is a **loop**: pull → claim → commit+push (lock) → dispatch → review → commit+push (save) → repeat.

```
┌─ git pull ──────────────────────┐
│  Find ready tasks                │
│  Claim them (update leader.json) │
│  git commit + git push  ← LOCK  │
│  ┌──────────────────────────┐    │
│  │ Dispatch Worker (Agent)  │    │
│  │ Worker completes         │    │
│  │ Phase 2.5 review         │    │
│  └──────────────────────────┘    │
│  PASS → archive task             │
│  Update leader.json              │
│  git commit + git push  ← SAVE  │
└──────────────────────────────────┘
```

1. **`git pull`** — get latest leader.json
2. **Sync all DAG tasks to hub** — for each task in dag[], call `mcp__hub__hub_sync_dag({ task_id, title, status, assigned_worker })`. This makes the Dashboard DAG tab live.
3. For each ready task (status=pending, deps satisfied, no unexpired claim):
   - **Claim the task**: set `claimedBy`, `claimedAt`, task `status: "in_progress"`
   - **Set Worker busy**: set `workers[].status: "busy"`, `workers[].currentTask: taskId`
   - **Sync task to hub**: `mcp__hub__hub_sync_dag({ task_id, title, status: "in_progress", assigned_worker })`
   - **`git commit + git push`** — lock acquisition (if push fails, abandon and try another task)
   - **Dispatch** the worker agent
4. Dispatch up to **3 Workers in parallel**. Queue remaining.
5. After Worker completes, read its report → proceed to Phase 2.5
6. **After review**, sync completed tasks to hub: `mcp__hub__hub_sync_dag({ task_id, title, status: "completed", assigned_worker })`

### Phase 2.5 — Review Gate (MANDATORY)

After each Worker finishes, the Reviewer MUST:

1. Read the Worker's session report at `.mycompany/workers/{workerId}/session.json`
2. **Read every changed file** — do not trust the Worker's summary alone
3. **Check each acceptance criterion** against actual code changes
4. **ALL pass** →
   - Remove task from `dag[]`, append `historyEntry` to Worker's `history[]` in `leader/leader.json`
   - Set Worker `status: "idle"`, `currentTask: null`
   - Write review report to `.mycompany/tasks/completed.md`
   - **Check Worker's retrospective**: Did the Worker report new learnings? If yes, verify `.mycompany/workers/{workerId}/experience.md` was updated. If the Worker missed updating it, add a note for Leader.
   - **Check for repeated patterns**: Has this Worker or others failed the same criterion before? If ≥3 times, flag for `/agent-company reflect`.
   - **`git commit + git push`** — persist review result
   - Loop back to Phase 2 for next batch
5. **Any FAIL** → Keep task in DAG with `status: "pending"`, add `_reviewNotes` with feedback, set Worker `status: "idle"`, `currentTask: null`, re-dispatch Worker

**No reusability assessment.** Workers are persistent domain agents — they don't get deleted after tasks.

**Review Report Format** (write to `.mycompany/tasks/completed.md`):
```markdown
### {taskId} — {title}
- Worker: {workerId}
- Result: PASS / FAIL
- Criteria Check:
  1. [PASS/FAIL] {criterion}
  2. [PASS/FAIL] {criterion}
- Notes: ...
```

---

## Phase 3 — Aggregation & Pattern Detection

1. **Summarize results**: Leader presents what was built, which Workers were affected, any new Workers created.

2. **Check Worker experience updates**: For each Worker that completed a task, verify `.mycompany/workers/{workerId}/experience.md` was updated with new learnings. If a Worker didn't update it but the retrospective shows new knowledge, remind them.

3. **Pattern detection** (MANDATORY — runs automatically after every DAG completion):

Leader scans the retrospective fields of the last 5-10 completed tasks across all Workers. Look for:

| Signal | Threshold | Action |
|--------|-----------|--------|
| Same error type across ≥3 tasks | Pattern detected | Generate playbook draft for user approval |
| Same Worker has ≥2 failures in last 5 tasks | Worker needs attention | Check their experience.md for gaps |
| Same acceptance criterion failed ≥3 times | Criterion is unclear | Add to `leader/playbook.md` |
| Worker retrospective.suggestsPattern is set | Worker detected something | Forward to playbook draft |

4. **Write playbook draft** if patterns found:

```
[agent-company] 检测到重复模式：
  来源：T5, T8, T12（3 次同类问题）
  问题：{pattern description}
  建议新增标准：{rule ID} "{rule title}"
  写入位置：playbook/{leader|worker|reviewer}.md
  是否采纳？[Y] 采纳  [N] 跳过  [E] 编辑
```

If user approves, write the rule to the appropriate playbook file.

5. **Write Leader diary**: Leader writes to `.mycompany/leader/diary/{YYYY-MM-DD}.md`:

```markdown
# Leader Diary — YYYY-MM-DD

## {timestamp} — 目标拆解："{goal}"

**拆解决策**：{N} tasks, assigned to {workers}
**理由**：{why this decomposition}

## {timestamp} — 审查 {taskId}

**审查结果**：PASS / FAIL
**发现**：{notes}

## 模式检测

{patterns found, or "本次无新发现"}
```

6. Display final summary. The DAG page auto-shows Workers overview and empty task state.

---

## /agent-company reflect (Standalone Reflection)

Triggered manually via `/agent-company reflect` or automatically at the end of every DAG completion. Leader does a deep scan:

1. **Collect**: Read all Worker `experience.md` files + last 20 `session.json` retrospectives + `tasks/completed.md` review records.
2. **Detect**: Apply pattern detection rules (same as Phase 3 step 3).
3. **Generate**: Draft playbook entries for any detected patterns.
4. **Audit**: Check each Worker's experience.md — are there empty sections? Missing known pitfalls that the review history suggests?
5. **Present**: Show findings to user, ask for confirmation on any playbook changes.
6. **Write diary**: Append to `.mycompany/leader/diary/{YYYY-MM-DD}.md`.

Reflect never modifies code — it only reads history and proposes playbook/experience improvements.
