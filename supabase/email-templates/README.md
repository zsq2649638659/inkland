# Supabase 注册确认邮件

`confirmation.html` 是托管版 Supabase 的「Authentication → Emails → Confirm signup」模板正文。

此模板把一次性 `TokenHash` 交给 Inkland 确认页。页面会先从地址栏移除令牌，只在用户点击「确认邮箱」后才调用 `verifyOtp`，避免邮件安全扫描器提前消耗链接，也不依赖注册时保存的 PKCE verifier。

启用前需要在 Supabase 项目配置自定义 SMTP，然后把 `confirmation.html` 的内容复制到 Confirm signup 模板并保存。默认 SMTP 若禁用了模板编辑，需先完成 SMTP 配置。保存模板并部署本仓库的确认页后，再发起新的注册验证；旧邮件链接不能用于验证新流程。
