# inkland 数据库迁移顺序

这些文件目前仍需在 Supabase SQL Editor 中按顺序执行；执行后请在团队记录中保存执行时间、操作者和结果。生产环境不要执行 `seed-data.sql`、`seed-test.sql` 或 `seed-test.sh`。

## 执行顺序

1. `migration-v2.sql`
   - 连载系列、评论举报、用户屏蔽。
   - `posts.review_status` 和 `posts.review_reason` 基础字段。
2. `feedbacks.sql`
   - 用户反馈表及用户自读 RLS。
3. `storage-policies.sql`
   - 公开图片存储桶和对象策略。
4. `private-images.sql`
   - 私密作品图片存储桶和登录可见策略。
5. `followers-only-visibility.sql`
   - 关注者可见内容策略。
6. `tag-follows.sql`、`user-tag-usage.sql`、`published-at.sql`、`add-link-url.sql`
   - 标签关注、标签统计、发布时间和链接字段。
7. `admin-backoffice.sql`（创建独立管理员账号表，不再使用前台 `profiles.role`）
   - 管理员角色、内容举报、审核字段、管理员 RLS 和审计记录。
8. 按需执行 `fix-rls.sql`、`fix-follows-rls.sql`、`fix-auth.sql`、`fix-rejected-and-series.sql`
   - 这些是修复脚本，执行前应先核对当前数据库策略和数据量。

## 首次指定管理员

执行 `admin-backoffice.sql` 后，在 Supabase Authentication > Users 中创建一个专门的后台账号，再替换文件末尾的邮箱并执行 `INSERT INTO public.admin_accounts ...`。这个邮箱不需要注册为 Inkland 前台用户。后台登录入口为 `/admin/login`。

## 上线前核验

- 每个业务表和 `storage.objects` 都已启用 RLS。
- 普通用户无法读取或修改其他用户的草稿、私密内容、审核队列和举报处理记录。
- 管理员可以看到待审核作品、举报和反馈，并能留下处理结果。
- 先在测试 Supabase 项目执行一遍，再在生产项目执行。
- 执行前导出数据库备份；当前仓库还没有自动回滚脚本，回滚应依赖备份恢复或针对性反向 SQL。
