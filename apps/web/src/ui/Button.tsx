import Link from "next/link";

type Variant = "primary" | "secondary" | "on-board" | "hue" | "on-mat" | "alarm" | "quiet";
type Size = "s" | "m" | "l";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-leaf border-ink",
  secondary: "bg-leaf text-ink border-control-border font-semibold",
  "on-board": "bg-leaf text-ink border-leaf",
  hue: "bg-board text-on-board border-board",
  "on-mat": "bg-transparent text-on-cover border-[#5a5e68] font-semibold",
  alarm: "bg-leaf text-alarm border-alarm",
  quiet: "bg-transparent text-ink border-transparent font-semibold hover:underline",
};
const SIZE: Record<Size, string> = {
  s: "h-[34px] px-3 text-button-s",
  m: "h-[42px] px-[18px] text-button",
  l: "h-12 px-5 text-button",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "m") {
  return `state-layer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border ${VARIANT[variant]} ${SIZE[size]} aria-disabled:cursor-not-allowed aria-disabled:opacity-40 disabled:cursor-not-allowed disabled:opacity-40`;
}

/** Every command (02 §7.1). One primary per view; `<a>` for navigation, `<button>` for actions. */
export function Button({
  variant,
  size,
  href,
  className = "",
  ...rest
}: {
  variant?: Variant;
  size?: Size;
  href?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = `${buttonClass(variant, size)} ${className}`;
  if (href) return <Link href={href} className={cls}>{rest.children}</Link>;
  return <button type="button" className={cls} {...rest} />;
}
