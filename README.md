# Naar — Skills Package Manager

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/naar-logotype-light.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/naar-logotype-dark.png">
    <img src="docs/assets/naar-logotype-dark.png" alt="Naar" width="520">
  </picture>
</p>

<p align="center">
  <strong>Find, review, and install AI-agent skills with explicit safety checks and target-aware delivery.</strong>
</p>

Naar is a repo-aware CLI for discovering, evaluating, and installing AI-agent skills, rules, and instruction bundles. It combines provider catalogs, repository context, assistant targets, and install-time review so teams can adopt reusable agent behavior without blind copy-paste into their repositories.

Documentation and product guides:

- [Documentation](https://supernovified.github.io/naar/docs)
- [Security](https://supernovified.github.io/naar/security)
- [FAQ](https://supernovified.github.io/naar/faq)
- [Changelog](https://supernovified.github.io/naar/changelog)

## Why Naar

- Search provider catalogs directly when you already know what you want.
- Run `naar go` when repository context should drive discovery and ranking.
- Install into assistant-specific targets such as Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Gemini, and `AGENTS.md`.
- Review fetched bundles, security signals, conflicts, and planned writes before anything changes on disk.
- Keep managed state, lock data, and local lifecycle history for auditing and cleanup.

## Installation

Prerequisite: Node.js `>=20`.

Install globally:

```bash
npm i -g naar-cli
```

Run without a global install:

```bash
npx -y naar-cli@latest go
npx -y naar-cli@latest search "github actions"
```

## Start Here

| Workflow | Command | What it does |
| --- | --- | --- |
| Guided discovery | `naar go` | Scans the repo, fetches provider candidates, ranks fit, and leads into the reviewed install flow. |
| Direct search | `naar search "github actions"` | Searches provider catalogs directly without scanning the repo or installing anything. |
| Explicit install | `naar install clawhub:brewpage --dry-run` | Fetches one provider ref, runs content checks, and previews writes before apply. |
| Repo facts | `naar scan --json` | Prints the structured repository facts used by recommendation and targeting. |

Typical flow:

```bash
naar go
naar search "testing"
naar install clawhub:brewpage --dry-run
```

## Core Commands

| Command | Purpose |
| --- | --- |
| `naar go` | Guided scan, recommendation, selection, and install flow. |
| `naar search <query>` / `naar s <query>` | Direct provider-catalog discovery. |
| `naar install <refs...>` | Explicit installation for known provider refs. |
| `naar scan` | Inspect structured repository facts. |
| `naar recommend` | Generate recommendations without entering install selection. |
| `naar list` | Show what Naar manages in the current repository. |
| `naar uninstall [skills...]` | Remove Naar-managed skills by canonical id. |
| `naar config` | View or update repo-level Naar defaults. |
| `naar targets` | Inspect supported assistant targets and groups. |
| `naar history` | Inspect local lifecycle history across repositories on this machine. |

For full command examples, flags, and workflow walkthroughs, use the website documentation at [supernovified.github.io/naar/docs](https://supernovified.github.io/naar/docs).

## Targets

Naar ships with conservative defaults and broader opt-in target coverage.

Default write targets include:

- Claude Code project skills
- Cursor project rules
- GitHub Copilot repository instructions
- OpenAI Codex repo skills

Additional stable and opt-in targets cover Gemini context, `AGENTS.md`, generic agent-skill conventions, and experimental integrations such as Windsurf, Cline, Roo Code, Continue, and Kiro.

Inspect available targets locally:

```bash
naar targets list
naar targets inspect codex_repo_skills
```

For the complete target reference, see [Website Docs: Targets](https://supernovified.github.io/naar/docs#targets). Maintainer-level target rules and schema details live in [docs/agent-target-registry.md](./docs/agent-target-registry.md).

## Providers

Naar currently supports:

- `anthropic` — Anthropic Official Skills fetched from the public GitHub repository at `anthropics/skills`
- `clawhub` — ClawHub catalog and bundle fetches
- `awesome` — Awesome Agent Skills as an opt-in index provider that resolves installable entries to public GitHub sources

`awesome` is intentionally not part of the default provider set because it is a large aggregate catalog and is best enabled explicitly when you want that broader index.

Examples:

```bash
naar search "stripe" --provider awesome
naar install awesome:stripe/stripe-best-practices
```

Provider behavior and discovery guidance are covered in [Website Docs: Providers](https://supernovified.github.io/naar/docs#providers).

## Safety Model

Naar is designed to keep discovery fast and installation explicit:

- Search stays discovery-only.
- Recommendation and install use structured repo facts instead of blind catalog browsing.
- Selected bundles are fetched and analyzed before write.
- Security score, warnings, and conflicts are surfaced before apply.
- `--dry-run`, `--json`, `--non-interactive`, and override flags preserve explicit control over writes.

Naar is a safety layer, not a guarantee that a third-party skill is harmless. Review installed content and treat risky or low-trust bundles accordingly.

Read the full security model in [SECURITY.md](./SECURITY.md) or on the website at [supernovified.github.io/naar/security](https://supernovified.github.io/naar/security).

## Provider Shell/CI Environment Variables

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Optional. Increases GitHub API rate-limit headroom when fetching public GitHub-backed providers such as Anthropic Official Skills and Awesome Agent Skills. |
| `CLAWHUB_API_TOKEN` | Optional. Uses ClawHub token-auth mode when needed. |
| `CLAWHUB_API_BASE_URL` | Optional. Overrides the ClawHub API base URL. Defaults to `https://clawhub.ai`. |
| `GITHUB_API_BASE_URL` | Optional. Overrides the GitHub API base URL. Defaults to `https://api.github.com`. |
| `NAAR_PROVIDER_TIMEOUT_MS` | Optional. Provider request timeout in milliseconds. Defaults to `10000`. |
| `NAAR_PROVIDER_RETRY_ATTEMPTS` | Optional. Provider retry attempts. Defaults to `3`. |

Set these in your shell or CI environment. Naar does not load `.env` files.

## Local History

Naar can store local lifecycle history outside the project directory so you can inspect what it manages across repositories on the current machine.

Useful commands:

```bash
naar history
naar history list
naar history skills
naar history show <project-path>
naar history prune
naar history forget <project-path>
naar history clear
```

History can be disabled for a run with `--history false`, or through shell/CI environment variables such as `NAAR_HISTORY=0` or `NAAR_HISTORY=false`. Set `NAAR_HOME=/custom/path` in your shell or CI environment to store history at `$NAAR_HOME/history.json`.

See [Website Docs: Local history](https://supernovified.github.io/naar/docs#local-history) for behavior and privacy details.

## Files Naar Writes

Naar writes only during install flows and only after the relevant preview and confirmation steps.

| Path | Purpose |
| --- | --- |
| `.naar/installed.json` | Tracks installed skills, selected targets, managed files, provenance, and security score at install time. |
| `naar.lock.json` | Stores lock data for resolved skill installs. |
| `.naar/skills/<skill>/SKILL.md` | Keeps Naar's managed local copy of fetched skill markdown. |
| Target-specific files | Writes or appends the assistant-specific artifacts for the selected targets. |

## Documentation

Use the website for the full product documentation set:

- [Documentation](https://supernovified.github.io/naar/docs)
- [Security](https://supernovified.github.io/naar/security)
- [FAQ](https://supernovified.github.io/naar/faq)
- [Changelog](https://supernovified.github.io/naar/changelog)

Contributor and maintainer workflow lives in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

Issues, ideas, and well-scoped pull requests are welcome. For development workflow, local commands, release notes, and documentation boundaries, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
