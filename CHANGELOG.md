# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-06-06

### Added
- Added a public product website with a homepage, docs, security, FAQ, and changelog pages, plus GitHub Pages deployment.
- Added an opt-in `awesome` provider backed by Awesome Agent Skills, including support for searchable/installable public GitHub-backed entries such as `awesome:stripe/stripe-best-practices`.
- Added deterministic provider query planning, dimensional recommendation scoring, structured recommendation blockers, and offline recommendation evaluation fixtures for broader and more explainable recommendation retrieval.
- Added a cached npm update notifier for newer `naar-cli` releases.

### Changed
- Promoted Naar's documentation and product presentation from a repo-only CLI readme into a fuller product surface, with the website carrying the long-form user guides and reference material.
- Moved the Anthropic provider to public GitHub-only catalog and bundle fetching. `GITHUB_TOKEN` remains available for GitHub API rate limits, but Anthropic API transport and API-key-driven fetch paths are removed.
- Unified command-line terminal UX and recommendation output around clearer fit summaries, safer install review, and consistent command behavior across search, recommend, install, and go flows.
- Removed `.env` templates and `.env`-style setup guidance. Naar now documents shell and CI environment variables only while keeping runtime configuration on normal `process.env` values.

### Docs and Website
- Launched interactive website search and guided-flow demos, expanded docs and FAQ coverage, and added a dedicated security reference and release changelog presentation.
- Rewrote the README to read as a product overview instead of a duplicated manual, and shifted deep command/reference reading to the website docs.
- Added website contributor guidance and clarified documentation boundaries between the README, website docs, and maintainer docs.

## [0.4.0] - 2026-06-03

### Added
- Added provider catalog search with `naar search <query>`, including JSON output and compact npm-like discovery rendering.
- Added direct provider-ref installs with `naar install <provider:skill>` and `naar install <provider:skill@version>`.
- Added explicit ref parsing/resolution for standalone installs, including validation for malformed refs and clear unknown-provider errors.
- Added `--reinstall` for reinstalling already-installed provider refs without changing normal safety checks.
- Added skill page links in recommendation cards and search results when providers expose a canonical skill URL.
- Added lifecycle-aware local history that tracks current installed state alongside install/uninstall events across projects.

### Changed
- Simplified the command model so `search` is discovery-only, `install` installs only explicit provider refs, and `go` remains the guided scan/recommend/install flow.
- Removed recommendation-backed fallback behavior from standalone `naar install`; direct installs no longer scan the repo, build recommendations, read recommendation cache, or depend on search selection paths.
- Updated `go` to build recommendations once and hand the selected results into the shared install engine instead of re-entering recommendation loading during install.
- Improved search presentation with fetch-time spinner feedback, npm-like result formatting, highlighted missing-license output, and direct install commands in rendered results.
- Refined local history into a lifecycle model that preserves current installed state, uninstall history, current-vs-ever-used summaries, and recent activity views.

### Docs
- Added Naar logotype artwork to the README and refreshed search/install guidance around the new direct-install command model.
- Updated maintainer release guidance and user-facing examples to match the current search/install split.

## [0.3.0] - 2026-06-03

### Added
- Added a centralized agent target ecosystem with stable, experimental, deprecated, AGENTS.md, and research-only target classifications.
- Added new target discovery commands: `naar targets list` and `naar targets inspect <target>` with JSON support.
- Added target group aliases including `all`, `all-skills`, `all-rules`, `all-instructions`, `agents-md`, `experimental`, `deprecated`, and `research`.
- Added verified write-capable targets for Claude memory, Copilot path instructions, Gemini context, AGENTS.md, Windsurf, Cline, Roo, Continue, and Kiro integrations.
- Added research-only target entries for tools without verified project-level write targets, including Trae and other agent ecosystems.
- Added local-only lifecycle history with `naar history`, `list`, `skills`, `show`, `prune`, `forget`, and `clear`.
- Added global history storage with OS-specific paths, `NAAR_HOME` override, versioned schema validation, corrupt-file backup, restrictive permissions, and atomic writes.
- Added `--history <true|false>` and `NAAR_HISTORY=0|false` controls for disabling history recording.

### Changed
- Refactored target compatibility, aliases, detection, defaults, and install rendering to use the central target registry.
- Preserved existing default install targets while making all new experimental/deprecated/research targets opt-in.
- Rendered non-skill-folder targets as concise managed rules/instructions/context hints instead of copying full `SKILL.md` into always-on files.
- Made managed block writes idempotent with target-specific markers while preserving legacy Copilot block handling.
- Updated scanner assistant detection to use registry-driven target patterns and group product-level detections.
- Upgraded history to schema v2 with current project skill state plus install/uninstall lifecycle events.
- Updated history summaries to distinguish currently installed projects, ever-used projects, uninstalled projects, install counts, and uninstall counts.
- Updated history terminal timestamps to show local machine time and date while keeping JSON timestamps as ISO strings.

### Security and Privacy
- Prevented research-only targets from producing install actions.
- Required explicit confirmation for broad target groups such as `all`, `experimental`, and `deprecated`, with `--yes` required in non-interactive/JSON flows.
- Recorded history only after successful applied installs and uninstalls, never during dry runs, canceled runs, failed operations, or recommendation-only runs.
- Kept install success best-effort when history recording fails.
- Kept uninstall success best-effort when history recording fails.
- Limited history data to local project paths, path hashes, timestamps, broad detected stack facts, installed skill metadata, targets, and security scores.
- Documented that history must not store source code, file contents, secrets, environment variables, tokens, remote URLs, shell history, or terminal commands.

### Docs
- Added an agent target registry guide for target schema, safety rules, aliases, detection, and renderer conventions.
- Updated README with the expanded target matrix, target groups, history commands, and local history controls.
- Updated SECURITY.md with local history privacy guidance and target write-safety behavior.

## [0.2.2] - 2026-06-02

### Added
- Added an explicit post-fetch security review decision step for install concerns so risky, blocked, and hard-blocked fetched bundles are reviewed before any files are written.
- Added explicit risky override semantics with `--allow-risky`, structured status values, and stronger hard-block/dangerous-override wording.
- Added timed security confirmation with 3 attempts, fresh confirmation codes per attempt, and a 60-second window per code.
- Added final post-install warnings when concerning skills are installed after explicit confirmation.
- Added clearer `naar list` output with per-skill version, targets, location, and install date when available.

### Changed
- Clarified two-stage scoring language in terminal output: recommendation cards now distinguish match score and pre-fetch risk estimate from final fetched-bundle security score.
- Improved fetched-bundle security warning presentation with recommendation-card color styling, capitalized labels, clearer spacing, and no user-facing penalty point values.
- Moved post-fetch install concerns from an abrupt failure path into an intentional review/continue/cancel flow for interactive installs.
- Improved Step 4 security summaries by placing final status/security score/risk details below each skill name with readable labels.
- Shortened security confirmation codes to 6 characters while preserving explicit typed confirmation.

### Fixed
- Fixed the bundled `go` banner showing `Naar vunknown` by resolving the CLI version from package metadata in both source and `dist` layouts.
- Fixed version output drift by using the same package-derived version for Commander and the `go` progress banner.
- Ignored local `.naar/skills/` skill copies in generated `.gitignore` entries so installed skill archives do not pollute repository status.

### Security
- Kept hard-blocked security findings non-overrideable by default policy while adding explicit interactive dangerous override handling where the install flow permits it.
- Required explicit `--allow-risky --yes` intent for non-interactive installs with post-fetch security concerns.
- Made cancellation, failed confirmation, and timeout paths abort before writes with a clear no-files-written guarantee.

### Docs and Release
- Polished README and contributor guidance for launch readiness.
- Added detailed security documentation covering trust boundaries, status semantics, override behavior, and install-time review.
- Split release automation so tag pushes run checks only and GitHub Release publication triggers npm Trusted Publishing.

## [0.2.1] - 2026-05-31

### Added
- Added install-time full bundle content security scanning for fetched skill files, including markdown comments, code blocks, and inline instructions.
- Added hard blocking for critical executable-content patterns (for example remote pipe-to-shell and destructive command signatures) before install plan creation.
- Added structured security evidence (file path, line number, excerpt) to risk signals for safer debugging and policy transparency.
- Added scoped primary/secondary repository facts with richer path-based evidence, project type detection, and command classification for recommendation context.

### Changed
- Refactored recommendation relevance scoring to a repo-needs pipeline with strict need matching, anti-triggers, specialized gates, and normalized scoring.
- Expanded scanner coverage with modular deterministic multi-ecosystem detectors and clearer CI/infra fact separation.
- Improved recommendation/install UX with multiline `Why` output (up to 3 reasons) in recommendation cards.
- Simplified step-4 install details into concise bullet summaries (`Status`, `Why`, `Targets`, `Publisher`, `Trust`).
- Updated recommendation cards to place `Publisher` inline with `Score`/`Risk`/`Status`, hide penalties, and use title-cased labels.

### Security
- Strengthened fetched-bundle policy enforcement and blocked-output reporting with signal IDs and concise evidence for suspicious content findings.

### Docs
- Split end-user README content from contributor-focused docs.

## [0.1.2] - 2026-05-30

### Fixed
- Stabilized CLI output tests by stripping ANSI terminal escape codes in stdout capture for command output assertions.
- Unblocked release pipeline failures at the `npm test` step in tag-triggered publish workflow runs.

## [0.1.1] - 2026-05-30

### Added
- Added recommendation card layout in `naar go` and `naar recommend` for clearer scanability.
- Added per-skill description lines (provider description with summary fallback) in recommendation output.
- Added global `--compact` mode for dense, power-user recommendation output.
- Added post-install output showing where Naar installed artifacts.
- Added npm auto-publish workflow on `v*` tags using GitHub Actions + npm Trusted Publishing (OIDC).

### Changed
- Reduced default recommendation list size from 20 to 10 to lower decision overload.
- Improved install prompt UX with clearer key hints, including explicit `q` quit visibility.

## [0.1.0] - 2026-05-30

### Added
- Bootstrapped the Naar CLI with scan/recommend/install pipeline.
- Added repository detection for JS/TS and Python ecosystems.
- Added AI assistant readiness detection and install targets.
- Added rule-based recommendation engine with explainable reasons.
- Added security scoring, blocking policy, and safe install flow.
- Added real provider integrations:
  - Anthropic official provider with API + GitHub fallback mode.
  - ClawHub provider with public/token mode support.
- Added managed install state and lock tracking:
  - `.naar/installed.json`
  - `naar.lock.json`
- Added automatic `.gitignore` management for Naar runtime artifacts.
- Added interactive assistant-target selection before installation.
- Added `q` shortcut to quit interactive install prompts safely.

### Changed
- Renamed product/CLI from `pomegranate`/`pom` to `naar`.
- Improved `go` flow output ordering and readability.
- Added consistent colorized CLI output across commands/help.
- Streamed `go` progress sequentially by pipeline phase.
- Normalized score/risk/readiness output to percentages.
- Inverted displayed risk semantics for user clarity:
  - `0%` = safest
  - `100%` = riskiest

### Provider and Security
- Replaced curated runtime provider data path with live provider fetch.
- Added retrying HTTP client with timeout/backoff and partial-result handling.
- Added provider-scoped identity for installed/recommended skills.
- Enforced strict install safety defaults and bundle re-check before write.

### Release and Packaging
- Prepared package metadata and release flow for public npm distribution.
- Switched npm package identity to `naar-cli` while keeping CLI command as `naar`.
- Added package publish hardening:
  - strict `files` whitelist
  - `prepack` build
  - `prepublishOnly` quality gates
- Updated README for global install and manual release workflow.
