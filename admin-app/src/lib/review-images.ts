import type { SupabaseClient } from "@supabase/supabase-js";

const privateImageMarker = /private:\/\/private-post-images\/([^\s)]+)/g;

export function privateImageSourcePaths(content: string) {
  return [...new Set([...content.matchAll(privateImageMarker)].map((match) => match[1]))];
}

export async function findPublicApprovedImageUrl(storageClient: SupabaseClient, postId: string, sourcePath: string) {
  const filename = sourcePath.split("/").pop();
  if (!filename) return null;
  const folderPath = `approved/${postId}`;
  const { data: objects } = await storageClient.storage.from("post-images").list(folderPath);
  if (!Array.isArray(objects) || !objects.some((object) => object.name === filename)) return null;
  return storageClient.storage.from("post-images").getPublicUrl(`${folderPath}/${filename}`).data?.publicUrl || null;
}

export async function healBrokenPrivateImageMarkers(storageClient: SupabaseClient, content: string, postId: string) {
  const sourcePaths = privateImageSourcePaths(content);
  if (!sourcePaths.length) return content;
  let updated = content;
  for (const sourcePath of sourcePaths) {
    const { data } = await storageClient.storage.from("private-post-images").createSignedUrl(sourcePath, 60);
    if (data?.signedUrl) continue;
    const publicUrl = await findPublicApprovedImageUrl(storageClient, postId, sourcePath);
    if (publicUrl) updated = updated.split(`private://private-post-images/${sourcePath}`).join(publicUrl);
  }
  return updated;
}
