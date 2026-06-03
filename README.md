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
| `naar search <query>` | Searches provider catalogs directly without repo scanning. | You already know roughly what skill you want. | `naar search "github actions"` |
| `naar install` | Installs selected skills with preview and confirmation. | You already know what to install or want a dry run. | `naar install --dry-run` |
| `naar list` | Lists skills Naar has installed in the repository. | You want to audit installed skills and locations. | `naar list` |
| `naar uninstall [skills...]` | Removes installed skills by canonical skill id. | You want to clean up skills Naar installed. | `naar uninstall my-skill` |
| `naar config` | Views or updates Naar config for the repo. | You want default providers, targets, or score settings. | `naar config --json` |
| `naar targets` | Lists and inspects supported assistant targets. | You want to see stable, experimental, deprecated, and research targets. | `naar targets list` |
| `naar history` | Views and manages local skill lifecycle history across projects. | You want to inspect current and past Naar-managed skills on this machine. | `naar history` |

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

Search provider catalogs directly:

```bash
naar search "github actions"
naar s brewpage
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

### Search for Skills

Search provider catalogs directly without scanning your repository:

```bash
naar search "github actions"
naar s brewpage
naar search "brewpage" --provider clawhub
naar search "brewpage" --target claude_project_skills
naar search "brewpage" --json
naar search "brewpage" --include-installed
naar search "brewpage" --install
```

Naar shows one exact match or up to three close matches from your configured providers. Search mode does not run repo scanning, repo-need inference, recommendation scoring, or recommendation storage. It is useful when you already know roughly what skill you want.

Use `--install` to install selected search results through the same safe install flow as `naar install`: fetched-bundle security analysis, security review, plan preview, conflict handling, local state, lockfile, and lifecycle history updates all still apply. Automated search installs must be explicit, for example:

```bash
naar search "brewpage" --install --provider clawhub --target codex_repo_skills --apply --yes --non-interactive
```

Ambiguous fuzzy results are not auto-installed in automation. Re-run with a more specific query or use `--from <provider:skill@version>`.

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
| `--history <true\|false>` | Enable or disable local lifecycle history for this invocation. |

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

Naar supports target aliases, full target ids, and target groups. Defaults stay conservative: Claude skills, Cursor rules, Copilot repository instructions, and Codex repo skills.

Target status:

- `stable`: documented path and tested renderer.
- `experimental`: documented path, newer integration, opt-in only.
- `deprecated`: legacy path retained for compatibility, explicit opt-in only.
- `research`: visible for discovery, not write-capable.

Target commands:

```bash
naar targets list
naar targets inspect codex_repo_skills
naar targets inspect agents-md
```

Useful target groups:

| Group | Meaning |
| --- | --- |
| `all` | Stable and experimental write-capable targets, excluding deprecated and research targets. |
| `all-skills` | Stable and experimental skill-folder targets only. |
| `all-rules` | Stable and experimental rule targets only. |
| `all-instructions` | Stable and experimental instruction/context targets only. |
| `agents-md` | Standard `AGENTS.md` managed block target. |
| `experimental` | Experimental write-capable targets only. |
| `deprecated` | Deprecated write-capable targets only. |
| `research` | Research-only targets; these never write files. |

Broad groups such as `all`, `experimental`, and `deprecated` require explicit confirmation. In non-interactive runs they require `--yes`.

| Product | Target id | Artifact kind | Path | Status | Default? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | `claude_project_skills` | skill | `.claude/skills/<skill>/SKILL.md` | stable | yes | Full skill folder target. |
| Claude Code | `claude_project_memory` | context | `CLAUDE.md` | stable | no | Concise managed memory block. |
| Cursor | `cursor_project_rules` | rule | `.cursor/rules/naar-<skill>.mdc` | stable | yes | Project rule file. |
| Cursor | `cursor_legacy_rules` | rule | `.cursorrules` | deprecated | no | Legacy managed block. |
| GitHub Copilot | `copilot_repo_instructions` | instruction | `.github/copilot-instructions.md` | stable | yes | Managed appended blocks. |
| GitHub Copilot | `copilot_path_instructions` | instruction | `.github/instructions/naar-<skill>.instructions.md` | stable | no | Concise path instruction file. |
| OpenAI Codex | `codex_repo_skills` | skill | `.agents/skills/<skill>/SKILL.md` | stable | yes | Full skill folder target. |
| Gemini CLI | `gemini_context` | context | `GEMINI.md` | stable | no | Concise managed context block. |
| AGENTS.md | `agents_md_standard` | agents-md | `AGENTS.md` | stable | no | Standard managed instructions block. |
| Generic Agent | `generic_agent_skills` | generic-skill | `.agents/skills/<skill>/SKILL.md` | stable | no | Generic skill folder convention. |
| Windsurf | `windsurf_workspace_skills` | skill | `.windsurf/skills/<skill>/SKILL.md` | experimental | no | Full skill folder target. |
| Windsurf | `windsurf_agents_skills` | skill | `.agents/skills/<skill>/SKILL.md` | experimental | no | `.agents/skills` skill alias. |
| Windsurf | `windsurf_rules` | rule | `.windsurf/rules/naar-<skill>.md` | experimental | no | Concise rule file. |
| Cline | `cline_workspace_skills` | skill | `.cline/skills/<skill>/SKILL.md` | experimental | no | Full skill folder target. |
| Cline | `cline_clinerules_skills` | skill | `.clinerules/skills/<skill>/SKILL.md` | experimental | no | Rule-folder skill target. |
| Cline | `cline_rules` | rule | `.clinerules/naar-<skill>.md` | experimental | no | Concise rule file. |
| Roo Code | `roo_rules` | rule | `.roo/rules/naar-<skill>.md` | experimental | no | Concise rule file. |
| Roo Code | `roo_legacy_rules` | rule | `.roorules` | deprecated | no | Legacy managed block. |
| Continue | `continue_rules` | rule | `.continue/rules/naar-<skill>.md` | experimental | no | Concise rule file. |
| Kiro | `kiro_workspace_skills` | skill | `.kiro/skills/<skill>/SKILL.md` | experimental | no | Full skill folder target. |
| Kiro | `kiro_steering` | context | `.kiro/steering/naar-<skill>.md` | experimental | no | Concise steering file. |
| Research targets | `*_research` | unknown | research only | research | no | Discoverable but never write-capable. |

Skills are reusable `SKILL.md` folders. Rules, instructions, context files, steering files, and `AGENTS.md` entries are concise activation hints; Naar does not blindly dump full skill content into always-on instruction files.

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

## Local History

Naar can remember, locally on your machine, which projects currently have Naar-managed skills and which install/uninstall lifecycle events happened there. This helps you inspect your own usage patterns and prepares for future personal recommendations.

Naar history is local-only. It does not upload source code, file contents, secrets, environment variables, or full repositories.

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

History can be disabled for a run with `--history false`, or through the environment with `NAAR_HISTORY=0` or `NAAR_HISTORY=false`. Set `NAAR_HOME=/custom/path` to store history at `$NAAR_HOME/history.json`.

Uninstalling a skill removes it from the project's current history state and records an uninstall event. Projects remain in local history after all skills are uninstalled until you run `naar history forget`, `naar history prune`, or `naar history clear`.

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
