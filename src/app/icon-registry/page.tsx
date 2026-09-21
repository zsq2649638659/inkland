"use client";

import { useMemo, useState } from "react";
import SiteIcon from "@/components/SiteIcon";
import { inklandIconRegistry, type InklandIconName } from "@/components/inkland/iconRegistry";

const chineseLabels: Partial<Record<InklandIconName, string>> = {
  "fa-about-us": "关于我们",
  "fa-action-delete": "删除",
  "fa-action-forbid": "屏蔽",
  "fa-action-edit": "编辑",
  "fa-action-preview-open": "预览",
  "fa-align-center": "居中对齐",
  "fa-align-left": "左对齐",
  "fa-align-right": "右对齐",
  "fa-arrow-left": "向左",
  "fa-arrow-right": "向右",
  "fa-arrow-up": "向上",
  "fa-arrow-down": "向下",
  "fa-arrow-down-wide-short": "降序排序",
  "fa-arrow-up-wide-short": "升序排序",
  "fa-angles-down": "向下展开（旧）",
  "fa-bars": "菜单",
  "fa-bell": "通知",
  "fa-book": "书籍",
  "fa-book-open": "打开书籍",
  "fa-bookmark": "收藏",
  "fa-calendar": "日期",
  "fa-calendar-days": "日历（旧）",
  "fa-camera": "相机",
  "fa-check": "确认",
  "fa-chevron-down": "向下展开",
  "fa-chevron-left": "向左切换",
  "fa-chevron-right": "向右切换",
  "fa-chevron-up": "向上收起",
  "fa-circle-check": "成功",
  "fa-circle-exclamation": "提示",
  "fa-circle-plus": "新增",
  "fa-circle-user": "用户（备用）",
  "fa-circle-xmark": "关闭",
  "fa-clock": "时间",
  "fa-clock-rotate-left": "历史记录",
  "fa-comment": "评论",
  "fa-comment-dots": "评论消息",
  "fa-compass": "发现",
  "fa-contact-us": "联系我们",
  "fa-share-nodes": "分享（旧）",
  "fa-detail-back-to-top": "回到顶部",
  "fa-detail-font-adjust": "字体调整",
  "fa-detail-line-height": "行高",
  "fa-detail-more": "更多",
  "fa-detail-night-mode": "详情页夜间模式（旧）",
  "fa-detail-paragraph-spacing": "段间距",
  "fa-detail-page-width": "页面宽度",
  "fa-detail-report": "举报作品",
  "fa-ellipsis-vertical": "更多操作",
  "fa-envelope": "邮件",
  "fa-eye": "查看",
  "fa-eye-slash": "隐藏",
  "fa-face-smile": "表情",
  "fa-feather-pointed": "创作",
  "fa-file-arrow-up": "上传文件",
  "fa-file-import": "导入文件",
  "fa-file-lines": "作品/文档",
  "fa-filter": "筛选",
  "fa-fire": "热度",
  "fa-flag": "举报",
  "fa-followers": "关注粉丝",
  "fa-font": "字体",
  "fa-gear": "设置",
  "fa-hashtag": "标签",
  "fa-heart": "喜欢",
  "fa-house": "主页",
  "fa-image": "图片",
  "fa-images": "多图",
  "fa-layer-group": "合集",
  "fa-link": "链接",
  "fa-list-check": "列表选择",
  "fa-lock": "锁定",
  "fa-long-serial": "长篇连载",
  "fa-magnifying-glass": "搜索",
  "fa-message": "消息",
  "fa-minus": "分割线",
  "fa-moon": "夜间模式",
  "fa-paper-plane": "发布",
  "fa-pen": "笔",
  "fa-pen-to-square": "编辑作品",
  "fa-power": "注销账户",
  "fa-pencil": "编辑",
  "fa-plus": "新增",
  "fa-profile-center": "个人空间",
  "fa-profile-settings": "个人资料",
  "fa-reply": "回复",
  "fa-right-from-bracket": "退出账户",
  "fa-right-to-bracket": "登录",
  "fa-share-from-square": "分享",
  "fa-sliders": "调整",
  "fa-spinner": "加载中",
  "fa-sun": "日间模式",
  "fa-tag": "标签",
  "fa-tag-heat": "标签热度",
  "fa-tag-participants": "标签参与",
  "fa-tag-works": "标签作品",
  "fa-tag-remove": "移除标签",
  "fa-tags": "标签组",
  "fa-trash-can": "删除",
  "fa-word-count": "字数",
  "fa-triangle-exclamation": "警告（旧）",
  "fa-user": "用户",
  "fa-user-check": "正确用户",
  "fa-user-circle": "用户头像（旧）",
  "fa-user-edit": "编辑姓名",
  "fa-user-favorite": "收藏好友",
  "fa-user-group": "人群",
  "fa-user-minus": "减少用户",
  "fa-user-plus": "添加用户",
  "fa-user-search": "搜索用户",
  "fa-user-shield": "人身安全",
  "fa-users": "用户列表",
  "fa-wand-magic-sparkles": "一键排版",
  "fa-workbench": "工作台",
  "fa-xmark": "关闭",
};

const chineseSegments: Record<string, string> = {
  action: "操作", about: "关于", adjust: "调整", align: "对齐", arrow: "箭头", card: "卡片",
  center: "中心", check: "确认", circle: "圆形", clear: "清除", compact: "紧凑", contact: "联系",
  default: "默认", detail: "详情", days: "日期", download: "下载", exclamation: "提示", expand: "放大",
  file: "文件", filter: "筛选", fire: "热度", font: "字体", followers: "关注粉丝", group: "组",
  height: "高度", import: "导入", info: "信息", layer: "层级", left: "左", line: "行", list: "列表",
  long: "长篇", mode: "模式", night: "夜间", nodes: "节点", open: "打开", outline: "描边",
  page: "页面", paragraph: "段落", profile: "资料", preview: "预览", right: "右", rotate: "旋转",
  search: "搜索", serial: "连载", settings: "设置", share: "分享", solid: "填充", spacing: "间距",
  user: "用户", upload: "上传", users: "用户", width: "宽度",
};

type IconGroup = {
  id: string;
  title: string;
  description: string;
  names: InklandIconName[];
};

const baseIconGroups: IconGroup[] = [
  {
    id: "home-sidebar",
    title: "首页 Sidebar",
    description: "主页、移动端菜单及“更多”子菜单中的全部导航按钮",
    names: [
      "fa-house", "fa-magnifying-glass", "fa-bell", "fa-workbench", "fa-followers",
      "fa-profile-center", "fa-clock-rotate-left", "fa-profile-settings", "fa-gear", "fa-ellipsis-circle",
      "fa-moon", "fa-contact-us", "fa-about-us", "fa-right-from-bracket", "fa-power", "fa-bars",
    ],
  },
  {
    id: "rich-text",
    title: "富文本编辑器",
    description: "创作页面、章节编辑页的编辑器工具栏",
    names: [
      "fa-rotate-left", "fa-rotate-right", "fa-bold", "fa-italic", "fa-underline",
      "fa-strikethrough", "fa-align-left", "fa-align-center", "fa-align-right",
      "fa-minus", "fa-wand-magic-sparkles", "fa-file-import", "fa-font", "fa-compress", "fa-expand",
    ],
  },
  {
    id: "auth",
    title: "登录注册和消息提示",
    description: "登录注册表单、密码可见性、认证状态与站内消息提示图标",
    names: [
      "fa-user", "fa-envelope", "fa-lock", "fa-eye", "fa-eye-slash", "fa-circle-check",
      "fa-circle-exclamation", "fa-circle-xmark", "fa-feather-pointed", "fa-sparkles", "fa-right-to-bracket",
      "fa-bell", "fa-heart", "fa-comment", "fa-bookmark", "fa-reply", "fa-user-plus",
    ],
  },
  {
    id: "user",
    title: "用户相关",
    description: "个人资料、用户页、关注关系、账户安全与用户操作",
    names: [
      "fa-user", "fa-user-plus", "fa-user-check", "fa-user-group", "fa-user-minus",
      "fa-user-shield", "fa-users",
    ],
  },
  {
    id: "detail-floating",
    title: "详情页 Floating Sidebar",
    description: "单篇、图片、章节详情页的阅读辅助操作",
    names: [
      "fa-moon", "fa-detail-font-adjust", "fa-detail-line-height", "fa-detail-paragraph-spacing",
      "fa-detail-page-width", "fa-detail-report", "fa-detail-back-to-top", "fa-detail-more",
    ],
  },
  {
    id: "publish",
    title: "发布与定时发布",
    description: "作品发布页、章节发布页的发布与日期时间选择",
    names: ["fa-calendar", "fa-clock"],
  },
  {
    id: "upload",
    title: "上传与作品内容",
    description: "图片上传、文件上传、作品类型与内容容器",
    names: [
      "fa-image", "fa-images", "fa-camera", "fa-file-arrow-up", "fa-cloud-arrow-up", "fa-word-count",
      "fa-file-lines", "fa-book", "fa-book-open", "fa-long-serial", "fa-layer-group",
    ],
  },
  {
    id: "interaction",
    title: "作品互动",
    description: "作品卡片、详情页、消息列表中的互动与操作菜单",
    names: [
      "fa-heart", "fa-comment", "fa-bookmark", "fa-reply", "fa-share-from-square",
      "fa-ellipsis-vertical", "fa-flag", "fa-action-delete", "fa-action-forbid", "fa-face-smile", "fa-message", "fa-paper-plane",
    ],
  },
  {
    id: "filters",
    title: "视图筛选与视图切换",
    description: "搜索页、作品管理页的筛选、排序与列表视图",
    names: [
      "fa-filter", "fa-list-compact", "fa-card-compact",
      "fa-list-check", "fa-sliders", "fa-arrow-down-wide-short", "fa-arrow-up-wide-short",
    ],
  },
  {
    id: "tag-detail",
    title: "标签详情页",
    description: "标签详情页头部的作品、参与与浏览统计",
    names: ["fa-tag-works", "fa-tag-participants", "fa-tag-heat"],
  },
  {
    id: "studio-actions",
    title: "作品管理操作",
    description: "作品管理与长篇连载章节管理中的编辑、预览、删除",
    names: ["fa-action-preview-open", "fa-action-edit", "fa-play"],
  },
  {
    id: "navigation-feedback",
    title: "导航与状态反馈",
    description: "页面切换、加载、提示、成功与异常状态",
    names: [
      "fa-arrow-left", "fa-arrow-right", "fa-arrow-up", "fa-arrow-down", "fa-arrow-rotate-right",
      "fa-chevron-down", "fa-angles-left", "fa-angles-right", "fa-chevron-left", "fa-chevron-right",
      "fa-chevron-up", "fa-circle-check", "fa-circle-exclamation",
      "fa-spinner", "fa-lock", "fa-xmark", "fa-check", "fa-hourglass-half",
    ],
  },
];

const iconNames = Object.keys(inklandIconRegistry).sort() as InklandIconName[];
const groupedNames = new Set(baseIconGroups.flatMap((group) => group.names));
const intentionallyUnusedNames = new Set<InklandIconName>([
  "fa-link", "fa-angles-down", "fa-share-nodes", "fa-triangle-exclamation",
  "fa-arrow-up-from-bracket", "fa-calendar-days", "fa-circle-user", "fa-clear-compact", "fa-comment-dots",
  "fa-detail-night-mode", "fa-user-circle", "fa-user-edit", "fa-user-favorite", "fa-user-search",
  "fa-ellipsis", "fa-filter-compact",
]);
const iconGroups: IconGroup[] = [
  ...baseIconGroups,
  {
    id: "unused",
    title: "暂无使用",
    description: "当前没有归入使用中组件分组，保留在注册表中备用",
    names: iconNames.filter((name) => intentionallyUnusedNames.has(name) && !groupedNames.has(name)),
  },
  {
    id: "other",
    title: "其它通用图标",
    description: "尚未归入特定页面组件的注册表图标",
    names: iconNames.filter((name) => !groupedNames.has(name) && !intentionallyUnusedNames.has(name)),
  },
];

function fallbackChineseLabel(name: InklandIconName) {
  return name.replace(/^fa-/, "").split("-").map((part) => chineseSegments[part] || part).join(" ");
}

function getUsageLocation(name: InklandIconName) {
  return iconGroups.find((group) => group.names.includes(name))?.description || "全站通用组件 / 具体调用页面";
}

export default function IconRegistryPreviewPage() {
  const [query, setQuery] = useState("");
  const visibleIcons = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return iconNames;
    return iconNames.filter((name) => {
      const label = chineseLabels[name] || fallbackChineseLabel(name);
      const location = getUsageLocation(name);
      return `${name} ${label} ${location}`.toLowerCase().includes(normalizedQuery);
    });
  }, [query]);

  const visibleGroups = useMemo(
    () => iconGroups
      .map((group) => ({ ...group, names: group.names.filter((name) => visibleIcons.includes(name)) }))
      .filter((group) => group.names.length > 0),
    [visibleIcons],
  );

  return (
    <main className="icon-registry-page">
      <header className="icon-registry-header">
        <div>
          <p className="icon-registry-eyebrow">Inkland Design System</p>
          <h1>图标注册表预览</h1>
          <p>显示 {visibleIcons.length} / {iconNames.length} 个图标，可按中文名、英文名或出现页面位置筛选。</p>
        </div>
        <label className="icon-registry-search">
          <span>筛选图标</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索图标、页面位置…" />
        </label>
      </header>

      <div className="icon-registry-groups">
        {visibleGroups.map((group) => (
          <section className="icon-registry-group" key={group.id}>
            <div className="icon-registry-group-header">
              <div>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
              <span>{group.names.length} 个</span>
            </div>
            <div className="icon-registry-grid" role="list">
              {group.names.map((name) => (
                <article className="icon-registry-card" key={name} role="listitem">
                  {inklandIconRegistry[name].supportsVariants ? (
                    <div className="icon-registry-preview icon-registry-preview--states" aria-label="描边和填充状态">
                      <span><SiteIcon name={name} variant="outline" size={24} /></span>
                      <span><SiteIcon name={name} variant="solid" size={24} /></span>
                    </div>
                  ) : (
                    <div className="icon-registry-preview"><SiteIcon name={name} size={32} /></div>
                  )}
                  <div className="icon-registry-copy">
                    <strong>{chineseLabels[name] || fallbackChineseLabel(name)}</strong>
                    <code>{name}</code>
                    <span>{getUsageLocation(name)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {visibleGroups.length === 0 && <p className="icon-registry-empty">没有匹配的图标。</p>}
    </main>
  );
}
