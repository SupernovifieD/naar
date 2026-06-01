# Naar (`naar`)

Naar is a repo-aware CLI that helps developers discover, evaluate, and safely install AI agent skills from different marketplaces.

It solves the "which skills should I trust and install for this repo?" problem by scanning your project, recommending compatible skills, and enforcing safety checks before writing files.

## What It Does

- Scans repository stack and structure (JS/TS + Python focused for MVP)
- Detects AI-assistant config readiness (Claude, Cursor, Copilot, Codex, generic)
- Recommends skills from external providers (Anthropic + ClawHub in MVP)
- Applies security scoring and blocks risky skills by default
- Previews install plans before any write
- Installs only approved, compatible skills

## Quick Start

Prerequisite: Node.js `>=20`.

Install globally:

```bash
npm i -g naar-cli
naar --help
```

Run in any project repository:

```bash
naar go
```

Ephemeral run without global install:

```bash
npx -y naar-cli@latest go
```

Compact output mode:

```bash
naar recommend --compact
naar go --compact
```

## Commands

```bash
naar go
naar scan
naar recommend
naar install
naar list
naar uninstall [skills...]
naar config
```

## Important Flags

```bash
--repo <path>
--provider <id>
--target <id>
--json
--compact
--dry-run
--apply
--all-compatible
--min-security-score <n>
--no-scripts
--allow-scripts
--allow-risky
--force
--from <provider:skill@version>
--from-plan <file>
--non-interactive
--yes
--verbose
```

`--compact` keeps recommendation output dense by removing description/targets/meta sections while preserving score, risk, status, and concise rationale.

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

## Install Targets

- Claude: `.claude/skills/<skill>/SKILL.md`
- Cursor: `.cursor/rules/naar-<skill>.mdc`
- Copilot: `.github/copilot-instructions.md` (appended managed blocks)
- Codex: `.agents/skills/<skill>/SKILL.md`
- Generic: `.agents/skills/<skill>/SKILL.md`

## Files Naar Writes

- `.naar/installed.json` (installed skill tracking + provenance)
- `naar.lock.json` (lock data for resolved installs)
- Target-specific install files listed above

## Safety Defaults

- Block high-risk skills by default
- Minimum security score: `80`
- Do not run scripts by default (`--no-scripts`)
- Overrideable risky skills require explicit `--allow-risky`
- No write before preview + confirmation
- `--json` mode is non-writing unless `--apply`
- No repository source files are uploaded to providers
- Post-fetch security concerns trigger a review step before any write
- In non-interactive mode, concern overrides require both `--allow-risky` and `--yes`

Recommendation/install status semantics:

- `ELIGIBLE`: compatible and installable under current policy.
- `RISKY`: overrideable security concerns; install requires explicit confirmation before writes.
- `BLOCKED`: policy concerns requiring explicit override confirmation before writes.
- `INCOMPATIBLE`: does not match the selected target compatibility set.

Recommendation output is a preliminary, pre-fetch view:

- `Match score` shows repo relevance/ranking.
- `Pre-fetch risk estimate` is based on provider metadata before bundle download.
- Recommendation statuses are rendered as preliminary labels.

During installation, Naar fetches bundle files and performs a second, final security analysis. That stage reports `Security score` and final status, which can differ from the pre-fetch estimate. If concerns are found (`risky`, `blocked`, or `hard-blocked`), Naar enters a security review step instead of writing files immediately.

## Security Model

Naar's security model, vetting pipeline, privacy boundaries, token-cost considerations, and user-responsibility notes are documented in [SECURITY.md](./SECURITY.md).

## Current MVP Notes

- Provider discovery/recommendation uses live provider APIs.
- Fail-open on provider availability (partial results + warnings).
- Fail-closed on install security policy.

## Contributing

Development setup, testing, local CLI usage, and release notes are documented in [CONTRIBUTING.md](./CONTRIBUTING.md).
