import type { SkillCandidate, SkillSecurityReport } from "../types/index.js";

function baselineRisk(): SkillSecurityReport {
  return {
    score: 100,
    level: "low",
    signals: [],
    requiresOverride: false
  };
}

function createSkill(skill: Omit<SkillCandidate, "risk">): SkillCandidate {
  return { ...skill, risk: baselineRisk() };
}

export const ANTHROPIC_SEED_SKILLS: SkillCandidate[] = [
  createSkill({
    providerSkillId: "anthropic/frontend-design-pro",
    canonicalSkillId: "frontend-design-pro",
    name: "Frontend Design Pro",
    source: {
      providerId: "anthropic",
      url: "https://github.com/anthropics/skills",
      version: "1.3.0",
      ref: "anthropic/frontend-design-pro@1.3.0",
      publisher: "Anthropic"
    },
    summary: "Guidelines for modern frontend UI decisions, component quality, accessibility, and consistent patterns.",
    tags: ["react", "nextjs", "tailwind", "ui-design", "accessibility"],
    compatibility: {
      assistants: ["claude", "cursor", "codex", "copilot", "generic"],
      frameworks: ["react", "nextjs", "tailwind", "vite"],
      languages: ["JavaScript", "TypeScript"]
    },
    metadata: {
      publisher: "Anthropic",
      description: "Front-end excellence baseline for AI-assisted coding workflows.",
      popularity: 92,
      license: "MIT",
      lastUpdatedIso: "2026-04-18T00:00:00.000Z",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      trustLevel: "official",
      pinnedRef: "v1.3.0"
    }
  }),
  createSkill({
    providerSkillId: "anthropic/test-quality-guard",
    canonicalSkillId: "test-quality-guard",
    name: "Test Quality Guard",
    source: {
      providerId: "anthropic",
      url: "https://github.com/anthropics/skills",
      version: "1.2.1",
      ref: "anthropic/test-quality-guard@1.2.1",
      publisher: "Anthropic"
    },
    summary: "Skill focused on test strategy, failing-first fixes, and regression checks for JS and Python projects.",
    tags: ["testing", "pytest", "vitest", "quality"],
    compatibility: {
      assistants: ["claude", "cursor", "codex", "copilot", "generic"],
      frameworks: ["pytest", "vite", "nextjs", "fastapi", "django", "flask"],
      languages: ["Python", "JavaScript", "TypeScript"]
    },
    metadata: {
      publisher: "Anthropic",
      popularity: 88,
      license: "MIT",
      lastUpdatedIso: "2026-03-20T00:00:00.000Z",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      trustLevel: "official",
      pinnedRef: "v1.2.1"
    }
  }),
  createSkill({
    providerSkillId: "anthropic/copilot-instructions-starter",
    canonicalSkillId: "copilot-instructions-starter",
    name: "Copilot Instructions Starter",
    source: {
      providerId: "anthropic",
      url: "https://github.com/anthropics/skills",
      version: "0.9.4",
      ref: "anthropic/copilot-instructions-starter@0.9.4",
      publisher: "Anthropic"
    },
    summary: "Builds practical repository-level instructions for Copilot and aligns with team coding workflows.",
    tags: ["copilot", "repo-instructions", "docs"],
    compatibility: {
      assistants: ["copilot", "claude", "cursor", "codex", "generic"],
      frameworks: ["react", "nextjs", "vue", "fastapi", "django"],
      languages: ["Python", "JavaScript", "TypeScript"]
    },
    metadata: {
      publisher: "Anthropic",
      popularity: 80,
      license: "MIT",
      lastUpdatedIso: "2026-01-12T00:00:00.000Z",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      trustLevel: "official",
      pinnedRef: "v0.9.4"
    }
  })
];

export const CLAWHUB_SEED_SKILLS: SkillCandidate[] = [
  createSkill({
    providerSkillId: "clawhub/fastapi-test-guard",
    canonicalSkillId: "fastapi-test-guard",
    name: "FastAPI Test Guard",
    source: {
      providerId: "clawhub",
      url: "https://clawhub.ai/skills/fastapi-test-guard",
      version: "2.1.0",
      ref: "clawhub/fastapi-test-guard@2.1.0",
      publisher: "openclaw-community"
    },
    summary: "FastAPI-focused testing instructions with pytest fixture and API contract guidance.",
    tags: ["fastapi", "pytest", "api-testing", "python"],
    compatibility: {
      assistants: ["claude", "cursor", "codex", "generic"],
      frameworks: ["fastapi", "pytest"],
      languages: ["Python"]
    },
    metadata: {
      publisher: "openclaw-community",
      popularity: 76,
      license: "Apache-2.0",
      lastUpdatedIso: "2026-04-01T00:00:00.000Z",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      trustLevel: "trusted",
      pinnedRef: "2.1.0"
    }
  }),
  createSkill({
    providerSkillId: "clawhub/cursor-rule-pack-ui",
    canonicalSkillId: "cursor-rule-pack-ui",
    name: "Cursor Rule Pack UI",
    source: {
      providerId: "clawhub",
      url: "https://clawhub.ai/skills/cursor-rule-pack-ui",
      version: "1.4.2",
      ref: "clawhub/cursor-rule-pack-ui@1.4.2",
      publisher: "ruleforge"
    },
    summary: "UI-focused Cursor rule set for component architecture, design systems, and review checklists.",
    tags: ["cursor", "ui-design", "components", "tailwind", "react"],
    compatibility: {
      assistants: ["cursor", "claude", "codex", "generic"],
      frameworks: ["react", "nextjs", "tailwind", "shadcn-ui"],
      languages: ["TypeScript", "JavaScript"]
    },
    metadata: {
      publisher: "ruleforge",
      popularity: 84,
      license: "MIT",
      lastUpdatedIso: "2026-03-30T00:00:00.000Z",
      hasScripts: false,
      hasBinaries: false,
      hasPackageManifests: false,
      trustLevel: "trusted",
      pinnedRef: "1.4.2"
    }
  }),
  createSkill({
    providerSkillId: "clawhub/python-deploy-blueprint",
    canonicalSkillId: "python-deploy-blueprint",
    name: "Python Deploy Blueprint",
    source: {
      providerId: "clawhub",
      url: "https://clawhub.ai/skills/python-deploy-blueprint",
      version: "0.7.5",
      ref: "clawhub/python-deploy-blueprint@0.7.5",
      publisher: "unknown-author"
    },
    summary: "Deployment and runtime instruction templates for Flask/Django/FastAPI repositories.",
    tags: ["python", "deploy-instructions", "flask", "django", "fastapi"],
    compatibility: {
      assistants: ["claude", "cursor", "codex", "copilot", "generic"],
      frameworks: ["flask", "django", "fastapi"],
      languages: ["Python"]
    },
    metadata: {
      publisher: "unknown-author",
      popularity: 52,
      license: undefined,
      lastUpdatedIso: "2024-10-01T00:00:00.000Z",
      hasScripts: true,
      hasBinaries: false,
      hasPackageManifests: true,
      trustLevel: "unknown",
      pinnedRef: "0.7.5"
    }
  })
];

export const SKILL_MARKDOWN: Record<string, string> = {
  "frontend-design-pro": `# Frontend Design Pro\n\n## Purpose\nUse this skill to enforce frontend quality, accessibility, and maintainable UI system choices.\n\n## Guidance\n- Prefer composable components and typed props.\n- Keep styles consistent with design tokens.\n- Add accessibility checks for keyboard and semantics.\n`,
  "test-quality-guard": `# Test Quality Guard\n\n## Purpose\nStandardize testing behavior across JS/TS and Python.\n\n## Guidance\n- Add focused tests for behavior changes.\n- Prefer failing-first reproductions for bugfixes.\n- Keep test execution commands documented.\n`,
  "copilot-instructions-starter": `# Copilot Instructions Starter\n\n## Purpose\nHelp maintain high-signal repository-level instructions for GitHub Copilot.\n\n## Guidance\n- Summarize architecture and boundaries.\n- Define preferred commands for lint/test/build.\n- Explain constraints and forbidden patterns.\n`,
  "fastapi-test-guard": `# FastAPI Test Guard\n\n## Purpose\nImprove FastAPI test quality with consistent API behavior checks.\n\n## Guidance\n- Validate response schema contracts.\n- Cover auth and error-path tests.\n- Keep pytest fixtures reusable and explicit.\n`,
  "cursor-rule-pack-ui": `# Cursor Rule Pack UI\n\n## Purpose\nCursor-oriented UI development skill for component quality and review hygiene.\n\n## Guidance\n- Keep components single-purpose and typed.\n- Use predictable style patterns and avoid visual regressions.\n`,
  "python-deploy-blueprint": `# Python Deploy Blueprint\n\n## Purpose\nProvide deployment and runtime guidance for Python web apps.\n\n## Notes\nThis skill includes optional scripts for environment bootstrap.\n`
};
