# 晚间复习工作台

个人静态复习站：先回忆、再看答案、自评 → 生成日报并导出复习包 → 次日归档到 GitHub。

详细规格见 [PROJECT_PLAN.md](./PROJECT_PLAN.md)。助手约定见 [AGENTS.md](./AGENTS.md)。

## 本地运行

需要 Node 20+。

```bash
npm ci
npm run content
npm run dev
```

开发服务器默认仍使用 Vite base `/study-review/`。本地预览构建产物：

```bash
npm run build
npx vite preview
```

然后打开 `http://localhost:4173/study-review/`。

## 常用脚本

| 命令 | 作用 |
|---|---|
| `npm test` | 单测 |
| `npm run validate` | 校验 `content/` |
| `npm run content` | 生成 `public/data/*.json` |
| `npm run build` | 校验 + 类型检查 + 内容构建 + Vite 构建 |
| `npm run archive:progress -- --input <包>` | 归档复习包到 `content/progress/` |

## 部署

Push 到 `main` 后，GitHub Actions 运行测试与构建并部署 GitHub Pages。

仓库名默认按 `study-review`；若不同，设置 Actions / 本地环境变量 `VITE_BASE=/你的仓库名/`。

### 验收状态（2026-10-27）

| 检查 | 状态 |
|---|---|
| 本地 `npm test` / `npm run build` | 以实现后实测为准 |
| 浏览器完整复习流程 | 待在隔离配置中手工走通 |
| GitHub Pages 线上访问 | **待办**：需创建远程仓库并启用 Pages |
| M7 真实使用 7～14 天 | 待真实使用验证 |

## 每日使用

1. 晚上打开站点 → 开始复习 → 看报告 → **导出今日复习包**。
2. 次日把复习包（+ 可选截图）和新学习内容交给录入助手。
3. 助手运行归档脚本并更新 `content/`，校验构建后提交。

导出成功 ≠ 已上传 GitHub。冲突时在设置/冲突页人工选择整侧，勿让助手用「时间较新」猜胜者。
