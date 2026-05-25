# /agent-company — Claude Code 虚拟开发团队

把 Claude Code 变成一个由 AI 组成的多人开发团队。**Leader Agent** 负责将目标拆解为任务依赖图（DAG），**持久化的领域 Worker** 并行独立执行，**浏览器中的实时 DAG 面板** 展示进度。多人通过 **Git 推送达成的分布式锁** 实现协作，无需额外服务。

## 快速开始

```bash
# 1. 安装（克隆到 Claude Code skills 目录）
git clone https://github.com/toustifer/agent-company-claude-skill.git ~/.claude/skills/agent-company/

# 2. 在已有项目中，首次设置（分析代码库，建立基线 Worker）
/agent-company init

# 3. 添加第一个工作目标（Leader 自动分配到对应 Worker）
/agent-company "接入微信登录"

# 4. 在浏览器中查看实时 DAG 面板
open http://localhost:8765/dag.html

# 5. 确认无误后回复 confirm，Worker 开始执行
confirm

# 6. 随时恢复之前的会话
/agent-company resume
```

## 命令一览

| 命令 | 作用 |
|------|------|
| `/agent-company init` | **首次初始化** — 扫描现有代码库，发现业务域，创建持久 Worker 基线 |
| `/agent-company "目标"` | **新增需求** — Leader 拆解目标、分配给已有 Worker、追加到 DAG |
| `/agent-company resume` | **恢复会话** — 加载上次状态，继续未完成的任务 |
| `/agent-company status` | **查看状态** — 展示 Worker 和 DAG 概览，不开始任何工作 |
| `/agent-company fresh` | **架构体检** — 审查 Worker 产出 + Git 历史，检查业务域覆盖，提出优化建议 |
| `/agent-company reset` | **重新分析** — 备份旧状态，重新扫描代码库，重建 Worker 清单 |
| `/agent-company update` | **Git 同步** — `git pull` 拉取最新状态 + `git push` 推送本地变更 |
| `/agent-company review [T5]` | **审查** — 不加参数显示所有已空闲任务；加 taskId 重新验证该任务 |
| `/agent-company upgrade` | **更新技能** — `git pull` SKILL.md、agents、dag-template 到最新版 |
| `/agent-company lang zh\|en` | **切换语言** — DAG 页面 UI 标签中英文切换 |

## 核心设计：领域 Worker

Worker 不是一次性的任务执行者，而是**持久的业务域专家**。每个 Worker：

- 拥有一个业务域（如 `worker-auth` 管所有认证逻辑，`worker-order` 管所有订单逻辑）
- 累积 `history[]` 记录所有已完成任务 —— 上下文永不丢失
- 状态为 `idle`（空闲可接任务）或 `busy`（正在执行中）
- **永不删除** —— 只在业务域边界变化时合并或拆分

```
项目启动 → init 扫描代码 → 发现业务域 → 创建持久 Worker → 有任务时 busy，无事 idle
                                                      → 新需求来了，分配给已有 Worker
                                                      → 新业务域出现，才创建新 Worker
```

新任务进入 `dag[]`。完成后，任务从 DAG 中移除，归档到对应 Worker 的 `history[]`。

## 多人协作

多人通过共享 Git 仓库协作，**`git push` 即是分布式锁**：

```
同事 A: git pull → 认领 T5 → commit + push ✅（锁获取成功）
同事 B: git pull → T5 已被 A 认领 → 跳过 → 找 T6
```

认领超过 30 分钟未完成自动过期，其他人可重新认领。

**每人首次使用：**

```bash
git clone <仓库地址>
cd <项目目录>

# 在 Claude Code 中执行（自动创建 .mycompany/identity.json，不入库）
/agent-company

# 根据提示输入你的名字（如 "stifer"）
# 身份信息存储在 .mycompany/identity.json —— 不会提交到 Git
```

## 工作流程

```
/agent-company "目标"
    │
    ▼
Phase 1: Leader 拆解目标 → leader.json（DAG + Worker 分配）
    │
    ▼
Phase 1.5: DAG 可视化面板（浏览器实时更新，Worker 卡片 + 任务依赖图）
    │
    ▼ （用户确认）
Phase 2: Worker 认领任务 → 并行执行（最多 3 个）→ git push
    │
    ▼
Phase 2.5: Review 审查（逐条验证验收标准）
    │
    ▼
Phase 3: 完成任务归档至 Worker 历史，DAG 清空
```

## 仓库文件

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 完整技能定义 — 所有阶段、协议、模板（33KB） |
| `dag-template.html` | 实时 DAG 可视化面板模板（中文/英文双语） |
| `agents/leader.md` | Leader Agent 系统提示词（需求拆解 + Worker 分配） |
| `agents/worker.md` | Worker Agent 系统提示词（领域感知的代码执行） |
| `agents/reviewer.md` | Reviewer Agent 系统提示词（验收标准验证） |
| `README.md` | 本文件 |

## 项目生成的文件结构

```
.mycompany/
  config.json              ← 共享设置（language），Git 跟踪
  identity.json            ← 个人身份（userId、name），Git 忽略，不入库
  sessions/
    leader.json            ← DAG + Workers 状态（唯一事实来源）
    dag.html               ← 实时 DAG 面板（每 2 秒自动刷新）
    lang.json              ← 语言设置
    workers/               ← Worker 完成报告
  memory/                  ← 项目上下文 & 架构决策记录
  tasks/                   ← 收件箱 & 已完成日志
```

## 环境要求

- Claude Code CLI
- Python 3（用于本地 HTTP 服务器，为 DAG 面板提供数据）
- Git（多人协作必需）
- 浏览器（查看 DAG 面板）
