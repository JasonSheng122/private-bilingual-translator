# AUDIT_COMMANDS.md

## 目的

提供常用代码搜索命令，帮助检查隐私和安全风险。

这些命令只是辅助。最终判断仍然要看代码语义。

## 搜索网络请求

```bash
rg "fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts" src manifest.json
rg "https?://" src manifest.json
```

关注点：

1. fetch 是否只在 provider 模块。
2. 是否出现 WebSocket。
3. 是否出现 sendBeacon。
4. 是否出现 telemetry 或 analytics。
5. T002 免费版只允许出现 `https://translate.googleapis.com/translate_a/single`、`https://translate.googleapis.com` 和 manifest host permission `https://translate.googleapis.com/*`。
6. T002-auto-rail 允许 manifest content script match pattern `http://*/*` 和 `https://*/*`，这只用于显示本地控制入口，不是 provider 网络目的地。
7. T003 Gemini 只允许出现 `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`、`https://generativelanguage.googleapis.com` 和 manifest host permission `https://generativelanguage.googleapis.com/*`。
8. 自定义 OpenAI-compatible / Gemini-compatible provider 不允许在源码或 manifest 默认权限中预置第三方中转站；默认网络目的地只应包含免费 endpoint 和官方 Gemini endpoint，自定义 provider origin 必须来自用户配置。

## 搜索权限

```bash
rg "all_urls|tabs|history|cookies|webRequest|debugger|scripting|executeScript|management|nativeMessaging|downloads|proxy|unlimitedStorage" manifest.json src
```

关注点：

1. 是否默认申请 all_urls。
2. 是否出现不必要高权限。
3. `scripting` 是否只用于用户触发的当前 tab fallback。
4. `executeScript` 是否只出现在 `src/background/background.js`，且只注入本地 `src/content/content-script.js`。

## 搜索密钥

```bash
rg "apiKey|token|authorization|bearer|secret|password|storage.sync|storage.local|storage.session" src
```

关注点：

1. 是否使用 storage.sync。
2. API Key 是否进入 content script。
3. API Key 是否进入日志或错误。
4. 页面右侧配置是否只通过 `src/floating-settings/` 这类扩展来源页面接触 Key，而不是 content script 读取网页 DOM input。
5. `storage.local` 是否只用于 `src/background/site-settings.mjs` 的 origin 级翻译设置，或 `src/background/secret-manager.mjs` 的用户主动本地保存 API Key。
6. `storage.session` 是否只用于 `src/background/secret-manager.mjs` 的会话 API Key。
7. `storage.local` 中的 API Key 是否只在用户主动选择本地保存时写入。

## 搜索 Provider Key URL 泄露

```bash
rg "x-goog-api-key|x-api-key|authorization|bearer|key=|api_key=" src tests manifest.json
```

关注点：

1. 生产代码中只允许 provider 模块内使用批准的 key header。
2. 生产代码中不允许 bearer token header。
3. 生产代码中不允许把 API Key 放进 URL query。

## 搜索私人 provider 历史残留

```bash
for pattern in "GPT""SAPI" "api\\.g""ptsapi" "g""ptsapi_gemini" "g""ptsapi-gemini" "g""ptsapi"; do
  rg -n "$pattern" .
done
```

关注点：

1. 运行时代码、测试、公开文档和历史任务卡都不应出现私人阶段 provider 的具体品牌、真实域名、旧 provider id、旧文件名或可反推占位域名。
2. 需要保留历史原因时，只描述当前结论，不保留旧接入细节。

## 搜索日志

```bash
rg "console\.log|console\.debug|console\.info|console\.warn|console\.error" src
```

关注点：

1. 是否打印原文。
2. 是否打印译文。
3. 是否打印请求体。
4. 是否打印 API Key。

## 搜索危险执行

```bash
rg "eval\(|new Function|innerHTML|outerHTML|insertAdjacentHTML" src
```

关注点：

1. 是否动态执行代码。
2. 是否不安全地插入 HTML。
3. 是否应该改用 textContent。

## 搜索页面文本存储

```bash
rg "originalText|sourceText|pageText|segments|translatedText|cache|html" src
```

关注点：

1. 原文是否被持久化。
2. 完整 HTML 是否被保存。
3. 缓存 key 是否暴露明文原文。

## 搜索 content script 密钥风险

```bash
rg "apiKey|token|authorization|bearer|secret|storage" src/content
```

关注点：

1. content script 是否接触密钥。
2. content script 是否读取存储。

## 推荐审计流程

每次 Codex 完成任务后执行：

1. 权限搜索。
2. 网络搜索。
3. 密钥搜索。
4. 日志搜索。
5. DOM 插入搜索。
6. 页面文本存储搜索。
7. 对照 AUDIT.md 填审计结论。
8. 更新相关公开文档或 PR 说明。
