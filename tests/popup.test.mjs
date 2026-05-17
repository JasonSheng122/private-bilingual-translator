import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("popup labels replace mode as direct translation", async () => {
  const html = await readFile(new URL("../src/popup/popup.html", import.meta.url), "utf8");

  assert.match(html, /<option value="bilingual">双语翻译<\/option>/);
  assert.match(html, /<option value="replace">直接翻译<\/option>/);
  assert.match(html, /<option value="natural">自然版<\/option>/);
  assert.match(html, /<option value="deep">深度版<\/option>/);
  assert.match(html, /<option value="gemini" selected>Gemini API<\/option>/);
  assert.match(html, /<option value="custom_openai">自定义中转站<\/option>/);
  assert.doesNotMatch(html, /自定义 OpenAI 中转站/);
  assert.doesNotMatch(html, /自定义 Gemini 中转站/);
  assert.match(html, /<section id="keyPanel" class="key-panel" aria-label="API Key" hidden>/);
  assert.match(html, /id="customBaseUrlInput"/);
  assert.match(html, /id="customModelInput"/);
  assert.match(html, /id="apiKeyInput" type="password"/);
  assert.match(html, /id="apiKeyStatus"/);
  assert.match(html, /<option value="session" selected>本次会话<\/option>/);
  assert.doesNotMatch(html, />Replace<\/option>/);
});

test("popup reports actual rendered translation count", async () => {
  const js = await readFile(new URL("../src/popup/popup.js", import.meta.url), "utf8");

  assert.match(js, /response\.status === "no_render"/);
  assert.match(js, /response\.renderedCount/);
  assert.match(js, /Translated \$\{translatedCount\} item\(s\)\./);
});

test("popup only shows paid provider controls for paid quality modes", async () => {
  const js = await readFile(new URL("../src/popup/popup.js", import.meta.url), "utf8");

  assert.match(js, /function updatePaidPanelVisibility\(\)/);
  assert.match(js, /keyPanel\.hidden = !isPaidQualityMode\(\)/);
  assert.match(js, /qualityMode\.value === QUALITY_MODES\.NATURAL \|\| qualityMode\.value === QUALITY_MODES\.DEEP/);
  assert.match(js, /const singleUseApiKey = isPaidQualityMode\(\) && apiKeyStorageMode\.value === "once"/);
});

test("popup requests custom provider permission only when translating", async () => {
  const js = await readFile(new URL("../src/popup/popup.js", import.meta.url), "utf8");

  assert.match(js, /type === MESSAGE_TYPES\.TRANSLATE_PAGE && isPaidQualityMode\(\) && isCustomPaidProvider\(\)/);
  assert.match(js, /function isCustomPaidProvider\(\)/);
  assert.match(js, /function normalizePopupPaidProvider\(value\)/);
  assert.match(js, /value === "custom_openai" \|\| value === "custom_gemini" \? "custom_openai" : "gemini"/);
  assert.doesNotMatch(js, /async function saveCurrentCustomProviderConfig\(\) \{\n\s*const permission = await requestCustomProviderPermission/);
});

test("popup saves custom provider config without api key", async () => {
  const js = await readFile(new URL("../src/popup/popup.js", import.meta.url), "utf8");
  const match = js.match(/async function saveCurrentCustomProviderConfig\(\) \{[\s\S]*?\n\}/);

  assert.ok(match);
  assert.match(match[0], /SAVE_CUSTOM_PROVIDER_CONFIG/);
  assert.match(match[0], /baseUrl: customBaseUrlInput\.value/);
  assert.match(match[0], /model: customModelInput\.value/);
  assert.doesNotMatch(match[0], /apiKey|apiKeyInput|SAVE_API_KEY/);
});
