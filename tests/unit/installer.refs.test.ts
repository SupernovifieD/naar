import { describe, expect, it } from "vitest";
import { formatSkillRef, parseSkillRef, toSkillRef } from "../../src/installer/refs.js";

describe("skill refs", () => {
  it("parses provider skill refs with optional namespace and version", () => {
    expect(parseSkillRef("clawhub:ui-ux")).toEqual({
      raw: "clawhub:ui-ux",
      providerId: "clawhub",
      skillId: "ui-ux"
    });
    expect(parseSkillRef("clawhub:wpank/ui-ux@1.2.3")).toEqual({
      raw: "clawhub:wpank/ui-ux@1.2.3",
      providerId: "clawhub",
      skillId: "wpank/ui-ux",
      version: "1.2.3"
    });
  });

  it("converts parsed refs to provider fetch refs", () => {
    const ref = toSkillRef(parseSkillRef("anthropic:frontend-design@main"));

    expect(ref).toEqual({ providerId: "anthropic", skillId: "frontend-design", version: "main" });
    expect(formatSkillRef(ref)).toBe("anthropic:frontend-design@main");
  });

  it("rejects malformed refs with a clear error", () => {
    expect(() => parseSkillRef("ui-ux")).toThrow('Invalid skill reference "ui-ux". Expected provider:skill or provider:skill@version.');
    expect(() => parseSkillRef("clawhub:")).toThrow('Invalid skill reference "clawhub:". Expected provider:skill or provider:skill@version.');
    expect(() => parseSkillRef("clawhub:ui-ux@")).toThrow('Invalid skill reference "clawhub:ui-ux@". Expected provider:skill or provider:skill@version.');
  });
});
