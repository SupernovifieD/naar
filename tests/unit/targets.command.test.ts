import { describe, expect, it } from "vitest";
import { runTargetsInspect, runTargetsList } from "../../src/commands/targets.js";

async function captureStdout(run: () => void | Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let buffer = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout.write as any) = (chunk: unknown) => {
    buffer += typeof chunk === "string" ? chunk : String(chunk);
    return true;
  };

  try {
    await run();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout.write as any) = originalWrite;
  }

  return stripAnsi(buffer);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

describe("targets command output", () => {
  it("lists target registry entries", async () => {
    const output = await captureStdout(() => runTargetsList());

    expect(output).toContain("Supported targets");
    expect(output).toContain("claude_project_skills");
    expect(output).toContain("windsurf_rules");
    expect(output).toContain("cursor_legacy_rules");
    expect(output).toContain("trae_research");
  });

  it("prints JSON target list", async () => {
    const output = await captureStdout(() => runTargetsList({ json: true }));
    const parsed = JSON.parse(output) as { targets: Array<{ id: string }> };

    expect(parsed.targets.map((target) => target.id)).toEqual(expect.arrayContaining([
      "agents_md_standard",
      "continue_rules",
      "trae_research"
    ]));
  });

  it("inspects targets by id and alias", async () => {
    const byId = await captureStdout(() => runTargetsInspect("agents_md_standard"));
    expect(byId).toContain("AGENTS.md standard instructions");
    expect(byId).toContain("Write-capable: yes");

    const byAlias = await captureStdout(() => runTargetsInspect("windsurf"));
    expect(byAlias).toContain("Windsurf rules");
    expect(byAlias).toContain("Status: experimental");
  });

  it("inspects target groups", async () => {
    const output = await captureStdout(() => runTargetsInspect("deprecated"));

    expect(output).toContain("Target group: deprecated");
    expect(output).toContain("cursor_legacy_rules");
    expect(output).toContain("roo_legacy_rules");
  });

  it("throws clearly for unknown targets", () => {
    expect(() => runTargetsInspect("missing-target")).toThrow("Unknown target: missing-target");
  });
});
