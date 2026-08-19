"use client";

interface DefaultAvatarProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function DefaultAvatar({ name, className, style }: DefaultAvatarProps) {
  const char = Array.from(name.trim() || "?")[0].toUpperCase();
  return (
    <span
      className={className}
      style={{
        ...style,
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: "var(--color-bg-secondary, #e8e4e0)",
        color: "var(--color-gray-900)",
        fontWeight: 700,
      }}
      aria-hidden="true"
    >
      {char}
    </span>
  );
}
