# Personal Claude Cowork（基于 Opencode）设计文档

## 1. 设计目标
围绕 `requirements.md` 定义的能力，提供一个可落地的系统设计，重点解决：
- Spec 驱动流程与执行链路打通。
- 多 agent（通过 assignee 区分）并行协作。
- 本地执行安全、可审计、可复盘。

## 2. 架构概览
采用“会话编排层 + 任务管理层 + 执行层 + 交付层”的分层设计：

1. **Session Orchestrator（会话编排层）**
   - 管理主会话与任务子会话。
   - 负责上下文拼装与窗口裁剪。
2. **Task Board（任务管理层）**
   - 管理 Task 生命周期与 assignee 分配。
   - 维护任务依赖关系和状态机。
3. **Execution Engine（执行层）**
   - 统一封装命令执行、文件读写、patch 生成、测试调用。
   - 输出标准化执行记录（成功/失败/耗时/产物）。
4. **Delivery Reporter（交付层）**
   - 聚合变更、测试、风险，生成可发布总结。

## 3. 核心数据模型

### 3.1 Task
```md
Task {
  id: string
  title: string
  description: string
  assignee: string
  status: "todo" | "doing" | "blocked" | "done"
  dependencies: string[]
  acceptance_criteria: string[]
  context_refs: string[]
  outputs: {
    patches: string[]
    test_results: string[]
    notes: string[]
  }
}
```

### 3.2 Session
```md
Session {
  id: string
  project_path: string
  branch: string
  parent_session_id?: string
  linked_task_ids: string[]
  context_sources: {
    files: string[]
    command_logs: string[]
    docs: string[]
  }
}
```

### 3.3 Audit Event
```md
AuditEvent {
  id: string
  task_id?: string
  session_id: string
  type: "command" | "file_change" | "test" | "commit"
  payload: string
  created_at: number
}
```

## 4. 关键流程设计

### 4.1 Spec 驱动启动流程
1. 用户编写/更新 `requirements.md`。
2. 系统根据 requirements 建立设计草案上下文。
3. 用户确认 `design.md` 后，系统生成初始 `task.md` 模板。
4. 用户为每个任务设置 assignee，进入执行阶段。

### 4.2 任务执行流程
1. Agent 领取 `status=todo` 且依赖已满足的任务。
2. 系统自动注入 Task 相关上下文（代码文件、设计段落、历史输出）。
3. Agent 进行代码修改并运行测试。
4. 系统记录 Audit Event，更新 Task 输出与状态。

### 4.3 交付汇总流程
1. 收集所有 `status=done` 的任务输出。
2. 聚合 commit、测试结果、风险说明。
3. 生成会话级总结，支持复制到 PR/发布说明。

## 5. 状态机设计

### 5.1 Task 状态机
- `todo`：已创建，待执行。
- `doing`：执行中。
- `blocked`：受依赖或环境问题阻塞。
- `done`：满足验收标准并完成验证。

状态迁移约束：
- `todo -> doing`
- `doing -> blocked`
- `blocked -> doing`
- `doing -> done`
- `done` 默认不可回退（需管理员或显式“重开任务”操作）。

## 6. 模块接口草案

### 6.1 Task Service
- `create_task(input)`
- `update_task(id, patch)`
- `list_tasks(filter)`
- `set_task_status(id, status)`

### 6.2 Execution Service
- `run_command(task_id, command)`
- `apply_patch(task_id, diff)`
- `run_tests(task_id, command)`
- `collect_changes(task_id)`

### 6.3 Reporting Service
- `build_task_summary(task_id)`
- `build_session_summary(session_id)`

## 7. 安全与治理设计
- 执行命令默认在项目目录内，限制高风险路径操作。
- 文件变更必须可追踪到 Task 与 Session。
- 关键动作（提交、批量改动）前提供预览摘要。

## 8. 可观测性设计
- 指标：任务完成率、平均任务耗时、测试通过率、阻塞率。
- 日志：按 `session_id` 和 `task_id` 查询。
- 错误分级：上下文错误、执行错误、测试错误、提交错误。

## 9. 里程碑建议
- **M1（最小可用）**：任务模型 + assignee + 状态流转 + 命令执行记录。
- **M2（协作增强）**：依赖管理 + 子会话 + 自动上下文注入。
- **M3（交付闭环）**：自动总结 + 风险报告 + 可复盘时间线。
