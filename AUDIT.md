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

1. fetch 只能出现在 provider 模块或批准的网络工具模块。
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
