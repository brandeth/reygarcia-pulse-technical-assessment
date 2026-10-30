import type { ComponentProps } from "react";

// One button for the whole app, so every screen shares the same colors,
// sizes and hover / press / disabled / focus behavior.

type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

// Icon-only buttons have no visible text, so they must carry an aria-label.
type ButtonProps = ComponentProps<"button"> & { variant?: Variant } & (
    | { size?: Exclude<Size, "icon"> }
    | { size: "icon"; "aria-label": string }
  );

const base =
  "inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition duration-150 ease-out-soft active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover hover:shadow-glow",
  secondary:
    "border border-line bg-glass text-fg backdrop-blur-glass hover:border-white/20 hover:bg-surface",
  danger: "bg-danger text-white hover:bg-danger-hover",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-8 text-base",
  icon: "size-10",
};

export default function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      // Native buttons default to type="submit"; only the chat Send button
      // should submit a form, so it has to opt in.
      type={type}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
