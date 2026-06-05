import { useEffect, useRef, useState } from "react";

interface HeroPomegranateProps {
  src: string;
  alt?: string;
  className?: string;
}

export default function HeroPomegranate({ src, alt = "", className = "" }: HeroPomegranateProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const velocityRef = useRef(0);
  const floatOffsetRef = useRef(0);
  const lastScrollYRef = useRef(0);
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
      node.style.transform = "translate3d(0, 0, 0) rotate(0deg) scale(1)";
      return undefined;
    }

    const handleScroll = () => {
      const nextScrollY = window.scrollY;
      const delta = nextScrollY - lastScrollYRef.current;
      lastScrollYRef.current = nextScrollY;
      velocityRef.current = Math.max(-18, Math.min(18, velocityRef.current + delta * 0.32));
    };

    let frame = 0;
    const startedAt = window.performance.now();

    const animate = (timestamp: number) => {
      const elapsed = timestamp - startedAt;
      const floatY = Math.sin(elapsed / 2300) * 8;
      const floatRotate = Math.sin(elapsed / 3100) * 1.5;
      velocityRef.current *= 0.92;
      floatOffsetRef.current += (velocityRef.current - floatOffsetRef.current) * 0.08;

      const wiggleY = Math.max(-14, Math.min(14, floatOffsetRef.current));
      const wiggleX = Math.max(-6, Math.min(6, floatOffsetRef.current * 0.42));
      const wiggleRotate = Math.max(-4, Math.min(4, floatOffsetRef.current * 0.18));

      node.style.transform = `translate3d(${wiggleX}px, ${floatY + wiggleY}px, 0) rotate(${floatRotate + wiggleRotate}deg) scale(1)`;
      frame = window.requestAnimationFrame(animate);
    };

    lastScrollYRef.current = window.scrollY;
    window.addEventListener("scroll", handleScroll, { passive: true });
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.cancelAnimationFrame(frame);
    };
  }, [reducedMotion]);

  return (
    <div ref={elementRef} className={className} style={{ willChange: "transform" }}>
      <div className="absolute inset-0 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        className="relative w-40 drop-shadow-[0_26px_48px_rgba(0,0,0,0.42)] lg:w-52"
      />
    </div>
  );
}
