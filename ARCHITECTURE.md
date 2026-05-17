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

1. 所有 fetch 只能出现在这里或批准的网络工具模块。
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
