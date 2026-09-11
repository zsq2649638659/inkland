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
        display: "flex",
        width: "100%",
        height: "100%",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "50%",
        background: "var(--color-primary, #f26b5b)",
        color: "var(--color-on-primary, #fff)",
        fontWeight: 700,
        ...style,
      }}
      aria-hidden="true"
    >
      {char}
    </span>
  );
}
