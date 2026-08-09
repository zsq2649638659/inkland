import { marked } from "marked";

const ALLOWED_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DEL", "EM", "H1", "H2", "H3",
  "H4", "HR", "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRONG", "UL",
]);

const ALLOWED_ATTRIBUTES = new Set(["alt", "class", "href", "loading", "rel", "src", "target", "title"]);

function isSafeUrl(value: string, kind: "href" | "src") {
  try {
    const url = new URL(value, window.location.origin);
    if (kind === "src") return url.protocol === "https:";
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export function isSafeExternalImageUrl(value: string) {
  return typeof window !== "undefined" && isSafeUrl(value, "src");
}

function sanitizeHtml(html: string) {
  if (typeof window === "undefined") return html;

  const document = new DOMParser().parseFromString(html, "text/html");
  const elements = Array.from(document.body.querySelectorAll("*"));

  for (const element of elements) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (!ALLOWED_ATTRIBUTES.has(name) || name.startsWith("on") || name === "style") {
        element.removeAttribute(attribute.name);
      }
    }

    if (element instanceof HTMLAnchorElement) {
      const href = element.getAttribute("href");
      if (!href || !isSafeUrl(href, "href")) element.removeAttribute("href");
      if (element.getAttribute("target") === "_blank") element.setAttribute("rel", "noopener noreferrer");
    }

    if (element instanceof HTMLImageElement) {
      const src = element.getAttribute("src");
      if (!src || !isSafeUrl(src, "src")) element.remove();
      else {
        element.setAttribute("loading", "lazy");
        element.setAttribute("referrerpolicy", "no-referrer");
      }
    }
  }

  return document.body.innerHTML;
}

/** Render user-authored Markdown and remove executable HTML/URL payloads. */
export function renderSafeMarkdown(markdown: string) {
  return sanitizeHtml(marked.parse(markdown || "", { breaks: true, gfm: true }) as string);
}

export function renderSafeInlineMarkdown(markdown: string) {
  return sanitizeHtml(marked.parseInline(markdown || "", { breaks: true, gfm: true }) as string);
}
