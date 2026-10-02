# Inkland 国内访问试用版

这份文件只对应 `codex/cloudflare-cn-test` 分支。它从主站最近确认的代码 `3d761be` 复制出来，试用版单独部署到 Cloudflare；Vercel 正式站不受影响。

## 当前状态

- 已在此分支加入 Cloudflare 的 Next.js 运行配置，Cloudflare Worker 名称为 `inkland-cloudflare-test`。
- 试用版仍使用现有 Supabase 数据、登录和图片；没有搬数据库、改表或改图片。
- 这个副本已设置为不让搜索引擎收录。
- Cloudflare 兼容检查为 95%。主站路由和页面结构通过检查；图片调整和旧 Webpack 设置只有部分支持，需要在实际页面中验证。
- **尚未发布到 Cloudflare。**当前没有检测到 Cloudflare 登录凭据或已连接的部署工具，因此还没有真实试用网址；也还没有改 Supabase 登录网址设置。

## 发布前要准备

1. 在 Cloudflare 登录账号，并确认仍使用免费方案。
2. 从现有 Supabase 项目设置中取到项目网址和公开访问 key。不要把服务端管理 key 填进公开网页变量。
3. 在构建时设置以下公开变量：

   - `NEXT_PUBLIC_SUPABASE_URL`：现有 Supabase 项目网址。
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`：现有 Supabase 公开访问 key。
   - `NEXT_PUBLIC_SITE_URL`：部署成功后拿到的 `workers.dev` 试用网址。首次部署前可先不填，拿到网址后再补上并重新构建。

4. 使用 Cloudflare 免费用量发布，命令为 `npm run deploy:vinext`。首次部署会显示真正的网址。发布之后先打开首页，确认 Cloudflare 上的网页能返回内容。
5. 在 Supabase Auth 的“允许跳转网址”中，添加该试用网址，例如 `https://实际生成的地址.workers.dev/**`。不要改 Supabase 的 Site URL、数据库或 Storage 设置。
6. 如果测试邮箱注册后的邮件仍跳回 Vercel，先暂停注册测试并记录；Supabase 邮件模板可能需要另行检查，当前方案没有改邮件模板。

## 试用边界

- 试用账号、评论和作品会写入现有 Supabase，请使用专门的测试账号。
- 只创建标题或内容带“Cloudflare测试”的测试记录；不要编辑或删除原有用户内容。
- 首轮测试只覆盖主网站：首页、列表、详情、图片、登录和一项保存操作。不测管理后台、图片上传、外部文档导入、定时任务或反馈同步。
- 没有设置访问密码；知道网址的人都可能打开。因此不要在页面放测试者的私密资料、密码或密钥。
- 没有 Cloudflare 登录凭据前，不要把 Supabase key、服务角色 key、邮箱密码或其他密钥写进此仓库。

## 国内用户测试记录

每位测试者关闭 VPN，并尽量在同一设备、同一网络、同一时间段先后比较正式站和 Cloudflare 试用版。每一步可重复 3 次，分别记首次打开和刷新结果。

| 代号 | 日期/时间 | 城市 | 运营商 | 设备/浏览器 | 关闭 VPN | 站点版本 | 首页秒数 | 列表/详情秒数 | 图片成功/秒数 | 登录成功 | 保存操作成功 | 错误或备注 |
| --- | --- | --- | --- | --- | --- | --- | ---: | ---: | --- | --- | --- | --- |
| T1 |  |  |  |  | 是/否 | Cloudflare / Vercel |  |  |  |  |  |  |
| T2 |  |  |  |  | 是/否 | Cloudflare / Vercel |  |  |  |  |  |  |
| T3 |  |  |  |  | 是/否 | Cloudflare / Vercel |  |  |  |  |  |  |
| T4 |  |  |  |  | 是/否 | Cloudflare / Vercel |  |  |  |  |  |  |
| T5 |  |  |  |  | 是/否 | Cloudflare / Vercel |  |  |  |  |  |  |

暂定通过标准：至少 5 人中 4 人完成主要流程；首页打开时间中位数不超过 5 秒；图片、登录和内容读取没有反复失败。Cloudflare 网页打开、但 Supabase 数据或图片失败，仍算整体未通过。

## 费用

Cloudflare Workers 先使用免费额度。官方当前说明免费额度为每天 100,000 次 Worker 请求，每次 CPU 时间 10 毫秒；静态文件请求免费。超过免费额度可能失败，届时不要自动升级付费方案。现有 Supabase 账单保持原样，测试新增的读写和流量仍计入当前 Supabase 项目。

参考：[Cloudflare Next.js 部署指南](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)、[Cloudflare Workers 价格](https://developers.cloudflare.com/workers/platform/pricing/)、[Supabase 登录跳转网址说明](https://supabase.com/docs/guides/auth/redirect-urls)。
