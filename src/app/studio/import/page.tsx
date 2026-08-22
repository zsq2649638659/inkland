import type { Metadata } from "next";
import ImportWorkspace from "./ImportWorkspace";

export const metadata: Metadata = {
  title: "批量导入作品 — Inkland",
  description: "批量导入作品，添加标签后发布、保存草稿或定时发布",
};

export default function StudioImportPage() {
  return <ImportWorkspace />;
}
