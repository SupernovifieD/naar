import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

interface CopyButtonProps {
  text: string;
  label?: string;
  iconOnly?: boolean;
}

export default function CopyButton({
  text,
  label = "Copy",
  iconOnly = false
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={[
        "inline-flex items-center gap-2 border border-white/10 bg-white/5 text-xs font-medium text-text-muted transition-colors duration-200 ease-glide hover:border-white/20 hover:bg-white/10 hover:text-text focus-visible:text-text",
        iconOnly
          ? "h-9 w-9 shrink-0 justify-center rounded-lg"
          : "rounded-full px-3 py-1"
      ].join(" ")}
      aria-live="polite"
      aria-label={copied ? `${label} copied` : label}
      title={copied ? "Copied" : label}
    >
      {iconOnly ? (
        <>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          <span className="sr-only">{copied ? "Copied" : label}</span>
        </>
      ) : (
        <span>{copied ? "Copied" : label}</span>
      )}
    </button>
  );
}
