# Opencode 可复用能力清单（T01）

## 1. 结论概览

围绕 `requirements.md` 与 `design.md`，当前代码库在**会话管理、项目绑定、执行能力、事件总线、日志与可观测基础**方面已有较完整实现，可作为本期「Personal Claude Cowork」的底座复用。  
本期主要新增集中在两块：

1. **Task Board 领域模型与状态机（T02）**
2. **执行审计事件模型与查询能力（T04）**

---

## 2. 能力盘点（复用 vs 新增）

| 能力域 | 现有模块/路径 | 当前能力 | 结论 |
| --- | --- | --- | --- |
| 会话模型与生命周期 | `packages/opencode/src/session/index.ts` | 会话创建/更新/归档/分叉、消息与 part 管理、状态与摘要 | **直接复用** |
| 会话存储 Schema | `packages/opencode/src/session/session.sql.ts` | `session` / `message` / `part` / `todo` / `permission` 表 | **直接复用**（新增 Task/Audit 表） |
| 会话 API | `packages/opencode/src/server/routes/session.ts` | 会话列表、详情、消息、todo、状态、摘要、回滚 | **直接复用**（可扩展 task 关联） |
| 项目绑定与目录识别 | `packages/opencode/src/project/project.ts` | 目录到项目识别、Git/worktree 感知、项目元数据持久化 | **直接复用** |
| 项目上下文实例化 | `packages/opencode/src/project/instance.ts` | 请求级目录上下文、状态隔离、路径边界判断 | **直接复用** |
| 项目 API | `packages/opencode/src/server/routes/project.ts` | 项目列表/当前项目/项目配置更新 | **直接复用** |
| VCS 分支信息 | `packages/opencode/src/project/vcs.ts` + `packages/opencode/src/server/server.ts` (`/vcs`) | 当前分支查询与变更事件 | **直接复用** |
| 终端执行（受控） | `packages/opencode/src/tool/bash.ts` | 命令执行、超时/中断、权限询问、运行元数据 | **直接复用** |
| PTY 终端会话 | `packages/opencode/src/pty/index.ts` + `packages/opencode/src/server/routes/pty.ts` | 交互终端创建、连接、输出回放、生命周期事件 | **直接复用** |
| 文件读写/补丁执行 | `packages/opencode/src/tool/read.ts` / `edit.ts` / `write.ts` / `apply_patch.ts` / `multiedit.ts` | 文件读取、编辑、写入、补丁应用及权限检查 | **直接复用** |
| 工具注册与可插拔扩展 | `packages/opencode/src/tool/registry.ts` | 内置工具 + plugin 工具统一注册 | **直接复用** |
| 事件总线与流式订阅 | `packages/opencode/src/bus/index.ts` / `bus/global.ts` / `server/server.ts` (`/event`) | 进程内事件发布订阅 + SSE 下发 | **直接复用**（新增审计事件类型） |
| 全局事件流 | `packages/opencode/src/server/routes/global.ts` (`/global/event`) | 全局 SSE 事件订阅 | **直接复用** |
| 日志系统 | `packages/opencode/src/util/log.ts` + `packages/opencode/src/server/server.ts` (`/log`) | 结构化日志、日志级别、持久化文件 | **直接复用**（可补 task 维度字段） |
| 命令执行事件 | `packages/opencode/src/command/index.ts` + `project/bootstrap.ts` | 命令执行前后触发事件 | **轻改造复用**（补审计写入） |
| Plugin Hook 扩展点 | `packages/opencode/src/plugin/index.ts` + `session/prompt.ts` 中 `tool.execute.before/after` | 工具执行钩子、事件钩子 | **轻改造复用**（可用于审计采集） |

---

## 3. 需求映射（FR 维度）

### FR-1 会话与项目绑定
- 复用：`Session` + `Project` + `Instance` + `/vcs` + `/file/status`
- 结论：**可直接满足主干能力**，仅需在 UI 侧拼装展示。

### FR-2 上下文注入
- 复用：`SessionPrompt.resolvePromptParts`、`ReadTool`、MCP 资源读取链路
- 结论：**可直接复用**，后续只需补“来源标记可视化”。

### FR-3 Task 协作面板
- 现状：仅有 `Todo`（轻量任务列表），缺少 Task 领域字段与依赖/状态机约束。
- 结论：**需新建 Task 领域模型与 API**（T02）。

### FR-4 执行能力
- 复用：`bash`、`pty`、`read/edit/write/apply_patch`、`tool registry`
- 结论：**可直接复用**，建议通过 Task 绑定补“任务上下文执行入口”。

### FR-5 安全与审计
- 现状：具备权限询问与日志，但缺结构化 `AuditEvent` 数据模型与按 task 时间线查询。
- 结论：**需新增 AuditEvent 模型与查询接口**（T04）。

### FR-6 交付总结
- 复用：`session/summary.ts`、`snapshot`、`message/tool part` 数据
- 结论：**可复用为基础**，后续补 task/session 聚合模板（T06）。

---

## 4. 新增实现建议（支撑 T02 / T04）

## 4.1 T02（Task 数据模型与状态机）
建议新增：
- `packages/opencode/src/task/task.sql.ts`（Task 表）
- `packages/opencode/src/task/index.ts`（Task 领域服务：create/update/list/delete/setStatus）
- `packages/opencode/src/server/routes/task.ts`（Task API：按 `assignee`/`status` 过滤）
- `packages/opencode/test/task/task.test.ts`（状态迁移与筛选测试）

状态机约束建议：
- `todo -> doing`
- `doing -> blocked`
- `blocked -> doing`
- `doing -> done`

## 4.2 T04（执行审计事件）
建议新增：
- `packages/opencode/src/task/audit.sql.ts`（AuditEvent 表）
- `packages/opencode/src/task/audit.ts`（审计写入/查询服务）
- `packages/opencode/src/server/routes/audit.ts`（按 `task_id` / `session_id` 查询时间线）
- 在 `project/bootstrap.ts` 初始化审计采集（监听 `message.part.updated` 或 tool hook）

审计类型建议：
- `command`：通用命令执行
- `file_change`：`write/edit/apply_patch/multiedit` 等文件改动
- `test`：命令中识别测试执行（如 `bun test`、`npm test`、`pytest`）
- `commit`：命令中识别提交行为（如 `git commit`）

---

## 5. 风险与注意事项

1. `tool` 事件更新频繁，审计写入需避免重复（建议按 `part_id` 或 `call_id` 去重）。
2. `Task` 与 `Session` 的关联方式需要前后一致（建议 `task.session_id` 可空，执行时写入）。
3. 新增表需走 drizzle migration，并保持 snake_case 字段命名。

