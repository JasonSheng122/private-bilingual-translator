# Changelog

本文件记录公开发布后用户需要知道的新功能、修复和兼容性变化。

格式参考 Keep a Changelog，但不强制完全遵循。日期使用 `YYYY-MM-DD`。

## Unreleased

### Added

- 补齐公开 README，说明安装、首次使用、provider 配置、权限边界、Chrome Web Store 状态和开源发布检查。
- 新增 `CHANGELOG.md`，作为公开用户查看后续 bug fix 和版本变化的入口。

## 0.1.0 - 2026-05-17

### Added

- 初始 developer preview。
- 支持免费版、自然版和深度版三种翻译质量模式。
- 支持直接翻译和双语翻译两种显示模式。
- 支持官方 Gemini API 和用户自填自定义中转站。
- 支持单次、会话和本地三种 API Key 使用方式。
- 提供右侧页面控制入口、内嵌设置页、敏感域名阻止、SPA 增量翻译和基础审计脚本。

### Security

- 默认不做遥测、分析统计、远程配置、开发者服务器或云同步。
- API Key 默认使用 `chrome.storage.session`，只有用户主动选择本地保存时才写入 `chrome.storage.local`。
- content script 不接触 API Key。
