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

1. fetch 是否只在 provider 模块，或批准的 `src/content/content-script.js` YouTube 字幕轨道请求，或批准的 `src/background/local-whisper-asr.mjs` 本机 Whisper endpoint。
2. 是否出现 WebSocket。
3. 是否出现 sendBeacon。
4. 是否出现 telemetry 或 analytics。
5. T002 免费版只允许出现 `https://translate.googleapis.com/translate_a/single`、`https://translate.googleapis.com` 和 manifest host permission `https://translate.googleapis.com/*`。
6. T002-auto-rail 允许 manifest content script match pattern `http://*/*` 和 `https://*/*`，这只用于显示本地控制入口，不是 provider 网络目的地。
7. T003 Gemini 只允许出现 `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent`、`https://generativelanguage.googleapis.com` 和 manifest host permission `https://generativelanguage.googleapis.com/*`。
8. 自定义 OpenAI-compatible / Gemini-compatible provider 不允许在源码或 manifest 默认权限中预置第三方中转站；默认网络目的地只应包含免费 endpoint 和官方 Gemini endpoint，自定义 provider origin 必须来自用户配置。
9. YouTube 字幕实验不允许新增 YouTube Data API、`youtubei`、YouTube 自动翻译（`tlang`）、第三方字幕服务、开发者服务器、analytics 或 telemetry 请求；字幕文本只能发送给用户选择的 provider。YouTube timed text 是批准的例外：只能在 `src/content/content-script.js` 中，由同 tab content script 的 `allowYouTubeCaptionTrack` 显式放行，基于播放器已发出的当前视频 `/api/timedtext` 请求地址（`PerformanceObserver` / `performance.getEntriesByType("resource")` 只读地址）请求同源英文 JSON3 轨道；`allowYouTubePlayerCaptionToggle` 只允许用户点击路径点击播放器现有 CC 按钮一次并恢复；不得注入 MAIN world 脚本、拦截页面请求或读取字幕/自动翻译菜单。本机 Whisper 只允许 `src/background/local-whisper-asr.mjs` 请求固定本机 `http://127.0.0.1:8765/transcribe`，且只能在用户按住 `Alt/Option` 点击 `幕` 且没有可读英文字幕轨道时启动。`data-pbt-local-asr-*` 和 `data-pbt-sync-*` 不得包含音频、ASR 原文、字幕正文、译文正文、字幕请求地址、完整 URL、完整时间轴、API Key 或 provider 响应。
10. YouTube overlay no-render 诊断只能返回错误码、状态和数量；不得新增网络目的地或把诊断发送到远程服务。

## 搜索权限

```bash
rg "all_urls|tabs|history|cookies|webRequest|debugger|tabCapture|desktopCapture|audioCapture|scripting|executeScript|management|nativeMessaging|downloads|proxy|unlimitedStorage" manifest.json src
```

关注点：

1. 是否默认申请 all_urls。
2. 是否出现不必要高权限。
3. `scripting` 是否只用于用户触发的当前 tab fallback。
4. `executeScript` 是否只出现在 `src/background/background.js`，且只注入本地 `src/content/content-script.js`。
5. YouTube 字幕实验不允许出现 `desktopCapture`、`audioCapture`、`debugger` 或 `webRequest`；本机 Whisper 只允许 `tabCapture` / `offscreen` 出现在 manifest 和 background 的本机 Whisper 路径。

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

1. 运行时代码、测试和公开文档都不应出现私人阶段 provider 的具体品牌、真实域名、旧 provider id、旧文件名或可反推占位域名。
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
4. YouTube 字幕实验中，字幕请求地址（含 `pot`）、句子、字幕原文、译文正文、时间轴和完整视频 URL 是否被持久化保存；它们只允许存在于当前页面内存、overlay DOM 和 provider 请求中。

## 搜索 YouTube 字幕越界请求

```bash
rg "youtubei|timedtext|captionTracks|PerformanceObserver|getEntriesByType|tlang|ytp-caption|ytp-subtitles-button|YouTube Data API|webRequest|\"world\"|tabCapture|offscreen|desktopCapture|audioCapture|debugger|127\\.0\\.0\\.1:8765" src manifest.json
```

关注点：

1. `timedtext`、`captionTracks`、`PerformanceObserver`、`getEntriesByType`、`tlang`、`ytp-caption`、`ytp-subtitles-button` 只允许出现在 `src/content/content-script.js` 的字幕路径；`tlang` 只允许作为被删除的参数出现。
2. manifest 和 `src` 不应出现 `"world": "MAIN"`、`webRequest`、YouTube 内部抓取接口、音频捕获权限或调试权限。
3. 字幕请求 URL 必须经过 HTTPS、`youtube.com`、`/api/timedtext`、带 `pot`、`v` 等于当前视频的校验；fetch 使用 `credentials: "omit"`。
4. overlay 只能以主 video `currentTime` 为时钟；源码中不应再出现控制条时间、transcript 面板或 offset 校准读取。
5. `幕` 按钮 timeout/cancel 只能使用本地 request id 和 runtime cleanup，不能引入额外 YouTube 抓取或轮询接口。
6. 本机 Whisper 必须确认 `START_YOUTUBE_LOCAL_ASR` 只由同 tab content script 的 `Alt/Option` + `幕` 路径且字幕轨道不可用时触发；background 传入 `chunkMs: 3000`，处理中的 chunk 不排队；不得新增 `desktopCapture`、`audioCapture`、`debugger`、WebSocket/EventSource、云端 ASR endpoint、storage key 或正文/API Key 日志。

## 搜索诊断泄露

```bash
rg "diagnostics|renderDiagnostics|renderStatus|no_usable|timestamp" src tests
```

关注点：

1. 诊断对象只能包含错误码、状态、数量、布尔值和步骤名。
2. 诊断对象不能包含字幕原文、译文正文、完整 URL、完整时间轴、API Key 或 provider 原始响应。
3. YouTube no-render 错误必须能区分无可用译文和 overlay 容器不可用等净化原因。

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
