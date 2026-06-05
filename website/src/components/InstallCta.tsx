import { useEffect, useMemo, useState, type CSSProperties } from "react";

interface InstallCtaProps {
  command: string;
  defaultText?: string;
  copiedText?: string;
  revealOnHover?: boolean;
  className?: string;
}

export default function InstallCta({
  command,
  defaultText = "Install",
  copiedText = "Copied",
  revealOnHover = true,
  className = ""
}: InstallCtaProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const style = useMemo(() => {
    const compactWidth = Math.max(defaultText.length + 4, 12);
    const expandedWidth = Math.max(command.length + 4, compactWidth);
    return {
      ["--install-cta-compact" as string]: `${compactWidth}ch`,
      ["--install-cta-expanded" as string]: `${expandedWidth}ch`,
      fontFamily: "var(--terminal-font)",
      fontVariantLigatures: "none"
    } satisfies CSSProperties;
  }, [command, defaultText.length]);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const widthClasses = revealOnHover
    ? "w-[var(--install-cta-compact)] hover:w-[var(--install-cta-expanded)] focus-visible:w-[var(--install-cta-expanded)]"
    : "w-auto";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Copy install command: ${command}`}
      aria-live="polite"
      style={style}
      className={[
        "group relative inline-flex h-11 items-center justify-center overflow-hidden rounded-full border border-white/12 bg-white/95 px-4 text-sm font-medium text-bg shadow-[0_12px_30px_rgba(0,0,0,0.24)] transition-[width,transform,box-shadow,background-color] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-white focus-visible:bg-white focus-visible:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_24px_rgba(219,181,90,0.2)] motion-reduce:transition-none",
        widthClasses,
        className
      ].join(" ").trim()}
    >
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent-red/10 via-white/0 to-accent-orange/12 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
      <span className="pointer-events-none absolute inset-[1px] rounded-full bg-gradient-to-r from-white/10 via-transparent to-white/15 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
      <span className="relative flex min-w-0 items-center justify-center text-center">
        {revealOnHover ? (
          <>
            <span
              className={[
                "whitespace-nowrap transition-all duration-300 motion-reduce:transition-none",
                copied ? "translate-y-1 opacity-0" : "opacity-100 group-hover:-translate-y-4 group-hover:opacity-0 group-focus-visible:-translate-y-4 group-focus-visible:opacity-0"
              ].join(" ")}
            >
              {defaultText}
            </span>
            <span
              className={[
                "absolute inset-0 flex items-center justify-center whitespace-nowrap transition-all duration-300 motion-reduce:transition-none",
                copied ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
              ].join(" ")}
            >
              {copied ? copiedText : command}
            </span>
          </>
        ) : (
          <span className="whitespace-nowrap">{copied ? copiedText : defaultText}</span>
        )}
      </span>
    </button>
  );
}
