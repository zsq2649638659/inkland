"use client";

import { useState } from "react";

const cardComments = [
  { name: "星河旅人", time: "12分钟前", text: "这个氛围感太棒了，尤其喜欢最后一张。" },
  { name: "枫丹画师", time: "刚刚", text: "期待下一章，人物关系越来越有意思了。" },
];

export default function ReportActionsPreview() {
  const [reported, setReported] = useState("");
  const [blocked, setBlocked] = useState("");
  const [detail, setDetail] = useState(false);

  const notify = (message: string) => {
    setReported(message);
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f8f6f3", color: "#292522", padding: "40px 6vw", fontFamily: "Arial, sans-serif" }}>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div><div style={{ color: "#f26b5b", fontWeight: 800, fontSize: 27, fontStyle: "italic" }}>INKLAND</div><p style={{ color: "#857c75", margin: "8px 0 0" }}>举报与屏蔽交互预览</p></div>
          <button onClick={() => setDetail(!detail)} style={buttonStyle}>{detail ? "返回首页卡片" : "打开作品详情"}</button>
        </div>

        {!detail ? (
          <article style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
              <div style={avatarStyle}>星</div>
              <div style={{ flex: 1 }}><strong>星河旅人</strong><div style={mutedStyle}>今天 14:28</div></div>
              <details className="preview-details" style={detailsStyle}>
                <summary aria-label="作品更多操作" style={moreStyle}>⋮</summary>
                <div className="comment-popup preview-popup"><button className="comment-popup-item" onClick={() => notify("已取消关注")}><span className="menu-item-icon" aria-hidden="true" />取消关注</button><button className="comment-popup-item" onClick={() => notify("作品举报入口已打开")}><i className="fa-solid fa-flag" /> 举报</button></div>
              </details>
            </div>
            <h2 style={{ fontSize: 21, margin: "24px 0 10px" }}>《暮色中的城市剪影》</h2>
            <p style={{ lineHeight: 1.8, color: "#665e58" }}>夜色沿着高架桥缓慢铺开，城市的灯火像一片倒悬的星河。这里是作品卡片预览内容。</p>
            <div style={{ borderTop: "1px solid #eee7e1", marginTop: 24, paddingTop: 18, display: "flex", gap: 26, color: "#857c75" }}>♡ 24　　💬 评论 2　　☆ 收藏　　↗ 分享</div>
            <div style={{ marginTop: 24, padding: 18, background: "#fbfaf8", borderRadius: 14 }}>
              <strong style={{ fontSize: 14 }}>评论 2条</strong>
              {cardComments.map((comment, index) => <div key={comment.name} style={{ display: "flex", gap: 10, marginTop: 18, position: "relative" }}>
                <div style={{ ...avatarStyle, width: 32, height: 32, fontSize: 13, background: index ? "#b7c9e7" : "#f5b8a7" }}>{comment.name[0]}</div>
                <div style={{ flex: 1 }}><div><strong style={{ fontSize: 13 }}>{comment.name}</strong> <span style={mutedStyle}>{comment.time}</span></div><div style={{ marginTop: 5, lineHeight: 1.6 }}>{comment.text}</div></div>
                <details className="preview-details" style={{ ...detailsStyle, marginLeft: "auto" }}>
                  <summary aria-label="评论更多操作" style={{ ...moreStyle, opacity: 1 }}>⋮</summary>
                  <div className="comment-popup preview-popup"><button className="comment-popup-item" onClick={() => setBlocked(comment.name)}><i className="fa-solid fa-ban" /> 屏蔽</button><button className="comment-popup-item" onClick={() => notify(`已选择举报「${comment.name}」的评论`)}><i className="fa-solid fa-flag" /> 举报</button></div>
                </details>
              </div>)}
            </div>
          </article>
        ) : <article style={{ ...cardStyle, minHeight: 460, position: "relative" }}>
          <h1 style={{ fontSize: 28, marginTop: 4 }}>《暮色中的城市剪影》</h1><p style={mutedStyle}>星河旅人 · 作品详情页</p>
          <p style={{ maxWidth: 640, lineHeight: 2, marginTop: 40 }}>这是详情页内容区域。右侧悬浮工具栏新增了第四个按钮，专门用于举报当前作品。</p>
          <div style={{ position: "absolute", right: 24, top: 92, display: "grid", gap: 10 }}>
            {["☾", "A", "↔", "⚑"].map((icon, index) => <button key={icon} title={index === 3 ? "举报作品" : "阅读设置"} onClick={() => index === 3 && notify("作品举报入口已打开")} style={{ ...floatingStyle, color: index === 3 ? "#f26b5b" : "#857c75" }}>{icon}</button>)}
          </div>
        </article>}
        {(reported || blocked) && <div style={{ marginTop: 18, padding: "13px 16px", borderRadius: 10, background: "#fff0ec", color: "#d65347" }}>{reported || `已屏蔽 ${blocked}`}</div>}
      </div>
    </main>
  );
}

const cardStyle = { background: "#fff", borderRadius: 18, padding: 28, boxShadow: "0 8px 30px rgba(80,60,40,.06)" };
const buttonStyle = { border: 0, borderRadius: 22, padding: "11px 18px", background: "#f26b5b", color: "#fff", cursor: "pointer", fontWeight: 700 };
const avatarStyle = { width: 42, height: 42, borderRadius: "50%", display: "grid", placeItems: "center", background: "#f5b8a7", color: "#fff", fontWeight: 700 };
const mutedStyle = { color: "#a39a93", fontSize: 12 };
const moreStyle = { border: 0, background: "transparent", color: "#928981", fontSize: 23, cursor: "pointer", lineHeight: 1, padding: 5 };
const detailsStyle = { position: "relative" as const, marginLeft: "auto" };
const floatingStyle = { width: 46, height: 46, border: 0, borderRadius: 12, background: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,.08)", fontSize: 20, cursor: "pointer" };
