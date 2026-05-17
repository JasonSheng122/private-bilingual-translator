import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("floating settings frame exposes provider config and key controls in extension page", async () => {
  const html = await readFile(new URL("../src/floating-settings/floating-settings.html", import.meta.url), "utf8");

  assert.match(html, /id="customBaseUrlInput" type="url"/);
  assert.match(html, /id="customModelInput" type="text"/);
  assert.match(html, /id="apiKeyInput" type="password"/);
  assert.match(html, /id="apiKeyStatus"/);
  assert.match(html, /<option value="session" selected>本次会话<\/option>/);
  assert.match(html, /<option value="local">本地保存<\/option>/);
  assert.doesNotMatch(html, /<option value="once">/);
});

test("floating settings saves custom provider config without api key", async () => {
  const js = await readFile(new URL("../src/floating-settings/floating-settings.js", import.meta.url), "utf8");
  const match = js.match(/async function saveCurrentCustomProviderConfig\(\) \{[\s\S]*?\nasync function saveCurrentApiKey/);

  assert.ok(match);
  assert.match(match[0], /SAVE_CUSTOM_PROVIDER_CONFIG/);
  assert.match(match[0], /baseUrl: customBaseUrlInput\.value/);
  assert.match(match[0], /model: customModelInput\.value/);
  assert.doesNotMatch(match[0], /apiKey|apiKeyInput|SAVE_API_KEY/);
});

test("floating settings saves api key through background only", async () => {
  const js = await readFile(new URL("../src/floating-settings/floating-settings.js", import.meta.url), "utf8");

  assert.match(js, /type: MESSAGE_TYPES\.SAVE_API_KEY/);
  assert.match(js, /provider: getSelectedPaidProvider\(\)/);
  assert.match(js, /apiKey: apiKeyInput\.value/);
  assert.match(js, /type: MESSAGE_TYPES\.GET_API_KEY_STATUS/);
  assert.match(js, /type: MESSAGE_TYPES\.CLEAR_API_KEY/);
  assert.doesNotMatch(js, /chrome\.storage/);
  assert.doesNotMatch(js, /console\./);
});
