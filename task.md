# Personal Claude Cowork（基于 Opencode）任务拆解

> 说明：以下任务按 Spec 驱动开发流程组织。每个任务均预留 `assignee` 字段，便于你在多个 coding agent 间分工。

## 1. Task 字段规范
每个任务至少包含：
- `id`
- `title`
- `description`
- `assignee`
- `status`（todo / doing / blocked / done）
- `dependencies`
- `acceptance_criteria`
- `deliverables`

---

## 2. 任务列表（可直接分配）

### T01
- **id**: T01
- **title**: 梳理 Opencode 可复用能力清单
- **description**: 盘点现有会话、项目、终端执行、日志相关模块，输出“复用 vs 新增”清单。
- **assignee**: agent-codex
- **status**: done
- **dependencies**: []
- **acceptance_criteria**:
  - 输出模块清单与对应源码路径。
  - 明确每个能力是直接复用、轻改造还是需新建。
- **deliverables**:
  - `docs/reuse-inventory.md`

### T02
- **id**: T02
- **title**: 定义 Task 数据模型与存储方案
- **description**: 落实 Task 实体字段、状态机和依赖关系，保证 assignee 可筛选、可统计。
- **assignee**: agent-backend
- **status**: todo
- **dependencies**: [T01]
- **acceptance_criteria**:
  - Task 模型满足 requirements 中字段约束。
  - 状态迁移规则可被单元测试覆盖。
- **deliverables**:
  - 数据模型实现代码
  - 状态机测试代码

### T03
- **id**: T03
- **title**: 实现 Task Board 基础界面
- **description**: 提供任务列表、按 assignee/status 过滤、任务详情查看与状态切换。
- **assignee**: agent-frontend
- **status**: todo
- **dependencies**: [T02]
- **acceptance_criteria**:
  - 可创建/编辑/查看 Task。
  - assignee/status 过滤可用。
  - 状态切换符合状态机约束。
- **deliverables**:
  - Task Board UI 代码
  - 基础交互测试（如适用）

### T04
- **id**: T04
- **title**: 接入执行引擎与审计事件
- **description**: 将命令执行、文件改动、测试运行统一映射为 Audit Event，并可追溯到 task_id。
- **assignee**: agent-runtime
- **status**: todo
- **dependencies**: [T02]
- **acceptance_criteria**:
  - 关键执行动作可生成结构化事件。
  - 可按 task_id/session_id 查询时间线。
- **deliverables**:
  - 审计事件模型与写入逻辑
  - 查询接口或视图

### T05
- **id**: T05
- **title**: 实现 Spec 文档联动入口
- **description**: 在会话中可快速引用 `requirements.md`、`design.md`、`task.md` 作为上下文源。
- **assignee**: agent-product
- **status**: todo
- **dependencies**: [T03]
- **acceptance_criteria**:
  - 三份文档可一键注入上下文。
  - 注入来源在会话中可见。
- **deliverables**:
  - 文档联动入口实现
  - 基本可用性验证记录

### T06
- **id**: T06
- **title**: 交付总结自动生成
- **description**: 生成任务级与会话级总结，包含变更、测试结果、风险与下一步建议。
- **assignee**: agent-reporting
- **status**: todo
- **dependencies**: [T04, T05]
- **acceptance_criteria**:
  - 可从已完成任务聚合总结。
  - 输出模板可直接用于 PR 描述。
- **deliverables**:
  - 总结生成器实现
  - 示例输出文档

### T07
- **id**: T07
- **title**: 端到端场景验收
- **description**: 以一个真实小需求验证“Spec → Design → Task → 执行 → 总结”闭环。
- **assignee**: agent-qa
- **status**: todo
- **dependencies**: [T03, T04, T05, T06]
- **acceptance_criteria**:
  - 完成至少 1 个完整闭环案例。
  - 输出问题清单与优化建议。
- **deliverables**:
  - 验收报告
  - 问题 backlog

---

## 3. 建议分工策略
- **并行组 A（架构/后端）**：T01, T02, T04
- **并行组 B（前端/产品）**：T03, T05
- **并行组 C（报告/测试）**：T06, T07

## 4. 看板管理建议
- 每日同步时按 `assignee` 维度过一遍阻塞项。
- 对 `blocked` 任务强制记录阻塞原因与解除条件。
- 每个 `done` 任务都附上最小证据：改动文件 + 测试命令 + 结果摘要。
