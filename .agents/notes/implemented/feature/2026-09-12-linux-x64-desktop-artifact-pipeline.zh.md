# Agent Note: Linux x64 桌面端构建与 GitHub Actions 流水线

Status: implemented

[English](2026-09-12-linux-x64-desktop-artifact-pipeline.md) | 中文

## Problem

运行 Linux (Ubuntu) 的用户需要与现有的 macOS (`mac-x64`, `mac-arm64`) 和 Windows (`win-x64`) 桌面发布目标一起生成的 AppImage 二进制文件 (`.AppImage`)。此外，还需要在 `push` 或 `workflow_dispatch` 时通过 GitHub Actions 自动生成 Linux `.AppImage` 和 Windows `.exe` 安装包。

## Decision

在 `@deepseek-ai/dsh-desktop` 打包脚本 (`desktop-build-paths.mjs`、`package-target.ts`、`desktop-auto-update-environment.mjs`、`desktop-upload-plan.ts`) 的目标定义中添加 `linux-x64`。在 `electron-builder.config.mjs` 中配置 `executableName: 'deepseek-harness'`，以在 Linux 打包期间替换无效的带作用域包名 (`@deepseek-aidsh-desktop`)。添加 `.github/workflows/desktop-artifacts.yml`，在 `ubuntu-24.04` (包含 `libfuse2t64` / `squashfs-tools` 依赖) 上执行 `package:desktop:linux:x64`，并在 `windows-latest` 上执行 `package:desktop:win:x64:unsigned`。

## Alternatives considered

**手动编写 AppImage 提取脚本。** 手动编写脚本需要维护 AppImageKit 二进制文件和手动桌面集成文件，而不是利用 electron-builder 的原生 AppImage 目标。

**在 Linux 上使用 Wine 构建 Windows 二进制文件。** 在 Linux 上交叉编译 Windows NSIS 安装包需要 Wine 和自定义工具，而 `windows-latest` runner 可以原生编译和测试 Windows 二进制文件。

## Consequences

AppImage 产物与 Windows 可执行文件可以通过 `pnpm run package:desktop:linux:x64` 在本地构建，并在每次 push 到 master 时在 GitHub Actions 中自动构建。桌面包目标管理的所有单元测试继续通过。
