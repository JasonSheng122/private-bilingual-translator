const GOOGLE_FREE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const DEFAULT_TARGET_LANGUAGE = "zh-CN";
const DEFAULT_MAX_CONCURRENT_REQUESTS = 6;
const HARD_MAX_CONCURRENT_REQUESTS = 8;

export const GOOGLE_FREE_PROVIDER = Object.freeze({
  id: "google_free",
  displayName: "Google Free Provider",
  endpoint: GOOGLE_FREE_ENDPOINT,
  allowedEndpoints: [GOOGLE_FREE_ENDPOINT],
  allowedOrigins: ["https://translate.googleapis.com"],
  maxRequestSize: 4000,
  maxConcurrentRequests: DEFAULT_MAX_CONCURRENT_REQUESTS,
  requiresKey: false
});

export async function translateWithGoogleFreeProvider(segments, options = {}) {
  const normalizedSegments = normalizeSegments(segments);

  if (normalizedSegments.length === 0) {
    return makeProviderError("empty_segments", "No translatable text was found.");
  }

  const endpoint = options.endpoint ?? GOOGLE_FREE_PROVIDER.endpoint;

  if (!isAllowedGoogleFreeUrl(endpoint)) {
    return makeProviderError("provider_endpoint_blocked", "The translation provider endpoint is not allowed.");
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    return makeProviderError("provider_unavailable", "The translation provider is unavailable.");
  }

  const maxRequestSize = Number.isInteger(options.maxRequestSize)
    ? options.maxRequestSize
    : GOOGLE_FREE_PROVIDER.maxRequestSize;
  const maxConcurrentRequests = normalizeMaxConcurrentRequests(options.maxConcurrentRequests);
  const translatedChunksBySegment = normalizedSegments.map(() => []);
  const requestItems = [];

  for (let segmentIndex = 0; segmentIndex < normalizedSegments.length; segmentIndex += 1) {
    const segment = normalizedSegments[segmentIndex];
    let chunks;

    try {
      chunks = splitTextForRequests(segment.text, {
        endpoint,
        maxRequestSize,
        prefix: `${makeBatchMarker(0)}\n`
      });
    } catch {
      return makeProviderError("provider_request_too_large", "A translation request exceeded the provider size limit.");
    }

    translatedChunksBySegment[segmentIndex] = new Array(chunks.length);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      requestItems.push({ segmentIndex, chunkIndex, text: chunk });
    }
  }

  let batches;

  try {
    batches = buildRequestBatches(requestItems, { endpoint, maxRequestSize });
  } catch {
    return makeProviderError("provider_request_too_large", "A translation request exceeded the provider size limit.");
  }

  const requestResult = await runRequestsWithConcurrency(batches, maxConcurrentRequests, async (batch) => {
    const response = await requestGoogleFreeTranslation(fetchImpl, batch.requestUrl);

    if (!response.ok) {
      return response;
    }

    try {
      const translatedTexts = splitBatchTranslatedText(response.text, batch.items.length);

      for (let index = 0; index < batch.items.length; index += 1) {
        const item = batch.items[index];
        translatedChunksBySegment[item.segmentIndex][item.chunkIndex] = translatedTexts[index];
      }

      return { ok: true };
    } catch {
      return makeProviderError("provider_response_invalid", "The translation provider returned an invalid response.");
    }
  });

  if (!requestResult.ok) {
    return requestResult;
  }

  return {
    ok: true,
    provider: getGoogleFreeProviderMetadata(),
    translations: normalizedSegments.map((segment, index) => ({
      id: segment.id,
      text: translatedChunksBySegment[index].join("")
    }))
  };
}

export function getGoogleFreeProviderMetadata() {
  return {
    id: GOOGLE_FREE_PROVIDER.id,
    displayName: GOOGLE_FREE_PROVIDER.displayName,
    endpoint: GOOGLE_FREE_PROVIDER.endpoint,
    allowedEndpoints: [...GOOGLE_FREE_PROVIDER.allowedEndpoints],
    allowedOrigins: [...GOOGLE_FREE_PROVIDER.allowedOrigins],
    maxRequestSize: GOOGLE_FREE_PROVIDER.maxRequestSize,
    maxConcurrentRequests: GOOGLE_FREE_PROVIDER.maxConcurrentRequests,
    requiresKey: GOOGLE_FREE_PROVIDER.requiresKey
  };
}

export function buildGoogleFreeRequestUrl(text, options = {}) {
  const endpoint = options.endpoint ?? GOOGLE_FREE_PROVIDER.endpoint;

  if (!isAllowedGoogleFreeUrl(endpoint)) {
    throw new Error("The translation provider endpoint is not allowed.");
  }

  const url = new URL(endpoint);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", options.targetLanguage ?? DEFAULT_TARGET_LANGUAGE);
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", String(text ?? ""));

  if (!isAllowedGoogleFreeUrl(url.href)) {
    throw new Error("The translation provider request URL is not allowed.");
  }

  return url.href;
}

export function isAllowedGoogleFreeUrl(value) {
  try {
    const url = new URL(value);
    const allowedEndpoint = new URL(GOOGLE_FREE_PROVIDER.endpoint);

    return (
      url.protocol === "https:" &&
      url.origin === allowedEndpoint.origin &&
      url.pathname === allowedEndpoint.pathname
    );
  } catch {
    return false;
  }
}

export function parseGoogleFreeResponse(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("Invalid provider response.");
  }

  const translatedText = data[0]
    .map((entry) => {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") {
        return "";
      }

      return entry[0];
    })
    .join("");

  if (!translatedText) {
    throw new Error("Invalid provider response.");
  }

  return translatedText;
}

async function requestGoogleFreeTranslation(fetchImpl, requestUrl) {
  let response;

  try {
    response = await fetchImpl(requestUrl, {
      method: "GET",
      credentials: "omit",
      headers: {
        Accept: "application/json"
      }
    });
  } catch {
    return makeProviderError("provider_network_error", "The translation provider request failed.");
  }

  if (!response || response.ok !== true) {
    return {
      ok: false,
      error: {
        code: "provider_http_error",
        message: "The translation provider returned an error status.",
        status: Number.isInteger(response?.status) ? response.status : 0
      }
    };
  }

  try {
    return {
      ok: true,
      text: parseGoogleFreeResponse(await response.json())
    };
  } catch {
    return makeProviderError("provider_response_invalid", "The translation provider returned an invalid response.");
  }
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

async function runRequestsWithConcurrency(requests, maxConcurrentRequests, worker) {
  let nextIndex = 0;
  let firstError = null;

  async function runWorker() {
    while (!firstError && nextIndex < requests.length) {
      const request = requests[nextIndex];
      nextIndex += 1;

      const result = await worker(request);

      if (!result.ok) {
        firstError = result;
      }
    }
  }

  const workerCount = Math.min(maxConcurrentRequests, requests.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return firstError ?? { ok: true };
}

function normalizeMaxConcurrentRequests(value) {
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_MAX_CONCURRENT_REQUESTS;
  }

  return Math.min(value, HARD_MAX_CONCURRENT_REQUESTS);
}

function buildRequestBatches(items, options) {
  const batches = [];
  let currentItems = [];

  for (const item of items) {
    const candidateItems = [...currentItems, item];
    const candidateUrl = buildGoogleFreeRequestUrl(formatBatchText(candidateItems), { endpoint: options.endpoint });

    if (candidateUrl.length <= options.maxRequestSize) {
      currentItems = candidateItems;
      continue;
    }

    if (currentItems.length > 0) {
      batches.push(makeRequestBatch(currentItems, options));
      currentItems = [item];
      continue;
    }

    throw new Error("A provider request item exceeded the size limit.");
  }

  if (currentItems.length > 0) {
    batches.push(makeRequestBatch(currentItems, options));
  }

  return batches;
}

function makeRequestBatch(items, options) {
  const requestUrl = buildGoogleFreeRequestUrl(formatBatchText(items), { endpoint: options.endpoint });

  if (requestUrl.length > options.maxRequestSize) {
    throw new Error("A provider request batch exceeded the size limit.");
  }

  return {
    items,
    requestUrl
  };
}

function formatBatchText(items) {
  return items
    .map((item, index) => `${makeBatchMarker(index)}\n${item.text}`)
    .join("\n");
}

function makeBatchMarker(index) {
  return `<<<PBT_SEGMENT_${index}>>>`;
}

function splitBatchTranslatedText(translatedText, itemCount) {
  const text = String(translatedText ?? "");
  const translatedTexts = [];

  for (let index = 0; index < itemCount; index += 1) {
    const marker = makeBatchMarker(index);
    const nextMarker = index + 1 < itemCount ? makeBatchMarker(index + 1) : "";
    const startIndex = text.indexOf(marker);

    if (startIndex < 0) {
      throw new Error("Missing batch marker.");
    }

    const contentStart = startIndex + marker.length;
    const contentEnd = nextMarker ? text.indexOf(nextMarker, contentStart) : text.length;

    if (contentEnd < 0) {
      throw new Error("Missing next batch marker.");
    }

    translatedTexts.push(text.slice(contentStart, contentEnd).trim());
  }

  return translatedTexts;
}

function splitTextForRequests(text, options) {
  const chunks = [];
  let remaining = text;

  while (remaining) {
    const chunk = takeRequestSizedPrefix(remaining, options);

    if (!chunk) {
      throw new Error("Unable to split provider request.");
    }

    chunks.push(chunk.trim());
    remaining = remaining.slice(chunk.length).trim();
  }

  return chunks;
}

function takeRequestSizedPrefix(text, options) {
  if (buildSizedRequestUrl(text, options).length <= options.maxRequestSize) {
    return text;
  }

  let low = 1;
  let high = text.length;
  let best = "";

  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = text.slice(0, midpoint);
    const requestSize = buildSizedRequestUrl(candidate, options).length;

    if (requestSize <= options.maxRequestSize) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }

  if (best.length < text.length) {
    const whitespaceIndex = best.search(/\s+\S*$/);

    if (whitespaceIndex > 20) {
      return best.slice(0, whitespaceIndex);
    }
  }

  return best;
}

function buildSizedRequestUrl(text, options) {
  return buildGoogleFreeRequestUrl(`${options.prefix ?? ""}${text}`, { endpoint: options.endpoint });
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
