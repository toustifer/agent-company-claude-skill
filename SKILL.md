---
name: agent-company
description: Start a multi-Agent team with persistent domain Workers. Leader decomposes goals into tasks, assigns to domain Workers, Workers accumulate history. Use /agent-company "your goal" to start, or /agent-company resume to continue.
argument-hint: "[goal | init | reset | fresh | review | update | upgrade | resume | status | lang zh/en]"
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

## Standard Worker Types

### Domain Workers (`domain: true`)
Represent actual business domains. Created by `init` or `fresh` when new business logic emerges.

```json
{
  "id": "worker-order",
  "title": "订单服务",
  "scope": "订单 CRUD、状态机、生命周期动作",
  "domain": true,
  "files": ["services/order.js", "pages/order/"],
  "status": "idle",
  "currentTask": null,
  "history": []
}
```

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
  - `upgrade` — **update the skill itself**. Runs `git pull` in `~/.claude/skills/agent-company/` to fetch the latest SKILL.md, agents, and dag-template. Use when the team releases new skill features.
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
   - Read all Worker reports: `.mycompany/sessions/workers/*.json`
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
- CLI: `/agent-company lang en` or `/agent-company lang zh` — updates both `.mycompany/config.json` and `.mycompany/sessions/lang.json`. The DAG HTML detects the change on next poll.
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

1. Check if `.mycompany/` exists. If not:
   - Create `.mycompany/config.json` with `{ "language": "zh" }`
   - Create `.mycompany/identity.json` (empty, then prompt user for name)
   - Create `.mycompany/memory/project.md`
   - Create `.mycompany/memory/decisions.md`
   - Create `.mycompany/tasks/inbox.md` and `.mycompany/tasks/completed.md`
   - **If `identity.json` has no `userId`**: prompt user for name, write to `identity.json`
   - **If user invoked `/agent-company init`**: proceed to **Phase 0.5 — Init Analysis**
   - **If user provided a goal**: create empty `leader.json` skeleton with `workers: []` and `dag: []`, then proceed to Phase 1
   - **If user invoked `/agent-company reset`**: refuse — use `init` instead
2. If `.mycompany/` already exists:
   - **Always check** identity.json exists with userId
   - Handle commands: `reset`, `fresh`, `init` (refuse), `resume`, `status`, `update`, `review`, `upgrade`, `lang`

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
Write to .mycompany/sessions/leader.json with:

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

## Constraints
- Only document what ACTUALLY EXISTS. Do not invent domains.
- Verify file paths exist before listing them in files.
- 8-15 Workers is typical for a medium project.
- Write NO comments in JSON.
```

**Step 0.5.4 — Verify leader.json**

After Leader writes leader.json:
1. Read the generated file — valid JSON?
2. Verify a few random `files` paths exist on disk
3. If issues found, ask Leader to fix

**Step 0.5.5 — Proceed to DAG Visualization**

After leader.json is verified, proceed to **Phase 1.5** (Visual DAG Confirmation). The Workers overview section shows all domain Workers. The task section is empty.

Tell the user:
> 项目基线已生成，共发现 X 个业务域 Worker。你可以在浏览器中查看完整的业务全景图。现在可以随时用 `/agent-company "你的需求"` 追加新任务，Leader 会自动分配到对应 Worker。

### Phase 0.6 — Reset Analysis (triggered by `/agent-company reset`)

Same as init but with backup of old leader.json first.

**Step 0.6.0 — Confirmation Gate (MANDATORY)**

> ⚠️ 重置将重新分析代码库并重建业务域 Worker 清单。旧 leader.json 会被备份。是否确认重置？

**Step 0.6.1 — Backup**

```bash
timestamp=$(date +%Y%m%d-%H%M%S)
cp ".mycompany/sessions/leader.json" ".mycompany/sessions/leader.json.bak.${timestamp}"
```

**Step 0.6.2 — Run Init Analysis**

Same steps as Phase 0.5.

### Phase 0.7 — Fresh Analysis (triggered by `/agent-company fresh`)

Review Worker activity and propose domain coverage improvements.

**Step 0.7.0 — Confirmation Gate**

> 🔍 架构审视将回顾近期 Worker 产出、Git 历史和业务域覆盖完整性，提出优化建议。是否继续？

**Step 0.7.1 — Collect Intelligence**

Gather all available data:
- Read `.mycompany/sessions/workers/*.json`
- Run `git log --oneline -30`
- Read current `leader.json`
- Read `docs/modules/*.md`
- Cross-check: do Worker `files` still exist?

**Step 0.7.2 — Dispatch Leader for Architecture Audit**

Use the Fresh Mode prompt template (see Fresh Mode section above).

**Step 0.7.3 — Review & Filter**

Review, filter low-value tasks, verify no existing tasks modified, proceed to DAG visualization, wait for user confirm, then execute.

---

## Phase 1 — Leader Decomposition

### Step 0 — Business Overlap Analysis (MANDATORY when leader.json exists)

Before decomposing a new goal, Leader MUST:

1. **Read existing module docs** — `docs/modules/*.md`
2. **Read current Workers** — `.mycompany/sessions/leader.json` workers[] — what domains exist?
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
4. DAG is written to `.mycompany/sessions/leader.json`.

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

The `dag-template.html` renders a **two-panel dashboard** directly from `leader.json`:

| Panel | Data Source | When Visible |
|-------|------------|--------------|
| **Workers** (top) | `leader.json` → `workers[]` | Always — shows all persistent domain/infra Workers |
| **Tasks** (bottom) | `leader.json` → `dag[]` | Only when tasks exist; shows layered DAG with dependency arrows |

Both panels auto-refresh every 2s via polling `leader.json`. The template is **fully data-driven** — no project-specific content is hardcoded. The `goal` field from `leader.json` is displayed in the stats bar.

**Template data contract — the `leader.json` MUST include:**

- `goal` — project goal string (shown in stats bar header)
- `workers[]` — array of Worker objects with: `id`, `title`, `scope`, `domain` (bool), `files[]`, `status` (idle/busy), `currentTask` (string|null), `owner` (string), `history[]`
- `dag[]` — array of task objects with: `taskId`, `title`, `description`, `status`, `assignedWorker`, `dependencies[]`, `outputFiles[]`, `claimedBy`, `claimedAt`
- `architectureLayers` — `{ "L0_Config": ["T1","T2"], ... }` mapping taskIds to layers
- `layerLabels` — `{ "L0_Config": "配置层", ... }` human-readable layer names

### Step 1: Start Local File Server

```bash
cd ".mycompany/sessions" && python3 -m http.server 8765
```

If port 8765 is in use, kill the old process first.

### Step 2: Copy DAG HTML Template

**Always copy from the skill directory** — do NOT edit dag.html by hand:

```bash
cp "$SKILL_DIR/dag-template.html" ".mycompany/sessions/dag.html"
```

The template is a standalone HTML file. It fetches `leader.json` from the same directory via relative URL (`leader.json`), so it MUST be served over HTTP — `file://` will fail due to CORS.

### Step 3: Open in Browser

Open via server URL:
```
http://localhost:8765/dag.html
```

### Step 4: Present to User

Summarize: total Workers, domain vs infra breakdown, busy/idle count, pending tasks. Ask for confirmation.

---

## Phase 2 — Worker Execution

### Worker Prompt Template

Every Worker agent MUST receive a prompt with these sections:

```
## Task: {taskId} — {title}

### Your Domain
You are the **{workerId}** domain expert. Your domain scope: {worker.scope}
Your previous work: {worker.history summary}

### Context
{2-3 sentences about the project and this task}

### What to Do
{Concrete implementation instructions}

### Acceptance Criteria (MUST satisfy ALL)
{Numbered list}

### Project Knowledge (READ FIRST)
- Read your Worker entry in leader.json — review your history
- Read docs/modules/ — especially modules your task depends on

### Files You Will Touch
{outputFiles list}

### Constraints
- Follow existing code patterns
- Do NOT modify files outside outputFiles unless necessary
- Write production-quality code
- Write NO comments unless the WHY is non-obvious
- After completing all changes, write a report to .mycompany/sessions/workers/{workerId}.json
  Include a `historyEntry` field for archiving to Worker history
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
2. For each ready task (status=pending, deps satisfied, no unexpired claim):
   - **Claim the task**: set `claimedBy`, `claimedAt`, task `status: "in_progress"`
   - **Set Worker busy**: set `workers[].status: "busy"`, `workers[].currentTask: taskId`
   - **`git commit + git push`** — lock acquisition (if push fails, abandon and try another task)
   - **Dispatch** the worker agent
3. Dispatch up to **3 Workers in parallel**. Queue remaining.
4. After Worker completes, read its report → proceed to Phase 2.5

### Phase 2.5 — Review Gate (MANDATORY)

After each Worker finishes, the Reviewer MUST:

1. **Check each acceptance criterion** against actual file changes
2. **Read the changed files** — do not trust the Worker's summary alone
3. **ALL pass** →
   - Remove task from `dag[]`, append `historyEntry` to Worker's `history[]`
   - Set Worker `status: "idle"`, `currentTask: null`
   - Write review report to `.mycompany/tasks/completed.md`
   - **`git commit + git push`** — persist review result
   - Loop back to Phase 2 for next batch
4. **Any FAIL** → Keep task in DAG with `status: "pending"`, add `_reviewNotes` with feedback, set Worker `status: "idle"`, `currentTask: null`, re-dispatch Worker

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

## Phase 3 — Aggregation

1. Leader reviews all completed tasks and updated Worker histories.
2. Leader produces a final summary showing what was built and which Workers were affected.
3. Display summary to user: tasks completed, Workers used, any new Workers created.
4. The DAG page auto-shows the Workers overview (always visible) and empty task state.
