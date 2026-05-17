# RELEASE_CHECKLIST.md

## 目的

每次准备长期使用插件前，先过一遍这个清单。

## 权限检查

1. manifest.json 没有默认 all_urls。
2. 没有 tabs 权限。
3. 没有 history 权限。
4. 没有 cookies 权限。
5. 没有 webRequest 权限。
6. 没有 debugger 权限。
7. activeTab 用于手动翻译。
8. `scripting` 权限只用于用户触发的当前 activeTab fallback；默认入口仍优先走 manifest content script。
9. content_scripts 只匹配 http/https 页面，用于显示控制入口；敏感域名不显示入口且不收集正文。
10. storage 权限只用于保存用户主动选择的 origin 级翻译设置和 API Key。

## 网络检查

1. 免费版只请求批准的免费翻译 endpoint。
2. Gemini 只请求批准的 Gemini endpoint。
3. 自定义中转站只请求用户填写并授权的 HTTPS OpenAI-compatible 或 Gemini-compatible endpoint；公开发布前不得预置任何第三方中转站 endpoint。
4. 没有 analytics 请求。
5. 没有 telemetry 请求。
6. 没有开发者服务器请求。
7. 没有 WebSocket。
8. 没有 sendBeacon。
9. Gemini API Key 只出现在 `x-goog-api-key` header，不出现在 URL query。
10. 自定义中转站 API Key 只出现在批准的 request header，不出现在 URL query。

## 密钥检查

1. 默认密钥保存方式是会话保存。
2. 单次密钥不落盘。
3. 本地保存需要主动选择。
4. storage.sync 没有被使用。
5. content script 拿不到 API Key。
6. 日志没有 API Key。
7. 错误信息没有 API Key。
8. 清除会话 Key 有效。
9. 清除本地 Key 有效。

## 站点设置检查

1. `chrome.storage.local` 只保存 origin、显示模式枚举、翻译质量枚举、付费供应商枚举和自动翻译布尔值。
2. 不保存完整 URL。
3. 不保存网页原文。
4. 不保存译文正文。
5. 不保存 provider 请求体或响应体。
6. 敏感域名不会保存站点翻译设置。
7. 右侧翻译按钮固定显示 `译`；成功翻译后左下角显示绿色勾选，第二次点击取消勾选并还原后，同一 origin 的自动翻译布尔值会关闭。

## 文本检查

1. 原文没有进入日志。
2. 译文没有进入日志。
3. 原文默认没有持久化保存。
4. 完整 HTML 没有保存。
5. 缓存默认关闭。
6. 清除缓存按钮有效。

## DOM 检查

1. input 没有被翻译。
2. textarea 没有被翻译。
3. password 没有被翻译。
4. contenteditable 没有被翻译。
5. code 没有被翻译。
6. pre 没有被翻译。
7. hidden 元素没有被翻译。
8. iframe 第一版没有被翻译。

## 功能检查

1. 免费版加双语翻译可用。
2. 免费版加直接翻译可用。
3. 自然版加双语翻译可用。
4. 自然版加直接翻译可用。
5. 深度版加双语翻译可用。
6. 深度版加直接翻译可用。
7. 恢复原文有效。
8. 移除译文有效。
9. 敏感域名被阻止。
10. 长页面付费警告有效。
11. 用户主动开启过自动翻译的 origin 子页面会自动翻译。
12. 用户关闭该 origin 自动翻译后，子页面不再自动翻译。
13. 翻译启用后，网页自身展开隐藏正文时，新出现的可见文本会自动翻译；SPA 同批 mutation 中可见导航/目录先出现、hidden 主正文稍后显示时，主正文也会在有限 settle 后补翻。
14. 闭合 `<details>` 的正文不会提前翻译，打开后才翻译。
15. React/Next.js 动态页面中，直接翻译 restore 不会把已更新的新文本改回旧文本。
16. 纯金额、数字、百分比不会进入 replace/restore 快照。
17. `chrome://extensions` reload 插件时没有 `An unknown error occurred when fetching the script.`。
18. provider 返回等于原文的内容时，不显示 `Translated n item(s).` 假成功，右侧按钮显示净化后的失败原因。
19. 自然版/深度版 provider 返回 JSONL、编号行、Markdown table 或 OpenAI-compatible content array 时，不误报 invalid response。
20. 深度版直接翻译成功后，页面发生 SPA 新内容、混合可见 shell + hidden 主正文或隐藏内容展开时，自动重翻译不会先把已有译文恢复成原文。
21. 深度版长页面翻译速度可接受，默认 6 路并发不频繁触发 429，且复杂句能看到短 `（白话：...）` 说明；自然版不添加解释。

## 文档检查

1. README、PRIVACY、SECURITY 或相关 docs 已按需更新。
2. AUDIT.md 审计已完成。
3. TEST_PLAN.md 测试已完成。
4. CHANGELOG.md 已记录用户可见的新功能、修复、限制或发布风险。
5. 剩余风险已写明。

## 发布前检查

1. `LICENSE` 存在，并且许可证选择已经由项目所有者确认。
2. `.gitignore` 忽略 `.DS_Store`、依赖目录、构建产物、日志、压缩包和本地环境文件。
3. `.DS_Store` 不再被 git 跟踪。
4. README.md 是面向用户和开发者的项目说明。
5. PRIVACY.md 说明了文本收集、provider 请求、API Key 存储和敏感域名阻止边界。
6. SECURITY.md 说明了漏洞报告方式和禁止提交真实 API Key、网页原文、译文或 provider 原始响应。
7. CHANGELOG.md 存在，并说明当前版本和后续 bug fix / release notes 的公开展示方式。
8. 公开文档不包含真实 API Key、token、私人网页文本或个人数据。
9. 不内置第三方中转站默认项；用户自定义 provider 由用户自己填写 `Base URL`、`model` 和 `API Key`。
10. manifest 默认不预置第三方中转站 host permission。
11. manifest 的 `optional_host_permissions` 只用于用户保存自定义 provider 时请求对应 HTTPS origin。
12. `npm test` 通过。
13. `npm run audit` 通过。
14. 秘密扫描通过。

## Chrome Web Store 发布前检查

1. 发布 zip 不包含 `node_modules`、日志、压缩包、本地环境文件、测试截图或本地临时文件。
2. Chrome Web Store Developer Dashboard 中的 single purpose、权限说明、隐私披露和 store listing 与 README、PRIVACY.md、manifest.json 一致。
3. 对 `activeTab`、`storage`、`scripting`、普通 http/https content script、provider host permissions 和自定义 provider optional host permission 给出最小权限解释。
4. 如果发布新版本，先更新 `manifest.json` version、CHANGELOG.md 和 GitHub Release notes，再提交商店审核。
5. 商店用户只能看到已发布 extension、商店页和版本信息；源代码 diff、提交历史和详细 release notes 以公开 GitHub 仓库为准。
