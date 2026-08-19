"use client";

import { useState, useRef, useCallback } from "react";

/**
 * Markdown 编辑器 Hook
 * 封装工具栏插入逻辑，修复滚动位置丢失问题
 */
export function useMarkdownEditor(initialValue = "") {
  const [content, setContent] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef(0);

  const getTA = () => textareaRef.current;

  /** 保存当前滚动位置 */
  const saveScroll = useCallback(() => {
    const ta = getTA();
    if (ta) scrollRef.current = ta.scrollTop;
  }, []);

  /** 恢复滚动位置 */
  const restoreScroll = useCallback(() => {
    const ta = getTA();
    if (ta) {
      requestAnimationFrame(() => {
        ta.scrollTop = scrollRef.current;
      });
    }
  }, []);

  /** 设置内容并保持滚动位置 */
  const setContentSafe = useCallback((val: string) => {
    saveScroll();
    setContent(val);
    // 恢复滚动放在 requestAnimationFrame 中，等 React 重渲染后再执行
    requestAnimationFrame(() => {
      const ta = getTA();
      if (ta) {
        ta.scrollTop = scrollRef.current;
        // 二次确保（某些浏览器需要）
        requestAnimationFrame(() => {
          ta.scrollTop = scrollRef.current;
        });
      }
    });
  }, [saveScroll]);

  /** 在光标选区前后插入文本，修复末尾换行符导致标记掉到下一行 */
  const insertAround = useCallback((before: string, after: string) => {
    const ta = getTA();
    if (!ta) return;
    saveScroll();
    let s = ta.selectionStart;
    let e = ta.selectionEnd;
    let sel = ta.value.substring(s, e);

    // 去除选区末尾的换行符，防止后半部分标记掉到下一行
    const trailing = sel.match(/[\n\r]*$/)?.[0] || "";
    if (trailing) {
      sel = sel.replace(/[\n\r]*$/, "");
      e -= trailing.length;
    }

    const v = ta.value.substring(0, s) + before + sel + after + ta.value.substring(e);
    setContent(v);
    requestAnimationFrame(() => {
      ta.focus();
      ta.scrollTop = scrollRef.current;
      if (sel) {
        ta.setSelectionRange(s + before.length, s + before.length + sel.length);
      } else {
        ta.setSelectionRange(s + before.length, s + before.length);
      }
    });
  }, [saveScroll]);

  /** 在当前行首插入前缀 */
  const insertAtLineStart = useCallback((prefix: string) => {
    const ta = getTA();
    if (!ta) return;
    saveScroll();
    const pos = ta.selectionStart;
    const lineStart = ta.value.substring(0, pos).lastIndexOf("\n") + 1;
    const v = ta.value.substring(0, lineStart) + prefix + ta.value.substring(lineStart);
    setContent(v);
    requestAnimationFrame(() => {
      ta.focus();
      ta.scrollTop = scrollRef.current;
      ta.setSelectionRange(lineStart + prefix.length, lineStart + prefix.length);
    });
  }, [saveScroll]);

  /** 在光标处插入文本 */
  const insertAtCursor = useCallback((text: string) => {
    const ta = getTA();
    if (!ta) return;
    saveScroll();
    const pos = ta.selectionStart;
    const v = ta.value.substring(0, pos) + text + ta.value.substring(pos);
    setContent(v);
    requestAnimationFrame(() => {
      ta.focus();
      ta.scrollTop = scrollRef.current;
      ta.setSelectionRange(pos + text.length, pos + text.length);
    });
  }, [saveScroll]);

  // ========== 工具栏操作 ==========

  const bold = () => insertAround("**", "**");
  const italic = () => insertAround("*", "*");
  const underline = () => insertAround("<u>", "</u>");
  const strikethrough = () => insertAround("~~", "~~");

  // 分割线：确保前后有空行
  const hr = () => {
    const ta = getTA();
    if (!ta) return;
    saveScroll();
    const pos = ta.selectionStart;
    const before = ta.value.substring(0, pos);
    // 确保分割线前有空行
    const prefix = before.endsWith("\n\n") || before === "" ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const v = before + prefix + "---\n" + ta.value.substring(pos);
    setContent(v);
    requestAnimationFrame(() => {
      ta.focus();
      ta.scrollTop = scrollRef.current;
      ta.setSelectionRange(pos + prefix.length + 4, pos + prefix.length + 4);
    });
  };

  return {
    content,
    setContent: setContentSafe,
    textareaRef,
    // 工具栏操作
    bold,
    italic,
    underline,
    strikethrough,
    hr,
    insertAtCursor,
    insertAtLineStart,
    insertAround,
    // 原始 setContent（用于 onChange）
    setContentRaw: setContent,
  };
}