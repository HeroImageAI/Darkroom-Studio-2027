import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
export function Button({
  primary = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      {...props}
      className={`${primary ? "button primary" : "button"} ${className}`}
    />
  );
}
export function Panel({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return <section className={`panel ${className}`}>{children}</section>;
}
export function Status({ ok, children }: PropsWithChildren<{ ok: boolean }>) {
  return (
    <span className={`status ${ok ? "ok" : ""}`}>
      <span aria-hidden="true">{ok ? "●" : "○"}</span> {children}
    </span>
  );
}
