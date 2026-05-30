# Naar (`naar`)

Naar is a repo-aware CLI that helps developers discover, evaluate, and safely install AI agent skills from different marketplaces.

It scans your repository, detects your stack and AI-assistant setup, recommends compatible skills, applies security scoring, previews the install plan, and installs only the skills you approve.

## What It Does

- Scans repo stack and structure (JS/TS + Python focused for MVP)
- Detects AI-assistant config readiness (Claude, Cursor, Copilot, Codex, generic)
- Recommends skills from external providers (Anthropic + ClawHub in MVP)
- Applies security scoring and blocks risky skills by default
- Previews install plan before any write
- Installs project-local skills and tracks provenance in:
  - `.naar/installed.json`
  - `naar.lock.json`

## Quick Start

Prerequisite: Node.js `>=20`.

Global install:

```bash
npm i -g naar
naar --help
```

Use in any project repo:

```bash
naar go
```

Ephemeral run without global install:

```bash
npx -y naar@latest go
```

Development/local run:

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
naar go
naar scan
naar recommend
naar install
naar list
naar uninstall
naar config
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

## Provider Auth and API Access

Naar uses real provider APIs by default and supports degraded fallback modes.

- Anthropic:
  - Set `ANTHROPIC_API_KEY` to use Anthropic Skills API mode.
  - Optional: `ANTHROPIC_API_BASE_URL` (default `https://api.anthropic.com`)
  - Optional: `ANTHROPIC_API_VERSION` (default `2023-06-01`)
  - Optional: `ANTHROPIC_BETA_HEADERS` (comma-separated; default includes skills/code-exec/files betas)
  - If key is missing or API fails, Naar falls back to Anthropic GitHub skills catalog.

- ClawHub:
  - Public read endpoints work without auth.
  - Optional: `CLAWHUB_API_TOKEN` enables token-auth mode for auth-required endpoints.
  - Optional: `CLAWHUB_API_BASE_URL` (default `https://clawhub.ai`)
  
- GitHub fallback headroom:
  - Optional: `GITHUB_TOKEN` for higher rate-limit headroom when Anthropic fallback uses GitHub.
  - Optional: `GITHUB_API_BASE_URL` (default `https://api.github.com`)

Provider runtime tuning:

- `NAAR_PROVIDER_TIMEOUT_MS` (default `10000`)
- `NAAR_PROVIDER_RETRY_ATTEMPTS` (default `3`)

`naar recommend --json` and `naar go --json` include provider mode hints (`api`, `github_fallback`, `public`, `token`) and provider warnings.

## Install Targets (MVP)

- Claude: `.claude/skills/<skill>/SKILL.md`
- Cursor: `.cursor/rules/naar-<skill>.mdc`
- Copilot: `.github/copilot-instructions.md` (appended managed blocks)
- Codex: `.agents/skills/<skill>/SKILL.md`
- Generic: `.agents/skills/<skill>/SKILL.md`

## Safety Defaults

- Block high-risk skills by default
- Minimum security score: `80`
- Do not run scripts by default (`--no-scripts`)
- No write before preview + confirmation
- `--json` mode is non-writing unless `--apply`
- No repository source files are uploaded to providers

## Testing

```bash
npm run typecheck
npm test
npm run build
```

## Manual npm Release (Maintainers)

One-time setup:

```bash
npm login
```

Release sequence:

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
npm publish
```

Post-publish smoke:

```bash
npm i -g naar
naar --version
naar --help
```

In a sample repository:

```bash
naar scan --json
naar go --dry-run
```

## Current MVP Notes

- Provider discovery/recommendation uses live provider APIs.
- Fail-open on provider availability (partial results + warnings).
- Fail-closed on install security policy.
