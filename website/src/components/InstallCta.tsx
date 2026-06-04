import { useEffect, useState } from "react";

interface InstallCtaProps {
  command: string;
}

export default function InstallCta({ command }: InstallCtaProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Copy install command: ${command}`}
      className="group relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-white/95 px-4 py-2 text-sm font-semibold text-bg shadow-glow transition-all duration-300 ease-glide hover:-translate-y-0.5 hover:bg-white focus-visible:bg-white"
    >
      <span className="absolute inset-0 bg-gradient-to-r from-accent-red/10 via-transparent to-accent-orange/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100" />
      <span className="relative flex items-center gap-2">
        <span className={`transition-all duration-200 ${copied ? "opacity-0" : "opacity-100 group-hover:opacity-0 group-focus-visible:opacity-0"}`}>
          Install
        </span>
        <span className={`absolute transition-all duration-200 ${copied ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"}`}>
          {copied ? "Copied" : command}
        </span>
      </span>
    </button>
  );
}
