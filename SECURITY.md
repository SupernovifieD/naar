# Naar Security Model

Naar is a safer workflow for discovering, evaluating, and installing third-party AI-agent skills. It helps reduce risk before instructions are written into your repository, but it is not a guarantee that a skill is safe.

Naar is not a sandbox, antivirus, or formal security audit. It is a safety layer that helps users make better decisions before adding third-party AI-agent skills to a project.

## 1. Security Overview

Naar's `go` and `install` flows are designed to avoid blind installation:

- Scan the local repository to build structured repo facts.
- Discover skill candidates from configured providers.
- Analyze candidate metadata and assign security signals.
- Rank recommendations by relevance and trust signals.
- Block risky candidates by default based on security policy.
- Fetch selected skill bundles.
- Analyze fetched file content before any write.
- Generate and preview an install plan.
- Write files only after explicit confirmation in interactive flow, or explicit `--apply`/`--yes` behavior in non-interactive modes.

This is a defense-in-depth flow, not a single trust check.

## 2. What Naar Does With Your Repository

Naar scans repository files locally to infer project facts. It looks for signals such as:

- Languages
- Frameworks
- Package managers
- Build/test/lint/format tools
- CI and infrastructure config
- AI-assistant config readiness
- Project topology (source, route, component, API, test, docs directories)

These facts are used for recommendation matching and provider search/ranking.

Important boundaries:

- Naar does not rewrite your application source code during scanning or recommendation.
- Naar does not manipulate app source files as part of scan/recommend logic.
- Built-in providers do not upload your full repository source files.
- Naar may use structured repo facts (for example frameworks/languages/assistants) in provider queries; these are not equivalent to sending your full codebase.
- Naar does not send your full codebase to provider APIs for recommendation-time analysis.
- Writes happen only during install flow, after plan generation and policy checks, and usually after explicit confirmation.

## 3. Files Naar May Write

During installation, Naar can write managed files for selected write-capable targets. The current conservative defaults are:

- Claude Code project skills: `.claude/skills/<skill>/SKILL.md`
- Cursor project rules: `.cursor/rules/naar-<skill>.mdc`
- GitHub Copilot repository instructions: `.github/copilot-instructions.md` (managed appended blocks)
- OpenAI Codex repo skills: `.agents/skills/<skill>/SKILL.md`

Additional stable and experimental targets are opt-in through `--target`, target aliases, or target groups. Deprecated targets are explicit opt-in only. Research targets are discoverable through `naar targets list`, but they are not write-capable and never produce install actions.

Run `naar targets list` or `naar targets inspect <target>` to inspect write capability, status, path hints, and documentation links before installing to a target.

Naar also writes internal management files:

- `.naar/installed.json`
- `naar.lock.json`

And it writes a managed local copy of fetched skill markdown:

- `.naar/skills/<skill>/SKILL.md`

These files support provenance and lifecycle operations (`list`, `uninstall`, reinstall decisions). `.naar/installed.json` records fields including provider id, skill id, canonical id, version/ref, selected targets, managed files, and security score at install time.

## 4. Local History Privacy

Naar may write a local history file outside the project directory to remember which projects installed which skills. This file is stored in the operating system's user data directory:

- macOS: `~/Library/Application Support/naar/history.json`
- Linux: `$XDG_DATA_HOME/naar/history.json`, or `~/.local/share/naar/history.json`
- Windows: `%APPDATA%/naar/history.json`
- Override: `$NAAR_HOME/history.json`

The history file may contain local project paths, project names, path hashes, timestamps, broad detected stack facts, installed Naar skill metadata, target names, and security scores.

The history file must not contain source code, file contents, environment variables, secrets, API keys, tokens, remote repository URLs, terminal history, shell commands, or private package registry URLs.

Users can inspect project paths, prune missing projects, forget individual projects, clear all history, or disable install recording with `--history false`, `NAAR_HISTORY=0`, or `NAAR_HISTORY=false`.

## 5. How Skill Vetting Works

### 5.1 Candidate Metadata Analysis

Before installation, Naar analyzes each candidate skill metadata profile (`analyzeSkill`), including:

- Executable scripts
- Binary artifacts
- Package manifests
- API key requirements
- Environment variable requirements
- Missing license
- Unpinned source/version/ref
- Unknown publisher
- Stale/unmaintained skill age
- Shell-command references in summary/tags
- Suspicious command-pattern references

Each signal includes:

- `id`
- `severity`
- `detail`
- `penalty`

Security score starts at `100`, and penalties reduce it.

### 5.2 Security Levels

Current level mapping is:

- `low`: score `>= 85`
- `medium`: score `>= 70`
- `high`: score `>= 40`
- `critical`: score `< 40`

The score is a risk heuristic, not proof of safety.

### 5.3 Default Security Policy

Current defaults and policy checks:

- Minimum security score target: `80`
- Script-bearing skills blocked by default behavior (`--no-scripts`)
- Hard block below safety score `60`
- Hard block when critical signals are present
- Block when score is below required threshold unless explicitly overridden
- Block when source is unpinned unless explicitly overridden
- Missing license is surfaced explicitly as `No license declared` and treated as risky
- Unknown publisher/stale/other non-critical warnings are treated as risky override cases

Flag behavior:

- `--min-security-score <n>` sets the required threshold for that run.
- `--no-scripts` enforces script blocking.
- `--allow-scripts` disables `--no-scripts` for that run.
- `--allow-risky` is required for non-interactive installs that proceed with post-fetch security concerns.

### 5.4 Fetched Content Analysis

Naar does not rely only on provider metadata. During install, after bundles are fetched, Naar scans fetched text content (`analyzeSkillContent`) across markdown/config/text files, including code fences, comments, inline code, and frontmatter.

Current content signals include:

- Remote content piped to shell
- Destructive filesystem commands
- Credential/secret exfiltration patterns
- Reverse shell patterns
- Encoded/eval execution patterns
- Shell commands in markdown/comment/code contexts
- Explicit execution instructions
- Permission-change instructions
- Package install instructions
- Sensitive path access/write references
- Network download references
- Secret/env access references
- Background/daemonization instructions

Signals can include evidence:

- File path
- Line number
- Excerpt (short, capped)

When fetched bundles contain concerns, Naar reports concise signal/evidence output, enters a security review step, and requires explicit user intent before any write.

### 5.5 Two-Stage Blocking

Naar has two checkpoints:

1. Recommendation-time vetting
- Candidates are analyzed and may be marked blocked.
- Blocked recommendations are excluded from normal install selection.

2. Install-time fetched-bundle vetting
- Selected bundles are fetched.
- Fetched content is scanned.
- If concerns are found (`risky`, `blocked`, `hard-blocked`), Naar enters a security review decision flow before install-plan application.
- Interactive mode requires explicit continue intent and a timed typed confirmation code before any file writes.
- Hard-blocked results are displayed with dangerous-override wording and require stronger confirmation.
- Wrong code, timeout, or cancel aborts install and writes nothing.

This protects against incomplete metadata and content drift between listing and fetched bundle.

### 5.6 Recommendation Score vs Security Score

Naar computes both:

- Recommendation/relevance score (repo fit, needs, compatibility, trust/popularity, caps)
- Security score (risk signals and policy checks)

Interpretation:

- A skill can be highly relevant but blocked for security.
- A skill can be lower risk but weakly relevant.
- Installation decisions should consider both fit and risk.

Output wording intentionally reflects two stages:

- Recommendation stage (before bundle fetch): `Match score`, `Pre-fetch risk estimate`, and preliminary status labels.
- Install stage (after bundle fetch and content scan): final `Security score` and final status (`eligible`, `risky`, `blocked`, `hard-blocked`).

## 6. Installation Safety Flow

Naar avoids silent writes:

- Builds an install plan before applying writes.
- Shows plan preview in normal terminal mode.
- `--dry-run` performs no writes.
- `--json` outputs plan data and does not write unless `--apply` is also set.
- `--non-interactive` requires explicit apply behavior to write.
- `--yes` alone does not bypass risky security policy.
- In non-interactive mode, post-fetch security concerns require explicit `--allow-risky --yes` to proceed.
- Interactive mode prompts for confirmation.
- Conflict detection blocks overwrite cases unless `--force` is used.

Recommended review pattern:

```bash
naar go --dry-run
```

You can also inspect recommendations first:

```bash
naar scan
naar recommend
```

## 7. User Responsibility and Low-Security Skills

Naar blocks risky skills by default, but no automated vetting system can prove that a third-party skill is safe. If you lower the security threshold, force overwrite conflict handling (`--force`), allow scripts, or install low-trust skills, you are accepting that risk.

Use extra caution with skills that:

- Include scripts
- Include binaries
- Require API keys or env vars
- Reference shell commands
- Come from unknown publishers
- Have missing licenses
- Appear stale
- Are unpinned to immutable refs
- Ask the assistant to access secrets, credentials, production systems, deployment systems, or local shell commands

## 8. Token Usage and Cost

Installing more skills can increase assistant context size and token usage.

- Each installed skill/rule/instruction may add extra context.
- More context can increase tokens.
- Higher token usage can increase cost or latency, depending on provider/model/assistant behavior.
- Irrelevant skills reduce signal-to-noise.

Naar helps you choose relevant skills, but it cannot guarantee how each assistant will count/load those files. Treat each installed skill as additional context with potential token cost.

## 9. Recommended Safe Usage

- Start with `naar scan`.
- Review with `naar recommend`.
- Use `--compact` for concise ranking review.
- Use `--dry-run` before writing.
- Prefer pinned, higher-trust, stronger-security skills.
- Keep script blocking enabled unless you explicitly need script-bearing skills.
- Review generated changes with `git diff`.
- Commit or discard install changes intentionally.
- Use `naar list` to review installed skills.
- Remove unused skills with `naar uninstall`.

## 10. Limitations

- Naar does not perform a full manual audit of every skill.
- Naar cannot guarantee that instructions are harmless.
- Naar cannot fully predict how any assistant will interpret/apply instructions.
- Provider metadata can be incomplete.
- Popularity and trust signals are useful heuristics, not guarantees.
- Even safe-looking instructions can cause bad outcomes if applied carelessly.
- Sensitive repositories still require manual review of installed instructions.

## 11. Reporting Security Issues

If you find a security issue in Naar vetting logic or install behavior, open a GitHub issue with a minimal reproduction. Do not include secrets, private repository code, API keys, or sensitive customer data in public issues.

If the project adds a private disclosure channel later, this section should be updated.
