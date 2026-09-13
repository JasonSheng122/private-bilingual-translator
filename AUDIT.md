# AUDIT.md

## 目的

本文件定义代码审计和功能审计流程。

每个有意义的功能都必须通过两类审计：

1. 静态代码审计。
2. 运行时功能审计。

## 审计等级

## 等级 1：开发前审计

开始写代码前先回答：

1. 是否需要新权限？
2. 是否增加网络目的地？
3. 是否保存网页正文？
4. 是否接触 API Key？
5. 是否影响敏感域名阻止？
6. 是否影响显示模式？
7. 是否影响供应商行为？
8. 是否增加付费成本风险？

只要有风险，必须写进变更记录、PR 说明或相关公开文档。

## 等级 2：静态代码审计

## 权限审计

检查 manifest.json。

未经明确批准，不允许出现：

1. all_urls。
2. tabs。
3. history。
4. cookies。
5. webRequest。
6. debugger。
7. management。
8. nativeMessaging。
9. downloads。
10. proxy。
11. unlimitedStorage。
12. tabCapture，除可选的本机 Whisper 捕获当前 tab 音频短块外。
13. desktopCapture。
14. audioCapture。

通过条件：

1. 手动翻译使用 activeTab。
2. storage 权限有明确用途。
3. scripting 权限有明确用途。
4. host 权限是可选或域名级。
5. 默认没有全站权限。

## 网络审计

搜索：

1. fetch。
2. XMLHttpRequest。
3. WebSocket。
4. EventSource。
5. sendBeacon。
6. importScripts。
7. dynamic import。
8. 远程 script URL。

规则：

1. fetch 只能出现在 provider 模块、批准的网络工具模块、明确批准的 `src/content/content-script.js` YouTube 字幕轨道请求，或明确批准的 `src/background/local-whisper-asr.mjs` 本机 Whisper 请求模块。
2. 第一版禁止 WebSocket。
3. 第一版禁止 EventSource。
4. 禁止 sendBeacon。
5. 禁止远程 JavaScript。
6. 禁止 analytics endpoint。
7. 禁止 telemetry endpoint。
8. 禁止开发者服务器 endpoint。

## 密钥审计

搜索：

1. apiKey。
2. token。
3. authorization。
4. bearer。
5. secret。
6. password。
7. storage.local。
8. storage.session。
9. storage.sync。
10. console。

规则：

1. API Key 不能进入 content script。
2. API Key 不能进入日志。
3. API Key 不能进入网页 DOM；右侧配置只能放在 `chrome-extension://` 来源的 iframe 内。
4. API Key 不能进入 URL query。
5. API Key 不能进入缓存。
6. storage.sync 禁止使用。
7. 会话密钥必须使用 storage.session。
8. 本地保存密钥必须用户主动选择。

## 文本数据审计

搜索：

1. originalText。
2. sourceText。
3. pageText。
4. segments。
5. cache。
6. console.log。
7. error.message。

规则：

1. 网页原文不能记录到日志。
2. 网页原文默认不能持久化保存。
3. 完整 HTML 不能保存。
4. 译文正文默认不能记录到日志。
5. 错误信息不能包含原文。
6. 缓存 key 不能明文暴露完整原文。

## 诊断信息审计

异步 UI、render 失败、provider 输出门槛和第三方 DOM adapter 允许返回净化诊断，但只能包含：

1. 错误码。
2. 状态。
3. 数量。
4. 布尔值。
5. 步骤名。

禁止包含：

1. 网页原文。
2. 译文正文。
3. 完整 URL。
4. API Key。
5. provider 原始响应。
6. 完整字幕时间轴。

## DOM 审计

检查 content script。

必须排除：

1. input。
2. textarea。
3. password。
4. contenteditable。
5. code。
6. pre。
7. script。
8. style。
9. hidden 元素。
10. aria-hidden 元素。
11. iframe。
12. hover card、tooltip、popover 等临时浮层。

## 显示模式审计

直接翻译必须满足：

1. 当前页面会话内可以恢复原文。
2. 原文不持久化保存。
3. 不重复替换。
4. 布局仍可阅读。

双语翻译必须满足：

1. 原文保持可见。
2. 译文出现在原文下方。
3. 防止重复插入。
4. 插入节点有插件标记。

## 供应商审计

每个供应商必须声明：

1. provider id。
2. 显示名。
3. 允许的网络源。
4. 最大请求大小。
5. 是否需要密钥。
6. 成本估算器。
7. 错误映射。

每个供应商必须禁止：

1. 静默切换供应商。
2. 记录请求体。
3. 记录响应体。
4. 记录 API Key。
5. 任意修改 endpoint。

## 等级 3：运行时审计

使用浏览器 DevTools Network 面板。

通过条件：

1. 免费版只调用批准的免费翻译 endpoint。
2. Gemini 模式只调用 Gemini endpoint。
3. 自定义 OpenAI-compatible / Gemini-compatible 模式只调用用户填写并授权的 HTTPS provider endpoint。
4. 不出现 telemetry 请求。
5. 不出现 analytics 请求。
6. 不出现开发者服务器请求。
7. 敏感域名不发送翻译请求。

## 等级 4：功能审计

必须测试这些流程：

1. 免费版加直接翻译。
2. 免费版加双语翻译。
3. 自然版加直接翻译。
4. 自然版加双语翻译。
5. 深度版加直接翻译。
6. 深度版加双语翻译。
7. 敏感域名阻止。
8. API Key 单次使用。
9. API Key 会话保存。
10. API Key 本地保存。
11. 恢复原文。
12. 移除译文。
13. 清除会话密钥。
14. 清除本地密钥。
15. 长页面付费警告。
16. Twitter/X、Reddit 等社交/内容流页面翻译完成后继续滚动新增正文会自动增量翻译，新增正文原文旁显示小型 spinner，且 hover card、tooltip、popover、互动按钮、统计数字和裸域名不触发自动增量翻译或 spinner。
17. Twitter/X、Reddit 等社交/内容流页面向上滚动回到当前页面会话中已翻译过的正文时，不重复请求 provider；页面框架移除双语译文 marker 时，只复用会话译文补回，不进入 spinner 或请求循环。
18. 用户显式取消翻译、还原原文或进入重翻译准备后，页面会话译文缓存不得在 restore mutation 中把原文重新翻回译文。
19. 旧直接翻译 DOM marker 残留但内存 restore 快照丢失时，插件不得猜测原文或再次翻译中文残留；只能通过当前页面 reload 回到网站原文。
20. 自然版/深度版严格重试只能重试未通过 output gate 的 segment，不得因单个标题或短段未翻译而把同批已成功正文再次发送给 provider。
21. 右侧控制入口隐藏偏好只能保存一个全局布尔值，不得保存完整 URL、网页原文、译文正文或 tab 列表。
22. runtime message failure 必须清理手动翻译按钮 loading 和自动增量原文旁 pending spinner，不得让等待控件无限停留。
23. 排查等待控件闪烁或残留时，必须用 `data-pbt-control="translation-pending"` / `translation-pending-spinner` 确认插件节点归属；对间歇闪烁必须采样一段滚动、悬停或等待窗口，不能用单帧无残留关闭问题。
24. `class` / `style` 属性变化只有在确实像隐藏内容变可见时才能触发自动补翻；纯视觉动画、脉冲、高亮或布局刷新不能反复创建 pending spinner。
25. 自动增量翻译必须跳过右侧推荐、趋势、直播、相关内容等 secondary rail，不得因这些区域滚动刷新或缓存复用发送 provider 请求或创建 pending spinner；主正文流和普通文档 TOC 侧栏仍应保留补翻能力。
26. YouTube 字幕翻译只处理用户点击 `幕` 后的字幕专用来源：只允许读取当前视频播放器已发出的 `/api/timedtext` 请求地址（`PerformanceObserver` / `performance.getEntriesByType("resource")`，只读地址），再请求同源英文 JSON3 轨道；不得读取 transcript 面板、播放器可见 CC 文本、控制条时间、播放器字幕/自动翻译菜单，不得注入 MAIN world 脚本、拦截页面 `fetch` / XHR、使用 `webRequest`、请求 `tlang` 自动翻译、YouTube Data API、`youtubei` 或第三方字幕服务；本机 Whisper 只作为用户按住 `Alt/Option` 点击 `幕` 且没有可读英文字幕轨道时的可选 fallback。字幕请求地址、字幕原文、译文、时间轴、音频块和完整视频 URL 不得持久化保存。
27. YouTube `幕` 按钮的 runtime message failure、后台无响应 timeout 和加载中再次点击必须清理本地 loading 和英文预览；过期 request id 或其他 videoId 的 render 不得落地；后台静默刷新进行中时点击 `幕` 必须直接关闭字幕；失败态必须显示净化后的可见中文提示，不能只显示 `!`。
28. overlay 只能以主 video 的 `currentTime` 为时钟，按句子 `start ≤ t < end` 显示；不得使用 offset 校准、控制条时间、player 方法时间或 URL 起播时间；广告（`ad-showing` / `ad-interrupting`）期间隐藏；videoId 变化时清理。
29. 只允许同 tab content script 的用户点击路径（`allowYouTubePlayerCaptionToggle: true`）在没有观察到当前视频字幕请求时点击播放器现有 CC 按钮一次，并在 CC 由扩展打开时再点击一次恢复；CC 已打开但没有请求时只允许关、开各一次；广告播放中不点击；popup、后台和静默刷新不得触发。
30. 字幕请求只能在 `youtube.com/watch` 页面、同 tab content script 显式携带 `allowYouTubeCaptionTrack: true` 时发生；URL 必须为 HTTPS、`youtube.com`、`/api/timedtext` 或 `/timedtext` 路径、带 `pot` 且 `v` 等于当前视频；只修改 `lang` / `kind` / `fmt` 并删除 `tlang`；fetch 使用 `credentials: "omit"`；页面 `ytInitialPlayerResponse` 轨道列表只在 videoId 等于当前视频时使用。
31. YouTube overlay render 如果返回 `renderedCount=0`，必须同时返回净化诊断原因；诊断和 `data-pbt-sync-*` 只能包含来源、字幕类型、状态、时间、句子起止和数量，不得包含字幕原文、译文正文、字幕请求地址、完整视频 URL、完整时间轴、API Key 或 provider 原始响应。
32. YouTube overlay 可以在中文字幕下方显示英文原文，并在译文返回前只显示英文原文；原文只存在当前页面 overlay DOM 和内存中，不得写入 diagnostics、storage、日志、错误或远程请求。
33. 本机 Whisper ASR 只能在 `youtube.com/watch` 页面、同 tab content script 的 `Alt/Option` + `幕` 用户点击路径显式携带 `allowYouTubeLocalWhisperAsr: true` 且 collect 返回 `caption_track_missing`、`caption_track_not_english`、`caption_track_token_missing`、`caption_track_fetch_failed` 或 `caption_track_no_segments` 时启动；普通 `幕` 点击、静默刷新、popup、后台或未显式 true 的路径不得启动。Chrome 因 `activeTab` / extension invocation 限制拒绝指定 tab capture 时，只能 fallback 一次当前活动 tab stream；若两次 stream 尝试都失败，只能返回净化 `youtube_local_asr_capture_denied`，不得创建 offscreen、调用本机 endpoint、调用 provider 或记录 Chrome 原始错误文本，也不得提示用户先点击浏览器工具栏扩展图标。`tabCapture` / `offscreen` 只允许出现在 manifest 和 `src/background/background.js`，音频 chunk 只接受扩展 offscreen document sender，background 启动 offscreen 时传入 `chunkMs: 3000`，offscreen 保持 3000ms 下限；网络只允许 `src/background/local-whisper-asr.mjs` POST 到 `http://127.0.0.1:8765/transcribe`；本机 ASR 启动后必须通过净化状态回传 processing / no-audio-chunk / chunk failure，同一 session 处理中的后续 chunk 不得排队堆积，且不得保存音频、ASR 原文、译文、完整 URL 或时间轴。`data-pbt-local-asr-*` 诊断只允许包含状态、错误码、active 布尔值、request id 和视频 paused/muted 布尔值。
34. overlay 只把站点显示模式用于 overlay 文本：双语为“中文 + 下一行英文”，直接翻译只显示中文，译文未返回时显示英文。字幕译文缓存按“provider 签名 + 句子 id”记录，签名只含翻译质量和付费供应商，切换显示模式不得触发 provider 请求；切换 provider 后新译文返回前保留旧译文。YouTube 字幕翻译不得接收单次使用 Key，content script 仍不得接触 API Key、Base URL 或 model；`missing_api_key`、`missing_custom_provider_config`、`provider_http_error` 的中文提示只能由错误码和 HTTP 状态码生成，不得显示 provider 原始响应文本；后台静默刷新遇到这些错误时同一错误和 provider 签名只提示一次。
35. overlay、`幕` 按钮和提示只能以带 `data-pbt-control` 的插件节点挂入播放器 `#movie_player`（找不到播放器时退回 body 并保持隐藏），不得修改或移动播放器已有节点；overlay 必须 `pointer-events: none`；按钮必须阻止 click / dblclick / mousedown / mouseup / pointerdown / pointerup 冒泡到播放器。字幕大小只允许保存 `small` / `standard` / `large` / `xlarge`，非法值被忽略。

## YouTube 字幕专项审计

YouTube 字幕相关任务必须额外确认：

1. manifest 的 `tabCapture` / `offscreen` 只服务可选的本机 Whisper；manifest 没有新增 `desktopCapture`、`audioCapture`、`debugger`、`webRequest`、`history`、`cookies`、MAIN world content script 或默认 YouTube host permission。
2. `timedtext`、`captionTracks`、`PerformanceObserver`、`getEntriesByType`、`ytp-caption`、`ytp-subtitles-button` 只出现在 `src/content/content-script.js` 的受控字幕路径中；`src` 中没有 `youtubei`、YouTube Data API、第三方字幕服务、analytics、telemetry 或开发者服务器请求。
3. content script 不读取 API Key、Base URL、model 或 storage。
4. 字幕请求地址（含 `pot`）、字幕原文、译文正文、时间轴和完整视频 URL 不写入 `chrome.storage.local`、`chrome.storage.session`、日志、错误、diagnostics 或测试快照。
5. 没有英文字幕、广告中、没有观察到字幕请求或字幕请求失败时，不发送 provider 请求。
6. 真实 Chrome Network 面板中，只允许用户选择的 provider endpoint、播放器自身的字幕请求和扩展对当前视频同源 `/api/timedtext` 的英文轨道请求；不得出现扩展发起的 `tlang` 自动翻译请求、`youtubei`、YouTube Data API、第三方字幕服务或其他视频的字幕请求。
7. `幕` 按钮不会因 runtime failure、后台无响应或再次点击无限转圈；取消或 timeout 后的旧请求 render 会被拒绝，英文预览被清理；各类失败有可见中文提示。
8. 关闭字幕、失败或切换视频时，overlay、原生字幕隐藏样式、句子和译文缓存同时清理；扩展打开的 CC 在读取后已恢复关闭。
9. 真实 Chrome 验证状态必须在 Closeout 单独标记；没有执行 Chrome 验证时，自动测试通过不能写成完整验收 Passed。
10. 真实页面同步问题必须先读取 overlay / `幕` 按钮的 `data-pbt-sync-*` 诊断（播放时间与当前句起止），不能仅凭自动测试关闭问题。
11. 必须确认 `tabCapture` / `offscreen` 只出现在 manifest 和 `src/background/background.js`，本机 Whisper endpoint 只出现在 `manifest.json`、`src/background/local-whisper-asr.mjs` 和本地 helper 文档/脚本中；`data-pbt-local-asr-*` 不得包含音频、字幕正文、译文正文、完整 URL、完整时间轴、API Key 或 provider 响应。

## 审计报告格式

每次审计必须输出：

1. 日期。
2. 任务 ID。
3. 审计文件。
4. 权限变化。
5. 网络变化。
6. 存储变化。
7. 密钥变化。
8. 运行的测试。
9. 发现的问题。
10. 已修复内容。
11. 剩余风险。
12. 是否通过。
