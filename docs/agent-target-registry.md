# Agent Target Registry

Naar target support is centralized in `src/targets/registry.ts`. Commands, scanner detection, recommendation compatibility, config defaults, and install planning should read from the registry instead of duplicating target facts.

## Target Schema

Each target entry must define:

- `id`: stable `InstallTarget` identifier. Do not rename an id without a migration.
- `displayName`: user-facing name used in pickers and target commands.
- `product`: assistant product family, such as `Claude Code`, `Cursor`, or `Windsurf`.
- `aliases`: short CLI aliases. Keep aliases unique and predictable.
- `status`: `stable`, `experimental`, `deprecated`, or `research`.
- `enabledByDefault`: true only for conservative default targets.
- `canWrite`: false for research-only targets.
- `artifactKind`: `skill`, `generic-skill`, `rule`, `instruction`, `context`, `agents-md`, or `unknown`.
- `installStrategy`: renderer strategy, including `research-only` for non-writeable targets.
- `pathHint` and `installPathTemplate`: displayed path hint and actual write path template.
- `documentationUrl`: primary source proving the target path or convention when available.
- `verificationStatus`: `verified-docs`, `project-convention`, or `research-unverified`.
- `scopeSupport`: one or more of `repo`, `workspace`, `path`, or `mode`.
- Capability booleans: bundled files, managed blocks, path-scoped rules, mode-specific rules, generic skill acceptance, and `AGENTS.md` compatibility.
- `detection`: local deterministic path patterns used by the scanner.
- `compatibility.assistantIds`: assistant ids that can use the target.
- `notes`: concise safety or compatibility notes.

## Status Rules

- `stable`: documented or established target with a verified renderer. Stable targets may be defaults only when they are conservative and already supported by existing behavior.
- `experimental`: documented path or convention, but opt-in only. Experimental targets are write-capable only when the write path is verified.
- `deprecated`: legacy write target retained for compatibility. Deprecated targets are excluded from defaults, `all`, `all-skills`, and `all-rules`; users must request them explicitly.
- `research`: discoverable but non-writeable. Research targets must use `canWrite: false` and `installStrategy: "research-only"`.

## Alias Rules

Define target aliases on registry entries. Group aliases live in `src/targets/aliases.ts`.

Required group behavior:

- `all`: stable and experimental write-capable targets only; excludes deprecated and research.
- `all-skills`: stable and experimental write-capable skill-folder targets only.
- `all-rules`: stable and experimental write-capable rule targets only.
- `all-instructions`: stable and experimental write-capable instruction/context targets only.
- `agents-md`: AGENTS.md targets only.
- `experimental`: write-capable experimental targets only.
- `deprecated`: deprecated write-capable targets only.
- `research`: research-only targets.

Broad groups (`all`, `experimental`, `deprecated`) must require explicit confirmation in interactive install flow and `--yes` in non-interactive or JSON install flow.

## Renderer Rules

Preserve existing target output exactly unless a migration is explicitly planned.

Use full `SKILL.md` content only for verified skill-folder targets. Rule files, instruction files, context files, steering files, and `AGENTS.md` blocks should render concise activation hints, not full skill markdown dumps.

Append/update targets must use managed markers:

```text
naar:target:<targetId>:skill:<slug>
```

The existing Copilot repository-instructions target keeps the legacy marker format for compatibility:

```text
naar:skill:<slug>
```

Managed block writes must be idempotent by replacing an existing block with the same marker.

## Detection Rules

Scanner detection must remain deterministic and local-only. Use registry `detection` patterns for path checks and group product-level assistant detections so one product with multiple targets does not produce confusing duplicate assistant rows.

Research targets may contribute detection paths for discovery, but they must never create install actions.

## Naming Conventions

Use ids in this shape:

```text
<product>_<scope>_<artifact>
```

Examples:

- `claude_project_skills`
- `copilot_path_instructions`
- `agents_md_standard`
- `trae_research`

Use `_research` suffix for research-only entries. Use `_legacy_` where the target is deprecated because the product moved to a newer path or model.

## Adding A Target

1. Add the `InstallTarget` and, if needed, `AssistantId` union member in `src/types/index.ts`.
2. Add one registry entry in `src/targets/registry.ts` with documentation and verification status.
3. Add aliases only through the registry entry or `src/targets/aliases.ts` group helpers.
4. Choose an existing renderer strategy or add a small renderer in `src/targets/renderers/`.
5. Add scanner detection patterns to the registry entry.
6. Add tests for alias resolution, group behavior, install planning, scanner detection, and target CLI output.
7. Run `npm run typecheck`, `npm test`, and `npm run build`.
