# Agent Note: DeepSeek Harness VS Code Extension and VSIX Artifact Pipeline

Status: implemented

English | [中文](2026-09-15-vscode-extension-and-vsix-artifact-pipeline.zh.md)

## Problem

Users want to run DeepSeek Harness directly within VS Code and compatible editors (e.g. Antigravity IDE) as an integrated sidebar chat experience without requiring an external browser window. The extension needs to handle local authentication cookies transparently, avoid cross-site trust errors (such as HTTP 403 on directory picker), provide a robust hybrid installation flow when `dsh` is missing, and build/distribute `.vsix` packages via CI.

## Decision

1. **Embedded Webview with Loopback Proxy**: Embedded DeepSeek Harness Web GUI inside a dedicated `WebviewView` in the sidebar and an optional Editor Tab panel. Implemented a local loopback reverse proxy (`apps/vscode/src/dshManager.ts`) that extracts authentication cookies, injects them on all iframe requests, and normalizes security headers (`Origin`, `sec-fetch-site`, `Referer`) to satisfy `api-request-trust.ts`.
2. **Hybrid Installation UX**: If `dsh` is not found on PATH or in standard Node directories, the sidebar renders an interactive installation card offering automatic one-click installation (with fallback to extension storage when sudo is unavailable) and a copyable command `npm install -g @deepseek-ai/dsh`.
3. **Packaging & CI Pipeline**: Added `apps/vscode/scripts/build.mjs` and `package.mjs` using `@vscode/vsce`. Added `package:vscode` to root `package.json` and a `build-vscode-vsix` job to `.github/workflows/desktop-artifacts.yml` to automatically package and upload the VSIX artifact on GitHub Actions.

## Alternatives considered

**Embedding raw localhost URL directly in Webview.** Directly rendering the iframe without proxy causes cookie dropping (`SameSite=Strict`) in `vscode-webview://` context, resulting in HTTP 401 authentication errors.

**Re-implementing a bespoke chat protocol.** Rewriting the chat UI inside the extension duplicates large parts of the web app and fails to reflect tools, subagents, and extensions provided by the Cordis harness engine.

## Consequences

The VS Code extension runs seamlessly in both left and right sidebars. The VSIX package (`deepseek-harness-vscode-0.1.0.vsix`) can be built locally with `pnpm run package:vscode` and is automatically generated and archived in GitHub Actions workflows alongside Linux AppImage and Windows EXE installers.
