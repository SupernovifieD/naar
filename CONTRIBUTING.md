# Contributing to Naar

Thanks for contributing to Naar. This document is for contributors and maintainers.

For the product overview, user-facing CLI usage, commands, flags, providers, targets, and safety model, see [README.md](./README.md).

## Documentation Boundaries

Keep documentation split by audience:

| File | Audience | Belongs there |
| --- | --- | --- |
| `README.md` | Users evaluating or using `naar-cli` | Product overview, quick start, user commands, flags, examples, providers, targets, safety model |
| `CONTRIBUTING.md` | Contributors and maintainers | Local setup, development commands, tests, build, release process, documentation guidelines |

User-facing command descriptions belong in the README. Development commands and maintainer workflow details belong here.

## Prerequisites

- Node.js `>=20`
- npm
- Git

## Local Setup

Install dependencies:

```bash
npm install
```

Run the TypeScript source directly during development:

```bash
npm run dev -- --help
npm run dev -- go
npm run dev -- scan
npm run dev -- recommend
npm run dev -- install
npm run dev -- list
npm run dev -- uninstall
npm run dev -- config
```

Pass normal CLI flags after the command:

```bash
npm run dev -- recommend --compact
npm run dev -- scan --repo ../my-project --json
```

## Build

```bash
npm run build
```

Build output is generated under `dist/`, including the CLI entrypoint.

## Run the Built CLI Locally

```bash
./dist/cli.js --help
./dist/cli.js go
```

## Quality Checks

Run the core checks before opening a PR or publishing:

```bash
npm run typecheck
npm test
npm run build
```

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Run Vitest in watch mode. |
| `npm run build` | Build the CLI with `tsup`. |
| `npm run verify` | Run typecheck and tests. |

## Website Development

The project website lives under `website/`.

Use the root helper scripts:

```bash
npm run website:dev
npm run website:build
npm run website:preview
```

For website-specific setup, generated assets, contribution workflow, and deployment notes, see [website/README.md](./website/README.md).

## Agent Target Registry

Naar's supported install targets are centralized in `src/targets/registry.ts`. The registry covers stable, experimental, deprecated, AGENTS.md, and research-only targets while keeping the default target set conservative.

When adding a future target, add a registry entry first, then wire only the required renderer or detection adapter. Do not duplicate aliases, labels, install paths, target order, or assistant compatibility maps in command, scanner, config, or installer code.

For schema details, renderer rules, naming conventions, and safety requirements, see [docs/agent-target-registry.md](./docs/agent-target-registry.md).

## Release Process for Maintainers

Naar uses GitHub Actions and npm Trusted Publishing with a two-step release flow:

1. Push a `v*` tag to run tag checks only. This does not publish to npm.
2. Publish a GitHub Release for that `v*` tag to run checks again and publish to npm.

Release sequence:

```bash
npm run typecheck
npm test
npm run build
npm version <patch|minor|major>
git push origin main --follow-tags
```

Then publish a GitHub Release for the new tag, for example `v0.2.2`.

Release notes:

- Pushing a `v*` tag triggers tag checks only.
- Publishing a GitHub Release for a `v*` tag triggers npm publishing.
- Stable versions publish to npm `latest`.
- Prerelease versions, such as `1.2.3-rc.1`, publish to npm `next`.
- Both workflows fail if the tag version does not match `package.json`.
- The publishing workflow file remains `.github/workflows/publish-npm.yml` for npm Trusted Publishing compatibility.

## Post-Publish Smoke Test

After npm publish completes:

```bash
npm i -g naar-cli
naar --version
naar --help
```

In a sample repository:

```bash
naar scan --json
naar go --dry-run
```

## Documentation Guidelines

- Keep README user-facing and approachable.
- Keep development-only commands, release process, and maintainer notes in this file.
- Treat `src/cli.ts`, command implementations, `package.json`, and install target source as the source of truth.
- Do not document commands, flags, providers, targets, or security behavior that are not implemented.
- Avoid "MVP" language in user-facing sections unless it is necessary and carefully framed.
