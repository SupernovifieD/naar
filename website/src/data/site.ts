import fs from "node:fs";

const rootPackagePath = new URL("../../../package.json", import.meta.url);
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8")) as { version?: string };

export const siteMeta = {
  name: "Naar",
  tagline: "Find, evaluate, and install AI-agent skills without turning your repo into a guessing game.",
  description: "Naar is a local-first CLI for discovering, evaluating, and safely installing AI-agent skills, rules, and instructions from provider catalogs.",
  installCommand: "npm i -g naar-cli",
  npmUrl: "https://www.npmjs.com/package/naar-cli",
  githubUrl: "https://github.com/SupernovifieD/naar",
  issuesUrl: "https://github.com/SupernovifieD/naar/issues"
} as const;

export const cliVersion = rootPackage.version ?? "unknown";

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
  { href: "/changelog", label: "Changelog" }
] as const;

export const productLinks = [
  { href: "/docs#search-first", label: "Search" },
  { href: "/docs#guided-flow", label: "Go workflow" },
  { href: "/docs#from-search-to-install", label: "Install" }
] as const;

export function withBase(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (pathname === "/") {
    return base || "/";
  }
  return `${base}${pathname}`;
}
