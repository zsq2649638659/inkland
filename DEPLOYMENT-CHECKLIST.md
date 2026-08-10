# inkland 上线前清单

## 需要在 Supabase 控制台完成

- 执行 `feedbacks.sql`，创建反馈表和 RLS 策略。
- 按 [DATABASE-MIGRATIONS.md](./DATABASE-MIGRATIONS.md) 的顺序执行迁移，并记录执行结果。
- 执行 `admin-backoffice.sql`，创建独立后台账号；部署独立 `admin-app` 后访问 `/admin/login` 核验管理员后台的审核和举报权限。
- 执行 `storage-policies.sql`，配置 `post-images` bucket、文件大小和对象权限。
- 执行 `private-images.sql`，配置 `private-post-images` bucket 和登录可见作品规则。
- 在 Authentication → URL Configuration 中设置正式 Site URL 和 Redirect URLs。
- 检查所有业务表和 `storage.objects` 是否启用 RLS，并确认草稿、私密、拒绝审核内容不会被公开查询。
- 确认数据库自动备份、邮箱验证、密码重置邮件和管理员举报处理流程。
- 确认公开作品只有在审核通过后才会进入公开展示；草稿、私密和拒绝内容不能被公开查询。

## 部署环境变量

根据 `.env.example` 配置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

不要配置 `NODE_TLS_REJECT_UNAUTHORIZED=0`，也不要把 Supabase service role key 放入前端或 `NEXT_PUBLIC_*` 变量。

## 发布前手动验证

- 注册、邮箱验证、登录、退出、密码修改、密码重置。
- 作品发布、编辑、删除，图片上传和系列章节管理。
- 评论、回复、举报、屏蔽、点赞、收藏和关注。
- 未登录访问私有页面时能跳转登录，登录后能回到原页面。
- 手机端上传、导航、阅读和评论。
- 在干净环境执行 `npm ci`、`npm run lint`、`npm run build`，再用生产构建启动测试。
- 执行 `npm audit --omit=dev`，确认没有需要阻断上线的依赖漏洞。

## 上线前需要业务确认

- 正式域名和联系邮箱。
- 服务条款、隐私政策、社区公约和版权投诉流程。
- 内容分级、R18 访问规则和审核标准。
- 用户注销、作品删除、图片清理和数据导出规则。
- 反馈表的管理员查看与处理方式，以及评论/上传/注册限流方案。
