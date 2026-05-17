# SECRETS_POLICY.md

## 目的

本文件定义 API Key 和中转站密钥的处理方式。

密钥包括：

1. Gemini API Key。
2. OpenAI 兼容中转站 API Key。
3. 自定义供应商 API Key。
4. 本地模型授权 token。
5. 未来新增供应商凭据。

## 三种密钥模式

## 模式 1：单次使用

行为：

1. 用户在 popup 中输入 API Key。
2. 本次翻译请求使用这个 Key。
3. 不写入 chrome.storage.local。
4. 不写入 chrome.storage.session。
5. 不发送给 content script。
6. 请求结束后清空后台引用。
7. 下一次使用需要重新输入。

用途：

最高隐私。

代价：

最麻烦。

## 模式 2：本次会话

行为：

1. 用户输入 API Key。
2. Key 写入 chrome.storage.session。
3. 浏览器重启后清空。
4. 扩展重载后清空。
5. 扩展更新后清空。
6. 扩展禁用后清空。
7. 默认不暴露给 content script。
8. 用户可以手动清除。

用途：

默认推荐。

代价：

重启浏览器后需要重新输入。

## 模式 3：本地保存

行为：

1. 用户明确选择保存到本地。
2. Key 写入 chrome.storage.local。
3. 浏览器重启后仍然存在。
4. 不使用 chrome.storage.sync。
5. 不暴露给 content script。
6. 用户可以一键清除。

用途：

方便。

代价：

安全性低于会话保存。

## 默认策略

1. 默认使用本次会话模式。
2. 单次使用模式始终可选。
3. 本地保存必须用户主动选择。
4. UI 必须明确显示当前密钥保存方式。

## 供应商配置

base URL 和模型名敏感性低于 API Key。

默认策略：

1. 供应商类型可以保存。
2. base URL 只有用户同意时保存。
3. 模型名只有用户同意时保存。
4. API Key 默认只存会话。

自定义 provider：

1. `Base URL` 和 `model` 由用户在 popup 中主动填写并保存。
2. 保存 `Base URL` 时必须校验为 HTTPS，且不能包含 username、password、query 或 hash。
3. API Key 与官方 Gemini Key 分开保存，仍遵守单次、会话、本地三种模式。
4. Gemini-compatible provider 的 API Key 只能进入 `x-goog-api-key` header，不能进入 URL query。
5. OpenAI-compatible provider 的 API Key 只能进入批准的 key header，不能进入 URL query。
6. content script 只能看到 provider id 枚举，不能读取 `Base URL`、model 或 API Key。

## 密钥处理铁律

1. 密钥不能进入 content script。
2. 密钥不能进入 DOM。
3. 密钥不能放进 URL query。
4. 密钥不能进入日志。
5. 密钥不能进入错误信息。
6. 密钥不能进入测试快照。
7. 密钥不能进入缓存。
8. 密钥不能写入开发日志、公开文档、PR 说明或提交信息。
9. 密钥不能写入 AUDIT.md。
10. 密钥不能出现在截图中。

## UI 要求

设置页和弹窗需要提供：

1. 供应商选择。
2. Gemini API Key 输入框。
3. OpenAI 兼容 API Key 输入框。
4. OpenAI 兼容 base URL 输入框。
5. 模型名输入框。
6. 密钥保存方式选择。
7. 清除会话密钥按钮。
8. 清除本地密钥按钮。

API Key 输入框必须使用密码样式显示。

UI 必须清楚显示：

1. 单次使用。
2. 保存到本次会话。
3. 保存到本地。

## 后台规则

只有可信扩展环境能访问密钥。

允许访问：

1. background service worker。
2. popup 提交密钥。
3. options page 提交密钥。
4. 右侧内嵌配置页提交密钥；该页面必须是 `chrome-extension://` 来源，不能是 content script 生成的普通网页 DOM 表单。

禁止访问：

1. content script。
2. 网页本身。
3. 页面 DOM。

## 测试要求

必须测试：

1. 单次 Key 不写任何存储。
2. 会话 Key 写入 chrome.storage.session。
3. 本地 Key 只有用户选择后写入 chrome.storage.local。
4. chrome.storage.sync 没有被调用。
5. content script 拿不到 API Key。
6. 日志隐藏 API Key。
7. 错误信息隐藏 API Key。
8. 清除会话密钥有效。
9. 清除本地密钥有效。
