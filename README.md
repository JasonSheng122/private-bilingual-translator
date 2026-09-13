# Private Bilingual Translator

隐私优先、手动控制优先的 Chrome Manifest V3 双语翻译插件：翻译英文网页，也能给 YouTube 视频加上和声音同步的中文字幕。

这个项目面向需要阅读英文网页、观看英文视频的个人用户和开发者。它会在普通网页右侧显示一个轻量控制入口，支持把当前页面翻译成中文，也支持在原文下方插入中文译文；在 YouTube 视频页，视频右下角会多出一个 `幕` 按钮，点一下即可显示中文字幕。

当前版本还在早期阶段，暂未上架 Chrome Web Store，需要以“加载已解压的扩展程序”的方式安装。

## 功能

1. 手动翻译当前网页。
2. 用户主动开启后的 origin 级自动翻译。
3. 免费版、自然版、深度版三种翻译质量模式。
4. 直接翻译和双语翻译两种显示模式。
5. 右侧页面控制入口，支持翻译、恢复、隐藏和打开设置。
6. 敏感域名默认阻止，在收集 DOM 文本前停止。
7. 官方 Gemini API 和用户自填中转站 provider。
8. API Key 单次使用、会话保存、本地保存三种模式。
9. YouTube 视频中文字幕：读取播放器自己使用的英文字幕轨道，按整句翻译，按视频播放时间逐帧同步显示。
10. YouTube 字幕跟随“双语翻译 / 直接翻译”设置，支持小 / 标准 / 大 / 特大四档字号，普通、影院和全屏模式都能显示。
11. 可选的本机 Whisper 语音识别，给没有英文字幕的视频使用（进阶功能，需要自行安装本机工具）。
12. 自动测试和静态审计脚本。

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
10. iframe、PDF、图片或 OCR 翻译。
11. 下载或保存 YouTube 字幕文件，请求 YouTube 自动翻译、YouTube Data API 或第三方字幕服务。

## 运行条件

1. 桌面版 Chrome，建议 116 或更新版本（可选的本机 Whisper 需要 116+）。已在 macOS + Chrome 153 上实测；Windows、Linux、ChromeOS 上的 Chrome 按设计可用，但未实测。Edge、Brave 等 Chromium 内核浏览器理论上可用，但未测试。
2. 不支持手机和平板（手机版 Chrome 不支持扩展），也不支持 Firefox 和 Safari。
3. 网络需要能访问 Google 翻译接口（免费版）和 YouTube；使用官方 Gemini 时还需要能访问 Gemini API。中国大陆用户需要能访问 Google 服务的网络环境。
4. 公司或学校管理的电脑可能禁止开启开发者模式或加载未上架的扩展，这种情况下无法安装。
5. Linux 需要系统装有中文字体，否则中文会显示为方框。
6. 普通使用不需要 Node.js、命令行或 API Key。Node.js 只用于运行测试和可选的本机 Whisper。

## 快速上手

1. 在 [Releases](https://github.com/JasonSheng122/private-bilingual-translator/releases) 下载最新版本的 zip 并解压。
2. 打开 `chrome://extensions`，开启右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择解压后的文件夹（里面有 `manifest.json`）。
4. 翻译网页：打开任意 `http` / `https` 页面，点击右侧的 `译` 按钮。
5. YouTube 字幕：打开一个有英文字幕的 YouTube 视频，点击视频右下角的 `幕` 按钮。

更新版本时，下载新的 zip 替换原文件夹，再到 `chrome://extensions` 点击扩展卡片上的“重新加载”，并刷新已经打开的页面。开发者模式加载的扩展不会自动更新。

## 官方发布渠道

本项目由 [JasonSheng122](https://github.com/JasonSheng122) 维护。唯一官方发布渠道是本仓库的 [GitHub Releases](https://github.com/JasonSheng122/private-bilingual-translator/releases)；如果以后上架 Chrome Web Store，商店链接也只会在本 README 和 Releases 中公布。

其他来源的安装包或商店条目都不是官方版本，可能被修改过（例如加入广告、收集数据或窃取 API Key）。安装前请确认来源。发现冒充本项目的版本，欢迎通过 [Issues](https://github.com/JasonSheng122/private-bilingual-translator/issues) 告知。

## 隐私和安全边界

翻译时，扩展只会把当前需要翻译的可见文本片段发送给用户选择的 provider。它不会把网页原文、译文正文、完整 HTML、provider 请求体或 provider 响应体写入持久化存储。

API Key 规则：

1. 单次使用不落盘。
2. 默认推荐会话保存，写入 `chrome.storage.session`。
3. 只有用户明确选择本地保存时，才写入 `chrome.storage.local`。
4. 不使用 `chrome.storage.sync` 保存 API Key。
5. content script 不读取、不保存、不传递 API Key。

YouTube 字幕只在用户点击 `幕` 后工作：扩展读取当前视频播放器已经发出的字幕请求地址（通过浏览器资源计时接口，只读地址，不拦截请求，也不注入页面脚本），再向 YouTube 同源请求当前视频的英文字幕轨道，使用 `credentials: "omit"`。字幕原文、译文和时间轴只保存在当前页面内存中，不写入存储、日志或错误信息；需要翻译的字幕句子会像网页文本一样发送给用户选择的翻译服务。可选的本机 Whisper 只在用户按住 `Alt/Option` 点击 `幕` 时启动，音频只发送到本机 `127.0.0.1:8765`。

更多细节见 [PRIVACY.md](PRIVACY.md) 和 [SECURITY.md](SECURITY.md)。

## YouTube 双语字幕

使用方法：

1. 打开一个有英文字幕的 YouTube 视频（人工字幕或自动生成字幕都可以），等广告结束。
2. 点击视频右下角的 `幕`，稍等 1–3 秒，视频底部会出现中文字幕。
3. 再点一次 `幕` 关闭字幕，播放器原来的 CC 设置会恢复。

工作方式：

1. 扩展读取播放器自己发出的字幕请求地址，再请求当前视频的英文字幕轨道。YouTube 字幕接口要求播放器生成的令牌，直接请求会得到空内容；如果播放器还没请求过字幕，扩展会点击一次 CC 按钮让播放器自己请求，读取后再关回。
2. 字幕按整句切分：人工字幕按句末标点合并连续行，自动字幕用逐词时间按停顿断句。部分视频的自动字幕只有整行时间，这时按行显示，时间与 YouTube 自带字幕一致。
3. 只翻译当前时间前 5 秒到后 90 秒的句子，播放过程中提前补翻下一批；译文返回前先显示英文原文。
4. 底部字幕只按视频播放时间逐帧刷新，拖动进度条、暂停、变速和控制条自动隐藏后都保持同步；广告期间隐藏，站内切换视频时自动清理。
5. 字幕显示期间隐藏播放器自带字幕，避免重复。

设置：

1. 显示模式：“双语翻译”显示中文和下一行英文，“直接翻译”只显示中文。切换后立即生效，不会重新翻译。
2. 字幕大小：在右侧 `设` 面板的“YouTube 字幕大小”里选择小 / 标准 / 大 / 特大，按站点保存。字号会随播放器大小自动缩放，影院模式和全屏时自动变大。
3. 翻译质量：免费版不需要 Key；自然版和深度版使用设置里已保存的 Key，保存方式需选“本次会话”或“本地保存”（“单次使用”只对一次网页翻译有效）。“本次会话”的 Key 在重新加载扩展或重启 Chrome 后需要重新填写。字幕按播放进度分批翻译，每批最多 60 句，看完整个视频大致相当于翻译整份字幕。切换翻译质量或供应商后会立即补翻当前段落，新译文返回前继续显示旧译文。

注意：

1. 收起右侧悬浮按钮时，`幕` 按钮也会一起隐藏；点击页面右边缘的 `‹` 可以重新展开。
2. 扩展安装或重新加载后，需要刷新已经打开的 YouTube 页面。
3. 如果 YouTube 要求“登录以确认你不是机器人”，视频无法播放时也读不到字幕。
4. 没有英文字幕的视频无法直接翻译，可以尝试下面的本机 Whisper。
5. 失败时按钮会显示中文提示，例如没有英文字幕、广告播放中、需要刷新页面、缺少 Key、翻译服务拒绝请求等。

## 本机 Whisper（可选，进阶）

给没有英文字幕的 YouTube 视频使用。普通用户可以不启用。

准备：

1. Node.js 20 或更新版本。
2. whisper.cpp 的 `whisper-cli`（放在 `PATH` 中）、一个 `ggml-*.bin` 模型文件（例如 `ggml-base.en.bin`，需要自行下载）和 `ffmpeg`；或者使用 OpenAI Python 版 `whisper` 命令。

使用：

1. 在仓库根目录启动本机 helper：

```bash
PBT_WHISPER_MODEL=/path/to/ggml-base.en.bin npm run local-whisper
```

2. 打开没有英文字幕的 YouTube 视频并播放（不要静音），按住 `Alt/Option` 点击 `幕`。扩展会捕获当前标签页约 3 秒一段的音频，只发送到本机 `127.0.0.1:8765` 识别，再把识别出的英文交给当前选择的翻译服务。

说明：

1. 实时识别必须先听到声音，字幕会比声音晚 3–8 秒。识别在本机完成，网速只影响翻译环节。
2. helper 只监听 `127.0.0.1:8765`，扩展里写死了这个地址，请不要修改端口。
3. 可用环境变量：`PBT_WHISPER_COMMAND`、`PBT_WHISPER_ENGINE`、`PBT_WHISPER_MODEL`、`PBT_WHISPER_EXTRA_ARGS`、`PBT_WHISPER_CPP_USE_GPU`（Apple Silicon 设为 `1` 可启用 GPU 加速，默认关闭）、`PBT_FFMPEG_COMMAND`、`PBT_WHISPER_TIMEOUT_MS`、`PBT_FFMPEG_TIMEOUT_MS`。
4. 只在 macOS 上验证过。helper 用 `/bin/sh` 查找命令，Windows 需要用环境变量指定命令，未验证。
5. 这个模式会增加本机 CPU 占用和翻译服务的请求频率。

## 开发者：从源码加载和测试

项目没有依赖，也不需要构建。运行测试需要 Node.js 20 或更新版本。

运行测试：

```bash
npm test
```

运行静态审计：

```bash
npm run audit
```

从源码加载扩展：

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

公开仓库不会预置第三方中转站。自定义 provider 的网络目的地必须来自用户填写的 HTTPS 地址，并在翻译时由用户授权对应 origin。域名授权在 popup 中点击翻译时申请；使用中转站翻译 YouTube 字幕前，建议先在 popup 里用中转站翻译一次网页，完成授权。

## 权限说明

当前 manifest 使用：

1. `activeTab`：用户手动触发翻译时处理当前 tab。
2. `storage`：保存用户主动选择的站点设置（包括 YouTube 字幕大小）和 API Key 保存模式。
3. `scripting`：在需要时向当前 tab 注入本地 content script。
4. `tabCapture` / `offscreen`：仅用于可选的本机 Whisper，在用户按住 `Alt/Option` 点击 `幕` 后捕获当前 YouTube 标签页的短音频块。
5. `content_scripts.matches` 的 `http://*/*` 和 `https://*/*`：在普通网页显示右侧控制入口，并在 YouTube 视频页显示 `幕` 按钮。
6. `host_permissions`：允许请求免费翻译 endpoint、官方 Gemini endpoint 和本机 `http://127.0.0.1:8765/*` Whisper helper。
7. `optional_host_permissions` 的 `https://*/*`：仅用于用户配置自定义 provider 后，在运行时请求对应 HTTPS origin。

项目不申请 `tabs`、`history`、`cookies`、`webRequest`、`debugger` 或 `all_urls`。

## 仓库结构

```text
manifest.json       Chrome MV3 manifest
src/background/     background service worker, provider orchestration, key handling
src/content/        page text collection, rendering, restore/remove behavior, YouTube captions
src/floating-settings/  right-side extension settings iframe
src/offscreen/      optional local Whisper audio recorder (offscreen document)
src/popup/          extension popup UI
src/providers/      translation provider adapters
src/shared/         shared policies and message types
scripts/            optional local Whisper helper server
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

当前版本暂未发布到 Chrome Web Store。请先按上面的步骤从 Releases 的 zip 或源码加载扩展。

后续如果发布商店版本，本仓库会继续保留源码、变更记录和安全说明。

## 已知限制

1. 不翻译 iframe、PDF、图片或 OCR 内容。
2. YouTube 字幕只支持有英文字幕的视频。页面打开很久、字幕已开启且在站内切换过视频时，偶尔需要刷新页面才能读到字幕请求；站内切换到没有字幕的视频时，提示会是“请打开 CC 或刷新页面”，刷新后才会显示“没有英文字幕”。
3. 没有逐词时间的自动字幕按整行翻译，一行常常是半句话，翻译质量会差一些。
4. 本机 Whisper 字幕一定晚于声音，且只在 macOS 上验证过。
5. 自定义 provider 的输出格式和速度取决于用户选择的服务。
6. 长页面自然版或深度版可能触发 provider 限流，需要按真实 provider 表现调小并发。
7. SPA 页面如果超过当前 settle 窗口很久才显示正文，仍可能需要针对具体 DOM 行为继续修复。

## License

MIT. See [LICENSE](LICENSE).
