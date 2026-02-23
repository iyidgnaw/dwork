# T01 复用能力清单（Opencode）

## 目标
围绕会话、项目、终端执行、日志/事件四个方向，先确认可直接复用的模块，再标注需要轻改造或新增的部分，作为后续 T02/T04 的输入。

## 复用盘点

| 能力域 | 现有模块 | 结论 | 说明 |
| --- | --- | --- | --- |
| 会话实体与生命周期 | `packages/opencode/src/session/index.ts` `packages/opencode/src/session/session.sql.ts` | 直接复用 | 已包含会话信息结构、创建/更新/删除事件、消息和摘要字段，满足 Task 关联 session 的基础依赖。 |
| 会话 API | `packages/opencode/src/server/routes/session.ts` | 直接复用 | 已提供 list/get/status/todo/children 等路由，可作为 Task Board 的上下文与筛选数据源。 |
| 项目实体与管理 | `packages/opencode/src/project/project.ts` `packages/opencode/src/project/project.sql.ts` | 直接复用 | 具备项目列表、更新和持久化能力，支持 task 以 project 维度组织。 |
| 项目 API | `packages/opencode/src/server/routes/project.ts` | 直接复用 | 已有 list/current/update 接口，可直接为任务页面提供项目上下文。 |
| 终端执行引擎 | `packages/opencode/src/tool/bash.ts` `packages/opencode/src/shell/shell.ts` | 轻改造 | 命令执行、权限确认、输出收集机制齐全；需补充 task_id 透传与结构化审计映射。 |
| PTY 实时终端会话 | `packages/opencode/src/pty/index.ts` `packages/opencode/src/server/routes/pty.ts` | 轻改造 | PTY 生命周期和 websocket 连接能力可用；需在事件流中绑定 task_id/session_id。 |
| 存储与 schema 汇总 | `packages/opencode/src/storage/schema.ts` `packages/opencode/src/storage/db.ts` | 轻改造 | 当前汇总已有 session/project 等表；需新增 task 与 audit_event 表并挂入 schema。 |
| 事件总线与服务级事件 | `packages/opencode/src/bus/bus-event.ts` `packages/opencode/src/server/event.ts` | 轻改造 | 事件定义机制已可复用；需扩展 task.* 与 audit.* 事件类型。 |
| 日志能力 | `packages/opencode/src/util/log.ts` | 直接复用 | 日志创建和级别输出机制完备，可用于任务与审计模块埋点。 |
| Task Board 核心模型 | （当前无对应模块） | 需要新建 | 需新增 Task 实体、状态机、依赖关系和 assignee 过滤查询能力。 |
| Audit Event 统一模型 | （当前无统一 task 追溯模型） | 需要新建 | 需建设 task_id/session_id 关联的结构化事件模型与查询接口。 |

## 建议落地顺序
1. **先做 T02（模型）**：新增 `task` 与 `audit_event` 数据模型，先打通状态机与依赖关系。
2. **再做 T04（执行映射）**：把 bash/pty/文件变更映射到 `audit_event`。
3. **最后做 T03/T05（前台与联动）**：复用现有 session/project 路由，补 Task Board UI 与 Spec 上下文入口。

## 风险与约束
- 终端执行路径较多（tool/bash + pty + server routes），若不统一埋点协议，后续审计查询会出现字段不一致。
- 需要尽早确定 `task.status` 的状态迁移规则，避免 UI 与后端状态机定义分叉。
