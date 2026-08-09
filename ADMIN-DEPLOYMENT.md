# Inkland 独立后台部署说明

后台现在位于 `admin-app/`，前台应用不再包含 `/admin` 页面或管理员接口。

## Vercel 设置

在同一个 GitHub 仓库中新建第二个 Vercel Project：

1. Import 同一个 GitHub 仓库。
2. Project Name 填 `inkland-admin`（可换成其他可用名称）。
3. Root Directory 选择 `admin-app`。
4. Framework Preset 选择 Next.js。
5. 添加与前台相同的环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. 部署后使用生成的 `https://inkland-admin.vercel.app/admin/login` 登录。

Vercel 生成的项目域名取决于项目名称；如果名称已被占用，按 Vercel 提示更换即可。

## 后台地址

- 登录：`/admin/login`
- 操作台：`/admin`

后台和前台共用 Supabase 数据库，但使用独立管理员账号和独立 Cookie，不依赖前台用户账号。

## 注意

这次改动需要先提交到 GitHub，Vercel 才能创建第二个项目并部署。不要把 `.env.local` 或任何 Supabase 密钥提交到仓库。
