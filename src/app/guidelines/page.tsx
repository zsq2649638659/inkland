import Link from "next/link";

const sections = [
  ["community", "社区公约"],
  ["publishing", "发布规范"],
  ["moderation", "审核与举报"],
  ["copyright", "版权投诉"],
] as const;
const contactEmail = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL || "inkland@163.com";
const effectiveDate = process.env.NEXT_PUBLIC_LEGAL_EFFECTIVE_DATE || "2026年8月9日";

export const metadata = {
  title: "社区公约与发布规范 — inkland",
  description: "inkland 社区公约、作品发布规范、内容审核、举报处理与版权投诉说明。",
};

export default function GuidelinesPage() {
  return (
    <main className="legal-page-shell">
      <Link href="/settings" className="legal-back-link">← 返回设置</Link>
      <article className="legal-document">
        <p className="legal-kicker">INKLAND 社区规则</p>
        <h1>社区公约与发布规范</h1>
        <p className="legal-meta">版本 1.0　<span aria-hidden="true">·</span>　生效日期：{effectiveDate}</p>
        <p>inkland 是一个面向同人创作者和读者的作品社区。规则的目的，是让创作者能安心发布，让读者能尊重地阅读和交流。使用发布、评论、互动或举报功能，即表示你愿意遵守本规范。</p>

        <nav aria-label="本页目录" className="my-8 rounded-2xl border border-black/10 p-5">
          <p className="font-medium mb-3">本页目录</p>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            {sections.map(([id, label]) => <li key={id}><a href={`#${id}`} className="text-accent hover:underline">{label}</a></li>)}
          </ol>
        </nav>

        <section id="community" className="scroll-mt-8">
          <h2>一、社区公约</h2>
          <h3>1. 尊重创作，也尊重彼此</h3>
          <p>请就作品和观点本身交流，不攻击作者、读者或其他群体。禁止辱骂、威胁、跟踪、恶意曝光、歧视性言论、性骚扰、引战和组织围攻。不同意可以退出讨论，不必把讨论变成人身对抗。</p>
          <h3>2. 保护隐私与安全</h3>
          <p>不得发布或索取他人的真实姓名、住址、电话、私人账号、身份证件、未成年人信息、未公开行程或其他可识别个人身份的信息。不得发布钓鱼链接、恶意程序、诈骗信息或诱导他人泄露账号凭证。</p>
          <h3>3. 诚实互动</h3>
          <p>不得刷屏、刷赞、刷收藏、批量注册、冒充他人、操纵榜单或利用漏洞影响作品展示。不得恶意举报、捏造证据或把举报功能当作骚扰工具。</p>
          <h3>4. 共同维护阅读体验</h3>
          <p>评论请与作品相关，避免连续发送无意义内容。涉及剧透、重大情节、现实人物或敏感主题时，请在标题、开头或标签中提前提示，让读者能够自行选择是否继续阅读。</p>
        </section>

        <section id="publishing" className="scroll-mt-8">
          <h2>二、发布规范</h2>
          <h3>1. 你可以发布什么</h3>
          <p>可以发布你原创的文字、图片、评论、研究、设定和同人创作，也可以发布你获得明确授权的作品。转载、翻译、改编、合作创作或使用他人素材时，应在正文或简介中说明来源、作者、授权情况和译者/改作者信息。</p>
          <h3>2. 发布前请填写完整信息</h3>
          <ul>
            <li>标题应准确、清晰，不用夸张标题、关键词堆砌或冒充官方的表述。</li>
            <li>选择正确的作品类型、标签、系列/合集和可见范围；连载作品应保持章节顺序和章节标题一致。</li>
            <li>在简介或开头标注主要角色、配对、原作、设定偏离、剧透、未完结等读者需要知道的信息。</li>
            <li>图片应尽量使用你有权使用的素材，并填写必要的替代文字；不要把联系方式、二维码或广告水印作为主要内容反复发布。</li>
          </ul>
          <h3>3. 内容与分级</h3>
          <p>涉及暴力、血腥、虐待、创伤、强制关系、性相关主题、未成年人或其他可能引起不适的内容，应在标题附近和标签中明确提示，并使用合适的分级。分级和标签是阅读提示，不会使违法或侵权内容变得合规。</p>
          <p>禁止发布法律法规禁止的内容、以未成年人为性对象的内容、真实伤害或犯罪的操作性指导、侵犯他人著作权/商标权/肖像权/隐私权的内容、未经同意的私人信息，以及以本平台为渠道的交易诈骗、引流和恶意营销。</p>
          <h3>4. 作品权利与修改</h3>
          <p>发布者应对作品的合法性和授权负责。你可以编辑、下架或删除自己的作品；如作品进入举报、版权投诉或安全处理流程，平台可能暂时限制编辑或展示，并在可以披露的范围内向相关用户说明。</p>
        </section>

        <section id="moderation" className="scroll-mt-8">
          <h2>三、审核与举报</h2>
          <p>平台会结合用户举报、权利人通知、系统风控和人工审核处理违规线索。处理原则是必要、适度、留有申诉渠道：可能采取标记提示、限制推荐或互动、隐藏内容、删除内容、限制账号功能、暂停账号或终止服务等措施；明显违法、侵权或存在现实安全风险的内容，可能先行限制展示。</p>
          <ol>
            <li><strong>提交：</strong>在作品、评论或用户菜单中选择“举报”，写明具体问题、相关位置和可核验依据；也可以通过设置中的反馈入口提交“内容举报”。</li>
            <li><strong>受理：</strong>平台记录举报类型、对象、理由和处理状态。重复举报不会自动提高处理优先级，恶意举报可能被限制举报功能。</li>
            <li><strong>核查：</strong>运营人员根据本规范、相关法律和必要证据判断。涉及版权的投诉，应补充权利证明、具体作品链接和联系方式。</li>
            <li><strong>处理与通知：</strong>根据风险采取相应措施，并在条件允许时向举报人或被处理用户反馈结果。为保护隐私和审核安全，不公开他人的完整举报材料。</li>
            <li><strong>复核：</strong>如果你认为处理有误，可在收到结果后通过联系邮箱提交复核，说明账号、对象、原处理结果和新的依据。</li>
          </ol>
        </section>

        <section id="copyright" className="scroll-mt-8">
          <h2>四、版权投诉与申诉</h2>
          <p>权利人或其授权代理人可以发送邮件至 <a href={`mailto:${contactEmail}`}>{contactEmail}</a>，邮件标题请注明“版权投诉”。请提供：投诉人真实姓名/主体名称、联系方式、权利证明、被投诉作品链接、具体侵权位置、权利声明，以及投诉人对所述内容真实性负责的确认。</p>
          <p>平台会在材料足以核验时进行初步处理，并可能联系发布者说明情况。被投诉者如拥有授权或认为投诉有误，也可通过同一邮箱提交反通知、授权证明和具体说明。平台会依据材料和适用法律决定是否恢复、限制或移除内容。</p>
          <p className="mt-8 text-sm text-muted">本规范会随功能、法律和社区实践更新。更新后的版本将在本页标注生效日期。它不是对具体个案结果的承诺；如涉及紧急人身安全或法定程序，请同时联系有管辖权的机构。</p>
        </section>
      </article>
    </main>
  );
}
