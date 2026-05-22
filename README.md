# /company — Claude Code Virtual Dev Team

A Claude Code skill that turns your AI into a multi-agent dev team. A **Leader Agent** decomposes goals into a DAG of tasks, **Worker Agents** execute independently in parallel, and a **live DAG viewer** shows real-time progress in your browser. Multi-user collaboration via **Git as distributed lock**.

## Quick Start

```bash
# 1. Install (clone into Claude Code skills directory)
git clone https://github.com/<your-org>/company-skill.git ~/.claude/skills/company/

# 2. In any project directory, start a session
/company "build a login module"

# 3. After Leader finishes decomposition, view the DAG
open http://localhost:8765/dag.html

# 4. Confirm and Workers start executing
confirm

# 5. Resume later
/company resume
```

## How It Works

```
/company "goal"
    │
    ▼
Phase 1: Leader decomposes → leader.json (DAG)
    │
    ▼
Phase 1.5: DAG HTML visualization (browser, live-updating)
    │
    ▼ (user confirms)
Phase 2: Workers execute tasks in parallel
    │
    ▼
Phase 2.5: Review gate (verify each Worker's output)
    │
    ▼
Phase 3: Aggregation & summary
```

## Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Full skill definition — all phases, protocols, and templates |
| `dag-template.html` | Live DAG visualization (copied into each project) |
| `README.md` | This file |

## Multi-User Collaboration

When teammates use `/company` on the same Git repo:

```
User A: git pull → claim T5 → commit+push ✅ (lock acquired)
User B: git pull → T5 claimed by A → skip → find T6
```

**Git push is the lock.** 30-min claim expiry prevents stuck locks.

Set your identity in `.mycompany/config.json`:
```json
{ "language": "zh", "userId": "your-name" }
```

## Project Files Created

```
.mycompany/
  config.json          ← language + userId
  sessions/
    leader.json        ← DAG state (single source of truth)
    dag.html           ← live progress viewer
    lang.json          ← language setting
    workers/           ← Worker completion reports
  memory/              ← project context & decisions
  tasks/               ← inbox & completed log
docs/modules/          ← per-module documentation (optional)
```

## Requirements

- Claude Code CLI
- Python 3 (for local HTTP server serving DAG HTML)
- Git (for multi-user collaboration)
- A browser (for DAG viewer)
