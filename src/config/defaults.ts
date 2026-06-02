import type { InstallTarget, NaarConfig } from "../types/index.js";
import { getDefaultInstallTargets } from "../targets/index.js";

export const DEFAULT_PROVIDERS = ["anthropic", "clawhub"];
export const DEFAULT_TARGETS: InstallTarget[] = getDefaultInstallTargets();

export const DEFAULT_CONFIG: NaarConfig = {
  defaultProviders: DEFAULT_PROVIDERS,
  defaultTargets: DEFAULT_TARGETS,
  minSecurityScore: 80,
  noScripts: true
};

export const MAX_SCAN_FILES = 40000;
export const MAX_SCAN_DEPTH = 10;
