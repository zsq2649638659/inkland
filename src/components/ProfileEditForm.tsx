"use client";
import SiteIcon from "@/components/SiteIcon";
import Radio from "@/components/inkland/Radio";

import { useEffect, useLayoutEffect, useState, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";
import { compressImage } from "@/lib/image";
import DefaultAvatar from "@/components/DefaultAvatar";
import AccountDatePicker from "@/components/AccountDatePicker";
import SettingsStatus from "@/components/SettingsStatus";
import { assertCanProfileEdit } from "@/lib/userRestrictions";
import { readAccountPreferences, saveAccountPreferences } from "@/lib/accountPreferences";
import { useRouter } from "next/navigation";

const MAX_NICKNAME_LENGTH = 16;

type ProfileDraftBaseline = {
  nickname: string;
  bio: string | null;
  avatar_url: string | null;
  gender: "male" | "female" | "private";
  birth_date: string | null;
  email: string;
};

type PendingNavigation = { href: string; replace: boolean };

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

const genderOptions = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "private", label: "保密" },
] as const;

export default function ProfileEditForm() {
  const supabase = createClient();
  const router = useRouter();
  const { user, profile, profileLoading, refreshProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const stayButtonRef = useRef<HTMLButtonElement>(null);
  const navigationTriggerRef = useRef<HTMLElement | null>(null);
  const hydratedUserRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const currentUrlRef = useRef("");
  const composingNicknameRef = useRef(false);

  const [nickname, setNickname] = useState(profile?.nickname || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [gender, setGender] = useState(readAccountPreferences(user).gender);
  const [birthDate, setBirthDate] = useState(readAccountPreferences(user).birth_date || "");
  const [baseline, setBaseline] = useState<ProfileDraftBaseline>({
    nickname: profile?.nickname || "",
    bio: profile?.bio || null,
    avatar_url: profile?.avatar_url || null,
    gender: readAccountPreferences(user).gender,
    birth_date: readAccountPreferences(user).birth_date,
    email: normalizeEmail(user?.email),
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<"warning" | "error" | "">("");
  const [success, setSuccess] = useState("");
  const [revisionStatus, setRevisionStatus] = useState<string | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [unsavedDialogOpen, setUnsavedDialogOpen] = useState(false);
  const [emailValue, setEmailValue] = useState(user?.email || "");

  const nicknameLength = Array.from(nickname).length;
  const hasUnsavedChanges = Boolean(user && hydratedUserId === user.id && (
    nickname.trim() !== baseline.nickname
    || (bio.trim() || null) !== baseline.bio
    || (avatarUrl || null) !== baseline.avatar_url
    || gender !== baseline.gender
    || (birthDate || null) !== baseline.birth_date
    || normalizeEmail(emailValue) !== baseline.email
  ));

  useLayoutEffect(() => {
    dirtyRef.current = hasUnsavedChanges || uploading || saving;
  }, [hasUnsavedChanges, saving, uploading]);

  useEffect(() => {
    if (!user || profileLoading || hydratedUserRef.current === user.id) return;
    hydratedUserRef.current = user.id;
    setNickname(profile?.nickname || "");
    setBio(profile?.bio || "");
    setAvatarUrl(profile?.avatar_url || "");
    const accountPreferences = readAccountPreferences(user);
    setGender(accountPreferences.gender);
    setBirthDate(accountPreferences.birth_date || "");
    setEmailValue(user.email || "");
    setBaseline({
      nickname: profile?.nickname || "",
      bio: profile?.bio || null,
      avatar_url: profile?.avatar_url || null,
      gender: accountPreferences.gender,
      birth_date: accountPreferences.birth_date,
      email: normalizeEmail(user.email),
    });
    setHydratedUserId(user.id);
  }, [profile, profileLoading, user]);

  useEffect(() => {
    currentUrlRef.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  });

  useEffect(() => {
    const setPendingNavigation = (href: string, replace = false) => {
      pendingNavigationRef.current = { href, replace };
      setUnsavedDialogOpen(true);
    };
    const interceptLinkNavigation = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let destination: URL;
      try {
        destination = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (destination.origin !== window.location.origin) return;
      const href = `${destination.pathname}${destination.search}${destination.hash}`;
      if (href === currentUrlRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      navigationTriggerRef.current = target instanceof HTMLElement ? target : anchor;
      setPendingNavigation(href);
    };
    const interceptProgrammaticNavigation = (event: Event) => {
      if (!dirtyRef.current || !(event instanceof CustomEvent) || typeof event.detail !== "string") return;
      event.preventDefault();
      setPendingNavigation(event.detail);
    };
    const interceptHistoryNavigation = (event: PopStateEvent) => {
      if (!dirtyRef.current) return;
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const protectedHref = currentUrlRef.current || href;
      if (href === protectedHref) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      window.history.pushState(event.state, "", protectedHref);
      navigationTriggerRef.current = null;
      setPendingNavigation(href, true);
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const closeDialogOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !pendingNavigationRef.current) return;
      pendingNavigationRef.current = null;
      setUnsavedDialogOpen(false);
    };

    document.addEventListener("click", interceptLinkNavigation, true);
    document.addEventListener("keydown", closeDialogOnEscape);
    window.addEventListener("inkland:navigate", interceptProgrammaticNavigation);
    window.addEventListener("popstate", interceptHistoryNavigation, true);
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      document.removeEventListener("click", interceptLinkNavigation, true);
      document.removeEventListener("keydown", closeDialogOnEscape);
      window.removeEventListener("inkland:navigate", interceptProgrammaticNavigation);
      window.removeEventListener("popstate", interceptHistoryNavigation, true);
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (unsavedDialogOpen) stayButtonRef.current?.focus();
    else navigationTriggerRef.current?.focus();
  }, [unsavedDialogOpen]);

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
      setErrorKind("error");
      setError("请选择图片文件");
      return;
    }
    setUploading(true);
    setErrorKind("");
    setError("");

    let compressedFile: File;
    try {
      compressedFile = (await compressImage(file, { maxDimension: 512, maxBytes: 512 * 1024, quality: 0.88 })).file;
    } catch (compressionError) {
      setErrorKind("error");
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
      setErrorKind("error");
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

  const handleSave = async (): Promise<boolean> => {
    let nextBaseline = baseline;
    const trimmedNickname = nickname.trim();
    const trimmedEmail = emailValue.trim();
    if (!trimmedNickname) {
      setSuccess("");
      setErrorKind("warning");
      setError("昵称不能为空");
      return false;
    }
    if (Array.from(trimmedNickname).length > MAX_NICKNAME_LENGTH) {
      setSuccess("");
      setErrorKind("warning");
      setError(`昵称最多 ${MAX_NICKNAME_LENGTH} 个字`);
      return false;
    }
    const emailCandidate = document.createElement("input");
    emailCandidate.type = "email";
    emailCandidate.value = trimmedEmail;
    if (!trimmedEmail || !emailCandidate.validity.valid) {
      setSuccess("");
      setErrorKind("warning");
      setError("请输入有效的邮箱地址");
      emailInputRef.current?.focus();
      return false;
    }

    setSaving(true);
    setError("");
    setErrorKind("");
    setSuccess("");

    try {
      const blocked = await assertCanProfileEdit();
      if (blocked) {
        setErrorKind("error");
        setError(blocked);
        return false;
      }

      const normalizedBio = bio.trim() || null;
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          nickname: trimmedNickname,
          bio: normalizedBio,
          avatar_url: avatarUrl || null,
        })
        .eq("id", user.id);

      if (updateErr) {
        setErrorKind("error");
        setError(`保存失败: ${updateErr.message}`);
        return false;
      }

      const submitted: string[] = [];
      if (trimmedNickname !== nextBaseline.nickname) submitted.push("nickname");
      if (normalizedBio !== nextBaseline.bio) submitted.push("bio");
      if ((avatarUrl || null) !== nextBaseline.avatar_url) submitted.push("avatar");
      nextBaseline = {
        ...nextBaseline,
        nickname: trimmedNickname,
        bio: normalizedBio,
        avatar_url: avatarUrl || null,
      };
      setBaseline(nextBaseline);
      await refreshProfile();

      const currentAccountPreferences = readAccountPreferences(user);
      const { error: personalError } = await saveAccountPreferences(supabase, {
        gender,
        birth_date: birthDate || null,
        copyright_license: currentAccountPreferences.copyright_license,
      });
      if (personalError) {
        setErrorKind("error");
        setError("性别或出生日期暂未保存成功，请稍后重试。");
        return false;
      }
      nextBaseline = { ...nextBaseline, gender, birth_date: birthDate || null };
      setBaseline(nextBaseline);

      if (revisionStatus === "requested" && submitted.length > 0) {
        const { error: revisionError } = await supabase.rpc("profile_revision_submit", { p_fields: submitted });
        if (revisionError) {
          setErrorKind("error");
          setError("资料整改状态更新失败，请稍后重试。");
          return false;
        }
        setRevisionStatus("submitted");
      }

      const emailChanged = normalizeEmail(trimmedEmail) !== nextBaseline.email;
      if (emailChanged) {
        const { error: emailError } = await supabase.auth.updateUser({ email: trimmedEmail });
        if (emailError) {
          setErrorKind("error");
          setError(`邮箱修改失败：${emailError.message}`);
          return false;
        }
        nextBaseline = { ...nextBaseline, email: normalizeEmail(trimmedEmail) };
        setBaseline(nextBaseline);
        setEmailValue(trimmedEmail);
        setSuccess("验证邮件已发送至新邮箱，请完成验证以更新绑定邮箱。");
      } else {
        setSuccess("保存成功");
      }
      setTimeout(() => setSuccess(""), 4000);
      return true;
    } catch {
      setErrorKind("error");
      setError("保存失败，请检查网络后重试。");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setNickname(baseline.nickname);
    setBio(baseline.bio || "");
    setAvatarUrl(baseline.avatar_url || "");
    setGender(baseline.gender);
    setBirthDate(baseline.birth_date || "");
    setEmailValue(baseline.email);
    setError("");
    setErrorKind("");
    setSuccess("");
  };

  const navigateToPendingDestination = () => {
    const pending = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    setUnsavedDialogOpen(false);
    navigationTriggerRef.current = null;
    if (!pending) return;
    if (pending.replace) router.replace(pending.href);
    else router.push(pending.href);
  };

  const discardAndLeave = () => {
    handleCancel();
    navigateToPendingDestination();
  };

  const saveAndLeave = async () => {
    const saved = await handleSave();
    if (saved) navigateToPendingDestination();
  };

  if (profileLoading || hydratedUserId !== user.id) {
    return (
      <div className="profile-edit-loading" role="status" aria-busy="true">
        <span className="profile-edit-loading-mark" aria-hidden="true" />
        <span>正在加载账号资料…</span>
      </div>
    );
  }

  return (
    <form
      className="profile-edit-form"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSave();
      }}
      noValidate
    >
              {/* Avatar */}
              <div className="avatar-section">
                <div className="avatar-upload">
                  <div className="avatar-preview">
                    {avatarUrl ? (
                      <Image src={avatarUrl} alt="当前头像" fill sizes="80px" unoptimized />
                    ) : (
                      <DefaultAvatar name={nickname || user?.email?.[0] || "?"} />
                    )}
                  </div>
                  <div className="avatar-overlay" aria-hidden="true">
                    <SiteIcon name="fa-camera" variant="solid" />
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

              {/* Nickname */}
              <div className="field-group">
                <label htmlFor="profile-nickname" className="field-label">昵称（最多16字）</label>
                <input
                  id="profile-nickname"
                  name="nickname"
                  type="text"
                  className="field-input"
                  placeholder="输入你的昵称…"
                  maxLength={32}
                  autoComplete="nickname"
                  aria-describedby="profile-nickname-count"
                  value={nickname}
                  onCompositionStart={() => { composingNicknameRef.current = true; }}
                  onCompositionEnd={(event) => {
                    composingNicknameRef.current = false;
                    setNickname(Array.from(event.currentTarget.value).slice(0, MAX_NICKNAME_LENGTH).join(""));
                  }}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setNickname(composingNicknameRef.current
                      ? nextValue
                      : Array.from(nextValue).slice(0, MAX_NICKNAME_LENGTH).join(""));
                  }}
                />
                <div id="profile-nickname-count" className={`char-count${nicknameLength > MAX_NICKNAME_LENGTH ? " over" : ""}`}>
                  {nicknameLength} / {MAX_NICKNAME_LENGTH}
                </div>
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
              </div>

              {/* Personal details */}
              <div className="profile-personal-fields">
                <div className="field-group">
                  <span className="field-label">性别</span>
                  <div className="profile-choice-group" role="radiogroup" aria-label="选择性别">
                    {genderOptions.map((option) => (
                      <Radio
                        name="profile-gender"
                        value={option.value}
                        key={option.value}
                        className={`profile-choice-button${gender === option.value ? " selected" : ""}`}
                        checked={gender === option.value}
                        onChange={() => setGender(option.value)}
                      >
                        {option.label}
                      </Radio>
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
                <label htmlFor="profile-email" className="field-label">邮箱</label>
                <input
                  ref={emailInputRef}
                  id="profile-email"
                  name="email"
                  type="email"
                  className="field-input"
                  placeholder="name@example.com"
                  maxLength={254}
                  autoComplete="email"
                  required
                  value={emailValue}
                  onChange={(event) => setEmailValue(event.target.value)}
                />
                <p className="profile-email-hint">修改邮箱后，需要通过验证邮件完成更换。</p>
              </div>

              {/* Actions */}
              <div className="form-actions">
                {error && (
                  <SettingsStatus kind={errorKind === "warning" ? "warning" : "error"} message={error} />
                )}
                {success && (
                  <SettingsStatus kind="success" message={success} />
                )}
                <div className="form-action-buttons">
                  <button type="button" className="btn-cancel" onClick={handleCancel}>
                    取消
                  </button>
                  <button type="submit" className="btn-save" disabled={saving}>
                    {saving ? (
                      <><SiteIcon name="fa-spinner" variant="solid" style={{ animation: "spin 1s linear infinite" }} />保存中...</>
                    ) : (
                      <>保存</>
                    )}
                  </button>
                </div>
              </div>
              {unsavedDialogOpen && (
                <div className="profile-unsaved-backdrop">
                  <section
                    className="profile-unsaved-dialog"
                    role="alertdialog"
                    aria-modal="true"
                    aria-labelledby="profile-unsaved-title"
                    aria-describedby="profile-unsaved-description"
                  >
                    <h2 id="profile-unsaved-title">资料还没有保存</h2>
                    <p id="profile-unsaved-description">离开前要保存你刚才修改的内容吗？</p>
                    <div className="profile-unsaved-actions">
                      <button type="button" className="profile-unsaved-discard" onClick={discardAndLeave} disabled={saving || uploading}>
                        不保存，离开
                      </button>
                      <button ref={stayButtonRef} type="button" className="profile-unsaved-stay" onClick={() => { pendingNavigationRef.current = null; setUnsavedDialogOpen(false); }}>
                        继续编辑
                      </button>
                      <button type="button" className="profile-unsaved-save" onClick={() => void saveAndLeave()} disabled={saving || uploading}>
                        {saving ? "保存中…" : "保存并离开"}
                      </button>
                    </div>
                  </section>
                </div>
              )}
    </form>
  );
}
