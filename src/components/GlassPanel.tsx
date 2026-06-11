import type { HTMLAttributes, ReactNode } from "react";

interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
  readonly padding?: number;
}

/** A frosted-glass surface used across the app for cards and panels. */
export function GlassPanel({
  children,
  padding = 20,
  className,
  style,
  ...rest
}: GlassPanelProps) {
  return (
    <div
      className={["glass", className ?? ""].filter(Boolean).join(" ")}
      style={{ padding, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
