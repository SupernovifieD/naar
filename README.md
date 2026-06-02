# Naar

**Repo-aware skill discovery and installation for AI coding assistants.**

Naar is a CLI and package manager for AI-agent skills. It scans your repository, understands your stack and assistant setup, recommends relevant skills from providers, explains security risk, previews file changes, and installs only what you approve.

## Why Naar Exists

Developers now work across multiple AI coding assistants, each with its own skill, rule, or instruction format. Finding the right skill for a specific repository is already messy; deciding whether to trust it and where to install it adds another layer of friction.

Naar is a repo-aware bridge between your project, your AI assistants, and skill marketplaces. It turns "what should I install for this repo?" into a guided flow with matching, safety checks, and explicit installation control.

## Quick Start

Prerequisite: Node.js `>=20`.

```bash
npm i -g naar-cli
```

Then in your project:

```bash
naar --help
naar go
```

Run without a global install:

```bash
npx -y naar-cli@latest go
```

`naar go` is the recommended first run. It scans the current repository, ranks skill recommendations, lets you choose what to install, and previews changes before writing.

## How Naar Works

1. Scans your repository for languages, frameworks, tools, topology, and assistant config.
2. Detects compatible assistant targets such as Claude, Cursor, Copilot, Codex, and generic agent skill folders.
3. Fetches skill candidates from configured providers.
4. Scores recommendations against your repo needs and shows pre-fetch risk estimates.
5. Fetches selected bundles and performs final content security checks.
6. Shows an install plan before writing files.
7. Installs only after explicit approval.

## Commands

| Command | What it does | Use it when | Example |
| --- | --- | --- | --- |
| `naar go` | Runs the guided scan, recommend, select, and install flow. | You want the complete experience. | `naar go` |
| `naar scan` | Prints structured repository facts. | You want to inspect what Naar detects. | `naar scan --json` |
| `naar recommend` | Ranks matching skills from providers. | You want recommendations without installing yet. | `naar recommend --compact` |
| `naar install` | Installs selected skills with preview and confirmation. | You already know what to install or want a dry run. | `naar install --dry-run` |
| `naar list` | Lists skills Naar has installed in the repository. | You want to audit installed skills and locations. | `naar list` |
| `naar uninstall [skills...]` | Removes installed skills by canonical skill id. | You want to clean up skills Naar installed. | `naar uninstall my-skill` |
| `naar config` | Views or updates Naar config for the repo. | You want default providers, targets, or score settings. | `naar config --json` |

## Common Examples

Guided flow:

```bash
naar go
```

Scan the current repo:

```bash
naar scan
```

Get recommendations:

```bash
naar recommend
```

Compact recommendations:

```bash
naar recommend --compact
```

Preview installation without writing:

```bash
naar install --dry-run
```

JSON output for automation:

```bash
naar recommend --json
```

Run against another repo:

```bash
naar scan --repo ../my-project
```

Recommend for a specific assistant target:

```bash
naar recommend --target claude
```

## Flags and Options

### Repo, Provider, and Target Selection

| Flag | Description |
| --- | --- |
| `--repo <path>` | Run Naar against another repository path. Defaults to the current working directory. |
| `--provider <id>` | Limit provider discovery to one or more provider ids. Repeatable. |
| `--target <id>` | Limit recommendation or install behavior to one or more assistant targets. Accepts aliases such as `claude` and full target ids. Repeatable. |
| `--all-compatible` | Select all compatible unblocked recommendations in automated flows. |
| `--from <provider:skill@version>` | Install a specific provider skill reference. |
| `--from-plan <file>` | Load install selections from a plan JSON file. |

### Output and Automation

| Flag | Description |
| --- | --- |
| `--json` | Emit JSON output. In install flows, JSON mode does not write unless `--apply` is also used. |
| `--compact` | Keep recommendation output dense while preserving match, risk, status, and concise rationale. |
| `--verbose` | Show more detailed diagnostic output where supported. |
| `--non-interactive` | Disable prompts for automation. Security concerns still require explicit override flags. |

### Install Behavior

| Flag | Description |
| --- | --- |
| `--dry-run` | Preview only. No files are written. |
| `--apply` | Apply writes in non-interactive or JSON modes. Use intentionally. |
| `--yes` | Skip ordinary confirmation prompts. Does not silently bypass post-fetch security concerns. |
| `--force` | Allow overwrite on install conflicts. Review carefully before using. |

### Safety Controls

| Flag | Description |
| --- | --- |
| `--min-security-score <n>` | Set the minimum security score for the current run. Default is `80`. |
| `--no-scripts` | Disallow script-bearing skills. This is the default behavior. |
| `--allow-scripts` | Allow script-bearing skills. Unsafe; use only when you trust the bundle. |
| `--allow-risky` | Acknowledge risky security concerns. Required for non-interactive concern overrides. Unsafe; use deliberately. |

### Configuration

These options are available on `naar config`:

| Flag | Description |
| --- | --- |
| `--set-provider <id>` | Set default providers for the repo. Repeatable. |
| `--set-target <id>` | Set default targets for the repo. Repeatable. |
| `--set-min-security-score <n>` | Set the default minimum security score. |

## Targets

Naar supports target aliases and full target ids.

| Alias | Target id | Install location |
| --- | --- | --- |
| `claude` | `claude_project_skills` | `.claude/skills/<skill>/SKILL.md` |
| `cursor` | `cursor_project_rules` | `.cursor/rules/naar-<skill>.mdc` |
| `copilot` | `copilot_repo_instructions` | `.github/copilot-instructions.md` as managed appended blocks |
| `codex` | `codex_repo_skills` | `.agents/skills/<skill>/SKILL.md` |
| `generic` | `generic_agent_skills` | `.agents/skills/<skill>/SKILL.md` |

## Providers and Authentication

Naar discovers skills through provider APIs and fallback catalogs. Some providers work without credentials; API keys can improve access, reliability, or rate limits.

| Provider | Authentication |
| --- | --- |
| Anthropic | Set `ANTHROPIC_API_KEY` to use Anthropic Skills API mode. If the key is missing or the API fails, Naar can fall back to Anthropic's GitHub skills catalog. |
| ClawHub | Public read endpoints work without auth. Set `CLAWHUB_API_TOKEN` for token-auth mode when needed. |
| GitHub fallback | Set `GITHUB_TOKEN` for higher rate-limit headroom when GitHub-backed fallback discovery is used. |

Provider environment variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_BASE_URL` | Optional Anthropic API base URL. Defaults to `https://api.anthropic.com`. |
| `ANTHROPIC_API_VERSION` | Optional Anthropic API version. Defaults to `2023-06-01`. |
| `ANTHROPIC_BETA_HEADERS` | Optional comma-separated Anthropic beta headers. |
| `CLAWHUB_API_BASE_URL` | Optional ClawHub API base URL. Defaults to `https://clawhub.ai`. |
| `GITHUB_API_BASE_URL` | Optional GitHub API base URL. Defaults to `https://api.github.com`. |
| `NAAR_PROVIDER_TIMEOUT_MS` | Provider request timeout. Default is `10000`. |
| `NAAR_PROVIDER_RETRY_ATTEMPTS` | Provider retry attempts. Default is `3`. |

Provider discovery uses repository facts, not your full source tree. Naar does not upload your repository source files to providers.

## Safety and Trust

Naar is designed to avoid blind installation:

- Shows recommendation-stage match and pre-fetch risk estimates.
- Fetches selected bundles and performs final content security analysis before writing.
- Blocks high-risk skills by default.
- Uses a default minimum security score of `80`.
- Disables scripts by default.
- Shows install plans before applying changes.
- Requires explicit confirmation for security concerns.
- Requires `--allow-risky --yes` for non-interactive installs that proceed with post-fetch concerns.
- Keeps JSON and non-interactive modes from silently writing unless explicitly applied.

Naar helps you make safer decisions, but it cannot prove that a third-party skill is harmless. Review installed files and treat risky, blocked, or hard-blocked skills with care. See [SECURITY.md](./SECURITY.md) for the full security model.

## Files Naar Writes

Naar writes only during install flows and only after the relevant preview and confirmation steps.

| Path | Purpose |
| --- | --- |
| `.naar/installed.json` | Tracks installed skills, selected targets, managed files, provenance, and security score at install time. |
| `naar.lock.json` | Stores lock data for resolved skill installs. |
| `.naar/skills/<skill>/SKILL.md` | Keeps Naar's managed local copy of fetched skill markdown. |
| Target-specific files | Writes or appends the assistant-specific files listed in [Targets](#targets). |

## Current Status

Naar is early, but already usable. The current focus is making skill discovery, recommendation, and installation safer and smoother across real projects.

Current capabilities include repository scanning, provider-backed recommendation, target-aware installation, security scoring, post-fetch content review, install previews, and installed-skill tracking.

Future work is expected to deepen marketplace coverage, language and framework awareness, recommendation quality, and user experience.

## Contributing

Issues, ideas, and thoughtful feedback are welcome. Development setup, local CLI usage, release notes, and documentation guidelines live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT. See [LICENSE](./LICENSE).
