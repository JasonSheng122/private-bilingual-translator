import assert from "node:assert/strict";
import test from "node:test";
import { translateSegments } from "../src/background/provider-manager.mjs";
import { MOCK_PROVIDER, translateWithMockProvider } from "../src/providers/mock-provider.mjs";

test("mock provider declares no network origin and no key requirement", () => {
  assert.deepEqual(MOCK_PROVIDER.allowedOrigins, []);
  assert.equal(MOCK_PROVIDER.requiresKey, false);
});

test("mock provider returns deterministic translations", () => {
  const result = translateWithMockProvider([
    { id: "a", text: "Hello world" },
    { id: "b", text: "  Multiple    spaces  " }
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "[mock zh] Hello world" },
    { id: "b", text: "[mock zh] Multiple spaces" }
  ]);
});

test("mock provider rejects empty input with a structured error", () => {
  const result = translateWithMockProvider([]);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "empty_segments");
});

test("provider manager selects google free provider for free mode", async () => {
  const result = await translateSegments({
    qualityMode: "free",
    segments: [{ id: "a", text: "Hello" }],
    fetchImpl: async (url, options) => ({
      ok: true,
      status: 200,
      url,
      options,
      async json() {
        const sourceText = new URL(url).searchParams.get("q");
        return [[[sourceText.replace("Hello", "zh:Hello"), sourceText, null, null]], null, "en"];
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "google_free");
  assert.deepEqual(result.translations, [{ id: "a", text: "zh:Hello" }]);
});

test("provider manager requires api key for paid quality modes without fallback", async () => {
  const result = await translateSegments({
    qualityMode: "natural",
    segments: [{ id: "a", text: "Hello" }],
    paidProvider: "gemini"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "missing_api_key");
});

test("provider manager selects gemini provider for natural mode with api key", async () => {
  const result = await translateSegments({
    qualityMode: "natural",
    segments: [{ id: "a", text: "Hello" }],
    apiKey: "test-key",
    paidProvider: "gemini",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([{ id: "a", text: "你好" }])
                  }
                ]
              }
            }
          ]
        };
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "gemini");
  assert.deepEqual(result.translations, [{ id: "a", text: "你好" }]);
});

test("provider manager selects gemini provider by default for paid modes", async () => {
  const result = await translateSegments({
    qualityMode: "natural",
    segments: [{ id: "a", text: "Hello" }],
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([{ id: "a", text: "你好" }])
                  }
                ]
              }
            }
          ]
        };
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "gemini");
  assert.deepEqual(result.translations, [{ id: "a", text: "你好" }]);
});

test("provider manager selects custom gemini provider only with user config", async () => {
  const result = await translateSegments({
    qualityMode: "natural",
    segments: [{ id: "a", text: "Hello" }],
    paidProvider: "custom_gemini",
    apiKey: "test-key",
    customProviderConfig: {
      baseUrl: "https://custom.example",
      model: "gemini-2.5-flash-lite"
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([{ id: "a", text: "你好" }])
                  }
                ]
              }
            }
          ]
        };
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "custom_gemini");
  assert.deepEqual(result.provider.allowedOrigins, ["https://custom.example"]);
  assert.deepEqual(result.translations, [{ id: "a", text: "你好" }]);
});

test("provider manager selects custom openai provider only with user config", async () => {
  const result = await translateSegments({
    qualityMode: "natural",
    segments: [{ id: "a", text: "Hello" }],
    paidProvider: "custom_openai",
    apiKey: "test-key",
    customProviderConfig: {
      baseUrl: "https://custom.example",
      model: "gemini-2.5-flash-lite"
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: "{\"translations\":[{\"id\":\"a\",\"text\":\"你好\"}]}"
              }
            }
          ]
        };
      }
    })
  });

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "custom_openai");
  assert.deepEqual(result.provider.allowedOrigins, ["https://custom.example"]);
  assert.deepEqual(result.translations, [{ id: "a", text: "你好" }]);
});

test("provider manager rejects custom gemini without user config", async () => {
  const result = await translateSegments({
    qualityMode: "natural",
    segments: [{ id: "a", text: "Hello" }],
    paidProvider: "custom_gemini",
    apiKey: "test-key"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "missing_custom_provider_config");
});

test("provider manager rejects custom openai without user config", async () => {
  const result = await translateSegments({
    qualityMode: "natural",
    segments: [{ id: "a", text: "Hello" }],
    paidProvider: "custom_openai",
    apiKey: "test-key"
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "missing_custom_provider_config");
});
