import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCustomGeminiEndpoint,
  buildCustomOpenAiEndpoint,
  getCustomProviderOriginPattern,
  getStoredCustomProviderConfig,
  normalizeCustomProviderBaseUrl,
  normalizeCustomProviderModel,
  saveCustomProviderConfig
} from "../src/background/custom-provider-config.mjs";

test("custom provider config normalizes base url and model", async () => {
  const storageArea = makeStorageArea();
  const saved = await saveCustomProviderConfig({
    baseUrl: "https://custom.example/",
    model: "models/gemini-2.5-flash-lite"
  }, storageArea);
  const stored = await getStoredCustomProviderConfig(storageArea);

  assert.equal(saved.ok, true);
  assert.equal(saved.baseUrl, "https://custom.example");
  assert.equal(saved.model, "gemini-2.5-flash-lite");
  assert.deepEqual(stored, {
    ok: true,
    configured: true,
    baseUrl: "https://custom.example",
    model: "gemini-2.5-flash-lite"
  });
  assert.equal(buildCustomGeminiEndpoint(stored), "https://custom.example/v1beta/models/gemini-2.5-flash-lite:generateContent");
  assert.equal(buildCustomOpenAiEndpoint(stored), "https://custom.example/v1/chat/completions");
});

test("custom provider config rejects unsafe base urls and models", async () => {
  const storageArea = makeStorageArea();

  assert.equal(normalizeCustomProviderBaseUrl("http://custom.example"), "");
  assert.equal(normalizeCustomProviderBaseUrl("https://user:pass@custom.example"), "");
  assert.equal(normalizeCustomProviderBaseUrl("https://custom.example?key=secret"), "");
  assert.equal(normalizeCustomProviderModel("models/gemini-2.5-flash-lite"), "gemini-2.5-flash-lite");
  assert.equal(normalizeCustomProviderModel("Gemini-2.5-flash-lite"), "gemini-2.5-flash-lite");
  assert.equal(normalizeCustomProviderModel("../secret"), "");

  const saved = await saveCustomProviderConfig({
    baseUrl: "http://custom.example",
    model: "gemini-2.5-flash-lite"
  }, storageArea);

  assert.equal(saved.ok, false);
  assert.equal(saved.error.code, "custom_provider_config_invalid");
  assert.equal(storageArea.data.pbt_custom_gemini_provider_config_v1, undefined);
});

test("custom provider origin pattern uses only the configured origin", () => {
  assert.equal(getCustomProviderOriginPattern("https://custom.example/path"), "https://custom.example/*");
  assert.equal(getCustomProviderOriginPattern("http://custom.example"), "");
});

test("custom openai endpoint accepts base url variants", () => {
  assert.equal(
    buildCustomOpenAiEndpoint({ baseUrl: "https://gateway.example", model: "Gemini-2.5-flash-lite" }),
    "https://gateway.example/v1/chat/completions"
  );
  assert.equal(
    buildCustomOpenAiEndpoint({ baseUrl: "https://gateway.example/v1", model: "gemini-2.5-flash-lite" }),
    "https://gateway.example/v1/chat/completions"
  );
  assert.equal(
    buildCustomOpenAiEndpoint({ baseUrl: "https://gateway.example/v1/chat/completions", model: "gemini-2.5-flash-lite" }),
    "https://gateway.example/v1/chat/completions"
  );
});

function makeStorageArea() {
  return {
    data: {},
    get(key, callback) {
      callback({ [key]: this.data[key] });
    },
    set(value, callback) {
      Object.assign(this.data, value);
      callback();
    }
  };
}
