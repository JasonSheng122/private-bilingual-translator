# Privacy Policy

Private Bilingual Translator 是一个本地运行的 Chrome 扩展。项目目标是尽量减少默认读取、默认发送和默认保存的数据。

## 这个扩展会读取什么

扩展在普通 `http` 和 `https` 页面加载 content script，用于显示页面右侧控制入口和处理用户操作。

扩展只在以下情况收集可见文本片段：

1. 用户点击翻译。
2. 用户已经为当前 origin 主动开启自动翻译。
3. 已翻译页面出现新的可见内容，需要增量翻译。

扩展默认跳过：

1. `input`。
2. `textarea`。
3. password 字段。
4. `contenteditable`。
5. `code`。
6. `pre`。
7. hidden 元素。
8. `aria-hidden` 元素。
9. iframe。
10. 敏感域名页面。

## 这个扩展会发送什么

翻译时，扩展会把当前需要翻译的文本片段发送给用户选择的翻译 provider。

当前支持或计划支持的 provider 类型包括：

1. 免费 Google 翻译风格 adapter。
2. 官方 Gemini adapter。
3. 用户配置的 Gemini-compatible 或 OpenAI-compatible provider。
4. 用户配置的本地模型地址。

扩展不会把文本发送给遥测、分析统计、远程配置或开发者服务器。

## 这个扩展会保存什么

扩展可以保存：

1. 用户选择的翻译质量模式。
2. 用户选择的显示模式。
3. 用户选择的付费 provider id。
4. 用户主动开启的 origin 级自动翻译设置。
5. 用户选择保存的 API Key。

API Key 保存规则：

1. 单次使用：不写入 storage。
2. 会话保存：写入 `chrome.storage.session`，作为默认推荐模式。
3. 本地保存：只有用户明确选择时，才写入 `chrome.storage.local`。
4. 不使用 `chrome.storage.sync` 保存 API Key。

扩展不会持久化保存网页原文、译文正文、完整 HTML、provider 请求体或 provider 响应体。

## 当前页面内存状态

直接翻译模式为了支持恢复原文，会在当前页面会话内保存恢复所需的原文状态。该状态只存在于页面运行时内存中，不写入扩展 storage。

## 敏感域名

敏感域名会在 DOM 文本收集前被阻止。默认敏感类别包括邮箱、云盘、私人文档、密码管理器、金融、支付、医疗、政府身份、登录页和开发者密钥页面。

## 不收集的内容

扩展不收集：

1. 浏览历史。
2. tab 列表。
3. cookie。
4. 表单密码。
5. 账号系统数据。
6. 行为分析数据。
7. 遥测数据。

## 重要提醒

翻译 provider 会收到你选择翻译的文本片段。使用任何第三方 provider 前，应确认你信任该 provider，并了解它自己的隐私政策和数据处理方式。
