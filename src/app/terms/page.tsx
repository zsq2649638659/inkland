import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 bg-paper min-h-screen">
      <Link href="/settings" className="text-sm text-accent">← 返回设置</Link>
      <h1 className="mt-8">服务条款（待审核草案）</h1>
      <p className="text-muted">本页面是上线前的内容占位草案，请在公开运营前由运营负责人确认并补充主体信息、适用法律和联系方式。</p>
      <h2>1. 服务说明</h2>
      <p>inkland 为用户提供同人作品发布、阅读、评论和互动服务。用户应遵守适用法律法规及社区公约。</p>
      <h2>2. 用户内容</h2>
      <p>用户对其发布内容负责，并应确保拥有相应的发布权利。平台可根据规则处理违法、侵权或明显不适宜的内容。</p>
      <h2>3. 账号与安全</h2>
      <p>用户应妥善保管账号信息，不得冒用他人身份或利用服务进行骚扰、刷量、恶意攻击等行为。</p>
      <h2>4. 联系方式</h2>
      <p>正式联系方式待配置。</p>
    </main>
  );
}
