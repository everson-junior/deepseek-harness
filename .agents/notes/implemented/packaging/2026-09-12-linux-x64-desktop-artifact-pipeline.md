# Linux x64 Desktop Artifact Packaging and GitHub Actions Pipeline

Added `linux-x64` target support to `@deepseek-ai/dsh-desktop` packaging scripts and created `.github/workflows/desktop-artifacts.yml` for automated GitHub Actions builds of Linux AppImage and Windows x64 executables.

## Motivation

Users running Ubuntu / Linux require AppImage binaries (`.AppImage`) generated alongside existing macOS (`mac-x64`, `mac-arm64`) and Windows (`win-x64`) targets. Automated CI execution via GitHub Actions generates both Linux AppImage and Windows `.exe` installer artifacts on `workflow_dispatch` or push to release tags.

## Technical Details

- **Target addition**: Added `linux-x64` target to `SUPPORTED_TARGETS` in `desktop-build-paths.mjs`, `package-target.ts`, `desktop-auto-update-environment.mjs`, and `desktop-upload-plan.ts`.
- **Electron Builder configuration**: Set `executableName: 'deepseek-harness'` in `electron-builder.config.mjs` to replace auto-inferred scoped package names (`@deepseek-aidsh-desktop`) containing invalid filename characters on Linux.
- **Workflow**: Added `.github/workflows/desktop-artifacts.yml` executing `package:desktop:linux:x64` on `ubuntu-24.04` and `package:desktop:win:x64:unsigned` on `windows-latest`.
