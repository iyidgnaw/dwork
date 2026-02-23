# E2E 问题 Backlog（T07）

## B1 - 缺少自动化 UI 回归
- **优先级**: high
- **描述**: Task Board Dock 的创建/编辑/状态流转/summary 复制尚未覆盖自动化 UI 测试。
- **建议**: 在 `packages/app` 增加最小 e2e 场景脚本，覆盖主流程与失败提示。

## B2 - Summary 文件变更提取精度可提升
- **优先级**: medium
- **描述**: 当前 summary 的变更文件来自 audit payload 递归抽取，可能包含非目标字段。
- **建议**: 在后端 audit payload 中增加统一字段（如 `changed_files`），前端按该字段渲染。

## B3 - 文本国际化
- **优先级**: medium
- **描述**: 新增 Task Dock 文本为英文硬编码，尚未接入 i18n 词条。
- **建议**: 补充 i18n key，并在多语言文件同步翻译。
