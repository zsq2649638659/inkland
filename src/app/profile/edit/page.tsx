"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { useAuth } from "@/components/AuthProvider";

export default function EditProfilePage() {
  const supabase = createClient();
  const router = useRouter();
  const { user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [nickname, setNickname] = useState(profile?.nickname || "");
  const [bio, setBio] = useState(profile?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!user) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">请先登录</p>
          <Link href="/login" className="btn-accent no-underline">去登录</Link>
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
    if (file.size > 2 * 1024 * 1024) {
      setError("图片大小不能超过 2MB");
      return;
    }

    setUploading(true);
    setError("");

    const fileExt = file.name.split(".").pop() || "png";
    const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;

    const { error: uploadErr } = await supabase.storage
      .from("post-images")
      .upload(fileName, file, { upsert: true });

    if (uploadErr) {
      if (uploadErr.message?.includes("Bucket") || uploadErr.message?.includes("not found")) {
        setError("上传失败：存储桶 'post-images' 未创建。请在 Supabase Dashboard → Storage 中创建名为 'post-images' 的公开存储桶。");
      } else {
        setError(`上传失败: ${uploadErr.message}`);
      }
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
      setSuccess("保存成功！");
      // 刷新页面以更新 AuthProvider 中的 profile
      setTimeout(() => router.push("/profile"), 800);
    }
    setSaving(false);
  };

  const avatarChar = nickname?.[0] || user.email?.[0] || "?";

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-50 bg-white border-b border-rule">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/profile" className="btn-ghost no-underline">
            <i className="fa-solid fa-arrow-left mr-1" />返回
          </Link>
          <span className="text-sm font-medium text-warm">编辑资料</span>
          <button className="submit-btn" onClick={handleSave} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="space-y-6">
          {/* 头像 */}
          <div className="flex flex-col items-center gap-4">
            <img
              src={avatarUrl || `https://placehold.co/100x100/f5e6d3/b8752e?text=${encodeURIComponent(avatarChar)}`}
              className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md"
              alt="avatar"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <button
              className="text-sm text-accent bg-transparent border border-accent rounded-full px-4 py-1.5 cursor-pointer hover:bg-accent-light transition-colors"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <><i className="fa-solid fa-spinner animate-spin mr-1" />上传中...</>
              ) : (
                <><i className="fa-solid fa-camera mr-1" />更换头像</>
              )}
            </button>
            <p className="text-xs text-muted">支持 JPG、PNG，最大 2MB</p>
          </div>

          {/* 昵称 */}
          <div>
            <label className="text-sm text-warm font-medium block mb-1.5">昵称</label>
            <input
              type="text"
              className="input-field"
              placeholder="输入昵称"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
            />
            <p className="text-xs text-muted mt-1">{nickname.length}/20</p>
          </div>

          {/* 个人简介 */}
          <div>
            <label className="text-sm text-warm font-medium block mb-1.5">个人简介</label>
            <textarea
              className="input-field resize-none"
              rows={4}
              placeholder="介绍一下自己..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={200}
            />
            <p className="text-xs text-muted mt-1">{bio.length}/200</p>
          </div>

          {/* 错误/成功提示 */}
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg p-3">
              <i className="fa-solid fa-circle-exclamation mr-1" />{error}
            </p>
          )}
          {success && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
              <i className="fa-solid fa-circle-check mr-1" />{success}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}