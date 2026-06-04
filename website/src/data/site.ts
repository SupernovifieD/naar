import { packageInfo } from "../lib/package";

export const siteMeta = {
  name: packageInfo.displayName,
  tagline: "Find, evaluate, and install AI-agent skills without turning your repo into a guessing game.",
  description: "Naar is a repo-aware CLI for discovering, reviewing, and installing AI-agent skills from provider catalogs.",
  installCommand: `npm i -g ${packageInfo.npmPackageName}`,
  npmUrl: `https://www.npmjs.com/package/${packageInfo.npmPackageName}`,
  githubUrl: packageInfo.repositoryUrl,
  issuesUrl: `${packageInfo.repositoryUrl}/issues`
} as const;

export const cliVersion = packageInfo.version;

export const navLinks = [
  { href: "/", label: "Home" },
  { href: "/docs", label: "Docs" },
  { href: "/security", label: "Security" },
  { href: "/faq", label: "FAQ" },
  { href: "/changelog", label: "Changelog" }
] as const;

export const productLinks = [
  { href: "/docs#getting-started", label: "Getting started" },
  { href: "/docs#search-workflow", label: "Search workflow" },
  { href: "/docs#guided-go-workflow", label: "Go workflow" },
  { href: "/docs#install-workflow", label: "Install" }
] as const;

export function withBase(pathname: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  if (pathname === "/") {
    return base || "/";
  }
  return `${base}${pathname}`;
}
