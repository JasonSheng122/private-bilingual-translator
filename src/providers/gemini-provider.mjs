import { QUALITY_MODES } from "../shared/message-types.mjs";
import {
  parseGeminiLikeResponse,
  parseGeminiLikeTranslations,
  readResponseTextSafely
} from "./gemini-like-response-parser.mjs";
import {
  filterTranslatedPaidOutput,
  mergePaidOutputTranslations
} from "./paid-translation-output.mjs";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_MAX_REQUEST_SIZE = 12000;
const NATURAL_TARGET_BATCH_REQUEST_SIZE = 8000;
const DEEP_TARGET_BATCH_REQUEST_SIZE = 6000;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 6;
const DEEP_DEFAULT_MAX_CONCURRENT_REQUESTS = 8;
const MAX_MAX_CONCURRENT_REQUESTS = 8;
const THINKING_BUDGET_DISABLED = 0;

export const GEMINI_PROVIDER = Object.freeze({
  id: "gemini",
  displayName: "Gemini Provider",
  endpoint: GEMINI_ENDPOINT,
  allowedEndpoints: [GEMINI_ENDPOINT],
  allowedOrigins: ["https://generativelanguage.googleapis.com"],
  model: DEFAULT_MODEL,
  maxRequestSize: DEFAULT_MAX_REQUEST_SIZE,
  maxConcurrentRequests: DEFAULT_MAX_CONCURRENT_REQUESTS,
  requiresKey: true
});

export async function translateWithGeminiProvider(segments, options = {}) {
  const normalizedSegments = normalizeSegments(segments);

  if (normalizedSegments.length === 0) {
    return makeProviderError("empty_segments", "No translatable text was found.");
  }

  const apiKey = String(options.apiKey ?? "").trim();

  if (!apiKey) {
    return makeProviderError("missing_api_key", "Gemini API Key is required.");
  }

  const endpoint = options.endpoint ?? GEMINI_PROVIDER.endpoint;

  if (!isAllowedGeminiUrl(endpoint)) {
    return makeProviderError("provider_endpoint_blocked", "The translation provider endpoint is not allowed.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    return makeProviderError("provider_unavailable", "The translation provider is unavailable.");
  }

  const qualityMode = normalizeGeminiQualityMode(options.qualityMode);
  const maxRequestSize = normalizeMaxRequestSize(options.maxRequestSize, GEMINI_PROVIDER.maxRequestSize);
  const maxConcurrentRequests = normalizeMaxConcurrentRequests(
    options.maxConcurrentRequests,
    getDefaultMaxConcurrentRequests(qualityMode)
  );
  const batches = buildGeminiRequestBatches(normalizedSegments, { qualityMode, maxRequestSize });

  if (!batches) {
    return makeProviderError("provider_request_too_large", "A translation request exceeded the provider size limit.");
  }

  const batchResult = await runGeminiBatches(fetchImpl, batches, {
    endpoint,
    apiKey,
    maxConcurrentRequests
  });

  if (!batchResult.ok) {
    return batchResult;
  }

  return {
    ok: true,
    provider: getGeminiProviderMetadata(),
    translations: batchResult.translations
  };
}

export function getGeminiProviderMetadata() {
  return {
    id: GEMINI_PROVIDER.id,
    displayName: GEMINI_PROVIDER.displayName,
    endpoint: GEMINI_PROVIDER.endpoint,
    allowedEndpoints: [...GEMINI_PROVIDER.allowedEndpoints],
    allowedOrigins: [...GEMINI_PROVIDER.allowedOrigins],
    model: GEMINI_PROVIDER.model,
    maxRequestSize: GEMINI_PROVIDER.maxRequestSize,
    maxConcurrentRequests: GEMINI_PROVIDER.maxConcurrentRequests,
    requiresKey: GEMINI_PROVIDER.requiresKey
  };
}

export function isAllowedGeminiUrl(value) {
  try {
    const url = new URL(value);
    const allowedEndpoint = new URL(GEMINI_PROVIDER.endpoint);

    return (
      url.protocol === "https:" &&
      url.origin === allowedEndpoint.origin &&
      url.pathname === allowedEndpoint.pathname &&
      !url.search
    );
  } catch {
    return false;
  }
}

export function parseGeminiResponse(data) {
  return parseGeminiLikeResponse(data);
}

function buildGeminiRequestBody(segments, { qualityMode, retry = false }) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildGeminiPrompt(segments, qualityMode, { retry })
          }
        ]
      }
    ],
    generationConfig: {
      temperature: qualityMode === QUALITY_MODES.DEEP ? 0.2 : 0,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingBudget: THINKING_BUDGET_DISABLED
      }
    }
  };
}

function buildGeminiRequestBatches(segments, { qualityMode, maxRequestSize }) {
  const batches = [];
  let currentBatch = [];
  const targetBatchRequestSize = getTargetBatchRequestSize(qualityMode, maxRequestSize);

  for (const segment of segments) {
    const singleRequestPair = buildGeminiRequestPair([segment], { qualityMode });

    if (getRequestPairSize(singleRequestPair) > maxRequestSize) {
      return null;
    }

    const candidateBatch = [...currentBatch, segment];
    const candidateRequestPair = buildGeminiRequestPair(candidateBatch, { qualityMode });
    const candidateSizeLimit = currentBatch.length === 0 ? maxRequestSize : targetBatchRequestSize;

    if (getRequestPairSize(candidateRequestPair) <= candidateSizeLimit) {
      currentBatch = candidateBatch;
      continue;
    }

    batches.push({
      segments: currentBatch,
      ...buildGeminiRequestPair(currentBatch, { qualityMode })
    });
    currentBatch = [segment];
  }

  if (currentBatch.length > 0) {
    batches.push({
      segments: currentBatch,
      ...buildGeminiRequestPair(currentBatch, { qualityMode })
    });
  }

  return batches;
}

function buildGeminiRequestPair(segments, { qualityMode }) {
  return {
    requestJson: JSON.stringify(buildGeminiRequestBody(segments, { qualityMode })),
    retryRequestJson: JSON.stringify(buildGeminiRequestBody(segments, { qualityMode, retry: true }))
  };
}

function getRequestPairSize(pair) {
  return pair.requestJson.length;
}

function buildGeminiPrompt(segments, qualityMode, { retry = false } = {}) {
  const styleInstruction = qualityMode === QUALITY_MODES.DEEP
    ? [
      "Deep mode: translate accurately into Simplified Chinese.",
      "Start with Chinese, not source English; do not copy source English sentences.",
      "Preserve necessary terms.",
      "For long/abstract/technical/opinionated text, append short （白话：...） after Chinese.",
      "Keep 白话 under 18 Chinese characters; skip it for short labels, headings, names, URLs, or code."
    ].join(" ")
    : [
      "Natural mode: translate smoothly into Simplified Chinese.",
      "Preserve meaning, numbers, URLs, names, and necessary English terms.",
      "No explanations, labels, or commentary.",
      "Do not copy source English sentences."
    ].join(" ");
  const retryInstruction = retry
    ? "Retry instruction: previous output copied English. Return real Chinese; keep only names, URLs, code, or unavoidable terms in English."
    : "";

  return [
    "You are a private webpage translation engine.",
    styleInstruction,
    "English prose/headings must contain Simplified Chinese, not only English.",
    retryInstruction,
    "For each item, translate the source text field into Simplified Chinese; keep id exactly.",
    "Return only JSON: [{\"id\":\"same id\",\"text\":\"translated text\"}].",
    JSON.stringify(segments)
  ].filter(Boolean).join("\n");
}

async function runGeminiBatches(fetchImpl, batches, { endpoint, apiKey, maxConcurrentRequests }) {
  const translationsByBatch = new Array(batches.length);
  let nextBatchIndex = 0;
  let firstError = null;

  async function worker() {
    while (!firstError) {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;

      if (batchIndex >= batches.length) {
        return;
      }

      const batch = batches[batchIndex];
      const response = await requestGeminiTranslation(fetchImpl, {
        endpoint,
        apiKey,
        requestJson: batch.requestJson
      });

      if (!response.ok) {
        firstError = response;
        return;
      }

      try {
        const translations = parseGeminiTranslations(response.text, batch.segments);

        const output = filterTranslatedPaidOutput(translations, batch.segments);

        if (!output.hasUntranslated) {
          translationsByBatch[batchIndex] = output.translations;
          continue;
        }

        const retryResponse = await requestGeminiTranslation(fetchImpl, {
          endpoint,
          apiKey,
          requestJson: batch.retryRequestJson
        });

        if (!retryResponse.ok) {
          firstError = retryResponse;
          return;
        }

        const retryTranslations = parseGeminiTranslations(retryResponse.text, batch.segments);
        const retryOutput = filterTranslatedPaidOutput(retryTranslations, batch.segments);
        const acceptedTranslations = mergePaidOutputTranslations(
          retryOutput.translations,
          output.translations,
          batch.segments
        );

        if (acceptedTranslations.length === 0) {
          firstError = makeProviderError("provider_response_invalid", "The translation provider returned untranslated text.");
          return;
        }

        translationsByBatch[batchIndex] = acceptedTranslations;
      } catch {
        firstError = makeProviderError("provider_response_invalid", "The translation provider returned an invalid response.");
        return;
      }
    }
  }

  const workerCount = Math.min(maxConcurrentRequests, batches.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (firstError) {
    return firstError;
  }

  return {
    ok: true,
    translations: translationsByBatch.flat()
  };
}

async function requestGeminiTranslation(fetchImpl, { endpoint, apiKey, requestJson }) {
  let response;

  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: requestJson
    });
  } catch {
    return makeProviderError("provider_network_error", "The translation provider request failed.");
  }

  if (!response || response.ok !== true) {
    const status = Number.isInteger(response?.status) ? response.status : 0;
    return {
      ok: false,
      error: {
        code: "provider_http_error",
        message: getProviderHttpErrorMessage(status),
        status
      }
    };
  }

  const textFallback = typeof response.clone === "function" ? response.clone() : null;

  try {
    const data = await response.json();
    const payloadError = getProviderPayloadError(data);

    if (payloadError) {
      return payloadError;
    }

    return {
      ok: true,
      text: parseGeminiResponse(data)
    };
  } catch {
    const text = await readResponseTextSafely(textFallback);

    if (text) {
      return { ok: true, text };
    }

    return makeProviderError("provider_response_invalid", "The translation provider returned an invalid response.");
  }
}

function parseGeminiTranslations(text, segments) {
  return parseGeminiLikeTranslations(text, segments, "Gemini");
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments
    .map((segment) => ({
      id: String(segment?.id ?? ""),
      text: normalizeText(segment?.text)
    }))
    .filter((segment) => segment.id && segment.text);
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeGeminiQualityMode(value) {
  return value === QUALITY_MODES.DEEP ? QUALITY_MODES.DEEP : QUALITY_MODES.NATURAL;
}

function normalizeMaxRequestSize(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function getTargetBatchRequestSize(qualityMode, maxRequestSize) {
  const targetSize = qualityMode === QUALITY_MODES.DEEP
    ? DEEP_TARGET_BATCH_REQUEST_SIZE
    : NATURAL_TARGET_BATCH_REQUEST_SIZE;
  return Math.min(targetSize, maxRequestSize);
}

function getDefaultMaxConcurrentRequests(qualityMode) {
  return qualityMode === QUALITY_MODES.DEEP
    ? DEEP_DEFAULT_MAX_CONCURRENT_REQUESTS
    : GEMINI_PROVIDER.maxConcurrentRequests;
}

function normalizeMaxConcurrentRequests(value, fallback) {
  const normalized = Number.isInteger(value) && value > 0 ? value : fallback;
  return Math.min(normalized, MAX_MAX_CONCURRENT_REQUESTS);
}

function makeProviderError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function getProviderPayloadError(data) {
  const message = String(data?.error?.message ?? data?.error?.status ?? data?.error ?? "").trim();

  if (!message) {
    return null;
  }

  const status = Number.isInteger(data?.error?.code) ? data.error.code : 0;
  return {
    ok: false,
    error: {
      code: "provider_http_error",
      message: getProviderPayloadErrorMessage(message, status),
      status
    }
  };
}

function getProviderHttpErrorMessage(status) {
  if (status === 401 || status === 403) {
    return "The translation provider rejected the API Key.";
  }

  if (status === 429) {
    return "The translation provider rate limit was reached.";
  }

  if (status === 413) {
    return "The translation request is too large for the provider.";
  }

  if (status === 400 || status === 404) {
    return "The translation provider did not accept the configured endpoint or model.";
  }

  return "The translation provider returned an error status.";
}

function getProviderPayloadErrorMessage(message, status) {
  if (status === 400 || status === 404 || /\b(model|endpoint|url|not\s*found|invalid\s*argument)\b/i.test(message)) {
    return "The translation provider did not accept the configured endpoint or model.";
  }

  if (status === 401 || status === 403 || /\b(api\s*key|key|token|auth|unauthorized|forbidden|permission)\b/i.test(message)) {
    return "The translation provider rejected the API Key.";
  }

  if (status === 429 || /\b(quota|rate\s*limit)\b/i.test(message)) {
    return "The translation provider rate limit was reached.";
  }

  if (status === 413) {
    return "The translation request is too large for the provider.";
  }

  return "The translation provider returned an error status.";
}
