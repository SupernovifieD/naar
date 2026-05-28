# Pomegranate v0.1 MVP Plan

## Summary

Pomegranate (`pom`) is a repo-aware CLI for:

- repo scanning and stack detection
- AI-assistant readiness audit
- rule-based skill recommendation
- safe, preview-first local installation

MVP defaults:

- providers: Anthropic + ClawHub
- install targets: Claude, Cursor, Copilot, Codex (+ generic mapping)
- security threshold: 80
- block scripts by default
- no non-interactive writes unless `--apply`

## Implemented Modules

- `src/scanner`: file-based repo scanner + framework/package/assistant detectors
- `src/recommend`: deterministic scoring + explainable reasons
- `src/security`: risk signal extraction + policy checks
- `src/providers`: provider interface + Anthropic/ClawHub providers
- `src/installer`: install plan generation, write apply, uninstall support
- `src/commands`: `go`, `scan`, `recommend`, `install`, `list`, `uninstall`, `config`

## Runtime Contracts

- `.pom/cache/scan.json`
- `.pom/cache/recommendations.json`
- `.pom/installed.json`
- `pom.lock.json`

## Architecture Diagram

```text
[CLI Commands]
   -> [Scanner + Detectors] -> [RepoFacts]
   -> [Provider Orchestrator] -> [Anthropic, ClawHub]
   -> [Catalog Normalizer]
   -> [Security Analyzer + Rule Scoring]
   -> [Recommendations]
   -> [Install Planner]
   -> [Confirm]
   -> [Installer]
   -> [State: .pom/installed.json, pom.lock.json]
```

## Milestone Status (Codebase)

- M1 CLI skeleton: done
- M2 repo scanner core: done
- M3 frontend detection: done
- M4 python detection: done (file/dependency heuristics)
- M5 AI assistant detection: done
- M6 recommendation engine: done
- M7 first providers: done (curated fallback)
- M8 security scanner: done
- M9 interactive installer: done
- M10 lockfile + uninstall: done
- M11 docs/examples: started

## Known Gaps for Next Iteration

- Replace curated provider fallback with live provider API clients
- Expand fixture matrix to all target stacks in the plan
- Improve conflict-aware merge strategy for existing instruction files
- Add richer provenance verification (checksums/signatures)
