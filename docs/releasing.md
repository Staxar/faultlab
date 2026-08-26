# Releasing FaultLab

This document describes the first `0.1.0` release and the process for future updates. The current
development version is `0.2.0`, including the current scenario, timeout, recorder, error-monitoring, Error
Observatory, investigation notes, and local export slices.

## Release policy

`0.1.0` is the first public snapshot of the MVP. The current `0.2.0` development line additionally
contains builder, recorder, error-monitoring, Error Observatory, notes, evidence, export, and timeout work.
The `0.1.0` snapshot includes:

- network latency, bandwidth throttling, offline failures, delays, and HTTP failures;
- JSON response mutation for Fetch/XHR responses;
- built-in preset configuration and reset;
- discovery of observed endpoints, GraphQL operations, and JSON fields;
- local runtime state for the selected tab.

Custom scenario CRUD, application limits, recorder timeline, error monitoring, request-body mutation, and
multi-tab orchestration were not part of the original `0.1.0` snapshot. They must be described as
development features until a new version is released.

The planned `0.2.0` release scope is maintained in [CHANGELOG.md](../CHANGELOG.md). It is not a release
until the validation checklist passes, the tag is created, and the package is uploaded.

Use semantic versioning for later releases:

- `0.1.x` for backwards-compatible fixes and documentation updates;
- `0.2.0` for the next backwards-compatible feature set;
- `1.0.0` when the public API and product scope are considered stable.

## Before any release

Requirements:

- Node.js 20 or newer;
- pnpm 10 or newer;
- Chrome or Chromium 116 or newer;
- a Git remote, if the source release will be hosted on GitHub.

From the repository root:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Confirm that `apps/extension/dist` contains `manifest.json`, `background.js`, `content.js`, `sidepanel.html`, the generated assets, and the four icon sizes. Load `apps/extension/dist` as an unpacked extension from `chrome://extensions` and manually verify:

- the Side Panel opens;
- Backend Down, Slow Network, Offline, and Bad Data can be activated;
- the selected tab is affected and another tab is not;
- stopping a scenario restores normal requests;
- invalid, non-JSON, and unreadable response bodies pass through unchanged;
- endpoint, GraphQL operation, and JSON field discovery works after browsing a test page.
- scenario activation and deactivation update the selected tab;
- error monitoring and recorder sessions stay on one selected tab.
- a request timeout ends with a network failure after the configured interval;
- findings filters, notes, screenshot capture, Markdown export, and print-to-PDF work locally.

## Prepare the source release

The repository currently starts without Git history. Create the first history as focused commits. The intended order is:

1. `chore: establish FaultLab MVP baseline` - workspace configuration, packages, extension shell, and initial documentation;
2. `feat(core): add JSON response mutation rules` - browser-independent mutation types, validation, matching, and transformations;
3. `feat(extension): intercept and mutate JSON responses` - debugger adapter and response-stage handling;
4. `feat(extension): add configurable built-in presets` - runtime messages, validation, persistence, reset, and Side Panel editor;
5. `feat(extension): discover request data` - endpoints, GraphQL operations, JSON paths, and selectors;
6. `docs: document the 0.1.0 release` - release scope, architecture corrections, roadmap, and this guide;
7. `chore(release): prepare v0.1.0` - final manifest and release metadata.

Because the starting files are all untracked, these commits describe the current file groups rather than reconstructing the exact historical order in which features were implemented. Do not commit generated `dist` output unless the project later adopts that policy.

Stage each group with explicit paths, review it, and commit it:

```bash
git add .gitignore .vscode package.json pnpm-workspace.yaml pnpm-lock.yaml \
  AGENTS.md apps/extension/package.json apps/extension/tsconfig.json \
  apps/extension/vite.config.ts packages/core/package.json \
  packages/core/tsconfig.json

git diff --cached --check
git commit -m "chore: establish FaultLab MVP baseline"
```

For the remaining groups, use `git add` with the relevant paths, then run `git diff --cached --check` and `git commit -m "..."` before moving to the next group. Review the complete history with:

```bash
git log --oneline --decorate
```

Create and publish the `0.2.0` release tag only after the final validation:

```bash
git tag -a v0.2.0 -m "FaultLab 0.2.0"
git push origin master
git push origin v0.2.0
```

If the default branch is not `master`, replace it with the actual branch name.

## Build the upload ZIP

The ZIP must contain `manifest.json` at its root, not inside a `dist` directory:

```bash
rm -f faultlab-0.2.0.zip
(cd apps/extension/dist && zip -r ../../../faultlab-0.2.0.zip .)
unzip -l faultlab-0.2.0.zip
```

Check the archive manually and upload `faultlab-0.2.0.zip`. Keep the ZIP outside `apps/extension/dist` so it cannot be included in a later build accidentally.

## Publish on GitHub

1. Push the branch and tag.
2. Open the repository's Releases page.
3. Create a release from tag `v0.2.0`.
4. Use `FaultLab 0.2.0` as the title.
5. Attach `faultlab-0.2.0.zip` and use [CHANGELOG.md](../CHANGELOG.md) for the included capabilities and known limitations.
6. Mark it as the first public release when the source and package are ready.

## Publish on the Chrome Web Store

1. Register for a Chrome Web Store developer account and complete the one-time registration payment, if required by Google.
2. Create a new item in the Developer Dashboard.
3. Upload `faultlab-0.2.0.zip`.
4. Complete the store listing: name, short description, detailed description, category, language, screenshots, and promotional images where required. Use `apps/extension/public/icons/icon-128.png` as the extension icon and prepare the additional store artwork required by the dashboard from the same FaultLab branding.
5. Explain the `activeTab`, `debugger`, `storage`, `sidePanel`, and `tabs` permissions in the privacy practices and permission justification fields. `activeTab` is used to capture a screenshot after the user invokes FaultLab; it avoids requesting `<all_urls>`. State that runtime state is stored locally and that FaultLab does not require a backend.
6. Provide a privacy policy URL if the dashboard requires one. The policy must match the actual data behavior of the extension.
7. Check the listing preview, submit for review, and record the submitted version and review status.

Do not claim that FaultLab never observes request data: the extension reads matched response bodies locally when JSON mutation is active. Do state that the data is processed locally and is not sent to a FaultLab service.

## Future updates

For every update:

1. Decide whether the change is a patch or a minor feature release.
2. Update the version in the root `package.json`, `apps/extension/package.json`, `packages/core/package.json`, and `apps/extension/manifest.json`.
3. Update the current status and release notes in `README.md` and this guide.
4. Run `pnpm test`, `pnpm typecheck`, `pnpm build`, and `git diff --check`.
5. Build a ZIP with the new version in its filename.
6. Commit the change, create an annotated tag such as `v0.1.1` or `v0.2.0`, and push both.
7. Upload the new ZIP as a new Chrome Web Store submission and update the GitHub release.

Keep the manifest version and package versions aligned. Chrome extension versions must use one to four dot-separated numeric components and must increase for every Web Store upload.
