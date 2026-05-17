import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGoogleFreeRequestUrl,
  GOOGLE_FREE_PROVIDER,
  isAllowedGoogleFreeUrl,
  parseGoogleFreeResponse,
  translateWithGoogleFreeProvider
} from "../src/providers/google-free-provider.mjs";

test("google free provider declares exact metadata and no key requirement", () => {
  assert.equal(GOOGLE_FREE_PROVIDER.id, "google_free");
  assert.equal(GOOGLE_FREE_PROVIDER.endpoint, "https://translate.googleapis.com/translate_a/single");
  assert.deepEqual(GOOGLE_FREE_PROVIDER.allowedEndpoints, [
    "https://translate.googleapis.com/translate_a/single"
  ]);
  assert.deepEqual(GOOGLE_FREE_PROVIDER.allowedOrigins, ["https://translate.googleapis.com"]);
  assert.equal(GOOGLE_FREE_PROVIDER.requiresKey, false);
  assert.equal(GOOGLE_FREE_PROVIDER.maxRequestSize > 0, true);
  assert.equal(GOOGLE_FREE_PROVIDER.maxConcurrentRequests, 6);
});

test("google free provider validates endpoint whitelist", () => {
  const requestUrl = buildGoogleFreeRequestUrl("Hello world");
  const parsed = new URL(requestUrl);

  assert.equal(isAllowedGoogleFreeUrl(requestUrl), true);
  assert.equal(parsed.origin, "https://translate.googleapis.com");
  assert.equal(parsed.pathname, "/translate_a/single");
  assert.equal(parsed.searchParams.get("client"), "gtx");
  assert.equal(parsed.searchParams.get("sl"), "auto");
  assert.equal(parsed.searchParams.get("tl"), "zh-CN");
  assert.equal(parsed.searchParams.get("dt"), "t");
  assert.equal(parsed.searchParams.get("q"), "Hello world");
  assert.equal(parsed.searchParams.has("key"), false);
  assert.equal(parsed.searchParams.has("token"), false);
  assert.equal(parsed.searchParams.has("authorization"), false);

  assert.equal(isAllowedGoogleFreeUrl("http://translate.googleapis.com/translate_a/single"), false);
  assert.equal(isAllowedGoogleFreeUrl("https://translate.google.com/translate_a/single"), false);
  assert.equal(isAllowedGoogleFreeUrl("https://translate.googleapis.com/translate_a/other"), false);
});

test("google free provider rejects unknown endpoint before fetch", async () => {
  let fetchCalled = false;

  const result = await translateWithGoogleFreeProvider(
    [{ id: "a", text: "Hello" }],
    {
      endpoint: "https://translate.google.com/translate_a/single",
      fetchImpl: async () => {
        fetchCalled = true;
      }
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_endpoint_blocked");
  assert.equal(fetchCalled, false);
});

test("google free provider rejects empty input with a structured error", async () => {
  const result = await translateWithGoogleFreeProvider([], {
    fetchImpl: makeFetch()
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "empty_segments");
});

test("google free provider parses translate response", () => {
  const translated = parseGoogleFreeResponse([
    [
      ["你好", "Hello", null, null],
      ["世界", "world", null, null]
    ],
    null,
    "en"
  ]);

  assert.equal(translated, "你好世界");
});

test("google free provider batches segments with safe fetch options", async () => {
  const fetchImpl = makeFetch();
  const result = await translateWithGoogleFreeProvider(
    [
      { id: "a", text: "Hello world" },
      { id: "b", text: "Good morning" }
    ],
    { fetchImpl }
  );

  assert.equal(result.ok, true);
  assert.equal(result.provider.id, "google_free");
  assert.deepEqual(result.translations, [
    { id: "a", text: "zh:Hello world" },
    { id: "b", text: "zh:Good morning" }
  ]);
  assert.equal(fetchImpl.calls.length, 1);

  for (const call of fetchImpl.calls) {
    assert.equal(isAllowedGoogleFreeUrl(call.url), true);
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.credentials, "omit");
    assert.equal(call.options.body, undefined);
    assert.deepEqual(Object.keys(call.options.headers), ["Accept"]);
  }
});

test("google free provider splits large input into bounded requests", async () => {
  const minimumSize = buildGoogleFreeRequestUrl("<<<PBT_SEGMENT_0>>>\nabcdefghij").length;
  const maxRequestSize = minimumSize + 10;
  const fetchImpl = makeFetch();
  const result = await translateWithGoogleFreeProvider(
    [{ id: "large", text: "abcdefghij ".repeat(8) }],
    { fetchImpl, maxRequestSize }
  );

  assert.equal(result.ok, true);
  assert.equal(fetchImpl.calls.length > 1, true);

  for (const call of fetchImpl.calls) {
    assert.equal(call.url.length <= maxRequestSize, true);
  }
});

test("google free provider maps HTTP errors to structured errors", async () => {
  const fetchImpl = makeFetch(() => [[["unused", "unused"]]], { ok: false, status: 429 });
  const result = await translateWithGoogleFreeProvider([{ id: "a", text: "Hello" }], { fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_http_error");
  assert.equal(result.error.status, 429);
  assert.equal(result.error.message.includes("Hello"), false);
});

test("google free provider maps invalid responses to structured errors", async () => {
  const fetchImpl = makeFetch(() => ({ unexpected: true }));
  const result = await translateWithGoogleFreeProvider([{ id: "a", text: "Hello" }], { fetchImpl });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "provider_response_invalid");
  assert.equal(result.error.message.includes("Hello"), false);
});

test("google free provider runs bounded concurrent requests and preserves segment order", async () => {
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const maxRequestSize = buildGoogleFreeRequestUrl("<<<PBT_SEGMENT_0>>>\nFirst").length + 5;
  const fetchImpl = async (url, options) => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeRequests -= 1;
    fetchImpl.calls.push({ url, options });
    const text = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[translateBatchText(text), text, null, null]], null, "en"];
      }
    };
  };
  fetchImpl.calls = [];

  const result = await translateWithGoogleFreeProvider(
    [
      { id: "a", text: "First" },
      { id: "b", text: "Second" },
      { id: "c", text: "Third" },
      { id: "d", text: "Fourth" }
    ],
    { fetchImpl, maxConcurrentRequests: 2, maxRequestSize }
  );

  assert.equal(result.ok, true);
  assert.equal(maxActiveRequests, 2);
  assert.deepEqual(result.translations, [
    { id: "a", text: "zh:First" },
    { id: "b", text: "zh:Second" },
    { id: "c", text: "zh:Third" },
    { id: "d", text: "zh:Fourth" }
  ]);
});

function makeFetch(responseFactory = (text) => [[[translateBatchText(text), text, null, null]], null, "en"], responseOptions = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const text = new URL(url).searchParams.get("q");

    return {
      ok: responseOptions.ok ?? true,
      status: responseOptions.status ?? 200,
      async json() {
        return responseFactory(text);
      }
    };
  };

  fetchImpl.calls = calls;
  return fetchImpl;
}

function translateBatchText(text) {
  return String(text)
    .split("\n")
    .map((line) => {
      if (!line || line.startsWith("<<<PBT_SEGMENT_")) {
        return line;
      }

      return `zh:${line}`;
    })
    .join("\n");
}
