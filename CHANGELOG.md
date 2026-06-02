# Changelog

All notable changes to this project are documented in this file.

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
