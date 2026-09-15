# Agent Note: Linux x64 Desktop Artifact Packaging and GitHub Actions Pipeline

Status: implemented

English | [中文](2026-09-12-linux-x64-desktop-artifact-pipeline.zh.md)

## Problem

Users running Linux (Ubuntu) require AppImage binaries (`.AppImage`) generated alongside existing macOS (`mac-x64`, `mac-arm64`) and Windows (`win-x64`) desktop release targets. Additionally, automated GitHub Actions execution is needed to generate both Linux `.AppImage` and Windows `.exe` installers on `push` or `workflow_dispatch`.

## Decision

Add `linux-x64` to target definitions in `@deepseek-ai/dsh-desktop` packaging scripts (`desktop-build-paths.mjs`, `package-target.ts`, `desktop-auto-update-environment.mjs`, `desktop-upload-plan.ts`). Configure `executableName: 'deepseek-harness'` in `electron-builder.config.mjs` to replace invalid scoped package names (`@deepseek-aidsh-desktop`) during Linux packaging. Add `.github/workflows/desktop-artifacts.yml` executing `package:desktop:linux:x64` on `ubuntu-24.04` (with `libfuse2t64` / `squashfs-tools` dependencies) and `package:desktop:win:x64:unsigned` on `windows-latest`.

## Alternatives considered

**Hand-crafting AppImage extraction scripts.** Hand-crafted scripts require maintaining AppImageKit binaries and manual desktop integration files rather than leveraging electron-builder's native AppImage target.

**Building Windows binaries on Linux using Wine.** Cross-compiling Windows NSIS installers on Linux requires Wine and custom tooling, whereas `windows-latest` runners compile and test Windows binaries natively.

## Consequences

AppImage artifacts and Windows executables can be built locally via `pnpm run package:desktop:linux:x64` and automatically in GitHub Actions on every push to master. All unit tests for desktop package target management continue to pass.
