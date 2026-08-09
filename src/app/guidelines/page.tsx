import Link from "next/link";

export default function GuidelinesPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 bg-paper min-h-screen">
      <Link href="/create" className="text-sm text-accent">← 返回创作</Link>
      <h1 className="mt-8">社区公约与发布规范</h1>
      <p className="text-muted">请尊重创作者、读者和作品权利，共同维护友善、有序的创作环境。</p>
      <h2>允许发布</h2>
      <p>原创或拥有相应发布权利的同人创作、评论和合理讨论。</p>
      <h2>禁止内容</h2>
      <p>违法内容、恶意骚扰、仇恨攻击、未经授权的个人信息、恶意刷屏，以及侵犯他人著作权、商标权或其他权利的内容。</p>
      <h2>内容分级</h2>
      <p>发布前请如实选择内容分级并添加必要标签。涉及成人、暴力或其他敏感主题的内容，应遵守平台后续公布的分级规则。</p>
      <h2>举报与处理</h2>
      <p>发现违规内容可以使用举报功能。平台会根据证据和规则进行处理，必要时限制内容展示或账号功能。</p>
      <p className="mt-8 text-sm text-muted">正式上线前请由运营负责人审核本页面，并补充版权投诉和申诉流程。</p>
    </main>
  );
}
