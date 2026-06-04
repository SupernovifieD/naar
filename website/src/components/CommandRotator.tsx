import { useEffect, useState } from "react";

const ROTATE_MS = 2600;

interface CommandRotatorProps {
  commands: string[];
}

export default function CommandRotator({ commands }: CommandRotatorProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion || commands.length <= 1) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % commands.length);
    }, ROTATE_MS);

    return () => window.clearInterval(timer);
  }, [commands.length, reducedMotion]);

  const current = commands[index] ?? commands[0] ?? "naar go";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm text-text shadow-panel shadow-black/20">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/5 via-transparent to-white/5 opacity-60" />
      <div className="relative flex items-center gap-3 overflow-hidden">
        <span className="text-text-soft">$</span>
        <div className="relative h-6 flex-1 [perspective:800px]">
          <span
            key={current}
            className={`absolute inset-0 block truncate text-cyan-300 ${reducedMotion ? "" : "animate-command-rotate"}`.trim()}
          >
            {current}
          </span>
        </div>
      </div>
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);

    const handleChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
}
