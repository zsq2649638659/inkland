export type ImportDuplicateKind = "exact" | "similar" | "update";
export type ImportDuplicateAction = "review" | "skip" | "keep" | "update";

export interface ExistingImportPost {
  id: string;
  title: string | null;
  content: string | null;
  post_type: string | null;
  series_name: string | null;
  chapter_number: number | null;
  status: string | null;
}

export interface ImportDuplicateMatch {
  kind: ImportDuplicateKind;
  existingPostId: string;
  existingTitle: string;
  similarity: number;
  message: string;
}

const SIMILARITY_THRESHOLD = 0.84;
const MIN_SIMILARITY_LENGTH = 80;

export function comparableImportText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function comparableSeriesName(value: string | null | undefined) {
  return (value || "").normalize("NFKC").replace(/\s+/g, "").trim();
}

function makeShingles(value: string, size = 3) {
  const characters = Array.from(value);
  const shingles = new Set<string>();
  for (let index = 0; index <= characters.length - size; index += 1) {
    shingles.add(characters.slice(index, index + size).join(""));
  }
  return shingles;
}

function textSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length < MIN_SIMILARITY_LENGTH || right.length < MIN_SIMILARITY_LENGTH) return 0;
  const lengthRatio = Math.min(left.length, right.length) / Math.max(left.length, right.length);
  if (lengthRatio < 0.68) return 0;

  const leftShingles = makeShingles(left);
  const rightShingles = makeShingles(right);
  if (leftShingles.size === 0 || rightShingles.size === 0) return 0;
  let intersection = 0;
  for (const shingle of leftShingles) {
    if (rightShingles.has(shingle)) intersection += 1;
  }
  return (2 * intersection) / (leftShingles.size + rightShingles.size);
}

function formatSimilarity(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function findImportDuplicate(
  work: { title: string; content: string; groupMode?: "single" | "collection" | "serial"; groupName?: string; chapterNumber?: number },
  existingPosts: ExistingImportPost[],
): ImportDuplicateMatch | null {
  const content = comparableImportText(work.content);
  if (!content) return null;

  const exact = existingPosts.find((post) => comparableImportText(post.content) === content);
  if (exact) {
    return {
      kind: "exact",
      existingPostId: exact.id,
      existingTitle: exact.title || "未命名作品",
      similarity: 1,
      message: `与已有作品《${exact.title || "未命名作品"}》正文完全相同，建议跳过。`,
    };
  }

  if (work.groupMode === "serial" && work.groupName?.trim() && work.chapterNumber != null) {
    const sameChapter = existingPosts.find((post) => (
      post.post_type === "serial"
      && comparableSeriesName(post.series_name) === comparableSeriesName(work.groupName)
      && post.chapter_number === work.chapterNumber
    ));
    if (sameChapter) {
      return {
        kind: "update",
        existingPostId: sameChapter.id,
        existingTitle: sameChapter.title || `第${work.chapterNumber}章`,
        similarity: textSimilarity(content, comparableImportText(sameChapter.content)),
        message: `检测到《${work.groupName}》第 ${work.chapterNumber} 章已有版本，正文不同，可更新已有版本或作为新章节。`,
      };
    }
  }

  let bestMatch: { post: ExistingImportPost; similarity: number } | null = null;
  for (const post of existingPosts) {
    const similarity = textSimilarity(content, comparableImportText(post.content));
    if (similarity >= SIMILARITY_THRESHOLD && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { post, similarity };
    }
  }
  if (!bestMatch) return null;

  return {
    kind: "similar",
    existingPostId: bestMatch.post.id,
    existingTitle: bestMatch.post.title || "未命名作品",
    similarity: bestMatch.similarity,
    message: `与已有作品《${bestMatch.post.title || "未命名作品"}》正文相似度约 ${formatSimilarity(bestMatch.similarity)}，请确认是否仍要导入。`,
  };
}
