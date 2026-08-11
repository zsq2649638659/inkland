"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import HomeSidebar from "@/components/HomeSidebar";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { compressImage } from "@/lib/image";
import DefaultAvatar from "@/components/DefaultAvatar";

export default function EditProfilePage() {
  const supabase = createClient();
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedUserRef = useRef<string | null>(null);

  const [nickname, setNickname] = useState(profile?.nickname || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // 昵称和邮箱的编辑切换
  const [nicknameEditOpen, setNicknameEditOpen] = useState(false);
  const [emailEditOpen, setEmailEditOpen] = useState(false);
  const [emailValue, setEmailValue] = useState(user?.email || "");

  useEffect(() => {
    if (!user || !profile || hydratedUserRef.current === user.id) return;
    hydratedUserRef.current = user.id;
    setNickname(profile.nickname || "");
    setBio(profile.bio || "");
    setAvatarUrl(profile.avatar_url || "");
    setEmailValue(user.email || "");
  }, [profile, user]);

  // 未登录状态
  if (!user) {
    return (
      <div id="page-profile-edit" className="min-h-screen bg-paper pb-20 lg:pb-0">
        <div className="main-container">
          <HomeSidebar />
          <div className="profile-edit-content">
            <div className="feed-empty-state">
              <div className="feed-empty-illustration">
                <div className="feed-empty-tag-ring">
                  <div className="feed-empty-ring-outer"></div>
                  <div className="feed-empty-ring-inner">
                    <i className="fa-solid fa-user-pen"></i>
                  </div>
                </div>
              </div>
              <h2 className="feed-empty-title">登录后编辑资料</h2>
              <p className="feed-empty-desc">登录后即可编辑个人资料和偏好设置</p>
              <Link href="/login" className="feed-empty-action">登录</Link>
              <Link href="/register" className="feed-empty-register">还没有账号？立即注册 →</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    setUploading(true);
    setError("");

    let compressedFile: File;
    try {
      compressedFile = (await compressImage(file, { maxDimension: 512, maxBytes: 512 * 1024, quality: 0.88 })).file;
    } catch (compressionError) {
      setError(compressionError instanceof Error ? compressionError.message : "图片处理失败，请换一张图片重试");
      setUploading(false);
      return;
    }

    const fileExt = "webp";
    const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;

    const { error: uploadErr } = await supabase.storage
      .from("post-images")
      .upload(fileName, compressedFile, { upsert: true, contentType: "image/webp" });

    if (uploadErr) {
      setError(`上传失败: ${uploadErr.message}`);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(fileName);
    if (urlData?.publicUrl) {
      setAvatarUrl(urlData.publicUrl);
    }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!nickname.trim()) {
      setError("昵称不能为空");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        nickname: nickname.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl || null,
      })
      .eq("id", user.id);

    if (updateErr) {
      setError(`保存失败: ${updateErr.message}`);
    } else {
      await refreshProfile();
      setSuccess("保存成功！");
      setNicknameEditOpen(false);
      setEmailEditOpen(false);
      setTimeout(() => setSuccess(""), 2500);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setNickname(profile?.nickname || "");
    setBio(profile?.bio || "");
    setAvatarUrl(profile?.avatar_url || "");
    setEmailValue(user?.email || "");
    setNicknameEditOpen(false);
    setEmailEditOpen(false);
    setError("");
    setSuccess("");
  };

  return (
    <div id="page-profile-edit" className="min-h-screen bg-paper pb-20 lg:pb-0">
      <div className="main-container">
        <HomeSidebar />

        <div className="profile-edit-content">
          {/* Page Header */}
          <div className="page-header">
            <h1 className="page-title">编辑资料</h1>
          </div>

          {/* Form Card */}
          <div className="form-card">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              noValidate
            >
              {/* Avatar */}
              <div className="avatar-section">
                <div className="avatar-upload">
                  <div className="avatar-preview">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="" />
                    ) : (
                      <DefaultAvatar name={nickname || user?.email?.[0] || "?"} />
                    )}
                  </div>
                  <div className="avatar-overlay" aria-hidden="true">
                    <i className="fa-solid fa-camera"></i>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png, image/jpeg, image/webp"
                    aria-label="更换头像"
                    onChange={handleAvatarUpload}
                  />
                </div>
                <span className="avatar-hint">
                  {uploading ? "正在压缩并上传..." : "点击更换头像，支持 PNG、JPEG、WebP，自动压缩"}
                </span>
              </div>

              {/* Nickname — 与邮箱同理：显示已有值 + 修改入口 */}
              <div className="field-group">
                <label className="field-label">昵称</label>
                <div className="inline-display" style={{ display: nicknameEditOpen ? "none" : "flex" }}>
                  <span className="inline-value">{nickname || "未设置"}</span>
                  <button
                    type="button"
                    className="inline-edit-btn"
                    onClick={() => setNicknameEditOpen(true)}
                  >
                    <i className="fa-solid fa-pen"></i> 修改
                  </button>
                </div>
                {nicknameEditOpen && (
                  <div className="inline-edit-row">
                    <input
                      type="text"
                      className="field-input"
                      placeholder="输入你的昵称…"
                      maxLength={30}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      autoFocus
                    />
                    <div className={`char-count${nickname.length > 30 ? " over" : ""}`}>
                      {nickname.length} / 30
                    </div>
                    <span className={`field-error${!nickname.trim() ? " visible" : ""}`} role="alert">
                      昵称不能为空
                    </span>
                  </div>
                )}
              </div>

              {/* Bio */}
              <div className="field-group">
                <label htmlFor="bio" className="field-label">简介</label>
                <textarea
                  id="bio"
                  name="bio"
                  className="field-textarea"
                  placeholder="简单介绍一下自己…"
                  maxLength={200}
                  rows={4}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                ></textarea>
                <div className={`char-count${bio.length > 200 ? " over" : ""}`}>
                  {bio.length} / 200
                </div>
                <span className="field-error" role="alert">简介不能超过 200 个字符</span>
              </div>

              {/* Email */}
              <div className="field-group">
                <label className="field-label">邮箱</label>
                <div className="inline-display" style={{ display: emailEditOpen ? "none" : "flex" }}>
                  <span className="inline-value">{user.email}</span>
                  <button
                    type="button"
                    className="inline-edit-btn"
                    onClick={() => setEmailEditOpen(true)}
                  >
                    <i className="fa-solid fa-pen"></i> 修改
                  </button>
                </div>
                {emailEditOpen && (
                  <div className="inline-edit-row">
                    <input
                      type="email"
                      className="field-input"
                      placeholder="your@email.com…"
                      maxLength={50}
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      autoFocus
                    />
                    <div className={`char-count${emailValue.length > 50 ? " over" : ""}`}>
                      {emailValue.length} / 50
                    </div>
                    <span className="field-error" role="alert">请输入有效的邮箱地址</span>
                  </div>
                )}
              </div>

              {/* 错误/成功提示 */}
              {error && (
                <span className="field-error visible" role="alert" style={{ display: "block", marginBottom: "16px" }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ marginRight: "4px" }}></i>{error}
                </span>
              )}
              {success && (
                <div className="success-toast">
                  <span className="success-toast-icon">
                    <i className="fa-solid fa-circle-check"></i>
                  </span>
                  <span className="success-toast-text">{success}</span>
                </div>
              )}

              {/* Actions */}
              <div className="form-actions">
                <button type="button" className="btn-cancel" onClick={handleCancel}>
                  取消
                </button>
                <button type="submit" className="btn-save" disabled={saving}>
                  {saving ? (
                    <><i className="fa-solid fa-spinner" style={{ animation: "spin 1s linear infinite" }}></i>保存中...</>
                  ) : (
                    <><i className="fa-solid fa-check" aria-hidden="true"></i> 保存</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
