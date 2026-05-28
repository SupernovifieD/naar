import type { CliFlags } from "../types/index.js";
import { runInstallFlow } from "./installFlow.js";

export async function runInstall(flags: CliFlags): Promise<void> {
  await runInstallFlow(flags, { forceFreshRecommendations: false });
}
