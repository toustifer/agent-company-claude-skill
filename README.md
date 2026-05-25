# /agent-company — Claude Code 虚拟开发团队

## 你也许遇到过这样的问题

想象一家软件公司。今天新入职了一位工程师，他被拉进一个已经跑了半年的项目——几十个模块、上百个文件、散落在各处的设计决策。他问同事"这个认证逻辑在哪？""之前为什么选了 JWT 而不是 session？""上次那个 bug 是谁修的、怎么修的？"

带他的人被打断了三次。他自己翻了三天代码才敢动手改第一个文件。两个月后他离职了，换了一个新人，同样的问题从头再来一遍。

**这不是人的问题，是上下文无法传递的问题。**

---

现在把场景换到 AI 辅助编程。你每次在 Claude Code 里开始一个新会话，本质上就是在"雇一个新人"——它不记得上一轮对话里你们讨论过什么，不记得上次改了哪些文件、为什么那样改。你反复复制粘贴同样的上下文、解释同样的架构、描述同样的约束。Token 在燃烧，耐心也在燃烧。

**AI 不记上下文，是因为你没给它一个持久化的记忆系统。**

---

## 我们的方案：把 AI 当成一个真正的团队

agent-company 做的不是"让 AI 帮你写代码"。它做的是**让 AI 像一支真正的工程团队一样运转**——每个人都有自己负责的领域，每个人都记得自己做过什么，新人加入时自动继承前人留下的全部上下文。

```
  ┌──────────────────────────────────────────────────────┐
  │              Leader（需求拆解 + 任务分配）               │
  └──────────────────────┬───────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────┐
   │ 认证 Worker│   │ 订单 Worker│   │ 聊天 Worker│   ← 每人只负责自己的域
   │ scope:   │   │ scope:   │   │ scope:   │
   │  微信登录 │   │  订单CRUD │   │  AI对话  │
   │ files:   │   │ files:   │   │ files:   │
   │  auth/   │   │  order/  │   │  chat/   │
   │ history: │   │ history: │   │ history: │
   │  T1,T5,T9│   │  T2,T6   │   │  T3,T7   │   ← 做过的事永远记得
   └──────────┘   └──────────┘   └──────────┘
```

**核心思想很简单：Worker 不是一次性工具人，是持久的业务域专家。**

---

## 三个信息，让 AI 不再"新人入职"

每个 Worker 在被派发任务前，通过三个信息源秒懂自己的业务上下文。就像新员工入职时 HR 递过来的三份文件：

### 1. scope — "你管什么"

一句话说清楚这个 Worker 负责的业务范围。比如 `"微信登录、token 管理、自动登录、session 恢复"`。Worker 启动时先读这个，瞬间知道自己是谁、该关心什么。

### 2. files — "代码在哪"

精确的代码领地清单。`["services/auth/", "api/auth.js", "pages/login/"]`。Worker 不需要在整个仓库里大海捞针，它知道自己的一亩三分地在哪。同时这些路径也是**边界**——Worker 原则上不碰领地之外的代码。

### 3. history[] — "之前做过什么"

这是最关键的设计。每次任务完成后，一条记录写入 Worker 的 `history[]`：

```json
{
  "taskId": "T5",
  "title": "添加 token 自动刷新",
  "description": "在 request.js 中拦截 401，静默调用 refreshToken 续期后重放原始请求",
  "completedAt": "2026-05-22",
  "outputFiles": ["services/auth/refreshToken.js", "api/request.js"]
}
```

下次这个 Worker 接到新任务时，它先翻自己的 `history[]`——上次改了 refreshToken.js，这次可能也要动；上次 request.js 加了拦截器，这次注意别破坏；上次按那个模式写的，这次保持一致。

**效果是什么？** 同一个 Worker 执行了 T1、T5、T9 三个任务后，它对认证域的理解已经超过大多数"第一次接手这个模块"的人类工程师。而且这些理解**永远不丢**——新建一个 Claude Code 会话，Worker 自动读取 `history[]`，瞬间恢复全部上下文。

```
T1 (接入微信登录) ──→ 写入 history
T5 (token 刷新)   ──→ 写入 history  
T9 (多端登录)     ──→ 写入 history
                         │
                         ▼
              Worker 的历史上下文层叠累积
              后续任务的理解成本趋近于零
```

---

## 快速开始

```bash
# 1. 安装
git clone https://github.com/toustifer/agent-company-claude-skill.git \
  ~/.claude/skills/agent-company/

# 2. 首次设置（扫描代码库，发现业务域，创建 Worker）
/agent-company init

# 3. 提第一个需求
/agent-company "接入微信登录"

# 4. 浏览器中查看 DAG 面板
open http://localhost:8765/dag.html

# 5. 确认无误后回复 confirm，Worker 开始执行
confirm
```

---

## 命令一览

| 命令 | 作用 |
|------|------|
| `/agent-company init` | **首次初始化** — 扫描代码库，发现业务域，创建持久 Worker |
| `/agent-company "目标"` | **新增需求** — Leader 拆解、分配到已有 Worker、追加到 DAG |
| `/agent-company resume` | **恢复会话** — 加载上次状态，继续未完成的任务 |
| `/agent-company status` | **查看状态** — Worker 和 DAG 概览 |
| `/agent-company fresh` | **架构体检** — 审查 Worker 产出 + Git 历史 + 业务域覆盖 |
| `/agent-company reset` | **重新分析** — 备份后重建 Worker 清单 |
| `/agent-company update` | **Git 同步** — pull + push |
| `/agent-company review [T5]` | **审查** — 展示已空闲任务或重新验证指定任务 |
| `/agent-company upgrade` | **更新技能** — 拉取最新 SKILL.md / agents / dag-template |
| `/agent-company lang zh\|en` | **切换语言** — DAG 面板中英文切换 |

---

## 多人协作

多人通过共享 Git 仓库协作。**`git push` 即是分布式锁**——不需要额外的任务分配服务：

```
同事 A: git pull → 认领 T5 → commit + push ✅（锁获取成功）
同事 B: git pull → T5 已被 A 认领 → 跳过 → 找下一个就绪任务
```

认领超过 30 分钟未完成自动过期。

**首次使用：** 在项目里执行 `/agent-company`，根据提示输入名字。身份信息写入 `.mycompany/identity.json`（Git 忽略，不入库）。

---

## 工作流

```
/agent-company "目标"
    │
    ▼
Phase 1: Leader 拆解需求 → leader.json（DAG + Worker 分配）
    │
    ▼
Phase 1.5: DAG 面板（浏览器实时更新，Worker 卡片 + 任务依赖图）
    │
    ▼  （用户 confirm）
Phase 2: Worker 读 scope + files + history → 并行执行（最多 3 个）
    │
    ▼
Phase 2.5: Review 审查（逐条验证验收标准）
    │
    ▼
Phase 3: 任务归档至 Worker history[] → DAG 清空 → history 层叠累积
```

---

## 仓库文件

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 完整技能定义 — 全部阶段、协议、模板（33KB） |
| `dag-template.html` | DAG 面板模板（中英双语，每 2 秒自动刷新） |
| `agents/leader.md` | Leader Agent 系统提示词 |
| `agents/worker.md` | Worker Agent 系统提示词（领域感知） |
| `agents/reviewer.md` | Reviewer Agent 系统提示词（验收验证） |
| `README.md` | 本文件 |

## 生成的文件结构

```
.mycompany/
  config.json              ← 共享设置（language），Git 跟踪
  identity.json            ← 个人身份（userId、name），Git 忽略
  sessions/
    leader.json            ← DAG + Workers 状态（单一事实来源）
    dag.html               ← 实时面板
    workers/               ← Worker 完成报告
  memory/                  ← 项目上下文 & 架构决策
  tasks/                   ← 收件箱 & 已完成日志
```

## 环境要求

- Claude Code CLI
- Python 3（本地 HTTP 服务器，为 DAG 面板提供数据）
- Git（多人协作）
- 浏览器（查看 DAG 面板）
