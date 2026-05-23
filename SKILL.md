---
name: agent-company
description: Start a multi-Agent team to work on your project. Leader breaks down tasks, Workers execute in parallel. Use /agent-company "your goal" to start, or /agent-company resume to continue.
argument-hint: "[goal | init | reset | fresh | review | update | upgrade | resume | status | lang zh/en]"
description: Start a multi-Agent team to work on your project. Leader breaks down tasks, Workers execute in parallel. Use /agent-company init for first-time setup, /agent-company reset to re-analyze, /agent-company fresh for architecture review, or /agent-company "your goal" to start.
---

# /agent-company

Start a virtual dev team — a Leader Agent breaks down your goal into tasks via DAG, distributes them to Worker Agents, and Workers execute independently with tool access. All state persists to `.mycompany/`, so sessions survive restarts.

## Options

- `$ARGUMENTS` may contain:
  - A task goal (e.g. `"add login module"`) — **appends to existing DAG** (default when leader.json exists)
  - `init` — **first-time setup only** (`.mycompany/` must NOT exist). Analyzes codebase + docs, generates baseline leader.json. Refuses to run if `.mycompany/` already exists — use `reset` instead.
  - `reset` — **re-analyze an existing project** from scratch. Backs up old `leader.json` → `leader.json.bak.{timestamp}`, then re-runs init analysis to generate a fresh baseline DAG. Requires user confirmation.
  - `fresh` — **architecture review & continuous improvement**. Leader reviews recent Worker activity (reports, git log, completed tasks), audits current architecture, and proposes optimization tasks appended to the DAG. Does NOT wipe anything. Requires user confirmation.
  - `update` — **sync project with remote**. Runs `git pull` to get latest leader.json + code, then `git push` any local changes. Use before starting work to ensure you have the latest state.
  - `review [taskId]` — **re-review a task or show review dashboard**. Without args: shows all idle tasks with their reusability status. With `T5`: re-checks acceptance criteria against actual code, re-assesses reusability, updates report.
  - `upgrade` — **update the skill itself**. Runs `git pull` in `~/.claude/skills/agent-company/` to fetch the latest SKILL.md, agents, and dag-template. Use when the team releases new skill features.
  - `new "task goal"` — starts a **fresh session**, replacing existing DAG
  - `resume` — restores the last session and continues unfinished tasks
  - `status` — shows current session progress without starting work
  - `lang zh` or `lang en` — switch display language (default: zh)

### Append vs New

When a leader.json already exists and user provides a new goal:
- **Default (append)**: Leader reads the current DAG + existing module docs → analyzes the NEW goal → appends new tasks to the DAG → preserves existing task IDs and statuses → increments task numbering from the last used ID.
- **`new` flag**: Wipes leader.json and starts fresh.

### Init Mode (first-time only)

**Precondition:** `.mycompany/` must NOT exist. If it already exists, refuse and tell the user to use `/agent-company reset` instead.

This mode analyzes the entire existing codebase and generates a `leader.json` where every discovered business module becomes a **completed** task. This gives the AI a complete picture of what's already built before you issue your first work goal.

**What Init Does:**

1. Scan `docs/` — read all documentation: `FUNCTIONAL_SPEC.md`, `UI_GUIDE.md`, `modules/*.md`, and any other `.md` files
2. Scan `src/` — understand directory structure, identify modules from actual code (stores/, api/, utils/, components/, pages/, config/, router/)
3. Read `README.md` — understand project overview and architecture
4. Read key config files — `package.json`, `vite.config.js`, `pages.json`, `manifest.json`
5. Dispatch a **Leader** agent with an init-specific prompt (see below)
6. Leader produces `leader.json` where:
   - Each discovered module is a task with `status: "completed"`, `assignedWorker: "init"`, `createdAt` set to init time
   - Task descriptions summarize what the module does (from docs + code)
   - `outputFiles` list actual source files belonging to each module
   - `dependencies` inferred from import relationships and doc references
   - `architectureLayers` groups modules by layer
   - `designDecisions` records key architectural patterns observed in the codebase
   - `overlapAnalysis` is null (no new goal to analyze yet)
7. Proceed to **Phase 1.5** (DAG visualization) — user can see the full business landscape in browser
8. **Skip Phase 2** — no Workers dispatched (all tasks are already completed)

**Init Leader Prompt Requirements:**

The Leader agent dispatched for `init` MUST produce a `leader.json` with:

- `sessionId`: auto-generated
- `goal`: extracted from project README or package.json description
- `createdAt`: ISO timestamp
- `status`: `"baseline"` (indicates this is a snapshot of existing code, not a work session)
- `architectureLayers`: modules grouped by layer (e.g., L0_Config, L1_Foundation, L2_Business, L3_Pages, L4_UI)
- `designDecisions`: key patterns found (e.g., "Pinia stores with reset pattern", "Feature flags via isFeatureEnabled", "Guard pipeline for routing")
- `dag[]`: one task per discovered module, all `status: "completed"`
  - Each task: `taskId`, `title`, `description` (2-3 sentence summary from docs), `status: "completed"`, `assignedWorker: "init"`, `outputFiles` (actual paths), `dependencies` (inferred), `createdAt`
- `overlapAnalysis`: `null`

**Init Task Schema (stored in dag[]):**
```json
{
  "taskId": "M1",
  "title": "配置系统 & 功能开关",
  "description": "全局配置中心，包含环境预设（dev/staging/prod）、功能开关（8 个 feature flags）、分页默认值、业务规则。所有模块通过 isFeatureEnabled() 进行功能门控。",
  "status": "completed",
  "assignedWorker": "init",
  "createdAt": "2026-05-22T10:00:00+08:00",
  "outputFiles": ["src/config/index.js", "src/config/env.js"],
  "dependencies": []
}
```

**Init vs Bootstrap:**

- Phase 0 bootstrap creates an **empty** `.mycompany/` and `leader.json` skeleton
- Init mode fills `leader.json` with the **actual business modules** discovered in the codebase
- Init mode ONLY runs when `.mycompany/` does NOT exist. If it exists, use `reset`.
- After init, subsequent `/agent-company "new goal"` calls have full context for overlap analysis

### Reset Mode (re-analyze existing project)

**Precondition:** `.mycompany/` MUST already exist. If it doesn't, tell the user to use `/agent-company init` instead.

Reset re-analyzes the codebase from scratch (same analysis as init), but first **backs up** the old `leader.json` to `leader.json.bak.{YYYYMMDD-HHmmss}`. The backup is a safety net — combined with Git history, no work is lost.

**Reset requires explicit user confirmation before proceeding.** This is a destructive operation (wipes current DAG), so the agent MUST pause and ask.

**What Reset Does:**

0. **Confirmation Gate (MANDATORY)**: Before doing anything, show the user current DAG stats (total tasks, completed/pending counts) and ask:
   > ⚠️ 重置将清空当前 DAG（共 X 个任务，Y 个已完成）。旧 leader.json 会被备份。是否确认重置？
   
   Wait for user to reply **confirm** before proceeding. If denied, abort.
1. **Backup**: Rename `leader.json` → `leader.json.bak.{timestamp}` (e.g., `leader.json.bak.20260522-153000`)
2. **Notify user**: "旧 leader.json 已备份至 leader.json.bak.20260522-153000"
3. **Run Init Analysis** (same as Phase 0.5): scan docs, src, README, package.json → dispatch Leader → generate fresh baseline `leader.json`
4. All discovered modules become `status: "completed"` tasks (same schema as init)
5. Proceed to **Phase 1.5** (DAG visualization)
6. **Skip Phase 2** — no Workers dispatched

**Key Safety Guarantees:**

- Old `leader.json` is never deleted — only renamed
- Git provides additional safety: `git log -- .mycompany/sessions/leader.json` shows full history
- Backup file is in `.mycompany/sessions/` alongside the new `leader.json`

### Fresh Mode (architecture review & continuous improvement)

**Precondition:** `.mycompany/` MUST already exist with a `leader.json` containing completed tasks. If it doesn't, tell the user to use `init` first.

`fresh` is the team's **retrospective** — Leader reviews what every Worker has been doing, audits the current architecture, and proposes concrete improvements. Nothing is wiped; new tasks are **appended** to the DAG.

**What Fresh Does:**

0. **Confirmation Gate (MANDATORY)**: Show current DAG stats and ask:
   > 🔍 架构审视将分析近期 Worker 产出和 Git 历史，提出优化建议追加到 DAG。当前 DAG 共 X 个任务（Y 已完成）。是否继续？
   
   Wait for **confirm**. If denied, abort.
1. **Collect Intelligence**:
   - Read all Worker reports: `.mycompany/sessions/workers/*.json`
   - Read recent git log: `git log --oneline -30` (who did what, when)
   - Read current `leader.json` (full DAG + overlapAnalysis + designDecisions)
   - Read module docs: `docs/modules/*.md` (check for staleness)
   - Scan source tree for drift: do docs still match actual code?
2. **Dispatch Leader for Architecture Audit**. Prompt:

```
## Task: Architecture Audit & Continuous Improvement

### Context
You are reviewing a project that has been developed by multiple Workers over time. Your job is to find what's getting messy and propose concrete improvements.

### What to Analyze
1. **Worker Activity Review**: Read .mycompany/sessions/workers/*.json — analyze each Worker:
   - Repeated failures or rework by the same Worker?
   - Which Workers touched the same files repeatedly? (→ merge candidate)
   - Any Worker that only did 1 small task and never again? (→ remove candidate)
   - Any Worker whose outputFiles span 5+ unrelated files? (→ split candidate)
   - Which Workers have domain overlap (same modules, same docs)?
2. **Code-Doc Drift**: Compare docs/modules/*.md against actual source files. Are docs stale? Are there modules with no docs?
3. **Git History Patterns**: Run git log --oneline -30. Which files change most often? Hot files may indicate poor boundaries. Merge conflicts?
4. **Architecture Smells**: Check for:
   - Circular dependencies between modules
   - Files that grew too large (500+ lines) — candidates for splitting
   - Duplicated logic across modules
   - Modules with too many dependencies (fragile)
   - Dead code or unused exports
   - Feature flags that are always true (ready to remove)
5. **Module Doc Freshness**: For each module doc, check if outputFiles still exist and whether the doc still matches the code.
6. **Worker Structure**: Based on all the above, recommend restructuring:
   - **Merge**: Two Workers consistently touching same files/modules → merge into one
   - **Split**: One Worker with 5+ unrelated outputFiles → split into specialized Workers
   - **Remove**: Worker whose module is stable (no changes in 20+ commits) → retire
   - **Keep**: Structure is fine — leave unchanged

### Output
Write TWO things to leader.json:

#### 1. Tasks (append to dag[])
New optimization tasks. Do NOT modify existing tasks. Increment task IDs.

Each task:
- taskId: prefixed by category letter (R1, D1, W1, ...)
- title: short description
- description: what's wrong + what to change + why
- acceptanceCriteria: 3-5 verifiable outcomes
- dependencies: existing task IDs this depends on
- status: "pending"
- assignedWorker: if W task, which worker(s) affected
- outputFiles: files that will be modified
- tags: ["fresh"]

#### 2. Worker Restructure Plan (new top-level field: workerRestructure)
```json
{
  "workerRestructure": {
    "analyzedAt": "ISO timestamp",
    "summary": "合并 w2+w4→worker-order；拆分 w7→worker-chat+worker-lesson；移除 w11",
    "changes": [
      {
        "action": "merge",
        "fromWorkers": ["worker-w2", "worker-w4"],
        "toWorker": "worker-order",
        "reason": "两人都处理订单相关模块，outputFiles 重叠 80%",
        "taskId": "W1"
      },
      {
        "action": "split",
        "fromWorker": "worker-w7",
        "toWorkers": ["worker-chat", "worker-lesson"],
        "reason": "outputFiles 涵盖聊天和课程两个独立领域",
        "taskId": "W2"
      },
      {
        "action": "remove",
        "fromWorker": "worker-w11",
        "reason": "模块已稳定 20+ 提交无变动，文档完整",
        "taskId": "W3"
      }
    ],
    "unchangedWorkers": ["worker-w1", "worker-w3", "worker-w5"]
  }
}
```

### Task Categories (prefix taskId with letter):
- **R** (Refactor): split large files, reduce coupling, simplify
- **D** (Docs): update stale module docs, add missing docs
- **C** (Cleanup): remove dead code, retire old feature flags, delete unused files
- **P** (Performance): optimize slow paths, reduce bundle size
- **W** (Worker): merge/split/remove Workers, reassign their tasks

### Constraints
- Only propose tasks that are WORTH DOING. A 200-line file is not "too large."
- Each task small enough for one Worker to complete. Max 8 tasks total.
- Do NOT propose rewriting the entire codebase. Be surgical.
- Worker restructure is OPTIONAL — if structure is fine, set `changes: []` and skip W tasks.
- Append to dag[], do NOT touch existing tasks.
- Write workerRestructure as a new top-level field in leader.json.
```

3. **Review Leader's Output**: Read the updated leader.json, verify the new tasks make sense, remove any that feel low-value. Pay special attention to the `workerRestructure` field — do the merge/split/remove recommendations make sense? If the Worker structure is fine, ensure `workerRestructure.changes` is an empty array `[]`.
4. Proceed to **Phase 1.5** (DAG visualization) — user sees the new optimization tasks AND Worker restructure plan in the DAG.
5. User confirms → **Phase 2** (Worker execution) for the fresh tasks. **W tasks (Worker restructure) execute first**, before R/D/C/P tasks, because they affect which Workers handle subsequent work.

**After Fresh Tasks Complete:**
- Workers update module docs if changes were made
- The project gets incrementally healthier without big-bang rewrites
- If Workers were restructured (W tasks completed), update `assignedWorker` on all existing tasks that were affected





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
| Layer label | 第X层 | LX |
| Stats: total | 总计 | Total |
| Stats: idle | 已空闲 | Idle |
| Stats: in_progress | 进行中 | In Progress |
| Stats: pending | 待执行 | Pending |
| Detail: description | 任务描述 | Description |
| Detail: dependencies | 依赖任务 | Dependencies |
| Detail: outputs | 产出文件 | Output Files |
| Detail: assigned | 指派 Worker | Assigned Worker |
| Detail: none | 无依赖，可立即执行 | None — ready to execute |
| Detail: not assigned | 尚未分配 | Not assigned yet |
| Legend title | 图例 | Legend |
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
6. **If push succeeds** → lock acquired → dispatch Worker

### Lock Expiry

A claim older than **30 minutes** with status still `pending` is considered expired. Other users may overwrite it.

The `claimedAt` field allows the DAG HTML to show "claimed X min ago" and flag stale claims.

### Task schema additions

```json
{
  "taskId": "T5",
  "claimedBy": "stifer",
  "claimedAt": "2026-05-22T15:30:00+08:00",
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

If `identity.json` doesn't exist or `userId` is not set, prompt the user to set it on first `/agent-company` run. This is the name that shows in `claimedBy` and `assignedWorker`.

**`config.json` vs `identity.json`:**
- `config.json` — shared settings (language), tracked in Git
- `identity.json` — personal identity (userId, name), gitignored, never committed

---

## Phase 0 — Session Bootstrap

1. Check if `.mycompany/` exists. If not:
   - Create `.mycompany/config.json` with `{ "language": "zh" }`
   - Create `.mycompany/identity.json` (empty, then prompt user for name — see Per-user identity above)
   - Create `.mycompany/memory/project.md`
   - Create `.mycompany/memory/decisions.md`
   - Create `.mycompany/tasks/inbox.md` and `.mycompany/tasks/completed.md`
   - **If `identity.json` has no `userId`**: prompt user: "你是谁？请输入你的名字（如 stifer、小明），这将用于任务标记。" Write to `identity.json`.
   - **If user invoked `/agent-company init`**: proceed to **Phase 0.5 — Init Analysis** (see below). DO NOT create an empty leader.json — init will generate the full baseline.
   - **If user provided a goal** (and `.mycompany/` didn't exist): create an empty `leader.json` skeleton, then proceed to Phase 1.
   - **If user invoked `/agent-company reset`**: refuse. Tell user `.mycompany/` doesn't exist — they should use `/agent-company init` instead.
2. If `.mycompany/` already exists:
   - **Always check** `.mycompany/identity.json` exists and has `userId`. If not, create + prompt as above.
   - **If `reset`**: proceed to **Phase 0.6 — Reset Analysis** (see below). Back up old `leader.json` first.
   - **If `fresh`**: proceed to **Phase 0.7 — Fresh Analysis** (see below). Review Worker history and propose improvements.
   - **If `init`**: refuse. Tell user `.mycompany/` already exists — they should use `/agent-company reset` instead.
   - **If `resume`**: load Leader state from `.mycompany/sessions/leader.json`, read language from `.mycompany/config.json`, and restore context.
   - **If `status`**: read session files and display current progress.
   - **If `update`**: run `git pull` → report what changed (new commits, updated files) → if local leader.json has uncommitted changes, commit and `git push`. Show sync summary.
   - **If `review`** (no taskId): show a dashboard of all idle tasks with their `reusable` status — which modules are still alive, which are marked for retirement.
   - **If `review T5`** (with taskId): run the Phase 2.5 review protocol on that specific task — re-check acceptance criteria against current code, re-assess `reusable`, update the review report.
   - **If `upgrade`**: `cd ~/.claude/skills/agent-company && git pull` → show latest commits → remind user to restart Claude Code for changes to take effect.
   - **If `lang <code>`**: update `.mycompany/config.json` language field, regenerate `dag.html` if it exists, and confirm to user.

### Phase 0.5 — Init Analysis (triggered by `/agent-company init`)

When the user runs `/agent-company init`, instead of creating an empty skeleton, the agent MUST analyze the existing codebase and generate a comprehensive `leader.json`:

**Step 0.5.1 — Read Documentation**

Read ALL of the following (if they exist):
- `README.md` — project overview, architecture, tech stack
- `docs/FUNCTIONAL_SPEC.md` — functional specification
- `docs/UI_GUIDE.md` — UI design guidelines
- `docs/modules/*.md` — each module's documentation
- `package.json` — dependencies, scripts
- `pages.json` — route/page structure (uni-app)
- `manifest.json` — app manifest

**Step 0.5.2 — Scan Source Code Structure**

Identify modules from actual directory layout:
- `src/config/` — configuration
- `src/stores/` — Pinia stores (one per business domain)
- `src/api/` — API layer
- `src/utils/` — utility functions
- `src/components/` — shared components
- `src/pages/` — page structure (organized by role/feature)
- `src/router/` — routing/guards
- Any other top-level `src/` directories

**Step 0.5.3 — Dispatch Leader for Init**

Dispatch a **Leader** agent with this prompt:

```
You are analyzing an EXISTING codebase to create a baseline DAG. This is NOT a work session — you are documenting what already exists.

## What to Do
Read the project's documentation and source code to understand the current business modules. Then produce a leader.json where each discovered module is a completed task.

## Steps
1. Read docs/FUNCTIONAL_SPEC.md to understand the overall system
2. Read docs/UI_GUIDE.md to understand visual standards
3. Read docs/modules/*.md — each doc describes one business module
4. Scan src/ directories to verify file existence and understand structure
5. Read README.md for project context

## Output: leader.json
Write to .mycompany/sessions/leader.json with:

- sessionId: "init-001"
- goal: extracted from README description or package.json
- createdAt: current ISO timestamp
- status: "baseline"
- architectureLayers: group modules into layers (L0_Config, L1_Foundation, L2_Business, L3_Pages, L4_UI)
- designDecisions: 3-5 key architectural patterns observed (e.g. "Feature flags via isFeatureEnabled", "Guard pipeline for routing")
- dag[]: one task per discovered module, ALL with status: "completed"
  - taskId: "M1", "M2", ...
  - title: short module name
  - description: 2-3 sentence summary of what the module does
  - status: "completed"
  - assignedWorker: "init"
  - createdAt: current ISO timestamp
  - outputFiles: actual source files belonging to this module (verified paths)
  - dependencies: inferred from imports and doc references
  - data-layer: which architecture layer this belongs to
- overlapAnalysis: null (no new goal to analyze)

## Constraints
- Only document what ACTUALLY EXISTS in the codebase. Do not invent modules.
- Verify file paths exist before listing them in outputFiles.
- Inferred dependencies must be based on actual import statements or doc references.
- Module count depends on the project — typically 8-15 modules.
- Write NO comments in JSON.
```

**Step 0.5.4 — Verify leader.json**

After Leader writes leader.json:
1. Read the generated file to check it's valid JSON and well-formed
2. Verify a few random `outputFiles` paths actually exist on disk
3. If issues found, ask Leader to fix

**Step 0.5.5 — Proceed to DAG Visualization**

After leader.json is verified, proceed to **Phase 1.5** (Visual DAG Confirmation). This lets the user see their existing business landscape as a node graph in the browser.

Do NOT enter Phase 2 (Worker Execution) — all tasks are `completed` baseline tasks, not work to execute.

After DAG is shown, tell the user:
> 项目基线已生成，共发现 X 个业务模块。你可以在浏览器中查看完整的业务全景图。现在可以随时用 `/agent-company "你的需求"` 追加新任务，Leader 会自动分析哪些模块可以复用。

### Phase 0.6 — Reset Analysis (triggered by `/agent-company reset`)

When the user runs `/agent-company reset` on an existing project, first confirm, then back up and re-analyze:

**Step 0.6.0 — Confirmation Gate (MANDATORY)**

Read current `leader.json`, compute DAG stats, and present to user:

> ⚠️ 重置将清空当前 DAG（共 X 个任务，Y 个已完成，Z 个待执行）。旧 leader.json 会被备份至 leader.json.bak.{timestamp}，Git 历史中也可随时恢复。是否确认重置？

Wait for user to reply **confirm**. If anything else, abort.

**Step 0.6.1 — Backup**

```bash
# Generate timestamp
timestamp=$(date +%Y%m%d-%H%M%S)
# Backup old leader.json
cp ".mycompany/sessions/leader.json" ".mycompany/sessions/leader.json.bak.${timestamp}"
```

Tell the user: "旧 leader.json 已备份至 `.mycompany/sessions/leader.json.bak.{timestamp}`。Git 历史中也可随时恢复。"

**Step 0.6.2 — Run Init Analysis**

Execute the same steps as Phase 0.5 (Steps 0.5.1–0.5.5): read docs, scan src, dispatch Leader, verify, show DAG.

The generated `leader.json` will have a fresh `sessionId` (e.g., `"reset-001"`) and `status: "baseline"`.

### Phase 0.7 — Fresh Analysis (triggered by `/agent-company fresh`)

When the user runs `/agent-company fresh`, review Worker activity and propose architecture improvements:

**Step 0.7.0 — Confirmation Gate (MANDATORY)**

Read current `leader.json`, compute DAG stats, and present:

> 🔍 架构审视将回顾近期所有 Worker 的产出和 Git 历史，分析当前架构并提出优化建议（追加到 DAG，不删除已有任务）。当前 DAG 共 X 个任务（Y 已完成）。是否继续？

Wait for **confirm**. Otherwise abort.

**Step 0.7.1 — Collect Intelligence**

Gather all available data for the Leader to analyze:
- Read `.mycompany/sessions/workers/*.json` — all Worker completion reports
- Run `git log --oneline -30` — recent commits, who did what
- Read current `leader.json` — full DAG, overlapAnalysis, designDecisions
- Read `docs/modules/*.md` — check for outdated docs
- Cross-check: do `outputFiles` listed in module docs still exist?

**Step 0.7.2 — Dispatch Leader for Architecture Audit**

Dispatch a **Leader** agent with the Fresh Mode prompt template (see Fresh Mode section above). The Leader:
1. Analyzes Worker reports for patterns (repeated failures, rework)
2. Checks code-doc drift (stale docs, missing docs)
3. Reviews git history for hot files (frequent changes = poor boundaries?)
4. Identifies architecture smells (circular deps, large files, dead code)
5. Proposes tasks as **appended** to `dag[]` (does NOT touch existing tasks)
6. Task IDs use prefixes: R=Refactor, D=Docs, C=Cleanup, P=Performance
7. Each task tagged with `"tags": ["fresh"]`

**Step 0.7.3 — Review & Filter**

After Leader writes updated `leader.json`:
1. Read the new tasks — do they make sense? Are they worth doing?
2. Remove or merge any that feel low-value or redundant
3. Verify no existing tasks were modified
4. Proceed to **Phase 1.5** (DAG visualization) — user sees optimization tasks alongside existing DAG
5. User confirms → **Phase 2** (Worker execution) for the fresh tasks

---

## Phase 1 — Leader Decomposition

### Step 0 — Business Overlap Analysis (MANDATORY when leader.json exists)

Before decomposing a new goal, Leader MUST:

1. **Read existing module docs** — `docs/modules/*.md` (overview + core files + interfaces + dependencies per module)
2. **Read current DAG** — `.mycompany/sessions/leader.json` (what's built, what's in progress)
3. **Analyze overlap** — for each requirement in the new goal:

```
新需求: "接入真实微信登录"
    │
    ├─ 检查 docs/modules/auth.md 
    │     → 已有 loginByWechatCode、userStore、token 管理
    │     → ✅ 复用 auth 模块
    │
    ├─ 检查 docs/modules/api-layer.md
    │     → 已有 errorHandler、request 拦截器
    │     → ✅ 复用 API 层
    │
    └─ 新依赖: 微信 SDK 配置
          → 🆕 需新建 wx-config 模块
```

Output `overlapAnalysis` in leader.json:

```json
{
  "overlapAnalysis": {
    "analyzedAt": "ISO timestamp",
    "existingModulesAffected": [
      {"module": "auth", "doc": "docs/modules/auth.md", "how": "扩展 login 流程接入真实 wx.login"},
      {"module": "api-layer", "doc": "docs/modules/api-layer.md", "how": "复用 request 拦截器注入真实 token"}
    ],
    "newModulesNeeded": [],
    "reusedWorkers": ["worker-w2"]
  }
}
```

### Step 1 — Decompose

1. Dispatch **leader** agent with the user's goal + overlap analysis context.
2. Leader analyzes the goal and produces a DAG of subtasks.
3. Each subtask includes: description, dependencies, assigned worker ID, expected output.
4. DAG is written to `.mycompany/sessions/leader.json`.

**Leader Prompt Requirements:**

The Leader agent MUST produce a leader.json that includes:
- `overlapAnalysis` — which existing modules/docs/workers are reused (see Step 0)
- `architectureLayers` — grouping tasks by layer
- `designDecisions` — key architectural choices
- Each task MUST have an **`acceptanceCriteria`** field — a numbered checklist of concrete, verifiable outcomes that define "done" for that task. These are the gates the Reviewer uses after Worker completion.
- Each task MUST tag whether it `reusesModule` (extends existing code, Worker must read that module's doc first) or `newModule` (greenfield, Worker creates new doc)

**Task Schema (required fields):**
```json
{
  "taskId": "T1",
  "title": "...",
  "description": "...",
  "acceptanceCriteria": [
    "文件 src/config/index.js 存在且包含 featureFlags 对象，至少有 8 个开关",
    "src/config/env.js 存在且定义了 dev / staging / prod 三个环境预设",
    "所有现有导入 appConfig 的模块不受影响（向后兼容）"
  ],
  "dependencies": [],
  "assignedWorker": null,
  "status": "pending",
  "outputFiles": ["src/config/index.js", "src/config/env.js"]
}
```

**Acceptance Criteria rules:**
- 3-6 items per task, each starting with a verb (存在/支持/可以/能/包含)
- Each item must be **verifiable** — you can check it by reading a file or running a command
- No vague items like "代码写得好" or "架构合理"
- Items describe the **observable result**, not the implementation steps

---

## Phase 1.5 — Visual DAG Confirmation (MANDATORY)

**Purpose:** Let the user visually verify the task decomposition before any Worker starts writing code. No code changes happen until the user confirms. The DAG page stays live and auto-refreshes as Workers update `leader.json`, providing real-time progress visibility.

### Step 1: Start Local File Server

The DAG HTML needs to fetch `leader.json` at runtime (browsers can't read local files directly). Start a background HTTP server serving `.mycompany/sessions/`:

```bash
# Windows (Python)
cd ".mycompany/sessions" && python -m http.server 8765

# macOS / Linux
cd ".mycompany/sessions" && python3 -m http.server 8765
```

Run with `run_in_background: true`. The server stays alive across turns. If port 8765 is taken, try 8766, 8767, etc.

**On subsequent `/agent-company resume` or `/agent-company status`**: check if the server is still running (try `curl http://localhost:8765/leader.json`). If not, restart it.

### Step 2: Copy DAG HTML Template

**Copy the template from the skill directory** — the HTML is maintained as a shared template that works for any project:

```bash
cp "$SKILL_DIR/dag-template.html" ".mycompany/sessions/dag.html"
```

(The template is at `skills/agent-company/dag-template.html` relative to the skills directory.)

**The HTML is a pure renderer** — it reads all task data from `http://localhost:8765/leader.json` via `fetch()`. It has NO project-specific content hardcoded. All labels, states, and UI come from the leader.json data and the built-in bilingual label sets.

**Architecture:**
```
dag.html ──fetch──▶ localhost:8765/leader.json ──reads──▶ leader.json (on disk)
    │                                                           ▲
    │  polls every 2s                                           │
    └───────────────────────────────────────────────────────────┘
              Workers update leader.json → HTML auto-detects changes
```

**HTML Requirements:**

- **Data Loading:** On load, `fetch('http://localhost:8765/leader.json')`. Show loading spinner while fetching. Show error state with retry button if server unreachable. After first successful load, poll every **2 seconds** for updates. Detect changes by comparing JSON string with previous fetch — only re-render if data actually changed.
- **Connection Indicator:** Top-left corner of stats bar: green dot + "已连接" when last fetch succeeded, red dot + "连接断开" on fetch failure. Show "最后更新: HH:MM:SS" timestamp.
- **Layout:** Layers arranged top-to-bottom. Layer grouping comes from `architectureLayers` in leader.json. If that field is missing, fall back to grouping by `data-layer` or render flat.
- **Nodes:** Each node renders from `dag[]` array. Shows `taskId`, `title`, status badge, dependency count. Color by `status`: `pending` = gray, `in_progress` = blue, `completed` = green.
- **Dependency Arrows:** SVG overlay. After each render, compute arrow positions via `getBoundingClientRect()` and draw paths from each dependency to its dependents.
- **Click Interaction:** Click node → detail panel shows full `description`, dependency list (with task titles), `outputFiles`, `assignedWorker`.
- **Legend + Stats:** Top-right legend. Stats bar shows computed counts from live data.
- **Language:** Read `language` from `.mycompany/config.json` (served at `http://localhost:8765/../config.json` or hardcode language into a `<script>` var in HTML). All UI labels use the configured language per mapping table above.
- **Technology:** Pure HTML + CSS + inline JS. No external dependencies. No bundler, no framework.

**Color Scheme:**
```css
:root {
  --color-pending: #e2e8f0;      /* gray */
  --color-in-progress: #3b82f6;  /* blue */
  --color-completed: #22c55e;    /* green */
  --color-layer-bg: #f8fafc;
  --color-arrow: #94a3b8;
}
```

**Arrow Rendering Strategy:**

After DOM is updated with new/updated nodes, compute arrow paths:
1. Each node has `data-task-id` and `data-deps` (JSON array of dependency task IDs)
2. For each dependency, find source and target node positions via `getBoundingClientRect()`
3. Draw SVG `<path>` elements from bottom-center of source to top-center of target
4. Redraw on window resize (debounced 200ms)

### Step 3: Open in Browser

**IMPORTANT:** Open via the server URL, NOT `file://` (browsers block `file://` from fetching local resources).

```bash
start "" "http://localhost:8765/dag.html"
```

Tell the user the page is live at `http://localhost:8765/dag.html`. It polls `leader.json` every 2 seconds and auto-updates when data changes. Advise them to bookmark this URL — it stays live throughout the entire Worker execution phase.

### Step 4: Present to User

After the HTML is live:

1. Summarize the DAG in text: total tasks, layer breakdown, key dependencies
2. Remind user the page is live at `http://localhost:8765/dag.html` and auto-updates every 2s
3. Ask the user to review and confirm:

> 请在浏览器中检查任务分解是否正确。确认无误回复 **confirm** 开始执行，或描述需要修改的地方。

### Step 5: Wait for Confirmation

- **User says confirm:** Proceed to Phase 2.
- **User requests changes:** Dispatch Leader again with feedback → update `leader.json` → HTML auto-detects changes on next poll (no need to regenerate HTML). Repeat until confirmed.
- **Do NOT start Phase 2 until the user explicitly confirms.**

---

## Phase 2 — Worker Execution

### Worker Prompt Template

Every Worker agent MUST receive a prompt with these sections:

```
## Task: {taskId} — {title}

### Context
{2-3 sentences about the project and what this task fits into}

### What to Do
{Concrete implementation instructions — what files to create/edit}

### Acceptance Criteria (MUST satisfy ALL)
{Numbered list from leader.json acceptanceCriteria}

### Project Knowledge (READ FIRST)
**Before touching any code, read these docs to understand what's already built:**
- `docs/modules/` — all existing module docs (每个 Worker 留下的模块文档)
- Focus especially on modules your task depends on (listed in dependencies above)
- This is how you inherit knowledge from previous Workers

### Files You Will Touch
{outputFiles list}

### Project Files You Should Read First
{List 2-4 key existing files the Worker should read to understand current code}

### Constraints
- Follow existing code patterns and conventions in the project
- Do NOT modify files outside the outputFiles list unless necessary
- Write production-quality code with proper error handling
- Write NO comments unless the WHY is non-obvious
- **Skip ALL other protocols (RIPER-5, etc.). Go directly to writing code.** Do not create datalog/ directories or task files.
- After completing all changes, write a summary to .mycompany/sessions/workers/{workerId}.json with:
  - What you changed (file-by-file)
  - How you verified each acceptance criterion
  - Any issues or notes
```

### Dispatch Rules

1. **`git pull`** — get latest leader.json (in case another user claimed tasks)
2. For each ready task (status=pending AND all dependencies=idle, AND no unexpired claim):
   - **FIRST**, claim the task: set `claimedBy` (from `.mycompany/identity.json` userId), `claimedAt` (ISO timestamp), `status` to `in_progress`, `assignedWorker` to the worker ID
   - **THEN** `git commit + git push` the updated leader.json. If push fails, abandon this task and try another.
   - **Push success → lock acquired** → dispatch the **worker** agent using the prompt template above.
3. Workers run independently with full file system tool access.
4. Dispatch up to **3 Workers in parallel per user**. Queue remaining ready tasks.
5. After Worker completes, READ `.mycompany/sessions/workers/<workerId>.json` to get its report.
6. `git pull` again → update `leader.json`: set task status to `reviewing`, clear `claimedBy`/`claimedAt` → `git push`.

### Phase 2.5 — Review Gate (MANDATORY)

After each Worker finishes, the Reviewer (the agent running /agent-company) MUST:

1. **Check each acceptance criterion** one by one against the actual file changes
2. **Read the changed files** — do not trust the Worker's summary alone
3. **Assess reusability** — will this module be reused in future work?
   - YES → mark task `status: "idle"`, set `reusable: true`. Module doc stays, Worker stays in pool.
   - NO → mark task `status: "idle"`, set `reusable: false`. Module doc archived, Worker candidate for retirement in next `fresh`.
   - Record assessment in the review report with reasoning.
4. **Mark the task `idle`** in leader.json ONLY if ALL acceptance criteria pass
5. **If any criterion fails**: mark task `pending` again, add feedback to leader.json, and re-dispatch the Worker with the feedback

**Review Report Format** (write to `.mycompany/tasks/completed.md`):
```markdown
### {taskId} — {title}
- Worker: {workerId}
- Result: PASS / FAIL
- Criteria Check:
  1. [PASS/FAIL] {criterion}
  2. [PASS/FAIL] {criterion}
  ...
- Reusable: YES / NO — {reasoning}
- Notes: ...
```

**After T1 (Config) is idle**: T2 and T4 become unblocked. Show the user updated DAG stats and ask which tasks to prioritize next.

---

## Phase 3 — Aggregation

1. Leader reviews all idle tasks and their review reports.
2. Leader produces a final summary and writes to `.mycompany/tasks/completed.md`.
3. Display summary to user, including reusable/idle module counts. The DAG page auto-shows all task statuses.
