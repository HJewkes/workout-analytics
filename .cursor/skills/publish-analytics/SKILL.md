---
name: publish-analytics
description: Review, version, and publish the @voltras/workout-analytics library to npm. Use when the user wants to push, publish, release, or version the workout-analytics package, or asks to prepare a release, cut a new version, or ship the library.
---

# Workout Analytics Publish

End-to-end workflow for reviewing, versioning, and publishing the `@voltras/workout-analytics` package.

## Prerequisites

- The library lives at `workout-analytics/`.
- Release is triggered by pushing a `v*` tag — the GitHub Actions `release.yml` workflow handles npm publish.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `refactor:`, etc.).
- Changelog follows [Keep a Changelog](https://keepachangelog.com/) format.
- Build uses `tsc` + `tsc-alias` to compile ESM/CJS with `@/` path aliases rewritten to relative paths.

## Workflow

Copy this checklist and track progress with the TodoWrite tool:

```
- [ ] Step 1: Code review
- [ ] Step 2: Run tests and linters locally
- [ ] Step 3: Version bump, changelog, commit, and PR
- [ ] Step 4: Monitor CI
- [ ] Step 5: Merge PR
- [ ] Step 6: Tag and trigger npm publish
```

---

### Step 1: Code Review

Review all local changes for correctness, quality, and risk.

```bash
cd workout-analytics
git diff            # unstaged
git diff --cached   # staged
git status
```

For each changed file, evaluate:

- **Correctness**: Does the logic do what it claims? Edge cases handled?
- **Types**: Are TypeScript types accurate and not using `any` escapes?
- **API surface**: Do public exports change? Is it backward-compatible?
- **Tests**: Are new behaviors tested? Were existing tests updated?
- **Immutability**: Do new functions preserve immutable data flow (no mutation of Phase/Rep/Set)?

Flag issues to the user using severity levels:
- **CRITICAL** — Must fix before release (bugs, type errors, breaking changes)
- **WARNING** — Should fix (code smells, missing tests, unclear naming)
- **NOTE** — Optional improvements

If there are critical issues, stop and ask the user to resolve them before continuing.

---

### Step 2: Run Tests and Linters Locally

Run the full CI suite before pushing:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run build
```

After build, verify `@/` aliases are fully resolved in compiled output:

```bash
rg "@/" dist/ --glob "*.js" -l
rg "@/" dist/ --glob "*.d.ts" -l
```

Both should return no results. If `@/` paths remain, `tsc-alias` is not running correctly.

All checks must pass. If any fail, report the errors and fix them (or ask the user).

---

### Step 3: Version Bump, Changelog, Commit, and PR

**3a. Determine version bump**

Ask the user what kind of release this is, or infer from the changes:
- `patch` — bug fixes, dependency bumps, non-functional changes
- `minor` — new features, new exports, non-breaking additions
- `major` — breaking API changes

**3b. Update `package.json` version**

Bump the `version` field in `package.json`. Current version can be read with:

```bash
node -p "require('./package.json').version"
```

**3c. Update `CHANGELOG.md`**

Move items from `[Unreleased]` to a new version section. Follow the existing format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features

### Changed
- Modifications to existing features

### Fixed
- Bug fixes
```

Write a thorough changelog entry based on the actual diff — not just commit messages. Group by Added/Changed/Fixed/Removed as appropriate.

**3d. Create release branch and commit**

```bash
git checkout -b release/vX.Y.Z
git add package.json CHANGELOG.md
# Include any other files that are part of this release
git add <changed files>
git commit -m "chore: release vX.Y.Z

<2-3 sentence summary of what's in this release>"
```

**3e. Push and create PR**

```bash
git push -u origin release/vX.Y.Z
```

Create PR with `gh pr create`. Use the PR template format:

```
## Summary
Release vX.Y.Z — <brief description>

## Changes
- <key changes from changelog>

## Test Plan
- All CI checks pass (lint, typecheck, test, build, gitleaks, security audit)
- Verified locally: `npm run lint && npm run typecheck && npm run test && npm run build`
- Verified @/ aliases resolved in dist/

## Breaking Changes
<any breaking changes, or "None">
```

---

### Step 4: Monitor CI

Wait for CI to complete on the PR. The CI pipeline runs these jobs:
- `gitleaks` — secret scanning
- `security-audit` — npm audit
- `lint` — eslint + prettier + typecheck
- `test` — vitest with coverage
- `build` — ESM + CJS + types verification
- `node-matrix` — Node 20 + 22 compatibility

```bash
gh pr checks <PR-number> --watch
```

If any check fails, investigate, fix locally, amend or add a commit, and push again.

**Do not proceed until all checks are green.**

---

### Step 5: Merge PR

Once all checks pass, merge the PR:

```bash
gh pr merge <PR-number> --squash --delete-branch
```

Use `--squash` to keep main history clean. The squash message should be the release commit message.

Then update local main:

```bash
git checkout main
git pull origin main
```

---

### Step 6: Tag and Trigger npm Publish

Create and push the version tag. This triggers the `release.yml` workflow which:
1. Validates (lint, format check, typecheck, test, build)
2. Verifies the tag matches `package.json` version
3. Publishes to npm with provenance
4. Creates a GitHub Release with auto-generated notes

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Monitor the release workflow:

```bash
gh run list --workflow=release.yml --limit=1
gh run watch <run-id>
```

Verify the publish succeeded:

```bash
npm view @voltras/workout-analytics version
```

Report the final published version and GitHub Release URL to the user.
