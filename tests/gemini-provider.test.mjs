import assert from "node:assert/strict";
import test from "node:test";
import {
  GEMINI_PROVIDER,
  isAllowedGeminiUrl,
  parseGeminiResponse,
  translateWithGeminiProvider
} from "../src/providers/gemini-provider.mjs";

test("gemini provider declares exact metadata and key requirement", () => {
  assert.equal(GEMINI_PROVIDER.id, "gemini");
  assert.equal(GEMINI_PROVIDER.endpoint, "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent");
  assert.deepEqual(GEMINI_PROVIDER.allowedEndpoints, [
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
  ]);
  assert.deepEqual(GEMINI_PROVIDER.allowedOrigins, ["https://generativelanguage.googleapis.com"]);
  assert.equal(GEMINI_PROVIDER.maxConcurrentRequests, 6);
  assert.equal(GEMINI_PROVIDER.requiresKey, true);
});

test("gemini provider validates endpoint whitelist", () => {
  assert.equal(isAllowedGeminiUrl(GEMINI_PROVIDER.endpoint), true);
  assert.equal(isAllowedGeminiUrl(`${GEMINI_PROVIDER.endpoint}?key=abc`), false);
  assert.equal(isAllowedGeminiUrl("http://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"), false);
  assert.equal(isAllowedGeminiUrl("https://example.com/v1beta/models/gemini-2.5-flash-lite:generateContent"), false);
});

test("gemini provider requires api key before fetch", async () => {
  let fetchCalled = false;
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: "Hello" }],
    {
      fetchImpl: async () => {
        fetchCalled = true;
      }
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "missing_api_key");
  assert.equal(fetchCalled, false);
});

test("gemini provider sends api key in header and preserves order", async () => {
  const fetchImpl = makeGeminiFetch();
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      qualityMode: "natural",
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "gemini");
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, GEMINI_PROVIDER.endpoint);
  assert.equal(fetchImpl.calls[0].options.method, "POST");
  assert.equal(fetchImpl.calls[0].options.credentials, "omit");
  assert.equal(fetchImpl.calls[0].options.headers["x-goog-api-key"], "test-key");
  assert.equal(new URL(fetchImpl.calls[0].url).searchParams.has("key"), false);

  const request = JSON.parse(fetchImpl.calls[0].options.body);
  const prompt = request.contents[0].parts[0].text;
  assert.equal(request.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.match(prompt, /Natural mode/);
  assert.match(prompt, /No explanations/);
  assert.doesNotMatch(prompt, /白话/);
});

test("gemini provider deep prompt requires translated Chinese text", async () => {
  const fetchImpl = makeGeminiFetchWithText(JSON.stringify([
    { id: "a", text: "深度翻译后的中文。" }
  ]));
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: "A long English sentence should not be copied unchanged." }],
    {
      qualityMode: "deep",
      apiKey: "test-key",
      fetchImpl
    }
  );
  const request = JSON.parse(fetchImpl.calls[0].options.body);
  const prompt = request.contents[0].parts[0].text;

  assert.equal(result.ok, true);
  assert.equal(request.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.match(prompt, /Deep mode/);
  assert.match(prompt, /Start with Chinese, not source English/);
  assert.match(prompt, /do not copy source English sentences/);
  assert.match(prompt, /（白话：\.\.\.）/);
  assert.match(prompt, /under 18 Chinese characters/);
  assert.match(prompt, /translate the source text field into Simplified Chinese/);
});

test("gemini provider retries copy-heavy deep output with stricter prompt", async () => {
  const sourceText = "You ask an agent to build an e-commerce site, but the checkout button in the shopping cart does nothing.";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const text = calls.length === 1
      ? JSON.stringify([{ id: "a", text: `${sourceText} （白话：没定义完成）` }])
      : JSON.stringify([{ id: "a", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。（白话：先定义完成）" }]);

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text }]
              }
            }
          ]
        };
      }
    };
  };
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: sourceText }],
    {
      qualityMode: "deep",
      apiKey: "test-key",
      fetchImpl
    }
  );
  const retryPrompt = JSON.parse(calls[1].options.body).contents[0].parts[0].text;

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.match(retryPrompt, /Retry instruction/);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。（白话：先定义完成）" }
  ]);
});

test("gemini provider keeps translated items when retry leaves one title untranslated", async () => {
  const titleText = "Lecture 08. Use Feature Lists to Constrain What the Agent Does";
  const bodyText = "You ask an agent to build an e-commerce site, but the checkout button in the shopping cart does nothing.";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const text = JSON.stringify([
      { id: "title", text: titleText },
      { id: "body", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。" }
    ]);

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text }]
              }
            }
          ]
        };
      }
    };
  };
  const result = await translateWithGeminiProvider(
    [
      { id: "title", text: titleText },
      { id: "body", text: bodyText }
    ],
    {
      qualityMode: "natural",
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(result.translations, [
    { id: "body", text: "你让一个 agent 搭建电商网站，但购物车里的结账按钮没有任何作用。" }
  ]);
});

test("gemini provider fails when retry leaves every item untranslated", async () => {
  const titleText = "Lecture 08. Use Feature Lists to Constrain What the Agent Does";
  const bodyText = "You ask an agent to build an e-commerce site, but the checkout button in the shopping cart does nothing.";
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const text = JSON.stringify([
      { id: "title", text: titleText },
      { id: "body", text: bodyText }
    ]);

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text }]
              }
            }
          ]
        };
      }
    };
  };
  const result = await translateWithGeminiProvider(
    [
      { id: "title", text: titleText },
      { id: "body", text: bodyText }
    ],
    {
      qualityMode: "natural",
      apiKey: "test-key",
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

test("gemini provider accepts object wrapped translation responses", async () => {
  const fetchImpl = makeGeminiFetchWithText(JSON.stringify({
    translations: [
      { id: "a", text: "你好" },
      { id: "b", translatedText: "早上好" }
    ]
  }));
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider accepts ordered responses without ids", async () => {
  const fetchImpl = makeGeminiFetchWithText(JSON.stringify([
    "你好",
    { target_text: "早上好" }
  ]));
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider accepts jsonl translation responses", async () => {
  const fetchImpl = makeGeminiFetchWithText([
    JSON.stringify({ id: "a", text: "你好" }),
    JSON.stringify({ id: "b", text: "早上好" })
  ].join("\n"));
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider accepts pair arrays and single key objects", async () => {
  const fetchImpl = makeGeminiFetchWithText(JSON.stringify([
    ["a", "你好"],
    { b: "早上好" }
  ]));
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider accepts numbered plain text lines when count matches", async () => {
  const fetchImpl = makeGeminiFetchWithText("1. 你好\n2. 早上好");
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider accepts id table plain text lines", async () => {
  const fetchImpl = makeGeminiFetchWithText("| a | 你好 |\n| b | 早上好 |");
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider accepts nested keyed translation objects", async () => {
  const fetchImpl = makeGeminiFetchWithText(JSON.stringify({
    results: {
      a: "你好",
      b: { zh: "早上好" }
    }
  }));
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider accepts plain translated text for one segment", async () => {
  const fetchImpl = makeGeminiFetchWithText("你好");
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: "Hello" }],
    {
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" }
  ]);
});

test("gemini provider splits oversized paid requests into bounded batches", async () => {
  const maxRequestSize = 1000;
  const fetchImpl = makeBatchingGeminiFetch({ maxRequestSize });
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "A".repeat(120) },
      { id: "b", text: "B".repeat(120) },
      { id: "c", text: "C".repeat(120) }
    ],
    {
      qualityMode: "natural",
      apiKey: "test-key",
      maxRequestSize,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "gemini");
  assert.equal(fetchImpl.calls.length > 1, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "zh:a" },
    { id: "b", text: "zh:b" },
    { id: "c", text: "zh:c" }
  ]);

  for (const call of fetchImpl.calls) {
    assert.equal(call.options.body.length <= maxRequestSize, true);
    assert.equal(call.options.headers["x-goog-api-key"], "test-key");
  }
});

test("gemini provider splits deep requests into smaller latency batches", async () => {
  const fetchImpl = makeBatchingGeminiFetch({ maxRequestSize: GEMINI_PROVIDER.maxRequestSize });
  const result = await translateWithGeminiProvider(
    Array.from({ length: 70 }, (_, index) => ({
      id: `s${index}`,
      text: "A".repeat(140)
    })),
    {
      qualityMode: "deep",
      apiKey: "test-key",
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length > 1, true);

  for (const call of fetchImpl.calls) {
    assert.equal(call.options.body.length <= GEMINI_PROVIDER.maxRequestSize, true);
  }
});

test("gemini provider runs paid batches with bounded concurrency", async () => {
  const maxRequestSize = 3000;
  const fetchImpl = makeConcurrentBatchingGeminiFetch({ maxRequestSize, releaseAfter: 2 });
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "A".repeat(2000) },
      { id: "b", text: "B".repeat(2000) },
      { id: "c", text: "C".repeat(2000) },
      { id: "d", text: "D".repeat(2000) }
    ],
    {
      qualityMode: "deep",
      apiKey: "test-key",
      maxRequestSize,
      maxConcurrentRequests: 2,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length > 2, true);
  assert.equal(fetchImpl.maxActive, 2);
  assert.deepEqual(result.translations, [
    { id: "a", text: "zh:a" },
    { id: "b", text: "zh:b" },
    { id: "c", text: "zh:c" },
    { id: "d", text: "zh:d" }
  ]);
});

test("gemini provider uses faster natural mode default concurrency", async () => {
  const maxRequestSize = 1800;
  const fetchImpl = makeConcurrentBatchingGeminiFetch({ maxRequestSize, releaseAfter: 6 });
  const result = await translateWithGeminiProvider(
    Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      text: "A".repeat(1000)
    })),
    {
      qualityMode: "natural",
      apiKey: "test-key",
      maxRequestSize,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 8);
  assert.equal(fetchImpl.maxActive, 6);
});

test("gemini provider uses higher default concurrency for deep mode", async () => {
  const maxRequestSize = 3000;
  const fetchImpl = makeConcurrentBatchingGeminiFetch({ maxRequestSize, releaseAfter: 8 });
  const result = await translateWithGeminiProvider(
    Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      text: "A".repeat(2000)
    })),
    {
      qualityMode: "deep",
      apiKey: "test-key",
      maxRequestSize,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 8);
  assert.equal(fetchImpl.maxActive, 8);
});

test("gemini provider caps paid batch concurrency", async () => {
  const maxRequestSize = 3000;
  const fetchImpl = makeConcurrentBatchingGeminiFetch({ maxRequestSize, releaseAfter: 8 });
  const result = await translateWithGeminiProvider(
    Array.from({ length: 8 }, (_, index) => ({
      id: `s${index}`,
      text: "A".repeat(2000)
    })),
    {
      qualityMode: "deep",
      apiKey: "test-key",
      maxRequestSize,
      maxConcurrentRequests: 99,
      fetchImpl
    }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length, 8);
  assert.equal(fetchImpl.maxActive, 8);
});

test("gemini provider maps invalid responses to structured errors", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { candidates: [{ content: { parts: [{ text: "not json" }] } }] };
    }
  });
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: "Hello private text" }],
    { apiKey: "test-key", fetchImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_response_invalid");
  assert.equal(result.error.message.includes("Hello private text"), false);
});

test("gemini provider parses openai-compatible choices", () => {
  const text = parseGeminiResponse({
    choices: [
      {
        message: {
          content: "[{\"id\":\"a\",\"text\":\"你好\"}]"
        }
      }
    ]
  });

  assert.equal(text, "[{\"id\":\"a\",\"text\":\"你好\"}]");
});

test("gemini provider parses openai-compatible content arrays", () => {
  const text = parseGeminiResponse({
    choices: [
      {
        message: {
          content: [
            { type: "text", text: "1. 你好" },
            { type: "text", text: "2. 早上好" }
          ]
        }
      }
    ]
  });

  assert.equal(text, "1. 你好\n2. 早上好");
});

test("gemini provider parses direct output text arrays", () => {
  const text = parseGeminiResponse({
    output: [
      {
        content: [
          { type: "output_text", text: "[{\"id\":\"a\",\"text\":\"你好\"}]" }
        ]
      }
    ]
  });

  assert.equal(text, "[{\"id\":\"a\",\"text\":\"你好\"}]");
});

test("gemini provider falls back to raw response text", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    clone() {
      return {
        async text() {
          return "1. 你好\n2. 早上好";
        }
      };
    },
    async json() {
      throw new Error("not json");
    }
  });
  const result = await translateWithGeminiProvider(
    [
      { id: "a", text: "Hello" },
      { id: "b", text: "Good morning" }
    ],
    { apiKey: "test-key", fetchImpl }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.translations, [
    { id: "a", text: "你好" },
    { id: "b", text: "早上好" }
  ]);
});

test("gemini provider maps rejected keys to a sanitized error", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    async json() {
      return { error: { message: "API key not valid" } };
    }
  });
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: "Hello private text" }],
    { apiKey: "test-key", fetchImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_http_error");
  assert.equal(result.error.status, 403);
  assert.equal(result.error.message, "The translation provider rejected the API Key.");
  assert.equal(result.error.message.includes("test-key"), false);
  assert.equal(result.error.message.includes("Hello private text"), false);
});

test("gemini provider maps missing model endpoints to a sanitized config error", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    async json() {
      return { error: "not found" };
    }
  });
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: "Hello private text" }],
    { apiKey: "test-key", fetchImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_http_error");
  assert.equal(result.error.status, 404);
  assert.equal(result.error.message, "The translation provider did not accept the configured endpoint or model.");
  assert.equal(result.error.message.includes("test-key"), false);
  assert.equal(result.error.message.includes("Hello private text"), false);
});

test("gemini provider maps ok error payloads to sanitized provider errors", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { error: { code: 403, message: "API key not valid. key=secret-value" } };
    }
  });
  const result = await translateWithGeminiProvider(
    [{ id: "a", text: "Hello private text" }],
    { apiKey: "test-key", fetchImpl }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_http_error");
  assert.equal(result.error.status, 403);
  assert.equal(result.error.message, "The translation provider rejected the API Key.");
  assert.equal(result.error.message.includes("test-key"), false);
  assert.equal(result.error.message.includes("secret-value"), false);
  assert.equal(result.error.message.includes("Hello private text"), false);
});

test("gemini provider parses text response", () => {
  const text = parseGeminiResponse({
    candidates: [
      {
        content: {
          parts: [{ text: "[{\"id\":\"a\",\"text\":\"你好\"}]" }]
        }
      }
    ]
  });

  assert.equal(text, "[{\"id\":\"a\",\"text\":\"你好\"}]");
});

function makeGeminiFetch() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([
                      { id: "a", text: "你好" },
                      { id: "b", text: "早上好" }
                    ])
                  }
                ]
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

function makeGeminiFetchWithText(text) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  { text }
                ]
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

function makeBatchingGeminiFetch({ maxRequestSize }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.body.length <= maxRequestSize, true);
    const segments = parseSegmentsFromGeminiRequest(options.body);

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(segments.map((segment) => ({
                      id: segment.id,
                      text: `zh:${segment.id}`
                    })))
                  }
                ]
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

function makeConcurrentBatchingGeminiFetch({ maxRequestSize, releaseAfter }) {
  const calls = [];
  const pendingReleases = [];
  let active = 0;
  let maxActive = 0;

  const fetchImpl = async (url, options) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push({ url, options });
    assert.equal(options.body.length <= maxRequestSize, true);
    const segments = parseSegmentsFromGeminiRequest(options.body);

    await waitForConcurrentRelease(pendingReleases, releaseAfter);
    active -= 1;

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify(segments.map((segment) => ({
                      id: segment.id,
                      text: `zh:${segment.id}`
                    })))
                  }
                ]
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

function parseSegmentsFromGeminiRequest(body) {
  const request = JSON.parse(body);
  const prompt = request.contents[0].parts[0].text;
  return JSON.parse(prompt.split("\n").at(-1));
}
