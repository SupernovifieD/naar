import { describe, expect, it } from "vitest";
import { resolveSkillDescription } from "../../src/utils/output.js";

describe("resolveSkillDescription", () => {
  it("uses metadata.description when present", () => {
    const value = resolveSkillDescription({
      summary: "Summary fallback",
      metadata: { description: "API description" }
    });

    expect(value).toBe("API description");
  });

  it("falls back to summary when description is missing", () => {
    const value = resolveSkillDescription({
      summary: "Summary fallback",
      metadata: {}
    });

    expect(value).toBe("Summary fallback");
  });

  it("normalizes whitespace and multiline content", () => {
    const value = resolveSkillDescription({
      summary: "ignored",
      metadata: { description: "First line\n\tSecond    line\r\nThird line" }
    });

    expect(value).toBe("First line Second line Third line");
  });

  it("returns null when both description and summary are empty", () => {
    const value = resolveSkillDescription({
      summary: " \n\t ",
      metadata: { description: "  " }
    });

    expect(value).toBeNull();
  });
});
