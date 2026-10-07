# npm release procedure

## Current safety state

Publication is disabled unless the GitHub repository variable `NPM_RELEASE_ENABLED` is exactly `true`. Keep it absent or `false` outside an explicitly authorized release. Neither CI nor `release:prepare` publishes or submits stages. The coordinated 4.0.0 release is public, its six Git tags are finalized, and `NPM_RELEASE_ENABLED` is restored to `false`. See the [completed release verification](RELEASE-4.0.0.md#release-verification).

This procedure uses staged publishing, not direct publishing. GitHub only submits artifacts; a maintainer approves them on npm with 2FA. Git tags are created in a separate workflow after all selected versions are public and their integrity has been verified.

## One-time setup

1. In GitHub **Settings → Environments**, create `npm-release` and configure required reviewers. Protect deployments so only `main` is eligible. The approval controls submission to npm staging, not final publication.
2. In **Settings → Secrets and variables → Actions → Variables**, keep `NPM_RELEASE_ENABLED=false` until an explicitly authorized release.
3. On each npm package (`autk-core`, `autk-map`, `autk-db`, `autk-plot`, `autk-compute`, `autk`), configure a Trusted Publisher:
   - Owner: `urban-toolkit`
   - Repository: `autark`
   - Workflow filename: `publish.yml`
   - Environment: `npm-release`
   - Direct publishing: disabled
   - Manage dist-tags: disabled
   - Staged publishing: allowed by npm
4. Enable 2FA on the maintainer's npm account. Prefer package publishing access that requires 2FA and disallows tokens. Workflows do not use `NPM_TOKEN`; after the first successful OIDC release, remove unused token secrets and revoke obsolete tokens.
5. Configure Trusted Publishers close to the release. New configurations expire if not validated within two days; recreate expired configurations rather than publishing prematurely.

CI and release workflows pin Node 22.23.3 and npm 11.15.0. The root tooling override pins `shell-quote` to 1.12.0 to avoid known command-injection advisories in `concurrently`'s bundled dependency. Staged publishing requires npm >=11.15.0 and Node >=22.14.0. The separate tag workflow has no npm OIDC publishing permission.

Official references: [Trusted Publishers](https://docs.npmjs.com/trusted-publishers), [staged publishing](https://docs.npmjs.com/staged-publishing), [npm stage](https://docs.npmjs.com/cli/v11/commands/npm-stage).

## Prepare a release (local, no npm mutation)

Only after integrating the agreed PRs and approving the release contents. Choose a version greater than the current one; the following example prepares a patch release after 4.0.0:

```bash
npm ci
npm run release:prepare -- 4.0.1
make verify
npm run pack:packages
npm run test:packages
npm run test:webgpu --workspace=@urban-toolkit/autk-compute
```

`release:prepare` raises all six versions together, updates internal references in libraries/gallery/usecases, and refreshes the root lockfile without running install scripts. It does not create Git tags, commits, pushes, stages or public versions.

Review the generated manifest/lockfile changes and write migration notes for the new version; [4.0.0](RELEASE-4.0.0.md) is a completed example. Visually inspect the gallery: smaller generic points/lines, harmonious colors, typed OSM tag sets and runtime polygon border toggles. Hardware WebGPU checks remain local; CI validates shader generation and runs the complete Vitest suite.

Commit and push only when authorized, using a message such as `chore(release): prepare 4.0.1`. Enable `NPM_RELEASE_ENABLED=true` immediately before the authorized release push. Do not merge another version bump while this release is pending.

## CI and staging

1. The release commit's main-push CI must succeed. CI builds, validates, packs and tests the actual six `.tgz` files in a temporary consumer outside the repository. Types are checked without `skipLibCheck`; Node imports and a browser bundle are checked without source aliases.
2. CI uploads `npm-packages-<run-id>-<attempt>` with a manifest identifying the exact commit and CI attempt. Artifacts are retained for 90 days. Preserve a copy for longer-term recovery if needed.
3. `Publish to npm` ignores failed runs, PRs/forks, non-main pushes and commits with unchanged package versions. A release must increase all six packages to the same version; partial or divergent version bumps are rejected. When releases are disabled, it does nothing.
4. The candidate job validates the originating run through the GitHub API. The staging job waits for approval of `npm-release`, checks out the tested SHA and downloads only that CI attempt's artifact.
5. Before any staging call, the script verifies all tarball hashes and packed manifests, published versions and remote tags. Registry/network/authentication failures abort; they are not interpreted as missing versions.
6. The script submits selected packages in order: core → map → db → plot → compute → umbrella. It sets the npm subprocess's provenance source SHA to the tested commit, since a `workflow_run` execution's default SHA may refer to a newer main commit. It uses `npm stage publish <tarball> --access=public --tag=latest --provenance --ignore-scripts`. It never approves a stage or publishes directly.

The workflow shares a non-cancelling concurrency group with finalization. It rejects versions behind registry `latest`, integrity mismatches and conflicting tags. GitHub concurrency does not guarantee FIFO ordering; registry checks are still necessary. Do not cancel an in-progress release or rerun its CI attempt after staging, since recovery must use the original artifacts.

## Review and approve on npm

On npmjs.com, review the **Staged Packages** tab for all selected packages. Confirm versions, contents, intended `latest` tag, provenance and commit. You may download each stage for comparison with the CI tarball. Approve with 2FA in dependency order, leaving the umbrella package last.

Alternatively, from a maintainer's authenticated machine with npm >=11.15.0:

```bash
npm stage list @urban-toolkit/autk-core
npm stage view <stage-id>
npm stage download <stage-id>
npm stage approve <stage-id>
```

Repeat for the other packages. OIDC is not a substitute for maintainer approval and cannot list/view/approve pending stages. `npm whoami` or a workflow that skips already-public versions does not validate OIDC staging authorization.

These six approvals are not atomic. Some versions may become public before others; do not announce the release until every selected package is approved.

## Finalize Git tags

After all selected versions are public:

1. Run **Actions → Finalize npm release → Run workflow** on `main`.
2. Enter the original successful main-push CI run ID from the release commit (the numeric ID in its Actions URL), not the staging workflow ID.
3. Approve the `npm-release` environment again.
4. The workflow retrieves the original artifacts and verifies that each public version has identical integrity and is the expected `latest`. Only then does it create missing `${package-name}@${version}` tags pointing to the tested commit, using one atomic Git push. Matching existing tags are left intact; conflicts fail.
5. Inspect both workflow summaries and verify a clean external installation of the released umbrella version (for example, `npm install @urban-toolkit/autk@4.0.1`), package versions, dist-tags and provenance.
6. Set `NPM_RELEASE_ENABLED=false` again.

Finalization never stages, approves or republishes npm packages. Creating a GitHub Release with the migration notes is optional and separate.

## Recovery

- **Registry/network/authentication error before staging:** resolve the error and rerun the original staging workflow; no tags have been created.
- **Partially staged release:** inspect stages on npm. Approve existing stages only after verifying their contents/integrity; rerun the original staging workflow. Public versions with matching integrity are skipped. Pending stages cannot be silently skipped because OIDC cannot inspect them. A stage/version conflict aborts with instructions to inspect and approve or reject with 2FA.
- **Wrong staged contents or tag:** reject the stage with npm 2FA before submitting the corrected stage. Never approve unknown contents. Changed artifacts require a new tested release candidate, not an unchecked local substitution.
- **Partially approved release:** approve the remaining stages. Finalization refuses to create any new tags until all selected packages are public and intact.
- **Git push failure:** rerun finalization with the same original CI ID. The tag push is atomic and existing matching tags are verified.
- **Different registry integrity or conflicting remote tag:** stop and investigate. The workflow never overwrites a published version, moves a tag or treats a conflict as success.
- **Expired CI artifacts:** restore the original verified artifacts through an explicitly reviewed recovery process. Do not substitute a new build silently. Artifact retention is not a permanent release archive.

A public npm version is immutable. There is no destructive rollback automation and no automatic unpublish. Repair a published regression with a new reviewed version.
