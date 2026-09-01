export interface ImportChapter {
  title: string;
  content: string;
  number?: number;
}

const CHAPTER_HEADING = /^(?:第\s*[零〇一二三四五六七八九十百千万两\d]+\s*[章节卷回部篇集]|chapter\s+[零〇一二三四五六七八九十百千万两\d]+|序章|楔子|引子|前言|后记|终章|尾声|番外(?:[零〇一二三四五六七八九十百千万两\d]+)?)(?:[：:\s　\-—·].*)?$/i;

function normalizeChapterContent(content: string) {
  return content.replace(/\r\n?/g, "\n").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function cleanImportHeading(line: string) {
  return line.trim().replace(/^#{1,6}\s*/, "").trim();
}

function chineseNumberValue(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!/[十百千万]/.test(value)) {
    const joined = Array.from(value).map((character) => digits[character]).join("");
    return /^\d+$/.test(joined) ? Number(joined) : undefined;
  }
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const character of value) {
    if (character in digits) {
      digit = digits[character];
    } else if (character === "万") {
      total += (section + digit) * 10_000;
      section = 0;
      digit = 0;
    } else if (character in units) {
      section += (digit || 1) * units[character];
      digit = 0;
    } else {
      return undefined;
    }
  }
  return total + section + digit || undefined;
}

function chapterNumberFromTitle(title: string) {
  const matched = title.match(/^第\s*([零〇一二三四五六七八九十百千万两\d]+)\s*[章节卷回部篇集]/i)
    || title.match(/^chapter\s+([零〇一二三四五六七八九十百千万两\d]+)/i);
  return matched ? chineseNumberValue(matched[1]) : undefined;
}

export function extractImportPreamble(content: string) {
  const lines = normalizeChapterContent(content).split("\n");
  const headings = lines
    .map((line, index) => ({ index, title: cleanImportHeading(line) }))
    .filter(({ title }) => title.length > 0 && title.length <= 80 && CHAPTER_HEADING.test(title));
  if (headings.length < 2) return "";
  return normalizeChapterContent(lines.slice(0, headings[0].index).join("\n"));
}

export function splitImportChapters(content: string): ImportChapter[] {
  const lines = normalizeChapterContent(content).split("\n");
  const headings = lines
    .map((line, index) => ({ index, title: cleanImportHeading(line) }))
    .filter(({ title }) => title.length > 0 && title.length <= 80 && CHAPTER_HEADING.test(title));
  if (headings.length < 2) return [];

  return headings.map((heading, index) => {
    const nextIndex = headings[index + 1]?.index ?? lines.length;
    const beforeFirst = index === 0 ? lines.slice(0, heading.index).join("\n").trim() : "";
    const body = lines.slice(heading.index + 1, nextIndex).join("\n").trim();
    return {
      title: heading.title,
      content: normalizeChapterContent([beforeFirst, body].filter(Boolean).join("\n\n")),
      number: chapterNumberFromTitle(heading.title),
    };
  }).filter((chapter) => chapter.content);
}
