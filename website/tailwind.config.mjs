/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        "bg-soft": "rgb(var(--bg-soft) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-glass": "rgb(var(--surface-glass) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        text: "rgb(var(--text) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted) / <alpha-value>)",
        "text-soft": "rgb(var(--text-soft) / <alpha-value>)",
        accent: {
          red: "rgb(var(--accent-red) / <alpha-value>)",
          "red-soft": "rgb(var(--accent-red-soft) / <alpha-value>)",
          orange: "rgb(var(--accent-orange) / <alpha-value>)",
          gold: "rgb(var(--accent-gold) / <alpha-value>)"
        },
        success: "rgb(var(--success) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)"
      },
      fontFamily: {
        sans: ["Manrope Variable", "Manrope", "Segoe UI", "sans-serif"],
        display: ["Space Grotesk", "Manrope Variable", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.04), 0 22px 70px rgba(0, 0, 0, 0.32)",
        panel: "0 18px 50px rgba(0, 0, 0, 0.28)",
        inset: "inset 0 1px 0 rgba(255,255,255,0.06)"
      },
      backgroundImage: {
        "hero-radial": "radial-gradient(circle at top, rgba(158, 36, 43, 0.28), transparent 46%), radial-gradient(circle at 80% 12%, rgba(228, 116, 67, 0.18), transparent 28%)"
      },
      transitionTimingFunction: {
        glide: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    }
  },
  plugins: []
};
