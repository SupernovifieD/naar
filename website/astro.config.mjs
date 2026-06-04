import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: "https://supernovified.github.io",
  base: "/naar",
  output: "static",
  trailingSlash: "ignore",
  integrations: [
    mdx(),
    react(),
    tailwind({
      applyBaseStyles: false
    })
  ]
});
