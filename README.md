# Pomegranate (`pom`)

Repo-aware CLI for auditing repositories, recommending Agent Skills, and installing selected skills safely.

## What It Does

- Scans repo stack and structure (JS/TS + Python focused for MVP)
- Detects AI-assistant config readiness (Claude, Cursor, Copilot, Codex, generic)
- Recommends skills from external providers (Anthropic + ClawHub in MVP)
- Applies security scoring and blocks risky skills by default
- Previews install plan before any write
- Installs project-local skills and tracks provenance in:
  - `.pom/installed.json`
  - `pom.lock.json`

## Quick Start

```bash
npm install
npm run build
./dist/cli.js go
```

Development mode:

```bash
npm run dev -- go
```

## Commands

```bash
pom go
pom scan
pom recommend
pom install
pom list
pom uninstall
pom config
```

## Important Flags

```bash
--json
--apply
--repo <path>
--provider <id>
--target <id>
--dry-run
--all-compatible
--min-security-score <n>
--no-scripts
--allow-scripts
--force
```

Target aliases:

- `claude` -> `claude_project_skills`
- `cursor` -> `cursor_project_rules`
- `copilot` -> `copilot_repo_instructions`
- `codex` -> `codex_repo_skills`
- `generic` -> `generic_agent_skills`

## Install Targets (MVP)

- Claude: `.claude/skills/<skill>/SKILL.md`
- Cursor: `.cursor/rules/pom-<skill>.mdc`
- Copilot: `.github/copilot-instructions.md` (appended managed blocks)
- Codex: `.agents/skills/<skill>/SKILL.md`
- Generic: `.agents/skills/<skill>/SKILL.md`

## Safety Defaults

- Block high-risk skills by default
- Minimum security score: `80`
- Do not run scripts by default (`--no-scripts`)
- No write before preview + confirmation
- `--json` mode is non-writing unless `--apply`

## Testing

```bash
npm run typecheck
npm test
npm run build
```

## Current MVP Notes

- Provider integrations currently use curated fallback catalogs with normalized metadata.
- The architecture is provider-pluggable and ready for deeper API integrations.
