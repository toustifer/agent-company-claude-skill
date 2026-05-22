---
name: company
description: Start a multi-Agent team to work on your project. Leader breaks down tasks, Workers execute in parallel. Use /company "your goal" to start, or /company resume to continue.
argument-hint: "[goal | resume | status]"
---

# /company

Start a virtual dev team — a Leader Agent breaks down your goal into tasks via DAG, distributes them to Worker Agents, and Workers execute independently with tool access. All state persists to `.mycompany/`, so sessions survive restarts.

## Options

- `$ARGUMENTS` may contain:
  - A task goal (e.g. `"add login module"`) — starts a new session
  - `resume` — restores the last session and continues unfinished tasks
  - `status` — shows current session progress without starting work
  - `lang zh` or `lang en` — switch display language (default: zh)

## Language Configuration

The skill supports Chinese (`zh`) and English (`en`) for all generated UI text (DAG HTML labels, status badges, confirmation prompts, etc.).

Language is stored in `.mycompany/config.json`:
```json
{ "language": "zh" }
```

**On first init** (Phase 0, step 1), default to `"zh"` if not specified.
**On any `/company` invocation**, check `.mycompany/config.json`. If `language` is set, use that language for all generated output.
**To change language:** 
- CLI: `/company lang en` or `/company lang zh` — updates both `.mycompany/config.json` and `.mycompany/sessions/lang.json`. The DAG HTML detects the change on next poll.
- UI: The DAG page has **中文 / EN** toggle buttons in the stats bar. Click to switch all UI labels instantly without reload.

### Language Mapping

| Context | zh | en |
|---------|----|----|
| Status: pending | 待执行 | Pending |
| Status: in_progress | 执行中 | In Progress |
| Status: completed | 已完成 | Completed |
| Layer label | 第X层 | LX |
| Stats: total | 总计 | Total |
| Stats: completed | 已完成 | Completed |
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

When multiple people use `/company` on the same project, they coordinate through the shared Git repository. **A successful `git push` is the lock.**

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

Set in `.mycompany/config.json`:
```json
{
  "language": "zh",
  "userId": "stifer"
}
```

If `userId` is not set, prompt the user to set it on first `/company` run. This is the name that shows in `claimedBy` and `assignedWorker`.

---

## Phase 0 — Session Bootstrap

1. Check if `.mycompany/` exists. If not, run init:
   - Create `.mycompany/config.json` with `{ "language": "zh" }`
   - Create `.mycompany/sessions/leader.json`
   - Create `.mycompany/memory/project.md`
   - Create `.mycompany/memory/decisions.md`
   - Create `.mycompany/tasks/inbox.md` and `.mycompany/tasks/completed.md`
2. If `resume`, load Leader state from `.mycompany/sessions/leader.json`, read language from `.mycompany/config.json`, and restore context.
3. If `status`, read session files and display current progress.
4. If `lang <code>`, update `.mycompany/config.json` language field, regenerate `dag.html` if it exists, and confirm to user.

## Phase 1 — Leader Decomposition

1. Dispatch **leader** agent with the user's goal.
2. Leader analyzes the goal and produces a DAG of subtasks.
3. Each subtask includes: description, dependencies, assigned worker ID, expected output.
4. DAG is written to `.mycompany/sessions/leader.json`.

**Leader Prompt Requirements:**

The Leader agent MUST produce a leader.json that includes:
- `architectureLayers` — grouping tasks by layer (e.g., `L0_Config`, `L1_Foundation`, `L2_Structure`, `L3_Features`, `L4_Integration`)
- `designDecisions` — key architectural choices
- Each task MUST have an **`acceptanceCriteria`** field — a numbered checklist of concrete, verifiable outcomes that define "done" for that task. These are the gates the Reviewer uses after Worker completion.

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

**On subsequent `/company resume` or `/company status`**: check if the server is still running (try `curl http://localhost:8765/leader.json`). If not, restart it.

### Step 2: Copy DAG HTML Template

**Copy the template from the skill directory** — the HTML is maintained as a shared template that works for any project:

```bash
cp "$SKILL_DIR/dag-template.html" ".mycompany/sessions/dag.html"
```

(The template is at `skills/company/dag-template.html` relative to the skills directory.)

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
2. For each ready task (status=pending AND all dependencies=completed, AND no unexpired claim):
   - **FIRST**, claim the task: set `claimedBy` (from config userId), `claimedAt` (ISO timestamp), `status` to `in_progress`, `assignedWorker` to the worker ID
   - **THEN** `git commit + git push` the updated leader.json. If push fails, abandon this task and try another.
   - **Push success → lock acquired** → dispatch the **worker** agent using the prompt template above.
3. Workers run independently with full file system tool access.
4. Dispatch up to **3 Workers in parallel per user**. Queue remaining ready tasks.
5. After Worker completes, READ `.mycompany/sessions/workers/<workerId>.json` to get its report.
6. `git pull` again → update `leader.json`: set task status to `reviewing`, clear `claimedBy`/`claimedAt` → `git push`.

### Phase 2.5 — Review Gate (MANDATORY)

After each Worker finishes, the Reviewer (the agent running /company) MUST:

1. **Check each acceptance criterion** one by one against the actual file changes
2. **Read the changed files** — do not trust the Worker's summary alone
3. **Mark the task `completed`** in leader.json ONLY if ALL acceptance criteria pass
4. **If any criterion fails**: mark task `pending` again, add feedback to leader.json, and re-dispatch the Worker with the feedback

**Review Report Format** (write to `.mycompany/tasks/completed.md`):
```markdown
### {taskId} — {title}
- Worker: {workerId}
- Result: PASS / FAIL
- Criteria Check:
  1. [PASS/FAIL] {criterion}
  2. [PASS/FAIL] {criterion}
  ...
- Notes: ...
```

**After T1 (Config) is completed**: T2 and T4 become unblocked. Show the user updated DAG stats and ask which tasks to prioritize next.

---

## Phase 3 — Aggregation

1. Leader reviews all completed tasks and their review reports.
2. Leader produces a final summary and writes to `.mycompany/tasks/completed.md`.
3. Display summary to user. The DAG page auto-shows all task statuses.
