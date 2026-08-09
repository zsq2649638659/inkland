# inkland

inkland 是一个中文同人创作社区，支持文字、图片、合集与连载发布，提供标签搜索、评论、段评、点赞、收藏、关注和创作者工作台。

## 本地开发

1. 复制 `.env.example` 为 `.env.local`，填写 Supabase 配置。
2. 安装依赖并启动开发服务器：

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000>。

## 数据库与存储

部署前请按顺序检查项目中的 SQL 文件，至少执行 `feedbacks.sql` 和 `storage-policies.sql`，并在 Supabase 控制台核验所有 RLS 策略。完整清单见 [DEPLOYMENT-CHECKLIST.md](./DEPLOYMENT-CHECKLIST.md)。

## 生产部署

生产环境需要配置 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY` 和 `NEXT_PUBLIC_SITE_URL`。不要使用 `NODE_TLS_REJECT_UNAUTHORIZED=0`，也不要暴露 Supabase service role key。

```bash
npm ci
npm run lint
npm run build
npm start
```
