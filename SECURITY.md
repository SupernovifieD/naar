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

During installation, Naar can write managed skill/rule files for selected targets:

- Claude: `.claude/skills/<skill>/SKILL.md`
- Cursor: `.cursor/rules/naar-<skill>.mdc`
- Copilot: `.github/copilot-instructions.md` (managed appended blocks)
- Codex: `.agents/skills/<skill>/SKILL.md`
- Generic: `.agents/skills/<skill>/SKILL.md`

Naar also writes internal management files:

- `.naar/installed.json`
- `naar.lock.json`

And it writes a managed local copy of fetched skill markdown:

- `.naar/skills/<skill>/SKILL.md`

These files support provenance and lifecycle operations (`list`, `uninstall`, reinstall decisions). `.naar/installed.json` records fields including provider id, skill id, canonical id, version/ref, selected targets, managed files, and security score at install time.

## 4. How Skill Vetting Works

### 4.1 Candidate Metadata Analysis

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

### 4.2 Security Levels

Current level mapping is:

- `low`: score `>= 85`
- `medium`: score `>= 70`
- `high`: score `>= 40`
- `critical`: score `< 40`

The score is a risk heuristic, not proof of safety.

### 4.3 Default Security Policy

Current defaults and policy checks:

- Minimum security score target: `80`
- Script-bearing skills blocked by default behavior (`--no-scripts`)
- Hard block below safety score `60`
- Block when score is below required threshold
- Block when critical signals are present
- Block when source is unpinned

Flag behavior:

- `--min-security-score <n>` sets the required threshold for that run.
- `--no-scripts` enforces script blocking.
- `--allow-scripts` disables `--no-scripts` for that run.

### 4.4 Fetched Content Analysis

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

When fetched bundles fail policy, Naar reports concise signal/evidence output and stops before writing.

### 4.5 Two-Stage Blocking

Naar has two checkpoints:

1. Recommendation-time vetting
- Candidates are analyzed and may be marked blocked.
- Blocked recommendations are excluded from normal install selection.

2. Install-time fetched-bundle vetting
- Selected bundles are fetched.
- Fetched content is scanned.
- Policy failures block installation before install-plan application.

This protects against incomplete metadata and content drift between listing and fetched bundle.

### 4.6 Recommendation Score vs Security Score

Naar computes both:

- Recommendation/relevance score (repo fit, needs, compatibility, trust/popularity, caps)
- Security score (risk signals and policy checks)

Interpretation:

- A skill can be highly relevant but blocked for security.
- A skill can be lower risk but weakly relevant.
- Installation decisions should consider both fit and risk.

## 5. Installation Safety Flow

Naar avoids silent writes:

- Builds an install plan before applying writes.
- Shows plan preview in normal terminal mode.
- `--dry-run` performs no writes.
- `--json` outputs plan data and does not write unless `--apply` is also set.
- `--non-interactive` requires explicit apply behavior to write.
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

## 6. User Responsibility and Low-Security Skills

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

## 7. Token Usage and Cost

Installing more skills can increase assistant context size and token usage.

- Each installed skill/rule/instruction may add extra context.
- More context can increase tokens.
- Higher token usage can increase cost or latency, depending on provider/model/assistant behavior.
- Irrelevant skills reduce signal-to-noise.

Naar helps you choose relevant skills, but it cannot guarantee how each assistant will count/load those files. Treat each installed skill as additional context with potential token cost.

## 8. Recommended Safe Usage

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

## 9. Limitations

- Naar does not perform a full manual audit of every skill.
- Naar cannot guarantee that instructions are harmless.
- Naar cannot fully predict how any assistant will interpret/apply instructions.
- Provider metadata can be incomplete.
- Popularity and trust signals are useful heuristics, not guarantees.
- Even safe-looking instructions can cause bad outcomes if applied carelessly.
- Sensitive repositories still require manual review of installed instructions.

## 10. Reporting Security Issues

If you find a security issue in Naar vetting logic or install behavior, open a GitHub issue with a minimal reproduction. Do not include secrets, private repository code, API keys, or sensitive customer data in public issues.

If the project adds a private disclosure channel later, this section should be updated.
