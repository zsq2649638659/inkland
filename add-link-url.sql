-- 为 notifications 表添加 link_url 字段，支持系统通知超链接
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url text;