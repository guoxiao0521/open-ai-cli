# start-ai-cli

## 项目背景

`start-ai-cli` 是一个面向 Windows 和 macOS 的 Node.js 命令行工具，用于在当前目录下同时打开 Codex CLI、Claude Code 和 Cursor CLI，方便在同一个项目上下文中启动多个 AI 编程助手。

## 目录结构

- `bin/start-ai-cli.js`：CLI 入口文件，负责解析参数并调用平台终端。
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

运行要求：Windows 或 macOS、Node.js 18+、平台终端，以及可用的 `codex`、`claude`、`agent` 命令。Windows 使用 Windows Terminal，macOS 使用 Terminal.app。

## Git 提交规范

提交信息使用 [Conventional Commits](https://www.conventionalcommits.org/) 风格，类型前缀 + 中文描述：

| 前缀 | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `refactor` | 重构（不改变外部行为） |
| `chore` | 构建、依赖、配置、文档等杂项 |

格式：`<类型>: <中文描述>`

示例：

```
feat: 支持通过参数指定要启动的 CLI
fix: 修复 Windows 下终端路径含空格时启动失败
refactor: 抽取平台检测逻辑为独立函数
chore: 更新 README 安装说明
```
