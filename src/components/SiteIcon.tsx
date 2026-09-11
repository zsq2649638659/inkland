import {
  InklandIcon,
  type InklandIconName,
  type InklandIconProps,
  type InklandIconVariant,
} from "@/components/inkland/iconRegistry";

type SiteIconProps = Omit<InklandIconProps, "name" | "variant" | "size"> & {
  name: InklandIconName;
  variant?: InklandIconVariant;
  hoverVariant?: InklandIconVariant;
  size?: number | string;
};

/** Main-site boundary: every product icon must resolve through the shared registry. */
export default function SiteIcon({ name, variant = "default", hoverVariant, size = "1em", className, style, ...props }: SiteIconProps) {
  if (!hoverVariant || hoverVariant === variant) {
    return <InklandIcon name={name} variant={variant} size={size} className={className} style={style} {...props} />;
  }

  return (
    <span className={`site-icon-hover${className ? ` ${className}` : ""}`} style={style} aria-hidden="true">
      <InklandIcon name={name} variant={variant} size={size} className="site-icon-hover__default" {...props} />
      <InklandIcon name={name} variant={hoverVariant} size={size} className="site-icon-hover__active" {...props} />
    </span>
  );
}
