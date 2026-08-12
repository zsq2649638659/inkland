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
9. `moderation-rules.sql`
   - 被举报次数、基础账号状态、处罚记录和举报受理通知。
10. `admin-moderation-v1-foundation.sql`
   - 第一版模块 0：违规词和白名单、作品版本、审核案件、举报合并案件、证据快照、确认违规、功能限制、举报者统计，以及通知和审计关联字段。
   - 该迁移只建结构，不自动回填历史作品版本或历史举报案件。
11. `image-screening-v2-author-only.sql`
   - 图片作品异步审核：作者可见、其他用户不可见；审核通过后恢复原可见范围。
   - 同时启用文字作品关键词初筛：命中关键词进入人工审核，未命中自动发布。
   - 白名单必须与关键词同分类、同词语才会抵消命中；规则只影响之后的新提交。

## 首次指定管理员

执行 `admin-backoffice.sql` 后，在 Supabase Authentication > Users 中创建一个专门的后台账号，再替换文件末尾的邮箱并执行 `INSERT INTO public.admin_accounts ...`。这个邮箱不需要注册为 Inkland 前台用户。后台登录入口为 `/admin/login`。

## 上线前核验

- 每个业务表和 `storage.objects` 都已启用 RLS。
- 普通用户无法读取或修改其他用户的草稿、私密内容、审核队列和举报处理记录。
- 管理员可以看到待审核作品、举报和反馈，并能留下处理结果。
- 先在测试 Supabase 项目执行一遍，再在生产项目执行。
- 执行前导出数据库备份；当前仓库还没有自动回滚脚本，回滚应依赖备份恢复或针对性反向 SQL。

## 第一版模块 0 执行与补救

`admin-moderation-v1-foundation.sql` 使用事务执行，并尽量使用 `IF NOT EXISTS`，可以在测试环境重复核对结构。执行前仍然必须备份数据库。

如果执行过程中报错，事务会整体回滚；不要删表重试，应先保存完整错误信息并修正前置迁移或字段冲突。

如果执行成功后发现应用兼容问题：

1. 新表暂时没有旧页面依赖，可以保留，不影响现有功能。
2. 新增到旧表的字段均有默认值或允许为空，旧代码可以继续运行。
3. 不要直接删除已经写入数据的新表；先停止新业务写入，再制作针对性的反向迁移。
4. 历史作品版本和举报案件的回填使用后续独立脚本，不与建表迁移混在一起，便于发现问题时单独停止。
