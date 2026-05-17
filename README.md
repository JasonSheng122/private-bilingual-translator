# Private Bilingual Translator

隐私优先、手动控制优先的 Chrome Manifest V3 双语网页翻译插件。

这个项目面向需要阅读英文网页的个人用户和开发者。它会在普通网页右侧显示一个轻量控制入口，支持把当前页面翻译成中文，也支持在原文下方插入中文译文。

当前版本还在早期阶段，建议先以源码方式安装和使用。

## 功能

1. 手动翻译当前网页。
2. 用户主动开启后的 origin 级自动翻译。
3. 免费版、自然版、深度版三种翻译质量模式。
4. 直接翻译和双语翻译两种显示模式。
5. 右侧页面控制入口，支持翻译、恢复、隐藏和打开设置。
6. 敏感域名默认阻止，在收集 DOM 文本前停止。
7. 官方 Gemini API 和用户自填中转站 provider。
8. API Key 单次使用、会话保存、本地保存三种模式。
9. 自动测试和静态审计脚本。

## 不做什么

这个扩展默认不做：

1. 遥测。
2. 分析统计。
3. 远程配置。
4. 账号系统。
5. 开发者服务器。
6. 云同步。
7. 浏览历史采集。
8. cookie 读取。
9. 密码管理器页面翻译。
10. iframe、PDF、YouTube 字幕或 OCR 翻译。

## 隐私和安全边界

翻译时，扩展只会把当前需要翻译的可见文本片段发送给用户选择的 provider。它不会把网页原文、译文正文、完整 HTML、provider 请求体或 provider 响应体写入持久化存储。

API Key 规则：

1. 单次使用不落盘。
2. 默认推荐会话保存，写入 `chrome.storage.session`。
3. 只有用户明确选择本地保存时，才写入 `chrome.storage.local`。
4. 不使用 `chrome.storage.sync` 保存 API Key。
5. content script 不读取、不保存、不传递 API Key。

更多细节见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## 安装和本地使用

环境要求：

1. Chrome 或 Chromium。
2. Node.js，用于运行测试和审计。

安装依赖：

```bash
npm install
```

运行测试：

```bash
npm test
```

运行静态审计：

```bash
npm run audit
```

加载扩展：

1. 打开 `chrome://extensions`。
2. 开启 Developer mode。
3. 点击 Load unpacked。
4. 选择本仓库根目录。
5. 打开一个普通 `http` 或 `https` 页面，点击右侧 `译` 按钮开始翻译。

## Provider 配置

免费版不需要 API Key。

自然版和深度版需要选择一个付费 provider：

1. `Gemini API`：使用官方 Gemini endpoint，需要用户自己的 Gemini API Key。
2. `自定义中转站`：使用用户自己填写的 `Base URL`、`model` 和 `API Key`，面向 OpenAI-compatible 或 Gemini-compatible 服务。

公开仓库不会预置第三方中转站。自定义 provider 的网络目的地必须来自用户填写的 HTTPS 地址，并在翻译时由用户授权对应 origin。

## 权限说明

当前 manifest 使用：

1. `activeTab`：用户手动触发翻译时处理当前 tab。
2. `storage`：保存用户主动选择的站点设置和 API Key 保存模式。
3. `scripting`：在需要时向当前 tab 注入本地 content script。
4. `content_scripts.matches` 的 `http://*/*` 和 `https://*/*`：在普通网页显示右侧控制入口。
5. `host_permissions`：允许请求免费翻译 endpoint 和官方 Gemini endpoint。
6. `optional_host_permissions` 的 `https://*/*`：仅用于用户配置自定义 provider 后，在运行时请求对应 HTTPS origin。

项目不申请 `tabs`、`history`、`cookies`、`webRequest`、`debugger` 或 `all_urls`。

## 仓库结构

```text
manifest.json       Chrome MV3 manifest
src/background/     background service worker, provider orchestration, key handling
src/content/        page text collection, rendering, restore/remove behavior
src/floating-settings/  right-side extension settings iframe
src/popup/          extension popup UI
src/providers/      translation provider adapters
src/shared/         shared policies and message types
tests/              unit, integration, and static audit tests
docs/               release checklist and audit commands
```

## 开发和审计

提交代码前至少运行：

```bash
npm test
npm run audit
```

更多人工审计命令见 [docs/AUDIT_COMMANDS.md](docs/AUDIT_COMMANDS.md)。

## 版本和变更记录

公开发布后，用户可以通过这些位置看到项目变化：

1. GitHub commits：看到每次代码和文档变更。
2. GitHub Releases：看到某个版本的发布说明和安装包。
3. [CHANGELOG.md](CHANGELOG.md)：看到按版本整理的新功能、修复和风险提示。
4. Chrome Web Store listing：如果发布到商店，用户会看到商店页面上的版本和描述；源代码级别的变更仍以 GitHub 为准。

每次修 bug 或发布新版本时，应同步更新 `manifest.json` 版本号、`CHANGELOG.md` 和 GitHub Release notes。

## 发布状态

当前版本暂未发布到 Chrome Web Store。请先按上面的步骤从源码加载扩展。

后续如果发布商店版本，本仓库会继续保留源码、变更记录和安全说明。

## 已知限制

1. 第一版不翻译 iframe、PDF、YouTube 字幕、图片或 OCR 内容。
2. 自定义 provider 的输出格式和速度取决于用户选择的服务。
3. 长页面自然版或深度版可能触发 provider 限流，需要按真实 provider 表现调小并发。
4. SPA 页面如果超过当前 settle 窗口很久才显示正文，仍可能需要针对具体 DOM 行为继续修复。

## License

MIT. See [LICENSE](LICENSE).
