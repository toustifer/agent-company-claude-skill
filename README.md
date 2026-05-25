# /agent-company — Claude Code Virtual Dev Team

A Claude Code skill that turns your AI into a multi-agent dev team. A **Leader Agent** decomposes goals into a DAG of tasks, **persistent domain Workers** execute independently in parallel, and a **live DAG viewer** shows real-time progress in your browser. Multi-user collaboration via **Git as distributed lock**.

## Quick Start

```bash
# 1. Install (clone into Claude Code skills directory)
git clone https://github.com/toustifer/agent-company-claude-skill.git ~/.claude/skills/agent-company/

# 2. In an existing project, first-time setup (analyzes codebase, creates baseline)
/agent-company init

# 3. Add your first work goal (Leader assigns to domain Workers)
/agent-company "add WeChat login"

# 4. View the live DAG
open http://localhost:8765/dag.html

# 5. Confirm and Workers start executing
confirm

# 6. Resume later
/agent-company resume
```

## Commands

| Command | Purpose |
|---------|---------|
| `/agent-company init` | **First-time setup** — analyze existing codebase, create domain Workers baseline |
| `/agent-company "goal"` | **New work** — Leader decomposes goal, assigns to Workers, appends to DAG |
| `/agent-company resume` | **Continue** — restore last session, resume unfinished tasks |
| `/agent-company status` | **Overview** — show Workers, DAG stats, without starting work |
| `/agent-company fresh` | **Retrospective** — review Worker activity & git history, propose improvements |
| `/agent-company reset` | **Re-analyze** — backup old state, re-scan codebase, rebuild Worker map |
| `/agent-company update` | **Git sync** — `git pull` + `git push` local changes |
| `/agent-company review [T5]` | **Audit** — show idle tasks / re-verify a specific task |
| `/agent-company upgrade` | **Update skill** — `git pull` latest SKILL.md, agents, dag-template |
| `/agent-company lang zh\|en` | **Switch language** for DAG UI labels |

## Core Concept: Domain Workers

Workers are **persistent business domain agents**, not ephemeral task executors. Each Worker:

- Owns a business domain (e.g., `worker-auth` handles all auth, `worker-order` handles all orders)
- Accumulates a `history[]` of completed tasks — never loses context
- Is `idle` (available) or `busy` (executing a task)
- Is **never deleted** — only merged or split when domains change

```
项目启动 → init 发现业务域 → 创建持久 Worker → 有任务时 busy，无事 idle
                                              → 新需求来了，分配给已有 Worker
                                              → 新业务域出现，才创建新 Worker
```

New tasks go into `dag[]`. After completion, tasks are archived to Worker's `history[]` and removed from the DAG.

## Multi-User Collaboration

When teammates use `/agent-company` on the same Git repo, **`git push` is the lock**:

```
User A: git pull → claim T5 → commit+push ✅ (lock acquired)
User B: git pull → T5 claimed by A → skip → find T6
```

30-min claim expiry prevents stuck locks.

**First-time setup per person:**

```bash
git clone <repo>
cd <project>

# In Claude Code — creates .mycompany/identity.json (personal, gitignored)
/agent-company

# Enter your name when prompted (e.g., "stifer")
# Your identity is stored in .mycompany/identity.json — never committed
```

## How It Works

```
/agent-company "goal"
    │
    ▼
Phase 1: Leader decomposes → leader.json (DAG + Worker assignment)
    │
    ▼
Phase 1.5: DAG HTML visualization (browser, live-updating, Workers + Tasks)
    │
    ▼ (user confirms)
Phase 2: Workers claim tasks → execute in parallel (up to 3) → git push
    │
    ▼
Phase 2.5: Review gate (verify each Worker's output against criteria)
    │
    ▼
Phase 3: Completed tasks archived to Worker histories, DAG clears
```

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Full skill definition — all phases, protocols, and templates |
| `dag-template.html` | Live DAG visualization (copied into each project) |
| `agents/leader.md` | Leader agent system prompt (decomposition & Worker assignment) |
| `agents/worker.md` | Worker agent system prompt (domain-aware code execution) |
| `agents/reviewer.md` | Reviewer agent system prompt (verification & quality gate) |
| `README.md` | This file |

## Project Files Created

```
.mycompany/
  config.json              ← shared settings (language), tracked in Git
  identity.json            ← personal identity (userId, name), GITIGNORED
  sessions/
    leader.json            ← DAG + Workers (single source of truth)
    dag.html               ← live progress viewer (auto-refreshes every 2s)
    lang.json              ← language setting
    workers/               ← Worker completion reports
  memory/                  ← project context & decisions
  tasks/                   ← inbox & completed log
```

## Requirements

- Claude Code CLI
- Python 3 (for local HTTP server serving DAG HTML)
- Git (for multi-user collaboration)
- A browser (for DAG viewer)
