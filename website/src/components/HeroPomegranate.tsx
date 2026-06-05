import { useEffect, useRef, useState } from "react";

interface HeroPomegranateProps {
  src: string;
  alt?: string;
  className?: string;
}

export default function HeroPomegranate({ src, alt = "", className = "" }: HeroPomegranateProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const scrollYRef = useRef(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);

    const handleChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const node = elementRef.current;
    if (!node) return undefined;

    if (reducedMotion) {
      node.style.transform = "translate3d(0, 0, 0) rotate(6deg) scale(1)";
      return undefined;
    }

    const handleScroll = () => {
      scrollYRef.current = window.scrollY;
    };

    let frame = 0;
    const startedAt = window.performance.now();
    const animate = (timestamp: number) => {
      const elapsed = timestamp - startedAt;
      const floatOffset = Math.sin(elapsed / 3000) * 6;
      const scrollOffset = Math.min(scrollYRef.current * 0.03, 10);
      const rotate = 6 + Math.sin(elapsed / 5000) * 0.85 + Math.min(scrollYRef.current * 0.004, 3);
      node.style.transform = `translate3d(0, ${floatOffset + scrollOffset}px, 0) rotate(${rotate}deg) scale(1)`;
      frame = window.requestAnimationFrame(animate);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <div ref={elementRef} className={className}>
      <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        className="relative w-32 drop-shadow-[0_26px_48px_rgba(0,0,0,0.42)] lg:w-40"
      />
    </div>
  );
}
