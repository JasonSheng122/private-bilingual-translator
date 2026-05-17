# TEST_PLAN.md

## 目的

定义插件怎么测试。

测试分四层。

## 第一层：单元测试

必须覆盖：

1. domain_policy。
2. secret_manager。
3. provider URL 验证。
4. 网络白名单。
5. dom_collector 过滤。
6. renderer 防重复。
7. cost_estimator。
8. cache_manager。

## domain_policy 测试

必须测试：

1. mail.google.com 被阻止。
2. docs.google.com 被阻止。
3. drive.google.com 被阻止。
4. notion.so 被阻止。
5. github.com 公开页面可手动翻译。
6. github.com/settings 被阻止。
7. 黑名单优先于白名单。
8. 自动翻译需要白名单。
9. 敏感域名手动翻译需要强警告或阻止。
10. 未知域名默认只能手动翻译。

## secret_manager 测试

必须测试：

1. 单次 Key 不保存。
2. 会话 Key 使用 storage.session。
3. 本地 Key 只有用户主动选择后才使用 storage.local。
4. storage.sync 从未调用。
5. 清除会话 Key 有效。
6. 清除本地 Key 有效。
7. 错误信息隐藏 Key。
8. 日志隐藏 Key。
9. content script 不能请求 Key。
10. 供应商只能通过后台拿到 Key。
11. Key 状态查询只返回布尔值，不返回 Key 内容。

## dom_collector 测试

应该包含：

1. p。
2. h1。
3. h2。
4. h3。
5. li。
6. blockquote。
7. td。
8. th。

必须排除：

1. input。
2. textarea。
3. password。
4. contenteditable。
5. script。
6. style。
7. code。
8. pre。
9. hidden。
10. aria-hidden。
11. svg。
12. canvas。
13. math。
14. 社交媒体用户名称、`@handle` 和用户 ID。
15. SVG/diagram namespace 中小写 `svg`、`text` 等 tagName 的文本也必须被排除。
16. 已翻译出的目标语中文文本不应再次进入 collect，避免再次点击翻译时把译文当作原文。

## renderer 测试

直接翻译：

1. 只替换一次。
2. 不重复。
3. 恢复原文有效。
4. 原文不持久化保存。
5. 直接翻译后切到双语翻译可以重新收集原文。
6. 如果直接翻译后的 textNode 仍是插件译文，restore 才写回 originalText。
7. 如果直接翻译后的 textNode 已被 React/Vue/Next 页面更新，restore 不写回旧 originalText。
8. re-translate 前会清理 stale replace entries，避免旧 Map 阻止新文本收集。
9. 纯金额、数字、百分比不进入 replace/restore 快照。
10. content script 不使用 Unicode property regex，避免浏览器加载兼容性风险。
11. 社交媒体用户名称、handle 和用户 ID 不进入 replace 快照，也不会被直接翻译替换。
12. 直接翻译后再次执行直接翻译前会恢复旧 replace 状态并重新收集原文，避免切换自然版/深度版后出现 `No translatable text found`。
13. 直接翻译启用后，如果 React/Vue/Next hydration 或动态渲染把插件译文 textNode 改回原文，右侧自动翻译会重新触发一次 `PBT_TRANSLATE_PAGE`。
14. provider 返回空译文或等于原文的译文时，不计入 replace 成功渲染，也不写入 replace 快照。
15. 直接翻译启用后的自动重翻译必须走增量模式，不先 restore 已有译文；即使增量付费请求缺少已保存 Key 或失败，也不能把已有译文恢复成原文。
16. 页面右侧悬浮按钮已翻译后，如果用户切换免费/自然/深度或付费供应商，再次点击带绿色勾选的 `译` 必须按开关语义还原并取消勾选；重新点击未勾选的 `译` 才按新设置翻译，不能重复渲染时报 `No translated text was rendered`。
17. 页面右侧设置从直接翻译切到双语翻译时，如果页面已翻译，必须自动先恢复原文再按双语模式重新渲染。
18. 手动完整翻译 collect 不应被未返回的自动增量请求占位跳过当前正文。
19. 同一段落中存在 inline `code`、链接或加粗等子元素时，直接翻译必须能替换代码前后的所有普通 text node，不能因为父元素已标记 `data-pbt-replaced` 就跳过兄弟 text node。
20. 点击还原原文或进入重翻译 prepare 后，旧的 pending incremental segment id 必须失效；旧 provider 响应晚到时不能把顶部导航、左侧目录或正文局部重新渲染成译文。
21. 点击带绿色勾选的右侧 `译` 时，restore 动作不能走翻译等待态的一帧延迟调度；即使翻译动作为了绘制等待态延迟发送，取消勾选也必须立即发送 `PBT_RESTORE_PAGE` 并恢复原文。

双语翻译：

1. 在原文下方插入译文。
2. 不重复插入。
3. 移除译文有效。
4. 原文保持不变。
5. 点击还原可以移除双语译文并回到原文页面状态。
6. 已翻译过的原文节点不再重复进入下一次 collect。
7. SPA 页面新增正文只收集新增文本。
8. provider 返回空译文或等于原文的译文时，不插入双语译文节点。
9. SPA 页面复用同一个 text node 改写正文时，旧双语译文节点会被清理，新正文重新进入 collect。
10. SVG/diagram 内的文本不进入 collect，也不能插入双语译文节点。
11. 页面右侧设置从双语翻译切到直接翻译时，如果页面已翻译，必须自动先移除旧双语译文，再按直接翻译重新渲染。

## provider 测试

必须测试：

1. 空输入被拒绝。
2. 大输入被分批。
3. 允许 endpoint 通过。
4. 未知 endpoint 被拒绝。
5. API 错误转成结构化错误。
6. 不记录请求体。
7. 不记录响应体。
8. 不记录 API Key。
9. 不静默切换供应商。
10. 能输出成本估算。
11. 批量请求保持 segment 顺序。
12. 批量请求不突破 endpoint 白名单和请求大小限制。
13. Gemini provider 使用 `x-goog-api-key` header。
14. Gemini provider 不把 Key 放进 URL query。
15. Gemini provider 响应解析失败时返回净化错误。
16. 自定义 Gemini-compatible provider 使用 `x-goog-api-key` header。
17. 自定义 Gemini-compatible provider 不把 Key 放进 URL query。
18. 自定义 Gemini-compatible provider 只请求用户填写的 HTTPS `Base URL` 拼出的 `/v1beta/models/{model}:generateContent` endpoint。
18.1. 自定义 OpenAI-compatible provider 使用批准的 key header。
18.2. 自定义 OpenAI-compatible provider 不把 Key 放进 URL query。
18.3. 自定义 OpenAI-compatible provider 只请求用户填写的 HTTPS `Base URL` 拼出的 `/v1/chat/completions` endpoint。
19. Gemini provider 对超出单次请求大小的多 segment 输入分批，且每批不超过 `maxRequestSize`。
20. 自定义 Gemini-compatible provider 对超出单次请求大小的多 segment 输入分批，且每批不超过 `maxRequestSize`。
21. 付费 provider 分批后仍按原 segment 顺序合并译文。
22. 自定义 Gemini-compatible provider 对 401/403 返回净化后的 Key 被拒绝错误，不包含 API Key 或页面原文。
23. Gemini provider 对 401/403 返回净化后的 Key 被拒绝错误，不包含 API Key 或页面原文。
24. 自定义 Gemini-compatible provider 接受 JSON array、对象包裹、按 id 返回对象和单段纯中文译文。
25. Gemini provider 接受 JSON array、对象包裹和单段纯中文译文。
26. Gemini/custom Gemini-compatible provider 对 HTTP 200 中的 `error` payload 返回净化错误，不包含 API Key、页面原文或响应体。
27. Gemini/custom Gemini-compatible/custom OpenAI-compatible provider 对分批付费请求使用有限并发，自然版默认 6 路、深度版默认 8 路、硬上限 8 路，并保持 segment 顺序。
28. Gemini/custom Gemini-compatible provider 接受无 id 的有序字符串数组或文本对象数组，并按本批次 segment 顺序回填。
29. Gemini/custom Gemini-compatible provider 接受 `translations`、`items`、`data`、`results`、`result`、`output` 这类常见对象包裹。
30. Gemini/custom Gemini-compatible provider 深度版 prompt 必须明确要求输出简体中文译文，不能整句照抄英文原文。
31. Gemini/custom Gemini-compatible provider 接受保留换行的 JSONL、编号纯文本行、Markdown table 行和 raw text fallback。
32. Gemini/custom Gemini-compatible provider 接受 OpenAI-compatible `message.content` 数组和 direct `output` 文本数组。
33. Gemini/custom Gemini-compatible provider 请求必须显式设置 `generationConfig.thinkingConfig.thinkingBudget = 0`，降低翻译任务延迟和思考 token 成本。
34. 自然版 prompt 必须禁止解释；深度版 prompt 必须对长句、抽象句、技术句或观点句要求可见的短 `（白话：...）` 说明。
35. Gemini/custom Gemini-compatible/custom OpenAI-compatible provider 深度版长页面必须拆成较小延迟批次并默认使用 8 路并发请求，同时仍保持单段上限、endpoint 白名单和 segment 顺序。
36. Gemini/custom Gemini-compatible/custom OpenAI-compatible provider 自然版/深度版目标批大小变化后，长页面分批测试仍必须覆盖批次上限、并发上限和顺序合并。
37. 付费 provider 返回“英文原文 + 中文说明”或整段英文未翻译时，必须触发一次严格重试；重试后没有任何 segment 通过 output gate 时返回净化错误，不把该结果当成成功译文。
38. 付费 provider 严格重试后只有部分 segment 仍未翻译时，必须跳过未通过门槛的 segment，保留已翻译 segment，并保持 segment 顺序。

## 第二层：集成测试

测试消息流：

1. popup 到 background。
2. background 到 content script。
3. content script 到 background。
4. background 到 provider。
5. provider 到 background。
6. background 到 content script。
7. content script 渲染结果。
8. background 先 ping manifest 已注入的 content script；如果 popup/用户触发路径 ping 失败，则只对当前 activeTab 执行一次 `chrome.scripting.executeScript` fallback。
9. content script 不存在且 fallback 注入失败时返回 `content_script_unavailable`，提示刷新页面。
10. 扩展 reload 后旧 content script 调用 `chrome.runtime.sendMessage` 失效时，不产生未捕获异常，并清理旧右侧入口。
11. 右侧悬浮按钮收到 provider 错误时显示失败状态，并通过 title/aria-label 暴露净化后的错误原因。
12. popup 查询 Key 状态时只显示是否已保存，不接收 Key 明文。
13. popup 发起翻译时，如果 content script 第一次 ping 暂时失败，background 会短暂重试后再决定是否提示刷新页面。
14. popup 持续无法连上 content script 且 fallback 注入失败时，background 只返回结构化错误，不自动刷新页面。
15. content script 触发的自动重翻译带 `incremental: true`，background 只对来自 content script 的增量翻译跳过 `PBT_PREPARE_TRANSLATION`；popup 传入该标记时仍必须执行 prepare。
16. content script 自动重翻译请求进行中再次发生 SPA/tab 内容变化时，最新可见变化可以在最多 2 个并发增量请求内立即补发 `incremental: true` 翻译；超过上限的变化继续排队。
17. content script 对 SPA/tab 可见内容变化的自动增量翻译 debounce 应保持短延迟，避免插件侧额外等待明显拖慢用户切换。
18. content script 在 `restorePage` 或 `prepareTranslation` 时会失效旧 collected segment，确保旧增量响应不能在用户还原或重翻译后落地。
19. 右侧 `translate` 动作可以延后一帧以绘制等待态；点击带绿色勾选的 `译` 触发的 `restore` 动作必须立即发送内部消息，不新增 `requestAnimationFrame` callback。
20. content script 自动增量翻译 in-flight 时会显示右侧“正在翻译，请稍等”状态条；多个自动增量请求并发时，最后一个请求完成后才隐藏。
21. content script 对 hidden/未稳定 SPA tab 新内容执行有限 settle 重扫：首次 collect 无文本时，内容变可见后仍能补翻；同批 mutation 里即使已有可见导航/目录小块触发了短 debounce，hidden 主正文仍要保留一次 settle 补扫；正常可见新增正文不因此重复发 provider 请求。
22. content script 对网站自带中文页面执行自动翻译暂停：`html lang="zh..."`、URL locale 或保守中文占比命中时，stored auto translate 和自动增量翻译不应发送 `PBT_TRANSLATE_PAGE`，右侧按钮显示 `译` 且无绿色勾选，暂停状态不能在每次 mutation 中反复改写插件浮窗。

## 第三层：手动浏览器测试

公开网页测试：

1. 打开公开英文文章。
2. 使用免费版加双语翻译。
3. 确认原文保留。
4. 确认中文在下方。
5. 确认表单字段没有被翻译。

直接翻译测试：

1. 打开公开英文文章。
2. 使用免费版加直接翻译。
3. 确认文本被替换。
4. 点击恢复。
5. 确认原文回来。
6. 先使用双语翻译，再使用直接翻译，确认不会保留上一轮双语译文节点。
7. 在 React/Next.js 动态计算器中使用直接翻译后，改变页面状态。
8. 确认页面更新出的金额不会被 restore 或二次翻译改回旧金额。
9. 确认 `$1,800.00`、`3200`、`20%` 这类纯金额/数字/百分比不会进入翻译片段。
10. 在社交媒体页面确认用户显示名、`@handle`、用户 ID 保持原文，正文内容仍可翻译。
11. 使用自然版直接翻译后点击恢复原文，再切换深度版直接翻译，确认不再提示 `No translatable text found`。

页面悬浮按钮测试：

1. 打开公开英文文章。
2. 确认页面右侧中部自动出现翻译、设置和隐藏三个圆形按钮。
3. 点击设置按钮，确认设置面板显示双语/直接模式选择。
4. 在设置面板中切换免费/自然/深度质量模式。
5. 在设置面板中切换自定义中转站或 Gemini 付费供应商。
6. 在设置面板中切换双语/直接模式。
7. 确认右侧设置不在网页 DOM 中放置 API Key 输入框；自然版/深度版显示扩展来源的内嵌配置面板，可直接保存 Key、中转站 Base URL 和 model。
8. 点击设置面板外的页面正文区域，确认设置面板自动收起。
9. 再次打开设置并选择某种显示模式，刷新同一网站页面。
10. 确认后续打开同一 origin 页面时默认使用上次选择的显示模式。
11. 点击页面内翻译按钮。
12. 确认按钮左下角出现绿色勾选，表示当前网址已翻译并开启本站默认翻译。
13. 站内切换 SPA 内容，确认新增的中间正文和右侧目录继续触发翻译。
14. 先用自然版翻译当前页，再在右侧设置中切换深度版并点击带绿色勾选的主按钮，确认先还原并取消勾选；再次点击未勾选的 `译` 后按深度版翻译，不提示 `No translated text was rendered`。
15. 已翻译后切换双语/直接显示模式，确认页面自动先回到原文再按新显示模式重新翻译，不需要再点击 `译`，且不提示 `No translated text was rendered`。
16. 主按钮文字始终显示 `译`；成功翻译后只在按钮左下角显示绿色勾选，不改成 `原`。
17. 在设置未变化时点击带绿色勾选的 `译`，确认页面还原成原文、绿色勾选消失，且当前网址默认翻译启用态取消。
17.1. 点击未勾选的 `译` 后，在请求返回前确认按钮显示上下波动的三点加载态，并显示“正在翻译，请稍等”状态条；请求结束后状态条消失，按钮恢复为带或不带绿色勾选的 `译`。
17.2. 点击带绿色勾选的 `译` 时确认原文立即恢复，不显示“正在翻译，请稍等”，也不需要等待下一帧或再次点击。
18. 点击网页自身的展开、折叠、详情或更多按钮，让原本隐藏的正文变为可见。
19. 确认新增可见正文继续触发翻译。
20. 确认闭合 `<details>` 内正文不会在打开前提前翻译，打开后才翻译。
21. 点击右侧翻译按钮成功后，刷新同一 origin 的子页面。
22. 确认子页面默认使用上次的翻译质量、付费供应商和显示模式自动翻译。
23. 再点击同一个带绿色勾选的翻译按钮还原。
24. 确认绿色勾选消失，并且再次打开同一 origin 子页面时不再自动翻译。
25. 点击隐藏按钮，确认按钮组收起到右侧把手。
26. 点击右侧把手，确认按钮组重新显示。
27. 确认页面内不再显示独立的双语/直接切换、还原或移除按钮。
28. 确认翻译执行，且按钮自身没有被翻译。
28. 确认按钮文字居中，按钮不会明显遮挡正文。
29. 在 `chrome://extensions` reload 插件，确认没有 `An unknown error occurred when fetching the script.`。
30. 如果 popup 提示 `Reload this page and try again.`，刷新目标网页后再点击翻译。
30. 不刷新目标网页时点击 reload 前残留的旧右侧按钮，确认不再新增 `Extension context invalidated` 错误。
31. 刷新目标网页后确认新右侧按钮重新显示，并可正常翻译。
32. 使用自然版/深度版但未保存自定义 provider Key 或 Key 被拒绝时，确认右侧按钮显示 `!`，hover 能看到净化后的错误原因。
33. 使用深度版时，如果 provider 返回等于原文的内容，popup 或右侧按钮不显示 `Translated n item(s).` 假成功。
34. 在自然版或深度版翻译请求尚未返回时切换站内 tab，确认新 tab 正文无需等待旧请求结束即可尽快发起增量补翻，且并发请求不超过 2 个。
34.1. 切换站内 tab 触发自动增量补翻时，确认右侧出现“正在翻译，请稍等”；如果连续触发多个补翻，请求全部结束后状态条才消失。
34.2. 切换到某些先出现 hidden/空容器再显示正文的 tab 时，等待约半秒后确认中间正文和右侧目录继续补翻，不长期停在英文原文；如果左侧/右侧目录先变成可见文本，主正文仍必须在 settle 后补翻。
35. 在双语模式下切换会复用 text node 的 SPA tab，确认旧译文消失，新正文重新出现对应译文，旧 provider 响应不会渲染到新正文上。
36. 免费版翻译后再次点击翻译时，确认已是中文的译文不会被当作新原文发送，也不会提示 `No translated text was rendered`。
37. 使用深度版切换 SPA tab 后，确认正文标题和段落不是“英文原文 + （白话：...）”，而是中文译文后再追加可选白话说明。
38. 在右侧 `设` 面板中选择自然版或深度版，确认内嵌配置面板是 `chrome-extension://` 来源的 iframe，并且网页脚本无法从父 DOM 读取其中的 API Key 输入值。
39. 使用自然版或深度版翻译包含英文标题和英文正文的长页面，确认如果 provider 保留少量标题英文，正文已翻译内容仍能落地，不出现整页 `The translation provider returned untranslated text`。
40. 在直接翻译模式下打开包含 inline `code` 的英文段落，确认代码前后的普通正文都变为中文，代码本身保持原样。
41. 在自然版或深度版增量翻译可能仍在返回中的情况下点击带绿色勾选的右侧 `译`，确认顶部导航、左侧目录、右侧目录和中间正文都恢复原文，并且等待几秒后不会被旧响应重新翻回中文。
42. 在 popup 中保存当前付费供应商的 Key 后，关闭右侧 `设` 再重新打开，确认内嵌配置页显示 Key 已保存，而不是旧的未保存状态。
43. 在普通文档站开启当前 origin 自动翻译后，切到网站自带中文版本 `/zh/` 或 `/zh-cn/`，确认页面不再自动翻译、Network 不新增 provider 请求、右侧按钮显示 `译` 且无绿色勾选，网页自身导航和点击不被卡住。
44. 在同一多语言站点从中文版本切回英文 lecture 页面，确认 origin 级自动翻译偏好没有被清除，仍可按原偏好继续翻译英文页面。

敏感页面测试：

1. 打开 mail.google.com。
2. 确认页面右侧不显示控制按钮组。
3. 点击扩展。
4. 确认阻止或强警告。
5. 确认没有 provider 请求。

密钥模式测试：

1. 在 popup 中选择自然版。
2. 选择自定义中转站，填写 HTTPS `Base URL` 和 `model`，不输入 API Key 也可以保存配置，保存配置时不应弹出 host permission。
2.1. 点击翻译时确认浏览器请求对应 origin 权限。
3. 输入自定义 provider API Key，选择单次使用，点击翻译。
4. 确认请求使用 `x-api-key` header，URL query 中没有 Key，请求 host 来自用户填写的 `Base URL`。
5. 切换到 Gemini API，输入 Gemini API Key，选择单次使用，点击翻译。
6. 确认请求使用 `x-goog-api-key` header，URL query 中没有 Key。
7. 在长页面使用自然版或深度版，确认 provider 可以拆成多个批准 endpoint 请求，而不是直接显示 `provider_request_too_large`。
8. 确认单次 Key 不写入 `chrome.storage.session` 或 `chrome.storage.local`。
9. 输入 API Key，选择本次会话，点击保存 Key。
10. 确认 Key 写入 `chrome.storage.session`，本地 storage 无 Key。
11. 使用自然版或深度版翻译，确认不需要再次输入 Key。
12. 点击清除会话 Key，确认会话 Key 被清除。
13. 输入 API Key，主动选择本地保存，点击保存 Key。
14. 确认 Key 写入 `chrome.storage.local`。
15. 点击清除本地 Key，确认本地 Key 被清除。
16. 确认 content script 拿不到 API Key。
17. 确认错误信息和日志不包含 API Key。
18. 切换付费供应商后，popup 明确显示该供应商是否已有会话 Key 或本地 Key。
19. 在右侧内嵌配置面板保存 Key 时，确认请求仍通过 background 的 `SAVE_API_KEY`，会话 Key 写入 `chrome.storage.session`，本地 Key 只有用户选择本地保存时写入 `chrome.storage.local`。
20. popup 保存 Key 后再打开右侧内嵌配置面板，确认配置面板通过 background 重新查询 `GET_API_KEY_STATUS`，并与 popup 的 Key 状态一致。

站点设置存储测试：

1. 在公开网页 A 上把显示模式设置为直接翻译。
2. 刷新同一 origin 下的另一个页面。
3. 确认右侧设置面板和 popup 默认显示直接翻译。
4. 在公开网页 B 上确认默认使用最近一次用户选择的显示模式、翻译质量和付费供应商，但不会自动翻译，除非该 origin 单独开启过自动翻译。
5. 在敏感域名页面确认不显示右侧入口，且不会保存站点显示模式。
6. 在公开网页 A 上点击右侧翻译按钮成功后，打开同一 origin 的另一个页面。
7. 确认该子页面默认自动翻译，并沿用上次的翻译质量、付费供应商和显示模式。
8. 再点击带绿色勾选的右侧翻译按钮还原，确认绿色勾选消失，且同一 origin 后续页面不再自动翻译。
9. 在 DevTools Application 面板确认只保存 origin、显示模式枚举、翻译质量枚举、付费供应商枚举和自动翻译布尔值，不保存完整 URL、网页原文或译文正文。
10. 在 DevTools Application 面板确认跨网站默认值只保存显示模式、翻译质量和付费供应商三个枚举，不保存完整 URL、网页原文、译文正文或 API Key。

## 第四层：运行时网络审计

使用 DevTools Network 面板。

必须检查：

1. 免费版只有批准的免费翻译请求。
2. Gemini 模式只有 Gemini 请求。
3. 自定义 OpenAI-compatible / Gemini-compatible 模式只请求用户填写并授权的 HTTPS provider origin。
4. 没有 analytics。
5. 没有 telemetry。
6. 没有开发者服务器。
7. 敏感域名没有翻译请求。
