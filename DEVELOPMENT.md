# Developing Vandal

Vandal is a Tauri 2 app: a Rust core (`src-tauri/`) for capture, hotkeys, the tray, settings
and image output, and a React + TypeScript UI (`src/`, built with Vite) for the overlay,
editor and Settings windows.

[`CLAUDE.md`](CLAUDE.md) has the working conventions (commands, IPC, settings, checks).

## Prerequisites

- Windows 10 1903+ or Windows 11, x64. Build and run natively, not in WSL: capture, overlays and
  hotkeys need the real desktop.
- Rust stable (`x86_64-pc-windows-msvc`) and Visual Studio Build Tools with the "Desktop
  development with C++" workload.
- Node LTS and npm 11.12 or later (for `.npmrc`'s `min-release-age` and `allow-git`). Run Node
  tooling from PowerShell. On this machine, Git Bash puts an old Node 16 first on PATH.
- `cargo-deny`, for `npm run security`: `cargo install --locked cargo-deny` (a couple of
  minutes, once).
- Ideally two monitors with different scaling, one to the left of or above the primary, so
  negative coordinates get exercised.

## Run

```powershell
npm install
npm run tauri:dev
```

The dev build has its own identity (`Vandal Dev`, `com.vandal.desktop.dev`) and Ctrl-prefixed
shortcuts (`Ctrl+Win+F12` region, `Ctrl+Win+Shift+F12` full screen), so it runs alongside an
installed copy. Its settings live in `%APPDATA%\com.vandal.desktop.dev\`.

## Checks

Run all of these before calling a change done:

```powershell
cd src-tauri; cargo fmt; cargo clippy --all-targets -- -D warnings; cargo test; cd ..
npm run lint; npm test; npx tsc --noEmit
npm run ext:build   # if extension/ changed: type-checks and builds the browser extension
npm run security    # known advisories (npm audit, cargo deny); a few seconds
```

## Dependencies

Every package we add can run code on our machines, in CI and in users' hands, so new ones get
checked before they're used. `.npmrc` and `src-tauri/deny.toml` enforce part of this; the
**Security** workflow (`.github/workflows/security.yml`) runs `npm run security`'s checks on every
push to `main`, every pull request, weekly, and before every release build.

**Before adding or upgrading a package** (npm or cargo):

- **Check it while planning the feature, not after building it.** A package that fails here
  means choosing another before any code depends on it.
- **Advisories:** search the [GitHub Advisory Database](https://github.com/advisories) and, for
  crates, [RustSec](https://rustsec.org/advisories/).
- **Maintenance and owner:** recent releases, an active repository, and the same owner as before.
  A package that changed hands recently is a reason to wait or look elsewhere.
- **Prefer what we already have.** Many Windows features only need another feature flag on the
  `windows` crate, not a new crate.
- **Age:** don't take a version published in the last 7 days. npm enforces this
  (`min-release-age`): ranges and `@latest` quietly pick the newest version that's a week old.
  **If `npm install pkg@<exact version>` hangs, the version is probably too new**: npm 11.12 loops
  instead of failing. Wait, or, if the fix is needed now, add `--min-release-age=0` to that one
  command and say why in the commit.
- **Review the lockfile diff** (`package-lock.json`, `src-tauri/Cargo.lock`): new transitive
  packages, git or non-registry sources, install scripts (`"hasInstallScript": true`).
- **Note the check in the commit message**, next to why we need the package.

`.npmrc` also turns off install scripts (`ignore-scripts`; no dependency needs one) and git
dependencies (`allow-git=none`). If a package ever needs its install script, that's a decision
to record, not a reason to turn the setting off.

**When the Security workflow fails** with nothing changed on our side, a new advisory has been
published against something we use. Upgrade it (once the fix is a week old), or, if it doesn't
apply to Vandal, add it to `ignore` in `src-tauri/deny.toml` with the reason. Yanked crates only
warn: run `cargo update -p <crate>` once the replacement is a week old.

Dependabot bumps the workflows' pinned action SHAs weekly and, with security updates on, opens
PRs for vulnerable npm and cargo packages. Review them like any other dependency change.

## Browser extension

`extension/chrome/` is Vandal Screen Capture, a Manifest V3 extension that also runs in Edge and Brave. It
shares the root's tooling: `npm run lint` and `npm test` cover it, and it uses Vandal's theme
tokens from `src/shared/theme.css`.

```powershell
npm run ext:build   # builds extension/chrome/dist
npm run ext:dev     # rebuilds on every change
npm run ext:zip     # builds, then zips it for loading unpacked (vandal-for-chrome-<version>.zip)
npm run ext:zip -- --release    # the same without the manifest's key, for the Chrome Web Store
npm run ext:host-dev            # lets the extension reach the dev build (Open in Vandal)
npm run ext:host-dev -- --remove
```

Open in Vandal uses native messaging: the browser starts `vandal.exe` as a host, which hands the
capture to the running app. The installer registers `com.vandal.desktop`; `ext:host-dev`
registers `com.vandal.desktop.dev`, which only hands over to a running `tauri:dev` (a dev build
loads its UI from the Vite server). Start `tauri:dev` from a normal terminal: Windows drops the
handoff to an elevated app.

To load it, open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, click
**Load unpacked** and pick `extension/chrome/dist`. After a rebuild, click the extension's reload
button there and reopen the popup. The manifest's `key` keeps the extension ID the same
everywhere (`bmloooliddgohojbpadiljacckgdbngm`); Vandal's native messaging host will only accept
that ID.

## Build an installer

```powershell
npm run build:local
```

This builds a release installer with a build number. It lands in
`src-tauri/target/release/bundle/nsis/`, for example `Vandal_0.3.0-beta.3+5_x64-setup.exe`.
Settings › About shows the same version and the commit it was built from, for example
`0.3.0-beta.3+5 (2cf53f9)`. For just the release exe (`src-tauri/target/release/vandal.exe`),
without an installer, use `npm run build:local -- --no-bundle`. Other arguments are passed on to
`tauri build` too.

How the build number works:

- **`+5` is the number of commits since the last release tag** (`v0.3.0-beta.3`), taken from
  `git describe`. Every new commit gives the next build a higher number. Nothing in the repo
  changes, so there's nothing to commit.
- **Build exactly on a tag and you get the plain version** (`0.3.0-beta.3`), the same as the
  CI release.
- **Uncommitted changes** don't change the number, but About adds "modified" and the script
  warns. Commit first if you want the build to be traceable.
- **Build after `release:bump` but before tagging** and you get the new version without a build
  number. That build is the release candidate.
- **The updater never offers a build its own release.** `0.3.0-beta.3+5` is still offered
  `beta.4`, and never "updated" back to `beta.3` (the updater sorts `+5` above the plain version).
- **The build number must be digits only.** Windows file versions are numeric, so NSIS writes
  the number into the exe's file version (`0.3.0.5`) and would replace anything else with `0`.

Build-numbered installers are for your own machine. A build that goes to anyone else should be
a release (below), so it has a tag and release notes.

Local installers have no updater signature (`.sig`): only CI has the updater's private key
(see Releasing › The updater key), and `build:local` turns the signature off when
`TAURI_SIGNING_PRIVATE_KEY` isn't set. A plain `npm run tauri build` builds the version in
`package.json` with no build number, like CI does, but without the key it fails after bundling
("A public key has been found, but no private key"). Use `build:local`, or add
`--config '{"bundle":{"createUpdaterArtifacts":false}}'`. `--no-bundle` builds aren't affected.

## Releasing

`package.json` holds the version, which `tauri.conf.json` reads. `src-tauri/Cargo.toml` and
both lockfiles must match it. Versions follow semver and stay at 0.x for now. Builds for
testers are prereleases of the next version (`0.3.0-beta.1`, `0.3.0-beta.2`...), which sort
before the release itself (`0.3.0`). Every release must have a new, higher number:

- **Tester build during a phase:** the next beta (`0.3.0-beta.4`).
- **Phase done:** the final version (`0.3.0`). Each phase raises the minor version, and the
  going-public release is `1.0.0`.
- **Fix to a final release:** the next patch (`0.3.1`). Don't use a patch number for in-between
  builds: `0.3.1` sorts after `0.3.0`, so it would claim the phase is done and outrank every
  later beta. Local builds get a build number instead (see Build an installer).
- **After 1.0:** major if something users rely on breaks (settings that can't migrate, a
  feature removed, a Windows version dropped), minor for new features, patch for fixes only.
- **Never reuse a version, or move or delete a published tag.** If a published release is
  broken, release the next number. A tag whose release is still a draft can be moved (below).
- **Keep the dot in `beta.10`.** It then sorts as a number, after `beta.9`. Without the dot,
  `beta10` sorts as text, before `beta9`.

1. As you work, add changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. Before bumping, check security:
   - `npm run security` passes (the release workflow runs it too and won't build if it fails).
   - Tauri's [security advisories](https://github.com/tauri-apps/tauri/security/advisories)
     have nothing new for Tauri or the plugins we use. Plugins we don't use (the updater, HTTP)
     don't matter until we add them, and then they need a check.
3. Bump the version:

   ```powershell
   npm run release:bump -- 0.3.0-beta.2
   ```

   This sets the version in all four files. It also turns `[Unreleased]` into a dated
   `[0.3.0-beta.2]` section and updates the compare links. It refuses a version that isn't
   higher than the current one (the updater only offers higher versions), and it refuses an
   empty `[Unreleased]`.

4. Commit, tag and push. The bump prints the exact commands:

   ```powershell
   git commit -am "Release v0.3.0-beta.2"
   git tag -a v0.3.0-beta.2 -m "Vandal 0.3.0-beta.2"
   git push origin main v0.3.0-beta.2
   ```

5. The tag starts the **Release** workflow (`.github/workflows/release.yml`). It runs the
   Security checks first, then checks that the tag matches the version files and has
   CHANGELOG notes, and runs the full checks. Then it builds the installer, attests its build provenance (signed by GitHub, checked with
   `gh attestation verify`), and creates a **draft** release with the installer, its
   updater signature (`…-setup.exe.sig`), `SHA256SUMS.txt` and that version's CHANGELOG section. Tags with a `-` are marked as
   prereleases.
6. Download the installer from the draft, install it over the previous version and smoke-test
   it. Check `gh attestation verify <installer> --repo rpodsada/vandal` passes and that its
   SHA-256 (`Get-FileHash`) matches the draft's `SHA256SUMS.txt`, and put
   it on the website's download dialog, which is hosted apart from GitHub, so a swapped
   installer can't come with a matching hash. Then press **Publish release** on GitHub.
7. Publishing starts the **Publish updates** workflow (`.github/workflows/publish-updates.yml`).
   It checks the installer's updater signature against the public key and writes the channel
   manifests to the `update-manifests` branch: `beta.json` gets every release, `stable.json`
   only final ones. Installed copies read them from
   `https://raw.githubusercontent.com/rpodsada/vandal/update-manifests/<channel>.json` (cached for
   up to 5 minutes). Check the run is green and the manifest shows the new version.

**Pulling a bad release:** turn it back into a draft on GitHub (or delete it), then run
**Actions › Publish updates › Run workflow**. A manual run sets each channel to the highest
published, signed release, even if that's lower; a publish only ever moves a channel up. Copies
that already installed the bad release keep it (the updater never goes down a version), so
the fix is the next release.

If the workflow fails, fix the problem on `main`, then move the tag and push it again:
`git tag -f -a v… -m "…"` and `git push -f origin v…`. A re-run replaces the files on an
existing draft.

To test the pipeline without releasing, run the workflow by hand (**Actions › Release › Run
workflow**). It runs the same checks and build, and keeps the installer as a workflow artifact
for 14 days. Manual runs sign for the updater too, so they prove the key still works.

### The updater key

Updates are signed with Tauri's updater key (minisign, not Windows code signing), and every
installed copy only accepts updates signed with it. The public key is in `tauri.conf.json`
(`plugins.updater.pubkey`, key ID `7EF3D52E75FC25DB`). The private key and its password are
in Richard's password manager and in the `release` environment's secrets
(`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`), which only `v*` tags and
`main` can use. The workflow gives them to the installer build step only, and that step reuses
the `dist/` built earlier instead of running Vite again, so no npm script or bundler has the key
in its environment. Never put the key in the repo or a `VITE_` variable.

- **If the key is lost,** installed copies can never update again: users must install a build
  with a new key by hand.
- **If the key leaks,** rotate it: generate a new one (`npx tauri signer generate`) and ship a
  release that carries the new public key but is still signed with the old key, so installed
  copies accept it; sign everything after that with the new key. A leaked key alone can't push
  an update: the manifests and installers also come from this repo.
