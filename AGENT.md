# start-ai-cli

## 项目背景

`start-ai-cli` 是一个面向 Windows 的 Node.js 命令行工具，用于在当前目录下同时打开 Codex CLI、Claude Code 和 Cursor CLI，方便在同一个项目上下文中启动多个 AI 编程助手。

## 目录结构

- `bin/start-ai-cli.js`：CLI 入口文件，负责解析参数并调用 Windows Terminal。
- `test/`：基于 `node --test` 的测试用例。
- `README.md`：面向用户的安装、使用和发布说明。
- `package.json`：npm 包信息、命令入口和开发脚本。

## 用法

全局安装后，在目标项目目录运行：

```bash
start-ai-cli
```

本地开发时可在仓库根目录运行：

```bash
npm link
npm test
npm run pack:dry-run
```

运行要求：Windows、Node.js 18+、Windows Terminal，以及可用的 `codex`、`claude`、`agent` 命令。
