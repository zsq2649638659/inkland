# Supabase 邮箱验证模板

| 文件 | Supabase 模板 | 邮件主题 |
| --- | --- | --- |
| `confirmation.html` | Authentication → Emails → Confirm signup | 确认你的 Inkland 邮箱 |
| `email-change.html` | Authentication → Emails → Change email address | 确认 Inkland 邮箱变更 |

两个模板都把一次性 `TokenHash` 交给 Inkland 确认页。链接先打开站内提示页；只有用户点击带下划线的确认链接后，页面才调用 `verifyOtp`，避免邮件安全扫描器提前消耗验证链接。注册确认使用 `type=signup`，邮箱更换使用 `type=email_change`。

启用前需要在 Supabase 项目配置自定义 SMTP，然后分别把对应文件复制到 Confirm signup 与 Change email address 模板，并设置表格中的中文主题。默认邮件服务会锁定主题和正文编辑。模板生效并部署本仓库的确认页后，再发起新的邮箱验证；旧邮件链接不能用于新的手动确认流程。

如果 Supabase 开启了安全邮箱更换，变更会向新旧邮箱各发一封确认邮件；模板会根据每封邮件自动传入对应的 `TokenHash`，两封邮件都需要按提示确认后，新邮箱才会生效。
