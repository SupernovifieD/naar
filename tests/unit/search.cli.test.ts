import { describe, expect, it } from "vitest";
import { createCliProgram, runCli } from "../../src/program.js";
import { CLI_VERSION } from "../../src/utils/version.js";

describe("search CLI registration", () => {
  it("registers the expected top-level commands", () => {
    const program = createCliProgram();

    expect(program.commands.map((command) => command.name())).toEqual(expect.arrayContaining([
      "go",
      "scan",
      "recommend",
      "search",
      "install",
      "list",
      "uninstall",
      "config",
      "targets",
      "history"
    ]));
  });

  it("registers naar search as discovery-only", () => {
    const program = createCliProgram();
    const command = program.commands.find((item) => item.name() === "search");
    const help = command?.helpInformation() ?? "";

    expect(command).toBeTruthy();
    expect(command?.aliases()).toContain("s");
    expect(command?.description()).toBe("Search provider catalogs for skills");
    expect(help).toContain("--include-installed");
    expect(help).not.toContain("--install");
    expect(help).not.toContain("--reinstall");
    expect(help).not.toContain("--apply");
    expect(help).not.toContain("--allow-risky");
    expect(help).toContain("--limit <n>");
    expect(help).toContain("--all");
  });

  it("exposes the s alias on the main program", () => {
    const program = createCliProgram();
    const alias = program.commands.find((item) => item.aliases().includes("s"));

    expect(alias?.name()).toBe("search");
    expect(alias?.usage()).toContain("<query...>");
  });

  it("resolves runCli for version output without exiting the test process", async () => {
    const originalExitCode = process.exitCode;
    const originalWrite = process.stdout.write.bind(process.stdout);
    let output = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.stdout.write as any) = (chunk: unknown) => {
      output += typeof chunk === "string" ? chunk : String(chunk);
      return true;
    };

    try {
      await expect(runCli(["node", "naar", "--version"])).resolves.toBeUndefined();
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout.write as any) = originalWrite;
      process.exitCode = originalExitCode;
    }

    expect(stripAnsi(output).trim()).toBe(CLI_VERSION);
  });
});

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
