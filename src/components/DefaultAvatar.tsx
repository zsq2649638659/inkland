"use client";

interface DefaultAvatarProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function DefaultAvatar({ name, className, style }: DefaultAvatarProps) {
  const char = (name || "?")[0].toUpperCase();
  return (
    <span
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #FDDCD8, #F26B5B)",
        color: "#fff",
        fontWeight: 700,
        ...style,
      }}
      aria-hidden="true"
    >
      {char}
    </span>
  );
}