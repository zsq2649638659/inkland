"use client";

import type { ReactNode } from "react";
import Link from "next/link";

type DetailView = "reportwork" | "reportcomment" | "reportuser" | "users" | "feedbacks" | "rules";

type Props = {
  activeView: DetailView;
  breadcrumb: string;
  adminInitial?: string;
  children: ReactNode;
};

const navItems: Array<{ view: DetailView; label: string; href: string }> = [
  { view: "reportwork", label: "作品举报", href: "/admin?view=reportwork" },
  { view: "reportcomment", label: "评论举报", href: "/admin?view=reportcomment" },
  { view: "reportuser", label: "用户举报", href: "/admin?view=reportuser" },
  { view: "users", label: "用户管理", href: "/admin?view=users" },
];

export default function AdminDetailFrame({ activeView, breadcrumb, adminInitial = "A", children }: Props) {
  return (
    <div className="admin-app-shell admin-detail-app-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark"><svg viewBox="0 0 1535 857" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M253 848C278.56 726.64 291.64 598.27 319.94 477.94C340.59 390.11 383.9 316.25 462.37 268.37C590.46 190.21 798.39 207.91 841.07 374.94C866.81 475.66 796.07 590.94 900.35 663.66C1008.05 738.76 1144.21 668.58 1231.02 597.02C1258.43 574.42 1284.44 529.68 1325.43 542.57L1338.05 549.95L1490.94 845.01L1310.99 847L1230.02 689.9C1174.48 744.13 1114.63 795.5 1042.33 826.33C869.05 900.22 671.92 843.47 691.05 625.05C697.88 547.05 757.52 410.78 644.51 379.48C557.04 355.26 495.68 418.68 475.63 497.62C446.93 610.64 440.1 734.58 410 847.99H253V848Z"/><path d="M1185 0L1099.01 487.99L1346 240H1535C1443.66 336.03 1351.46 442.56 1251.02 529.02C1161.29 606.26 958.981 728.81 930.891 530.97L1025 0.00999451H1185V0Z"/><path d="M301 60L158 848H0L137 60H301Z"/></svg></span>
          <span>Inkland 管理后台</span>
        </div>
        <div className="admin-nav-group">
          <p>后台功能</p>
          <nav aria-label="后台主导航">
            <Link className="admin-nav-item" href="/admin?view=reviews"><span>作品审核</span></Link>
            <Link className="admin-nav-item" href="/admin?view=comments"><span>评论审核</span></Link>
            {navItems.map((item) => <Link className={`admin-nav-item ${activeView === item.view ? "is-active" : ""}`} href={item.href} key={item.view} aria-current={activeView === item.view ? "page" : undefined}><span>{item.label}</span></Link>)}
            <Link className={`admin-nav-item ${activeView === "feedbacks" ? "is-active" : ""}`} href="/admin?view=feedbacks" aria-current={activeView === "feedbacks" ? "page" : undefined}><span>用户反馈</span></Link>
            <Link className={`admin-nav-item ${activeView === "rules" ? "is-active" : ""}`} href="/admin?view=rules" aria-current={activeView === "rules" ? "page" : undefined}><span>审核规则</span></Link>
          </nav>
        </div>
        <div className="admin-sidebar-foot">Inkland 内容治理后台<br />设计稿 · uicraft</div>
      </aside>
      <main className="admin-main">
        <header className="admin-topbar">
          <div className="admin-breadcrumb"><strong>{breadcrumb}</strong></div>
          <div className="admin-top-actions">
            <button className="admin-btn admin-btn-light admin-global-search-btn" type="button">全局搜索 <span className="admin-shortcut">⌘ K</span></button>
            <button className="admin-btn admin-btn-light" type="button" onClick={() => window.location.reload()}>刷新</button>
            <span className="admin-last-updated">上次更新 10:24</span>
            <button className="admin-account-trigger" type="button">管理员 {adminInitial} <span aria-hidden="true">⌄</span></button>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
