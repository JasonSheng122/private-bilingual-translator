const WRAPPER_KEYS = ["translations", "items", "data", "results", "result", "output", "response"];
const TEXT_KEYS = [
  "text",
  "translation",
  "translationText",
  "translation_text",
  "translated",
  "translatedText",
  "translated_text",
  "targetText",
  "target_text",
  "target",
  "outputText",
  "output_text",
  "content",
  "message",
  "value",
  "zh",
  "zh_cn",
  "zhCN",
  "chinese",
  "simplifiedChinese",
  "simplified_chinese"
];
const RESPONSE_TEXT_KEYS = [
  "text",
  "output_text",
  "outputText",
  "content",
  "message",
  "value"
];

export function parseGeminiLikeResponse(data) {
  const text = firstNonEmptyString([
    getCandidateResponseText(data),
    getChoiceResponseText(data),
    getDirectResponseText(data)
  ]);

  if (!text) {
    throw new Error("Invalid provider response.");
  }

  return text;
}

export function parseGeminiLikeTranslations(value, segments, providerName = "provider") {
  const parsed = normalizeTranslationItems(parseTranslationPayload(value, segments), segments);
  const ids = new Set(segments.map((segment) => segment.id));

  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid ${providerName} translation response.`);
  }

  const byId = new Map();

  for (const item of parsed) {
    const id = getTranslationItemId(item);
    const translatedText = getTranslationItemText(item);

    if (!ids.has(id) || !translatedText) {
      throw new Error(`Invalid ${providerName} translation item.`);
    }

    byId.set(id, translatedText);
  }

  return segments.map((segment) => {
    if (!byId.has(segment.id)) {
      throw new Error(`Missing ${providerName} translation item.`);
    }

    return {
      id: segment.id,
      text: byId.get(segment.id)
    };
  });
}

export async function readResponseTextSafely(response) {
  if (!response || typeof response.text !== "function") {
    return "";
  }

  try {
    return normalizePayloadText(await response.text());
  } catch {
    return "";
  }
}

function getCandidateResponseText(data) {
  for (const candidate of Array.from(data?.candidates || [])) {
    const text = firstNonEmptyString([
      getPartsText(candidate?.content?.parts),
      getResponseValueText(candidate?.content?.text),
      getResponseValueText(candidate?.text),
      getResponseValueText(candidate?.outputText),
      getResponseValueText(candidate?.output_text)
    ]);

    if (text) {
      return text;
    }
  }

  return "";
}

function getChoiceResponseText(data) {
  for (const choice of Array.from(data?.choices || [])) {
    const text = firstNonEmptyString([
      getResponseValueText(choice?.message?.content),
      getResponseValueText(choice?.delta?.content),
      getResponseValueText(choice?.text),
      getResponseValueText(choice?.content)
    ]);

    if (text) {
      return text;
    }
  }

  return "";
}

function getDirectResponseText(data) {
  return firstNonEmptyString([
    getResponseValueText(data?.output_text),
    getResponseValueText(data?.outputText),
    getResponseValueText(data?.text),
    getResponseValueText(data?.content),
    getResponseValueText(data?.output)
  ]);
}

function getPartsText(parts) {
  if (!Array.isArray(parts)) {
    return "";
  }

  return normalizePayloadText(parts
    .map((part) => getResponseValueText(part))
    .filter(Boolean)
    .join("\n"));
}

function getResponseValueText(value, seen = new Set()) {
  if (typeof value === "string") {
    return normalizePayloadText(value);
  }

  if (Array.isArray(value)) {
    return normalizePayloadText(value
      .map((item) => getResponseValueText(item, seen))
      .filter(Boolean)
      .join("\n"));
  }

  if (!value || typeof value !== "object" || seen.has(value)) {
    return "";
  }

  seen.add(value);

  for (const key of RESPONSE_TEXT_KEYS) {
    const text = getResponseValueText(value[key], seen);

    if (text) {
      return text;
    }
  }

  return "";
}

function parseTranslationPayload(value, segments) {
  const text = normalizePayloadText(value);

  try {
    return normalizeTranslationPayload(
      JSON.parse(extractJsonPayloadText(text)),
      segments
    );
  } catch (error) {
    const jsonLineItems = parseJsonLineItems(text);

    if (jsonLineItems) {
      return normalizeTranslationPayload(jsonLineItems, segments);
    }

    const plainLineItems = parsePlainLineItems(text, segments);

    if (plainLineItems) {
      return plainLineItems;
    }

    if (segments.length === 1 && isLikelyPlainTranslatedText(text)) {
      return [{ id: segments[0].id, text }];
    }

    throw error;
  }
}

function normalizeTranslationPayload(parsed, segments) {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (typeof parsed === "string") {
    return parseTranslationPayload(parsed, segments);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid translation response.");
  }

  for (const key of WRAPPER_KEYS) {
    const nested = parsed[key];

    if (Array.isArray(nested)) {
      return nested;
    }

    if (typeof nested === "string") {
      return parseTranslationPayload(nested, segments);
    }

    if (nested && typeof nested === "object") {
      return normalizeTranslationPayload(nested, segments);
    }
  }

  if (segments.length === 1) {
    const text = getTranslationItemText(parsed);

    if (text) {
      return [{ id: segments[0].id, text }];
    }
  }

  const ids = new Set(segments.map((segment) => segment.id));
  const keyedEntries = Object.entries(parsed)
    .map(([id, item]) => {
      if (!ids.has(id)) {
        return null;
      }

      return {
        id,
        text: getTranslationValueText(item)
      };
    })
    .filter((item) => item && item.text);

  if (keyedEntries.length > 0) {
    return keyedEntries;
  }

  throw new Error("Invalid translation response.");
}

function normalizeTranslationItems(items, segments) {
  if (!Array.isArray(items)) {
    return items;
  }

  return items.map((item, index) => normalizeTranslationItem(item, index, items.length, segments));
}

function normalizeTranslationItem(item, index, itemCount, segments) {
  const orderedId = segments.length === itemCount ? segments[index]?.id ?? "" : "";
  const ids = new Set(segments.map((segment) => segment.id));

  if (typeof item === "string") {
    return {
      id: orderedId,
      text: item
    };
  }

  if (Array.isArray(item)) {
    return normalizeArrayTranslationItem(item, orderedId, ids);
  }

  if (!item || typeof item !== "object") {
    return item;
  }

  const explicitId = getTranslationItemId(item);
  const text = getTranslationItemText(item);

  if (explicitId || text) {
    return {
      id: explicitId || orderedId,
      text
    };
  }

  const singleKeyItem = normalizeSingleKeyTranslationItem(item, orderedId, ids);

  if (singleKeyItem) {
    return singleKeyItem;
  }

  return item;
}

function normalizeArrayTranslationItem(item, orderedId, ids) {
  if (item.length === 0) {
    return item;
  }

  if (item.length === 1) {
    return {
      id: orderedId,
      text: getTranslationValueText(item[0])
    };
  }

  const first = normalizeText(item[0]);

  if (ids.has(first)) {
    return {
      id: first,
      text: getTranslationValueText(item[1])
    };
  }

  return {
    id: orderedId,
    text: getTranslationValueText(item[item.length - 1])
  };
}

function normalizeSingleKeyTranslationItem(item, orderedId, ids) {
  const entries = Object.entries(item);

  if (entries.length !== 1) {
    return null;
  }

  const [key, value] = entries[0];
  const text = getTranslationValueText(value);

  if (!text) {
    return null;
  }

  return {
    id: ids.has(key) ? key : orderedId,
    text
  };
}

function parseJsonLineItems(value) {
  const lines = getPayloadLines(value)
    .filter((line) => /^[{["]/.test(line));

  if (lines.length <= 1) {
    return null;
  }

  const items = [];

  for (const line of lines) {
    try {
      items.push(JSON.parse(line));
    } catch {
      return null;
    }
  }

  return items;
}

function parsePlainLineItems(value, segments) {
  const lines = getPayloadLines(value)
    .map((line) => cleanPlainTranslationLine(line, segments))
    .filter(Boolean);

  if (lines.length !== segments.length || lines.length === 0) {
    return null;
  }

  if (!lines.every((line) => isLikelyPlainTranslatedText(line))) {
    return null;
  }

  return lines.map((line, index) => ({
    id: segments[index].id,
    text: line
  }));
}

function cleanPlainTranslationLine(value, segments) {
  let line = normalizeText(value);

  if (!line || /^[-:|\s]+$/.test(line)) {
    return "";
  }

  const tableText = extractTableLineText(line, segments);

  if (tableText) {
    return tableText;
  }

  line = line
    .replace(/^[-*+\u2022]\s+/, "")
    .replace(/^\d+[\.)\u3001]\s+/, "")
    .trim();

  for (const segment of segments) {
    const idPrefix = new RegExp(`^${escapeRegExp(segment.id)}\\s*[:：|\\-\\u2013\\u2014]\\s*`);
    line = line.replace(idPrefix, "").trim();
  }

  return line;
}

function extractTableLineText(value, segments) {
  if (!value.includes("|")) {
    return "";
  }

  const cells = value.split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);

  if (cells.length < 2 || /^[-:\s]+$/.test(cells.join(""))) {
    return "";
  }

  const ids = new Set(segments.map((segment) => segment.id));

  if (ids.has(cells[0])) {
    return cells.slice(1).join(" | ").trim();
  }

  return "";
}

function getPayloadLines(value) {
  return stripMarkdownFences(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^```/.test(line));
}

function getTranslationItemId(item) {
  return normalizeText(item?.id ?? item?.segmentId ?? item?.segment_id ?? item?.key);
}

function getTranslationItemText(item) {
  if (typeof item === "string") {
    return normalizeText(item);
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  for (const key of TEXT_KEYS) {
    const text = getTranslationValueText(item[key]);

    if (text) {
      return text;
    }
  }

  return "";
}

function getTranslationValueText(value) {
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  return getTranslationItemText(value);
}

function extractJsonPayloadText(value) {
  const text = stripMarkdownFences(value);

  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    return text;
  }

  const firstArrayIndex = text.indexOf("[");
  const firstObjectIndex = text.indexOf("{");
  const starts = [
    { index: firstArrayIndex, end: "]" },
    { index: firstObjectIndex, end: "}" }
  ].filter((candidate) => candidate.index >= 0)
    .sort((left, right) => left.index - right.index);

  if (starts.length === 0) {
    throw new Error("Missing JSON payload.");
  }

  const start = starts[0];
  const endIndex = text.lastIndexOf(start.end);

  if (endIndex <= start.index) {
    throw new Error("Missing JSON payload.");
  }

  return text.slice(start.index, endIndex + 1);
}

function stripMarkdownFences(value) {
  return String(value ?? "")
    .replace(/^\s*```[a-zA-Z0-9_-]*\s*/, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function firstNonEmptyString(values) {
  for (const value of values) {
    const text = normalizePayloadText(value);

    if (text) {
      return text;
    }
  }

  return "";
}

function looksLikeProviderErrorText(value) {
  return /api\s*key|token|invalid|unauthorized|forbidden|quota|rate\s*limit|permission/i.test(String(value ?? ""));
}

function isLikelyPlainTranslatedText(value) {
  const text = normalizeText(value);
  return Boolean(text && /[\u3400-\u9fff]/.test(text) && !looksLikeProviderErrorText(text));
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePayloadText(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
