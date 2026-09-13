# ARCHITECTURE.md

## 架构目标

让扩展保持简单、可审计、模块边界清楚。

每个模块只做一件事。

## 五个运行环境

## 1. Popup 弹窗

职责：

1. 显示当前页面状态。
2. 选择翻译质量模式。
3. 选择显示模式。
4. 输入单次 API Key。
5. 启动翻译。
6. 清除会话密钥。
7. 清除本地密钥。

禁止：

1. 不抽取页面 DOM。
2. 不直接修改网页。
3. 不执行长时间翻译流程。
4. 不记录 API Key。
5. 不记录网页原文。

## 2. Options 设置页

职责：

1. 配置翻译供应商。
2. 配置默认翻译质量。
3. 配置默认显示模式。
4. 配置 API Key 保存方式。
5. 管理自动翻译白名单。
6. 管理敏感域名黑名单。
7. 清除缓存。
8. 清除密钥。

禁止：

1. 不访问页面 DOM。
2. 不翻译当前页面。
3. 不做遥测。
4. 不做分析统计。

## 3. 右侧内嵌配置页

职责：

1. 运行在 `chrome-extension://` 来源的 iframe 中。
2. 让用户在页面右侧 `设` 面板里保存 API Key。
3. 让用户在页面右侧 `设` 面板里保存自定义中转站 Base URL 和 model。
4. 只通过 background message 访问 secret_manager 和 custom_provider_config。

禁止：

1. 不访问页面 DOM。
2. 不收集网页正文。
3. 不调用翻译供应商。
4. 不记录 API Key。
5. 不把 API Key 发给 content script。

## 4. Background Service Worker 后台

职责：

1. 编排翻译流程。
2. 管理供应商适配器。
3. 读取 API Key。
4. 强制执行网络白名单。
5. 强制执行域名策略。
6. 估算成本。
7. 在 popup 和 content script 之间转发消息。

禁止：

1. 不记录网页原文。
2. 不记录 API Key。
3. 不发起未批准网络请求。
4. 默认不持久化保存网页正文。

## 5. Content Script 内容脚本

职责：

1. 收集可见、可翻译文本。
2. 排除敏感元素。
3. 把文本片段发给后台。
4. 把译文渲染回页面。
5. 在当前页面会话内支持恢复原文。

禁止：

1. 不能接触 API Key。
2. 不能直接调用翻译供应商。
3. 不能读取密钥存储。
4. 不能做遥测。
5. 不能翻译输入框。
6. 第一版不能翻译 iframe。

## 6. YouTube 字幕翻译模块（实验能力）

状态：

1. 不使用 transcript 面板、播放器可见 CC、控制条时间或 offset 校准作为时间来源：这些来源没有精确时间或无法稳定读取，会导致底部字幕和声音错位。直接请求 `captionTracks[].baseUrl` 缺少播放器生成的 `pot` 令牌只能拿到空内容；站内切换视频后页面 `<script>` 里的 `ytInitialPlayerResponse` 仍是上一个视频；`.ytp-time-current` 在控制条自动隐藏后停止更新。
2. 时间轴只来自播放器自己请求的 YouTube 字幕轨道（timed text JSON3），时钟只来自播放器主 video 的 `currentTime`。
3. 本模块不属于普通网页正文翻译范围，也不改变网页正文的直接翻译/双语翻译语义；overlay 读取同一个显示模式设置：双语显示“中文 + 下一行英文”，直接翻译只显示中文。

职责：

1. 只在 `youtube.com/watch` 普通视频页工作，只在用户点击视频右下角 `幕` 后运行。
2. 首次点击 `幕` 后，content script 通过 `PerformanceObserver`（`type: "resource"`、`buffered: true`）和 `performance.getEntriesByType("resource")` 读取播放器已发出的 `/api/timedtext` 请求 URL；只接受 HTTPS、`youtube.com`、带 `pot` 且 `v` 等于当前视频的 URL，只保存在当前页面内存（最多 8 个视频）。只读取 URL，不读取响应、不拦截请求、不注入页面脚本。
3. 找不到当前视频的请求时，只有同 tab content script 的用户点击路径（`allowYouTubePlayerCaptionToggle: true`）可以点击播放器现有 CC 按钮一次，让播放器自己请求字幕，最多等待 3 秒；CC 是扩展打开的，读取完成后再点击一次恢复关闭。CC 已打开但没有观察到请求时，只允许关、开各一次触发播放器重新请求。广告播放中不点击 CC，返回 `caption_track_ad_showing`。CC 按钮只按 `disabled` / `aria-disabled` 判断是否可用，“无法显示字幕”这类标签文字在视频未开始播放时也会出现，不作为无字幕依据；页面轨道列表已列出英文轨道时，CC 按钮缺失或禁用只返回 `caption_track_token_missing`。
4. 取得请求 URL 后，content script 只修改 `lang`、`kind`、`fmt` 并删除 `tlang`，同源请求当前视频的英文 JSON3 轨道，`credentials: "omit"`。页面 `<script>` 中的 `ytInitialPlayerResponse` 轨道列表只在 `videoDetails.videoId` 等于当前视频时使用（按分数优先人工英文轨道；没有英文轨道时返回 `caption_track_not_english`，不点击 CC）；列表不可用时按“人工 `en` → 播放器已选英文轨道 → 自动 `en`”依次尝试。
5. JSON3 解析为句子：人工字幕把连续行合并到句末标点为止，停顿 ≥ 1.5 秒、超过 8 秒或 160 字符时断开；自动字幕使用逐词 `tOffsetMs`（首词缺省为 0，忽略 `\n` 追加事件），在句末标点、停顿 ≥ 0.7 秒、超过 7 秒或 110 字符时断句；`[Music]` 这类括号提示单独成句。部分视频的自动字幕只返回整行事件、没有逐词时间，这时按人工字幕规则分组，每条事件从自己的开始时间显示到下一条开始，与 YouTube 自带字幕的显示时间一致，诊断字幕类型为 `asr_lines`。句子结束时间加 0.4 秒尾巴，与下一句间隔不足 1 秒时延长到下一句开始，最短显示 1.2 秒。
6. 翻译按句子进行：collect 只返回当前时间前 5 秒到后 90 秒内尚未收到结果的句子，每批最多 60 句；译文按句子 id 缓存在当前页面内存。已翻译状态下，未来 60 秒内出现未翻译句子时，overlay 通过静默刷新补取下一批；同一句 10 秒内不重复请求，失败后 10 秒内不重试。译文按“provider 签名 + 句子 id”记录是否已处理，签名只包含翻译质量和付费供应商，不包含显示模式，切换显示模式直接复用已有译文；切换翻译质量或供应商后，下一次 overlay 刷新即对当前窗口内未按新签名处理的句子发起静默刷新，新译文返回前继续显示旧译文。background 调用 provider 时不传单次使用 Key，自然版/深度版只读取已保存（本次会话或本地）的 Key。
7. overlay 在字幕显示期间用 `requestAnimationFrame` 读取主 video（优先 `#movie_player` 内的 `video.html5-main-video`）的 `currentTime`，并在 `timeupdate` / `seeking` / `seeked` / `play` / `playing` / `pause` / `ratechange` / `loadedmetadata` 事件时补刷；视频暂停或标签页隐藏时停止逐帧刷新。按开始时间二分查找当前句，只显示 `start ≤ t < end` 的句子；没有当前句时隐藏。
8. 译文未返回时 overlay 先显示英文原文；译文返回后按显示模式显示：双语为“中文 + 下一行英文”，直接翻译只显示中文。晚到的译文只要仍属于当前视频就照常落地，不再按窗口判定过期；videoId 变化、用户关闭或取消后的 render 被拒绝。
9. 播放器带 `ad-showing` / `ad-interrupting` class 时隐藏 overlay；watch 页 videoId 变化时清理 overlay、句子、译文缓存和状态。
10. 字幕轨道 overlay 显示期间插入一条 `data-pbt-control="youtube-native-caption-style"` 样式隐藏播放器自带字幕，避免与 overlay 重复；关闭、失败或切换视频时移除。
11. `幕` 按钮的异步请求带 request id；runtime failure、后台无响应 timeout 或加载中再次点击会取消请求、清理英文预览和本地 loading，过期 render 不落地；后台静默刷新进行中时点击 `幕` 直接关闭字幕。失败态显示净化后的中文提示；缺少 Key（`missing_api_key`）、自定义中转站未配置（`missing_custom_provider_config`）和 provider HTTP 错误（`provider_http_error`，区分 401/403、429 和其他状态）有专门的中文提示。后台静默刷新遇到这三类错误时，同一错误和 provider 签名只提示一次，并保留已显示的译文。
12. overlay 和 `幕` 按钮只暴露不含正文的同步诊断：`data-pbt-sync-source`、`data-pbt-sync-track`、`data-pbt-sync-status`、`data-pbt-sync-playback`、`data-pbt-sync-cue`、`data-pbt-sync-cue-end`、`data-pbt-sync-cue-count`、`data-pbt-sync-translated-count`；真实页面错位时先读取这些属性，确认播放时间是否落在当前句起止之间。
13. 本机 Whisper 是可选 fallback：只有同 tab content script 的 `Alt/Option` + `幕` 请求显式携带 `allowYouTubeLocalWhisperAsr: true`，且 collect 返回 `caption_track_missing`、`caption_track_not_english`、`caption_track_token_missing`、`caption_track_fetch_failed` 或 `caption_track_no_segments` 时，background 才通过 `tabCapture.getMediaStreamId()` 和 offscreen document 采集当前 tab 约 3 秒音频短块，发送到本机 `http://127.0.0.1:8765/transcribe`，再把净化后的 ASR 文本交给用户已选择的 provider 翻译并以单句 overlay 显示 12 秒。Chrome 拒绝指定 sender tab capture 时只 fallback 一次当前活动 tab stream，两次失败只返回净化 `youtube_local_asr_capture_denied`；background 传入 `chunkMs: 3000`，offscreen 保持 3000ms 下限，同一 session 只允许一个 chunk 处于 processing；启动后回传 processing / no-audio-chunk 等净化状态；`data-pbt-local-asr-*` 只包含状态、错误码、active 布尔值、request id 和视频 paused/muted 布尔值；local ASR status/render 使用独立 session id 判定 stale。实时识别必须先听到声音，字幕一定晚于声音。
14. overlay、`幕` 按钮和提示都以带 `data-pbt-control` 的插件节点挂在播放器 `#movie_player` 内部（绝对定位；找不到播放器时退回 body 并保持隐藏），普通、影院和全屏模式都可见。层级取自真实页面：视频容器 10、控制条 58/59、菜单 1001/2300；overlay 为 40，按钮为 60，提示为 61。按钮阻止 click、dblclick、mousedown、mouseup、pointerdown、pointerup 冒泡到播放器，避免触发暂停或全屏；按钮用 CSS `right: 18px` / `bottom: 72px` 贴在播放器右下角，不再用 JS 计算坐标。`ResizeObserver` 监听播放器尺寸变化（影院、全屏、窗口缩放），即时重算按钮可见性和 overlay 字号，暂停时也生效。中文字号 = 播放器高度 × 3.6%（限制在 16–40px）× 字幕大小倍率（小 0.85 / 标准 1 / 大 1.2 / 特大 1.4）；英文行 0.75em、常规粗细、略淡。控制条显示时距底部 max(82px, 高度 10%)，播放器带 `ytp-autohide` 时为 max(24px, 高度 5%)。字幕大小按站点保存在 `pbt_site_settings_v1` 的 `captionSizesByOrigin` / `defaultCaptionSize`，popup 保存其他设置时保留原值；设置面板只在 YouTube watch 页显示该选项。

禁止：

1. 除可选的本机 Whisper 捕获的当前 tab 音频短块外，不读取音频流，不申请或使用麦克风、`desktopCapture`、`audioCapture` 或 `debugger`。
2. 不注入 MAIN world 脚本，不改写或拦截页面 `fetch` / XHR，不使用 `webRequest`。
3. 除当前视频的同源 `/api/timedtext` 英文轨道外，不请求 YouTube 字幕 endpoint、YouTube 自动翻译（`tlang`）、YouTube Data API、`youtubei` 或第三方字幕服务。
4. 不读取播放器“字幕/自动翻译”菜单，不读取 transcript 面板、播放器可见 CC 文本或控制条时间，不做 offset 校准。
5. 不读取评论、推荐、播放历史、cookie 或账号信息。
6. 字幕请求 URL（含 `pot`）、字幕原文、译文正文、完整视频 URL、时间轴和 provider 原始响应不写入 diagnostics、storage、日志或错误，只存在当前页面内存和 overlay DOM 中。
7. content script 仍不能接触 API Key、Base URL 或 model。

实现文件：

1. `src/content/content-script.js`：`幕` 按钮、字幕请求 URL 捕获、CC 一次性触发与恢复、英文轨道选择与请求、JSON3 断句、按句翻译窗口与预取、按帧 overlay、原生字幕隐藏、request id / timeout / 取消、净化诊断、本机 ASR overlay。
2. `src/background/background.js`：处理字幕专用 collect/render 消息，只为同 tab content script 来源转发 `allowYouTubeCaptionTrack`、`allowYouTubePlayerCaptionToggle`、`allowYouTubeLocalWhisperAsr`；render 消息只携带 `requestId`、`videoId` 和译文；把 collect 状态映射为净化错误码；本机 Whisper 只在同 tab content script 用户点击路径启动 `tabCapture` + offscreen，本机 ASR chunk 只接受 offscreen sender。
3. `src/background/local-whisper-asr.mjs`：固定请求本机 `http://127.0.0.1:8765/transcribe`，只返回净化 ASR 文本或净化错误码，不记录音频、原文或译文。
4. `src/offscreen/local-asr.html` / `src/offscreen/local-asr.js`：offscreen 当前 tab 音频短块采集器，只在 background 传入 stream id 后启动；默认 chunk 为 3000ms，停止时关闭 recorder、stream 和 audio context。
5. `src/shared/message-types.mjs`：声明字幕专用内部消息类型和本机 ASR 启停/render 消息类型。

## 核心模块

## domain_policy

职责：

判断当前页面能否翻译。

输入：

1. 当前 URL。
2. 用户白名单。
3. 用户黑名单。

输出：

1. 是否允许手动翻译。
2. 是否允许自动翻译。
3. 阻止原因。

网络：无。

## dom_collector

职责：

从页面中收集可见文本片段。

必须排除：

1. input。
2. textarea。
3. password。
4. contenteditable。
5. script。
6. style。
7. code。
8. pre。
9. kbd。
10. samp。
11. noscript。
12. svg。
13. canvas。
14. math。
15. hidden 元素。
16. aria-hidden 元素。
17. display none 元素。
18. visibility hidden 元素。

## renderer

职责：

把译文渲染回网页。

子模块：

1. replace_renderer。
2. bilingual_renderer。

规则：

1. 标记插件插入节点。
2. 防止重复渲染。
3. 支持恢复或移除。
4. 不持久化保存原文。

## provider_manager

职责：

根据翻译质量模式选择供应商。

输入：

1. 翻译质量模式。
2. 供应商设置。
3. 密钥模式。
4. 文本片段批次。

输出：

1. 译文。
2. 供应商元数据。
3. 成本估算。
4. 结构化错误。

## providers

子模块：

1. google_free_provider。
2. gemini_provider。
3. custom_gemini_provider。
4. mock_provider。

规则：

1. provider fetch 只能出现在这里或批准的网络工具模块；另批准 `src/content/content-script.js` 在 YouTube watch 页内，基于播放器已发出的当前视频字幕请求地址请求同源 `/api/timedtext` 英文轨道；CC 按钮一次性触发只点击当前页面现有播放器按钮，不新增 fetch 目的地。
2. 每个供应商声明允许的网络源。
3. 每个供应商验证 endpoint。
4. 每个供应商必须隐藏密钥。
5. 不允许静默切换供应商。

## secret_manager

职责：

管理 API Key 和中转站密钥。

允许存储：

1. chrome.storage.session。
2. 用户主动选择时使用 chrome.storage.local。

禁止存储：

1. chrome.storage.sync。

禁止：

1. 密钥进入 content script。
2. 密钥进入 DOM。
3. 密钥进入日志。
4. 密钥进入错误信息。

## cost_estimator

职责：

估算付费翻译成本。

输入：

1. 供应商。
2. 模型。
3. 输入长度。
4. 估算输出长度。

输出：

1. 估算费用。
2. 成本警告等级。

## cache_manager

职责：

去重和可选缓存。

默认：

持久化缓存关闭。

允许：

当前页面会话内内存缓存。

禁止：

1. 缓存完整 HTML。
2. 明文原文作为缓存 key。
3. 缓存 API Key。
4. 缓存浏览历史。

## logger

职责：

只记录技术事件。

允许记录：

1. 模式。
2. 供应商。
3. 错误码。
4. 耗时。
5. 片段数量。
6. 估算成本。

禁止记录：

1. 网页原文。
2. 译文正文。
3. API Key。
4. 请求体。
5. 响应体。
6. 带敏感 query 的完整 URL。
