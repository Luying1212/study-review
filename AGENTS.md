# 晚间复习工作台 — Agent 约定

先判断任务类型，再决定可改范围。

## 任务类型

### A. 开发维护（用户明确要求改功能/修 bug/改架构）

允许修改：`src/`、`scripts/`、测试、配置、文档、`PROJECT_PLAN.md` 相关实现。
完成后运行 `npm test` 与 `npm run build`。schema 变更须同步校验器、构建、示例、导入导出。

### B. 每日内容 / 进度录入（默认）

**只允许修改 `content/`**（`subjects.json`、`days/`、`progress/`）。
禁止修改 `src/`、`scripts/`、配置，禁止跳过校验，禁止手写评分/due/重算历史。

## 每日录入流程

1. 先处理用户提供的复习包：`npm run archive:progress -- --input <路径>`  
   - 只有截图、没有 JSON 时：可更新内容，但必须说明「本次未归档精确进度」。  
   - 不得凭截图猜测 due、评分历史或卡片 ID。
2. 新建或合并当日 `content/days/YYYY-MM-DD.json`。
3. 出卡原则见 `PROJECT_PLAN.md` §8：针对没搞懂的点；一张卡一个考点；待核对用 `needs-review`；AI 补充标 `ai-supplement`；开放题给 `rubric`；查重用 `cardRefs`；`card.id` 永不改名/复用，废弃用 `retired: true`。
4. 提交前：`npm run validate`、`npm test`、`npm run build`；检查 diff 仅在允许目录。
5. 按用户授权再 commit / push；核实 Pages 部署成功后才能说「网站已更新」。

## 进度与隐私

- 进度必须由归档脚本处理；不得把原始复习包整文件提交仓库。
- 公开归档不含作答原文、私人备注、截图、凭证。
- 不写真实姓名、学号、账号等。

## Commit 示例

`content: 2026-10-27 归档复习反馈并更新数据结构`
