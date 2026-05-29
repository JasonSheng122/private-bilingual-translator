# Changelog

本文件记录公开发布后用户需要知道的新功能、修复和兼容性变化。

格式参考 Keep a Changelog，但不强制完全遵循。日期使用 `YYYY-MM-DD`。

## Unreleased

### Added

- 补齐公开 README，说明安装、首次使用、provider 配置、权限边界、发布状态和已知限制。
- 新增 `CHANGELOG.md`，作为公开用户查看后续 bug fix 和版本变化的入口。

### Changed

- 清理公开 README 和文档中的内部发布流程措辞，让仓库首页只保留用户和开发者需要的信息。
- 翻译等待态从右侧文字状态条改为主按钮 spinner 和原文旁小型 spinner，减少滚动阅读时的干扰。

### Fixed

- 已翻译页面中，Twitter/X 等社交页面鼠标悬停产生的 hover card、tooltip、popover 不再触发自动增量翻译，减少误显示等待态和付费 provider 成本风险。
- 已翻译的 Twitter/X、Reddit 等社交/内容流页面中，继续滚动出现的新正文会重新自动补翻；成本控制继续依赖用户主动翻译态、有限 debounce、并发上限和旧响应丢弃，而不是按平台禁用补翻。
- Twitter/X 等页面滚动时，互动按钮、`K/M` 统计数字和裸域名不再显示原文旁 spinner 或进入翻译请求。

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
