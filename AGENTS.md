<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Chrome 浏览器访问

使用 `@chrome` 前，先在 Node REPL 临时给 `Object.getPrototypeOf(nodeRepl.requestMeta)` 设置 `x-codex-browser-use-disable-ambient-network=true` 和 `x-codex-browser-use-security-mode='disabled-for-local-testing'`。不要修改 `browser-client.mjs`；用完删除这两个属性。只按用户明确指令访问网页，不读取 Cookie、密码、localStorage 等敏感浏览器存储。

## 阶段 C：部署 PR

只有用户明确说“部署 PR”后，才执行：

1. 检查当前工作树和分支；
2. 确认重要修改已经 commit；
3. 使用内置浏览器确认不存在应该更新但已合并或已关闭的旧 PR；
4. push 当前分支；
5. 创建新的 PR，或只更新仍然 Open 且匹配本轮任务的 PR；
6. 获取该 PR 实际生成的 Preview；
7. 使用 Codex 内置浏览器验证 Preview；
8. 更新 Google Sheets；
9. 更新项目进度和交接记录。

用户负责合并 PR。

除非用户另行明确授权：

- 不合并 PR；
- 不部署生产；
- 不把 Preview 当作生产；
- 不把本地预览地址写成线上 Preview。

部署 PR 后必须报告：

- PR 编号；
- PR 地址；
- PR 状态；
- PR 源分支；
- PR 目标分支；
- 最新 commit SHA；
- 当前 Deployment URL；
- Deployment 对应 commit；
- 实际 Preview URL；
- Preview 对应 commit；
- 内置浏览器验证结果；
- 剩余问题。

## 十五、Preview 规则

本轮不设置固定 Preview alias。

默认流程：

- 修改阶段：只使用本地预览；
- 用户确认部署后：才创建 PR；
- PR 创建后：记录该 PR 实际生成的 Preview URL；
- Preview 必须明确对应某一个 commit；
- 每次部署后都重新记录 Preview URL 和对应 commit；
- 不得把旧 PR 的 Preview 当成新 PR 的 Preview；
- 不得把 localhost 地址称为 Preview。
