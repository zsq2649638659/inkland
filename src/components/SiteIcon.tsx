import {
  InklandIcon,
  type InklandIconName,
  type InklandIconProps,
  type InklandIconVariant,
} from "@/components/inkland/iconRegistry";

type SiteIconProps = Omit<InklandIconProps, "name" | "variant" | "size"> & {
  name: InklandIconName;
  variant?: InklandIconVariant;
  size?: number | string;
};

/** Main-site boundary: every product icon must resolve through the shared registry. */
export default function SiteIcon({ name, variant = "default", size = "1em", ...props }: SiteIconProps) {
  return <InklandIcon name={name} variant={variant} size={size} {...props} />;
}
