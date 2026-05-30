# Changelog

All notable changes to this project are documented in this file.

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
