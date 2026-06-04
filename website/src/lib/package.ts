import fs from "node:fs";

interface RootPackageJson {
  name?: string;
  version?: string;
  description?: string;
  repository?: string | { type?: string; url?: string };
  bin?: Record<string, string>;
  engines?: { node?: string };
}

const rootPackagePath = new URL("../../../package.json", import.meta.url);
const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8")) as RootPackageJson;

function normalizeRepositoryUrl(repository: RootPackageJson["repository"]): string {
  if (typeof repository === "string") {
    return repository.replace(/^git\+/, "").replace(/\.git$/, "");
  }

  const url = repository?.url ?? "";
  return url.replace(/^git\+/, "").replace(/\.git$/, "");
}

const cliCommand = Object.keys(rootPackage.bin ?? {})[0] ?? "naar";

export const packageInfo = {
  name: rootPackage.name ?? "naar-cli",
  displayName: "Naar",
  version: rootPackage.version ?? "unknown",
  description: rootPackage.description ?? "A repo-aware package manager for AI-agent skills, rules, and instructions",
  repositoryUrl: normalizeRepositoryUrl(rootPackage.repository) || "https://github.com/SupernovifieD/naar",
  npmPackageName: rootPackage.name ?? "naar-cli",
  cliCommand,
  nodeEngine: rootPackage.engines?.node ?? ">=20"
} as const;
