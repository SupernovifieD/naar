import { Download } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

interface InstallCtaProps {
  command: string;
  defaultText?: string;
  copiedText?: string;
  revealOnHover?: boolean;
  alignExpand?: "left" | "right";
  variant?: "light" | "code";
  icon?: "download";
  className?: string;
}

export default function InstallCta({
  command,
  defaultText = "Install",
  copiedText = "Copied",
  revealOnHover = true,
  alignExpand = "left",
  variant = "light",
  icon,
  className = ""
}: InstallCtaProps) {
  const [copied, setCopied] = useState(false);
  const defaultTextIsCommand = looksLikeCommand(defaultText);
  const commandIsCommand = looksLikeCommand(command);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const style = useMemo(() => {
    const iconWidth = icon ? 3 : 0;
    const compactWidth = Math.max(defaultText.length + (defaultTextIsCommand ? 6 : 4) + iconWidth, variant === "code" ? 18 : 12);
    const expandedWidth = Math.max(command.length + (commandIsCommand ? 6 : 4) + iconWidth, compactWidth);
    return {
      ["--install-cta-compact" as string]: `${compactWidth}ch`,
      ["--install-cta-expanded" as string]: `${expandedWidth}ch`,
      fontFamily: "var(--terminal-font)",
      fontVariantLigatures: "none"
    } satisfies CSSProperties;
  }, [command, commandIsCommand, defaultText.length, defaultTextIsCommand, icon, variant]);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const baseButtonClasses = variant === "code"
    ? "border-white/10 bg-white/5 text-cyan-200 shadow-[0_10px_22px_rgba(0,0,0,0.18)] hover:border-white/18 hover:bg-white/10 focus-visible:bg-white/10 focus-visible:text-white"
    : "border-white/12 bg-white/95 text-bg shadow-[0_12px_30px_rgba(0,0,0,0.24)] hover:bg-white focus-visible:bg-white focus-visible:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_24px_rgba(219,181,90,0.2)]";

  const sharedButtonClasses = [
    "group relative inline-flex h-11 items-center justify-center overflow-hidden rounded-full border px-4 text-sm font-medium transition-[width,transform,box-shadow,background-color] duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 motion-reduce:transition-none",
    baseButtonClasses
  ].join(" ");

  const commandChipClasses = variant === "code"
    ? "border-white/10 bg-black/25 text-cyan-100"
    : "border-black/10 bg-black/10 text-bg";

  const renderIcon = () => {
    if (icon !== "download") return null;
    return <Download size={15} strokeWidth={1.9} className="shrink-0" aria-hidden="true" />;
  };

  const renderLabel = (label: string, treatAsCommand: boolean) => {
    const content = treatAsCommand ? (
      <code
        className={[
          "inline-flex max-w-full items-center whitespace-nowrap rounded-lg border px-2.5 py-1 text-[0.92em] leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          commandChipClasses
        ].join(" ")}
      >
        {label}
      </code>
    ) : (
      <span className="whitespace-nowrap">{label}</span>
    );

    if (!icon) {
      return content;
    }

    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        {renderIcon()}
        {content}
      </span>
    );
  };

  const content = revealOnHover ? (
    <>
      <span
        className={[
          "whitespace-nowrap transition-all duration-300 motion-reduce:transition-none",
          copied ? "translate-y-1 opacity-0" : "opacity-100 group-hover:-translate-y-4 group-hover:opacity-0 group-focus-visible:-translate-y-4 group-focus-visible:opacity-0"
        ].join(" ")}
      >
        {renderLabel(defaultText, !copied && defaultTextIsCommand)}
      </span>
      <span
        className={[
          "absolute inset-0 flex items-center justify-center whitespace-nowrap transition-all duration-300 motion-reduce:transition-none",
          copied ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        ].join(" ")}
      >
        {copied ? renderLabel(copiedText, false) : renderLabel(command, commandIsCommand)}
      </span>
    </>
  ) : (
    copied ? renderLabel(copiedText, false) : renderLabel(defaultText, defaultTextIsCommand)
  );

  if (!revealOnHover) {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Copy install command: ${command}`}
        aria-live="polite"
        style={style}
        className={`${sharedButtonClasses} w-auto ${className}`.trim()}
      >
        {variant === "light" ? (
          <>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent-red/10 via-white/0 to-accent-orange/12 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
            <span className="pointer-events-none absolute inset-[1px] rounded-full bg-gradient-to-r from-white/10 via-transparent to-white/15 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
          </>
        ) : null}
        <span className="relative flex min-w-0 items-center justify-center text-center">{content}</span>
      </button>
    );
  }

  return (
    <span
      style={style}
      className={[
        "inline-flex w-[var(--install-cta-expanded)]",
        alignExpand === "right" ? "justify-end" : "justify-start",
        className
      ].join(" ").trim()}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Copy install command: ${command}`}
        aria-live="polite"
        className={`${sharedButtonClasses} w-[var(--install-cta-compact)] hover:w-[var(--install-cta-expanded)] focus-visible:w-[var(--install-cta-expanded)]`.trim()}
      >
        {variant === "light" ? (
          <>
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent-red/10 via-white/0 to-accent-orange/12 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
            <span className="pointer-events-none absolute inset-[1px] rounded-full bg-gradient-to-r from-white/10 via-transparent to-white/15 opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none" />
          </>
        ) : null}
        <span className="relative flex min-w-0 items-center justify-center text-center">{content}</span>
      </button>
    </span>
  );
}

function looksLikeCommand(value: string): boolean {
  return /^(npm|npx|pnpm|yarn|bun|naar)\b/.test(value.trim());
}
