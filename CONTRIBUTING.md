# Contributing to Naar

Thanks for contributing to Naar.

For product overview and end-user CLI usage, see [README.md](./README.md). This document is for contributors and maintainers.

## Prerequisites

- Node.js `>=20`
- npm

## Local Setup

```bash
npm install
```

## Development Commands

Use `npm run dev -- <command>` to run the TypeScript source directly during development.

```bash
npm run dev -- go
npm run dev -- scan
npm run dev -- recommend
npm run dev -- install
npm run dev -- list
npm run dev -- uninstall
npm run dev -- config
```

## Build

```bash
npm run build
```

Build output (including the CLI entrypoint) is generated under `dist/`.

## Run the Built CLI Locally

```bash
./dist/cli.js go
./dist/cli.js --help
```

## Quality Checks

```bash
npm run typecheck
npm test
npm run build
```

## Release Process for Maintainers

Naar uses GitHub Actions + npm Trusted Publishing with a two-step release flow:

1. Push a `v*` tag to run tag checks only (no npm publish).
2. Publish a GitHub Release for that `v*` tag to run checks again and publish to npm.

Release sequence:

```bash
npm run typecheck
npm test
npm run build
npm version <patch|minor|major>
git push origin main --follow-tags
```

Then publish a GitHub Release for the new tag (for example `v0.2.2`).

Release notes:

- Pushing a `v*` tag triggers tag checks only. It does not publish to npm.
- Publishing a GitHub Release for a `v*` tag triggers npm publishing.
- Stable versions publish to npm `latest`.
- Prerelease versions (for example `1.2.3-rc.1`) publish to npm `next`.
- Both workflows fail if the tag version does not match `package.json`.

## Post-Publish Smoke Test

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

- `README.md` is for users of `naar-cli`.
- `CONTRIBUTING.md` is for contributors and maintainers.
- Do not add development-only commands back into `README.md` unless they are clearly marked and linked here.
