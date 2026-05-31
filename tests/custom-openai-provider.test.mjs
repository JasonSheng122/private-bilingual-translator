import assert from "node:assert/strict";
import test from "node:test";
import {
  CUSTOM_OPENAI_PROVIDER,
  getCustomOpenAiProviderMetadata,
  isAllowedCustomOpenAiUrl,
  parseCustomOpenAiResponse,
  translateWithCustomOpenAiProvider
} from "../src/providers/custom-openai-provider.mjs";
import { buildCustomOpenAiEndpoint } from "../src/shared/custom-provider-config.mjs";

const CUSTOM_PROVIDER_CONFIG = Object.freeze({
  baseUrl: "https://custom.example",
  model: "gemini-2.5-flash-lite"
});
const CUSTOM_PROVIDER_ENDPOINT = buildCustomOpenAiEndpoint(CUSTOM_PROVIDER_CONFIG);

test("custom openai provider declares config-derived metadata and key requirement", () => {
  const metadata = getCustomOpenAiProviderMetadata(CUSTOM_PROVIDER_CONFIG);

  assert.equal(CUSTOM_OPENAI_PROVIDER.id, "custom_openai");
  assert.equal(CUSTOM_OPENAI_PROVIDER.requiresKey, true);
  assert.equal(CUSTOM_OPENAI_PROVIDER.maxConcurrentRequests, 6);
  assert.deepEqual(CUSTOM_OPENAI_PROVIDER.allowedEndpoints, []);
  assert.deepEqual(CUSTOM_OPENAI_PROVIDER.allowedOrigins, []);
  assert.equal(metadata.endpoint, "https://custom.example/v1/chat/completions");
  assert.deepEqual(metadata.allowedEndpoints, [CUSTOM_PROVIDER_ENDPOINT]);
  assert.deepEqual(metadata.allowedOrigins, ["https://custom.example"]);
  assert.equal(metadata.model, "gemini-2.5-flash-lite");
});

test("custom openai provider validates endpoint whitelist", () => {
  assert.equal(isAllowedCustomOpenAiUrl(CUSTOM_PROVIDER_ENDPOINT, CUSTOM_PROVIDER_CONFIG), true);
  assert.equal(isAllowedCustomOpenAiUrl(`${CUSTOM_PROVIDER_ENDPOINT}?key=abc`, CUSTOM_PROVIDER_CONFIG), false);
  assert.equal(isAllowedCustomOpenAiUrl("http://custom.example/v1/chat/completions", CUSTOM_PROVIDER_CONFIG), false);
  assert.equal(isAllowedCustomOpenAiUrl("https://example.com/v1/chat/completions", CUSTOM_PROVIDER_CONFIG), false);
  assert.equal(isAllowedCustomOpenAiUrl("https://custom.example/v1beta/models/gemini-2.5-flash-lite:generateContent", CUSTOM_PROVIDER_CONFIG), false);
});

test("custom openai provider sends x-api-key header and preserves order", async () => {
  const fetchImpl = makeCustomOpenAiFetch();
  const result = await translateWithCustomOpenAiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      qualityMode: "natural",
      apiKey: "test-key",
      providerConfig: CUSTOM_PROVIDER_CONFIG,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, CUSTOM_PROVIDER_ENDPOINT);
  assert.equal(fetchImpl.calls[0].options.method, "POST");
  assert.equal(fetchImpl.calls[0].options.credentials, "omit");
  assert.deepEqual(Object.keys(fetchImpl.calls[0].options.headers).sort(), ["Content-Type", "x-api-key"]);
  assert.equal(fetchImpl.calls[0].options.headers["x-api-key"], "test-key");
  assert.equal(JSON.parse(fetchImpl.calls[0].options.body).model, "gemini-2.5-flash-lite");
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("custom openai provider retries copy-heavy deep output with stricter prompt", async () => {
  const sourceText = "You ask an agent to build an e-commerce site, but the checkout button in the shopping cart does nothing.";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const content = calls.length === 1
      ? JSON.stringify({ translations: [{ id: "a", text: `${sourceText} （白话：没定义完成）` }] })
      : JSON.stringify({ translations: [{ id: "a", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。（白话：先定义完成）" }] });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content
              }
            }
          ]
        };
      }
    };
  };
  const result = await translateWithCustomOpenAiProvider(
    [{ id: "a", text: sourceText }],
    {
      qualityMode: "deep",
      apiKey: "test-key",
      providerConfig: CUSTOM_PROVIDER_CONFIG,
      fetchImpl
    }
  );
  const retryRequest = JSON.parse(calls[1].options.body);
  const retryPrompt = retryRequest.messages[1].content;

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(retryPrompt, /Retry instruction/);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。（白话：先定义完成）" }
  ]);
});

test("custom openai provider keeps translated items when retry leaves one title untranslated", async () => {
  const titleText = "Lecture 08. Use Feature Lists to Constrain What the Agent Does";
  const bodyText = "You ask an agent to build an e-commerce site, but the checkout button in the shopping cart does nothing.";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const content = calls.length === 1
      ? JSON.stringify({
        translations: [
          { id: "title", text: titleText },
          { id: "body", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。" }
        ]
      })
      : JSON.stringify({
        translations: [
          { id: "title", text: titleText }
        ]
      });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content
              }
            }
          ]
        };
      }
    };
  };
  const result = await translateWithCustomOpenAiProvider(
    [
      { id: "title", text: titleText },
      { id: "body", text: bodyText }
    ],
    {
      qualityMode: "natural",
      apiKey: "test-key",
      providerConfig: CUSTOM_PROVIDER_CONFIG,
      fetchImpl
    }
  );
  const retryRequest = JSON.parse(calls[1].options.body);
  const retryPrompt = retryRequest.messages[1].content;

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(retryPrompt, /Retry instruction/);
  assert.equal(retryPrompt.includes(titleText), true);
  assert.equal(retryPrompt.includes(bodyText), false);
  assert.deepEqual(result.translations, [
    { id: "body", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。" }
  ]);
});

test("custom openai provider fails when retry leaves every item untranslated", async () => {
  const titleText = "Lecture 08. Use Feature Lists to Constrain What the Agent Does";
  const bodyText = "You ask an agent to build an e-commerce site, but the checkout button in the shopping cart does nothing.";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const content = JSON.stringify({
      translations: [
        { id: "title", text: titleText },
        { id: "body", text: bodyText }
      ]
    });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content
              }
            }
          ]
        };
      }
    };
  };
  const result = await translateWithCustomOpenAiProvider(
    [
      { id: "title", text: titleText },
      { id: "body", text: bodyText }
    ],
    {
      qualityMode: "natural",
      apiKey: "test-key",
      providerConfig: CUSTOM_PROVIDER_CONFIG,
      fetchImpl
    }
  );

  assert.equal(result.ok, false);
  assert.equal(calls.length, 2);
  assert.equal(result.error.code, "provider_response_invalid");
  assert.equal(result.error.message, "The translation provider returned untranslated text.");
  assert.equal(result.error.message.includes("test-key"), false);
  assert.equal(result.error.message.includes(titleText), false);
});

test("custom openai provider uses faster natural mode default concurrency", async () => {
  const maxRequestSize = 1800;
  const fetchImpl = makeConcurrentBatchingCustomOpenAiFetch({ maxRequestSize, releaseAfter: 6 });
  const result = await translateWithCustomOpenAiProvider(
    Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      text: "A".repeat(1000)
    })),
    {
      qualityMode: "natural",
      apiKey: "test-key",
      providerConfig: CUSTOM_PROVIDER_CONFIG,
      maxRequestSize,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 8);
  assert.equal(fetchImpl.maxActive, 6);
});

test("custom openai provider uses higher default concurrency for deep mode", async () => {
  const maxRequestSize = 3000;
  const fetchImpl = makeConcurrentBatchingCustomOpenAiFetch({ maxRequestSize, releaseAfter: 8 });
  const result = await translateWithCustomOpenAiProvider(
    Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      text: "A".repeat(2000)
    })),
    {
      qualityMode: "deep",
      apiKey: "test-key",
      providerConfig: CUSTOM_PROVIDER_CONFIG,
      maxRequestSize,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 8);
  assert.equal(fetchImpl.maxActive, 8);
});

test("custom openai provider caps paid batch concurrency", async () => {
  const maxRequestSize = 3000;
  const fetchImpl = makeConcurrentBatchingCustomOpenAiFetch({ maxRequestSize, releaseAfter: 8 });
  const result = await translateWithCustomOpenAiProvider(
    Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      text: "A".repeat(2000)
    })),
    {
      qualityMode: "deep",
      apiKey: "test-key",
      providerConfig: CUSTOM_PROVIDER_CONFIG,
      maxRequestSize,
      maxConcurrentRequests: 99,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 8);
  assert.equal(fetchImpl.maxActive, 8);
});

test("custom openai provider parses openai-compatible choices", () => {
  const text = parseCustomOpenAiResponse({
    choices: [
      {
        message: {
          content: "{\"translations\":[{\"id\":\"a\",\"text\":\"你好\"}]}"
        }
      }
    ]
  });

  assert.equal(text, "{\"translations\":[{\"id\":\"a\",\"text\":\"你好\"}]}");
});

test("custom openai provider maps invalid responses to structured errors", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { content: "not json" } }] };
    }
  });
  const result = await translateWithCustomOpenAiProvider(
    [{ id: "a", text: "Hello private text" }],
    { apiKey: "test-key", providerConfig: CUSTOM_PROVIDER_CONFIG, fetchImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_response_invalid");
  assert.equal(result.error.message.includes("test-key"), false);
  assert.equal(result.error.message.includes("Hello private text"), false);
});

test("custom openai provider maps rejected keys to a sanitized error", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    async json() {
      return { error: "Token is invalid" };
    }
  });
  const result = await translateWithCustomOpenAiProvider(
    [{ id: "a", text: "Hello private text" }],
    { apiKey: "test-key", providerConfig: CUSTOM_PROVIDER_CONFIG, fetchImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_http_error");
  assert.equal(result.error.status, 401);
  assert.equal(result.error.message, "The translation provider rejected the API Key.");
  assert.equal(result.error.message.includes("test-key"), false);
  assert.equal(result.error.message.includes("Hello private text"), false);
});

function makeCustomOpenAiFetch() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: "{\"translations\":[{\"id\":\"a\",\"text\":\"你好\"},{\"id\":\"b\",\"text\":\"早上好\"}]}"
              }
            }
          ]
        };
      }
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function makeConcurrentBatchingCustomOpenAiFetch({ maxRequestSize, releaseAfter }) {
  const calls = [];
  const pendingReleases = [];
  let active = 0;
  let maxActive = 0;

  const fetchImpl = async (url, options) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push({ url, options });
    assert.equal(options.body.length <= maxRequestSize, true);
    const segments = parseSegmentsFromCustomOpenAiRequest(options.body);

    await waitForConcurrentRelease(pendingReleases, releaseAfter);
    active -= 1;

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  translations: segments.map((segment) => ({
                    id: segment.id,
                    text: `zh:${segment.id}`
                  }))
                })
              }
            }
          ]
        };
      }
    };
  };

  Object.defineProperty(fetchImpl, "maxActive", {
    get() {
      return maxActive;
    }
  });
  fetchImpl.calls = calls;
  return fetchImpl;
}

function waitForConcurrentRelease(pendingReleases, releaseAfter) {
  return new Promise((resolve) => {
    pendingReleases.push(resolve);

    if (pendingReleases.length >= releaseAfter) {
      for (const release of pendingReleases.splice(0)) {
        release();
      }
      return;
    }

    setTimeout(() => {
      const index = pendingReleases.indexOf(resolve);

      if (index >= 0) {
        for (const release of pendingReleases.splice(0)) {
          release();
        }
      }
    }, 0);
  });
}

function parseSegmentsFromCustomOpenAiRequest(body) {
  const request = JSON.parse(body);
  const prompt = request.messages[1].content;
  return JSON.parse(prompt.split("\n").at(-1));
}
