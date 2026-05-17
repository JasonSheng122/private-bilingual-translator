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
import {
  buildCustomGeminiEndpoint,
  normalizeCustomProviderConfig
} from "../shared/custom-provider-config.mjs";

const DEFAULT_MAX_REQUEST_SIZE = 12000;
const NATURAL_TARGET_BATCH_REQUEST_SIZE = 8000;
const DEEP_TARGET_BATCH_REQUEST_SIZE = 6000;
const DEFAULT_MAX_CONCURRENT_REQUESTS = 6;
const DEEP_DEFAULT_MAX_CONCURRENT_REQUESTS = 8;
const MAX_MAX_CONCURRENT_REQUESTS = 8;
const THINKING_BUDGET_DISABLED = 0;

export const CUSTOM_GEMINI_PROVIDER = Object.freeze({
  id: "custom_gemini",
  displayName: "Custom Gemini-compatible Provider",
  endpoint: "",
  allowedEndpoints: [],
  allowedOrigins: [],
  model: "",
  maxRequestSize: DEFAULT_MAX_REQUEST_SIZE,
  maxConcurrentRequests: DEFAULT_MAX_CONCURRENT_REQUESTS,
  requiresKey: true
});

export async function translateWithCustomGeminiProvider(segments, options = {}) {
  const normalizedSegments = normalizeSegments(segments);

  if (normalizedSegments.length === 0) {
    return makeProviderError("empty_segments", "No translatable text was found.");
  }

  const providerConfig = normalizeCustomProviderConfig(options.providerConfig ?? {
    baseUrl: options.baseUrl,
    model: options.model
  });

  if (!providerConfig) {
    return makeProviderError("missing_custom_provider_config", "Custom provider Base URL and model are required.");
  }

  const apiKey = String(options.apiKey ?? "").trim();

  if (!apiKey) {
    return makeProviderError("missing_api_key", "Custom provider API Key is required.");
  }

  const endpoint = options.endpoint ?? buildCustomGeminiEndpoint(providerConfig);

  if (!isAllowedCustomGeminiUrl(endpoint, providerConfig)) {
    return makeProviderError("provider_endpoint_blocked", "The translation provider endpoint is not allowed.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    return makeProviderError("provider_unavailable", "The translation provider is unavailable.");
  }

  const qualityMode = normalizePaidQualityMode(options.qualityMode);
  const maxRequestSize = normalizeMaxRequestSize(options.maxRequestSize, CUSTOM_GEMINI_PROVIDER.maxRequestSize);
  const maxConcurrentRequests = normalizeMaxConcurrentRequests(
    options.maxConcurrentRequests,
    getDefaultMaxConcurrentRequests(qualityMode)
  );
  const batches = buildCustomGeminiRequestBatches(normalizedSegments, { qualityMode, maxRequestSize });

  if (!batches) {
    return makeProviderError("provider_request_too_large", "A translation request exceeded the provider size limit.");
  }

  const batchResult = await runCustomGeminiBatches(fetchImpl, batches, {
    endpoint,
    apiKey,
    maxConcurrentRequests
  });

  if (!batchResult.ok) {
    return batchResult;
  }

  return {
    ok: true,
    provider: getCustomGeminiProviderMetadata(providerConfig),
    translations: batchResult.translations
  };
}

export function getCustomGeminiProviderMetadata(providerConfig) {
  const normalizedConfig = normalizeCustomProviderConfig(providerConfig);
  const endpoint = normalizedConfig ? buildCustomGeminiEndpoint(normalizedConfig) : "";
  const origin = normalizedConfig ? new URL(normalizedConfig.baseUrl).origin : "";

  return {
    id: CUSTOM_GEMINI_PROVIDER.id,
    displayName: CUSTOM_GEMINI_PROVIDER.displayName,
    endpoint,
    allowedEndpoints: endpoint ? [endpoint] : [],
    allowedOrigins: origin ? [origin] : [],
    model: normalizedConfig?.model ?? "",
    maxRequestSize: CUSTOM_GEMINI_PROVIDER.maxRequestSize,
    maxConcurrentRequests: CUSTOM_GEMINI_PROVIDER.maxConcurrentRequests,
    requiresKey: CUSTOM_GEMINI_PROVIDER.requiresKey
  };
}

export function isAllowedCustomGeminiUrl(value, providerConfig) {
  try {
    const endpoint = buildCustomGeminiEndpoint(providerConfig);
    const allowedEndpoint = new URL(endpoint);
    const url = new URL(value);

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

export function parseCustomGeminiResponse(data) {
  return parseGeminiLikeResponse(data);
}

function buildCustomGeminiRequestBody(segments, { qualityMode, retry = false }) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: buildCustomGeminiPrompt(segments, qualityMode, { retry })
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

function buildCustomGeminiRequestBatches(segments, { qualityMode, maxRequestSize }) {
  const batches = [];
  let currentBatch = [];
  const targetBatchRequestSize = getTargetBatchRequestSize(qualityMode, maxRequestSize);

  for (const segment of segments) {
    const singleRequestPair = buildCustomGeminiRequestPair([segment], { qualityMode });

    if (getRequestPairSize(singleRequestPair) > maxRequestSize) {
      return null;
    }

    const candidateBatch = [...currentBatch, segment];
    const candidateRequestPair = buildCustomGeminiRequestPair(candidateBatch, { qualityMode });
    const candidateSizeLimit = currentBatch.length === 0 ? maxRequestSize : targetBatchRequestSize;

    if (getRequestPairSize(candidateRequestPair) <= candidateSizeLimit) {
      currentBatch = candidateBatch;
      continue;
    }

    batches.push({
      segments: currentBatch,
      ...buildCustomGeminiRequestPair(currentBatch, { qualityMode })
    });
    currentBatch = [segment];
  }

  if (currentBatch.length > 0) {
    batches.push({
      segments: currentBatch,
      ...buildCustomGeminiRequestPair(currentBatch, { qualityMode })
    });
  }

  return batches;
}

function buildCustomGeminiRequestPair(segments, { qualityMode }) {
  return {
    requestJson: JSON.stringify(buildCustomGeminiRequestBody(segments, { qualityMode })),
    retryRequestJson: JSON.stringify(buildCustomGeminiRequestBody(segments, { qualityMode, retry: true }))
  };
}

function getRequestPairSize(pair) {
  return pair.requestJson.length;
}

function buildCustomGeminiPrompt(segments, qualityMode, { retry = false } = {}) {
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

async function runCustomGeminiBatches(fetchImpl, batches, { endpoint, apiKey, maxConcurrentRequests }) {
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
      const response = await requestCustomGeminiTranslation(fetchImpl, {
        endpoint,
        apiKey,
        requestJson: batch.requestJson
      });

      if (!response.ok) {
        firstError = response;
        return;
      }

      try {
        const translations = parseCustomGeminiTranslations(response.text, batch.segments);

        const output = filterTranslatedPaidOutput(translations, batch.segments);

        if (!output.hasUntranslated) {
          translationsByBatch[batchIndex] = output.translations;
          continue;
        }

        const retryResponse = await requestCustomGeminiTranslation(fetchImpl, {
          endpoint,
          apiKey,
          requestJson: batch.retryRequestJson
        });

        if (!retryResponse.ok) {
          firstError = retryResponse;
          return;
        }

        const retryTranslations = parseCustomGeminiTranslations(retryResponse.text, batch.segments);
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

async function requestCustomGeminiTranslation(fetchImpl, { endpoint, apiKey, requestJson }) {
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
      text: parseCustomGeminiResponse(data)
    };
  } catch {
    const text = await readResponseTextSafely(textFallback);

    if (text) {
      return { ok: true, text };
    }

    return makeProviderError("provider_response_invalid", "The translation provider returned an invalid response.");
  }
}

function parseCustomGeminiTranslations(text, segments) {
  return parseGeminiLikeTranslations(text, segments, "Custom Gemini");
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

function normalizePaidQualityMode(value) {
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
    : CUSTOM_GEMINI_PROVIDER.maxConcurrentRequests;
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
    return "The translation provider did not accept the configured Base URL or model.";
  }

  return "The translation provider returned an error status.";
}

function getProviderPayloadErrorMessage(message, status) {
  if (status === 400 || status === 404 || /\b(model|endpoint|url|not\s*found|invalid\s*argument)\b/i.test(message)) {
    return "The translation provider did not accept the configured Base URL or model.";
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
