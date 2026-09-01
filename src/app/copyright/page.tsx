import Link from "next/link";
import { copyrightPolicyOptions } from "@/lib/copyrightPolicy";

const contactEmail = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL || "inkland@163.com";
const effectiveDate = process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE || "2026年9月1日";

export const metadata = {
  title: "作品版权说明 — inkland",
  description: "inkland 作品版权偏好、站内阅读和站外转载改编边界说明。",
};

export default function CopyrightPage() {
  return (
    <main className="legal-page-shell">
      <Link href="/settings?tab=account" className="legal-back-link">← 返回账号设置</Link>
      <article className="legal-document">
        <p className="legal-kicker">INKLAND 作品说明</p>
        <h1>作品版权说明</h1>
        <p className="legal-meta">版本 1.0　<span aria-hidden="true">·</span>　生效日期：{effectiveDate}</p>

        <p>你在 Inkland 发布作品时，仍然保留作品的相应权利。账号设置里的版权偏好，是你对其他人如何使用作品的默认提示；发布具体作品时，请根据作品实际情况再次确认。</p>

        <h2>一、先说清楚三件事</h2>
        <ol>
          <li>作品属于你或你已获得授权的范围；选择某个偏好不会替你取得原作、素材、配乐、字体或其他第三方权利。</li>
          <li>作品公开后，其他用户可以按照 Inkland 的页面权限阅读和进行站内互动；这不等于允许复制正文、下载图片或搬运到站外。</li>
          <li>版权偏好是公开作品旁的使用提示，不会自动追溯修改已经发布的作品，也不会替代你与他人之间单独签署的授权协议。</li>
        </ol>

        <h2>二、Inkland 的四种版权偏好</h2>
        <div className="copyright-policy-list">
          {copyrightPolicyOptions.map((option, index) => (
            <section className="copyright-policy-item" key={option.value}>
              <div className="copyright-policy-number">{index + 1}</div>
              <div>
                <h3>{option.label}</h3>
                <p>{option.description}</p>
                <p className="copyright-policy-detail">{option.detail}</p>
              </div>
            </section>
          ))}
        </div>

        <h2>三、同人作品和合作作品</h2>
        <p>如果作品使用了他人的角色、世界观、图片、文字、翻译、设定或其他素材，请先确认你拥有相应授权。你只能对自己拥有或被授权的部分作出许可，不应把第三方权利一并授权给他人。</p>
        <p>合作创作、改编或转载作品，建议在简介中写明参与者、原作者、授权范围、修改内容和原文链接。版权偏好无法替代必要的署名和授权说明。</p>

        <h2>四、发现未经允许的转载</h2>
        <p>如果你发现自己的作品被未经允许转载、改编或用于商业宣传，请通过 <a href={`mailto:${contactEmail}`}>{contactEmail}</a> 联系我们，并提供账号、作品链接、具体侵权位置、权利或授权证明以及你的处理诉求。平台会在材料足以核验时进行初步处理。</p>

      </article>
    </main>
  );
}
