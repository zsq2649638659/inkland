"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { compressImage } from "@/lib/image";
import DefaultAvatar from "@/components/DefaultAvatar";
import AccountDatePicker from "@/components/AccountDatePicker";
import SettingsStatus from "@/components/SettingsStatus";
import { assertCanProfileEdit } from "@/lib/userRestrictions";
import { readAccountPreferences, saveAccountPreferences } from "@/lib/accountPreferences";

const genderOptions = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "private", label: "保密" },
] as const;

export default function ProfileEditForm() {
  const supabase = createClient();
  const { user, profile, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedUserRef = useRef<string | null>(null);

  const [nickname, setNickname] = useState(profile?.nickname || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [gender, setGender] = useState(readAccountPreferences(user).gender);
  const [birthDate, setBirthDate] = useState(readAccountPreferences(user).birth_date || "");
  const baselineRef = useRef({ nickname: profile?.nickname || "", bio: profile?.bio || null, avatar_url: profile?.avatar_url || null });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revisionStatus, setRevisionStatus] = useState<string | null>(null);

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
    const accountPreferences = readAccountPreferences(user);
    setGender(accountPreferences.gender);
    setBirthDate(accountPreferences.birth_date || "");
    setEmailValue(user.email || "");
    baselineRef.current = { nickname: profile.nickname || "", bio: profile.bio || null, avatar_url: profile.avatar_url || null };
  }, [profile, user]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("profile_revision_status, hidden_profile_fields")
          .eq("id", user.id)
          .maybeSingle();
        if (data?.profile_revision_status) setRevisionStatus(data.profile_revision_status as string);
      } catch {
        // 查询失败时保持未知状态，不阻断资料编辑。
      }
    })();
  }, [user, supabase]);

  if (!user) return null;

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

    const blocked = await assertCanProfileEdit();
    if (blocked) {
      setError(blocked);
      setSaving(false);
      return;
    }

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
      const previousBaseline = baselineRef.current;
      const submitted: string[] = [];
      if (nickname.trim() !== previousBaseline.nickname) submitted.push("nickname");
      if ((bio.trim() || null) !== previousBaseline.bio) submitted.push("bio");
      if ((avatarUrl || null) !== previousBaseline.avatar_url) submitted.push("avatar");
      baselineRef.current = { nickname: nickname.trim(), bio: bio.trim() || null, avatar_url: avatarUrl || null };
      const currentAccountPreferences = readAccountPreferences(user);
      const { error: personalError } = await saveAccountPreferences(supabase, {
        gender,
        birth_date: birthDate || null,
        copyright_license: currentAccountPreferences.copyright_license,
      });
      if (revisionStatus === "requested" && submitted.length > 0) {
        const { error: revisionError } = await supabase.rpc("profile_revision_submit", { p_fields: submitted });
        if (!revisionError) {
          setRevisionStatus("submitted");
          if (!personalError) setSuccess("保存成功");
        } else {
          if (!personalError) setError("资料整改状态更新失败，请稍后重试。");
        }
      } else {
        if (!personalError) setSuccess("保存成功");
      }
      if (personalError) setError("性别或出生日期暂未保存成功，请稍后重试。");
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
    const accountPreferences = readAccountPreferences(user);
    setGender(accountPreferences.gender);
    setBirthDate(accountPreferences.birth_date || "");
    setEmailValue(user?.email || "");
    baselineRef.current = { nickname: profile?.nickname || "", bio: profile?.bio || null, avatar_url: profile?.avatar_url || null };
    setNicknameEditOpen(false);
    setEmailEditOpen(false);
    setError("");
    setSuccess("");
  };

  return (
    <form
      className="profile-edit-form"
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
                      <Image src={avatarUrl} alt="当前头像" fill sizes="88px" unoptimized />
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

              {/* Personal details */}
              <div className="profile-personal-fields">
                <div className="field-group">
                  <span className="field-label">性别</span>
                  <div className="profile-choice-group" role="group" aria-label="选择性别">
                    {genderOptions.map((option) => (
                      <button
                        type="button"
                        key={option.value}
                        className={`profile-choice-button${gender === option.value ? " selected" : ""}`}
                        aria-pressed={gender === option.value}
                        onClick={() => setGender(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field-group">
                  <span className="field-label">出生日期</span>
                  <AccountDatePicker value={birthDate} onChange={setBirthDate} />
                </div>
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
              {/* Actions */}
              <div className="form-actions">
                {success && (
                  <SettingsStatus kind="success" message="保存成功" />
                )}
                <div className="form-action-buttons">
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
              </div>
    </form>
  );
}
