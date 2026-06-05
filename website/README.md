# Contributing to the Naar Website

This directory contains the static marketing and documentation site for Naar.

It is built with Astro, Tailwind, MDX, and a small number of React islands. The site is deployed to GitHub Pages under `/naar`.

## Prerequisites

- Node.js `>=20`
- npm
- Root repo dependencies installed
- Website dependencies installed

From the repo root:

```bash
npm install
npm --prefix website install
```

## Run Locally

Recommended from the repo root:

```bash
npm run website:dev
```

Directly from the website workspace:

```bash
npm --prefix website run dev
```

Notes:

- `website` has a `predev` hook that rebuilds the local skills index before the dev server starts.
- The skills index is generated from the root provider layer, so provider warnings during startup are expected when remote catalogs are limited or partially unavailable.
- Local development does not require you to change the GitHub Pages base path manually.

## Build and Preview

Build the site:

```bash
npm run website:build
```

Or:

```bash
npm --prefix website run build
```

Preview the production build locally:

```bash
npm run website:preview
```

## What Is Generated

Some website assets are generated at build time:

- `website/public/data/skills-index.json`
  - built by `website/scripts/build-skills-index.ts`
  - sourced from the root provider layer in `src/providers/`
- changelog pages
  - sourced from the root [`CHANGELOG.md`](../CHANGELOG.md)
- package metadata used in the site
  - sourced from the root [`package.json`](../package.json)

Do not hand-edit:

- `website/dist/`
- `website/public/data/skills-index.json`

## Where To Make Changes

- Homepage and marketing sections:
  - `website/src/pages/index.astro`
  - `website/src/components/`
- Docs, security, FAQ, and changelog pages:
  - `website/src/pages/`
- Shared metadata and build-time content helpers:
  - `website/src/data/`
  - `website/src/lib/`
- Site-wide styling:
  - `website/src/styles/global.css`

## Contribution Workflow

For most website changes:

```bash
npm --prefix website run build
```

If you changed shared root code that the website depends on, also run:

```bash
npm run verify
```

That second check matters when you touch:

- `src/providers/`
- shared root TypeScript used by website build scripts
- release metadata or changelog parsing paths

## Suggesting Changes

If you want to propose website changes:

- Open a PR with a short explanation of the problem and the intended user-facing result.
- For visual changes, include screenshots or a short screen recording.
- For motion changes, mention reduced-motion behavior explicitly.
- For copy changes, keep product claims aligned with the CLI’s actual behavior in the root repo.

If you are not sure where a change belongs, open an issue or draft PR and point to the affected page or component.

## Deployment Notes

The website is deployed by GitHub Actions through `.github/workflows/deploy-website.yml`.

- Pushes to `main` trigger a website deploy.
- `workflow_dispatch` can trigger a manual deploy.

Unless you are changing deployment behavior, you should not need to touch the workflow.
