"use client";

import { useState, useRef, useEffect } from "react";

// 常用 emoji 表情分组
const EMOJI_GROUPS: { name: string; icon: string; emojis: string[] }[] = [
  {
    name: "表情",
    icon: "😀",
    emojis: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐"],
  },
  {
    name: "手势",
    icon: "👍",
    emojis: ["👍", "👎", "👏", "🙌", "🤝", "🙏", "✌️", "🤞", "🤟", "🤘", "🤙", "👌", "🤌", "🤏", "✋", "👋", "🤚", "🖐️", "🖖", "👆", "👇", "👉", "👈"],
  },
  {
    name: "爱心",
    icon: "❤️",
    emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "💕", "💖", "💗", "💓", "💞", "💝", "💘", "💌", "💟", "❣️"],
  },
  {
    name: "符号",
    icon: "✨",
    emojis: ["✨", "🌟", "⭐", "💫", "🔥", "💥", "💯", "💢", "💦", "💧", "💤", "💨", "🕳️", "🎉", "🎊", "🎀", "🎈", "💣", "💎", "🔮", "💡", "💭", "💬", "🗯️", "💮", "💐", "🌸", "💮", "🏵️", "🌹", "🌺", "🌻", "🌼", "🌷"],
  },
  {
    name: "哭/汗",
    icon: "😭",
    emojis: ["😭", "😢", "😥", "😰", "😨", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥺", "😤", "😡", "😠", "🤬", "💀", "☠️", "💩", "🤡", "👻", "👽", "🤖", "😈", "👿", "👹", "👺"],
  },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  darkMode?: boolean;
}

export default function EmojiPicker({ onSelect, darkMode = false }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState(0);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={pickerRef} className="relative inline-block">
      <button
        type="button"
        className="text-sm bg-transparent border-none cursor-pointer p-1.5 rounded hover:opacity-70 transition-opacity"
        style={{ color: darkMode ? "#8a8078" : "#8c7b6b" }}
        onClick={() => setOpen(!open)}
        title="表情"
      >
        <i className="fa-regular fa-face-smile text-base" />
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 rounded-xl border shadow-xl z-[200] overflow-hidden"
          style={{
            width: "320px",
            background: darkMode ? "#2a2a2a" : "#fff",
            borderColor: darkMode ? "#444" : "#e8e0d5",
          }}
        >
          {/* 分组标签 */}
          <div
            className="flex border-b"
            style={{ borderColor: darkMode ? "#444" : "#e8e0d5" }}
          >
            {EMOJI_GROUPS.map((group, i) => (
              <button
                key={group.name}
                type="button"
                className="flex-1 text-center py-2 text-sm bg-transparent border-none cursor-pointer transition-colors"
                style={{
                  background: activeGroup === i
                    ? (darkMode ? "#333" : "#f5f0ea")
                    : "transparent",
                  color: darkMode ? "#b8b0a0" : "#8c7b6b",
                }}
                onClick={() => setActiveGroup(i)}
                title={group.name}
              >
                {group.icon}
              </button>
            ))}
          </div>

          {/* Emoji 网格 */}
          <div
            className="grid grid-cols-8 gap-0.5 p-2 max-h-[200px] overflow-y-auto"
            style={{ fontSize: "20px" }}
          >
            {EMOJI_GROUPS[activeGroup].emojis.map((emoji, i) => (
              <button
                key={i}
                type="button"
                className="w-9 h-9 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer hover:scale-125 transition-transform"
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}