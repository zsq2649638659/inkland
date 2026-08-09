import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 bg-paper min-h-screen">
      <Link href="/settings" className="text-sm text-accent">← 返回设置</Link>
      <h1 className="mt-8">隐私政策（待审核草案）</h1>
      <p className="text-muted">本页面是上线前的内容占位草案，请在公开运营前确认数据处理主体、存储地域、保存期限和用户权利说明。</p>
      <h2>1. 我们收集的信息</h2>
      <p>为提供账号、作品发布、评论和互动功能，平台可能处理邮箱、昵称、头像、作品内容、互动记录和必要的日志信息。</p>
      <h2>2. 信息使用</h2>
      <p>信息仅用于提供、维护和改进服务、保障平台安全以及处理用户反馈和举报。</p>
      <h2>3. 信息控制</h2>
      <p>用户可通过账户功能管理个人资料和作品。正式上线前将补充访问、更正、删除和注销账号的具体流程。</p>
      <h2>4. 联系方式</h2>
      <p>正式隐私联系邮箱待配置。</p>
    </main>
  );
}
