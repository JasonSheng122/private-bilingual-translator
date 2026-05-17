const CJK_PATTERN = /[\u3400-\u9fff]/g;
const LATIN_WORD_PATTERN = /[A-Za-z][A-Za-z0-9._+-]*/g;

export function hasUntranslatedPaidOutput(translations, segments) {
  return filterTranslatedPaidOutput(translations, segments).hasUntranslated;
}

export function filterTranslatedPaidOutput(translations, segments) {
  const translationById = new Map(
    Array.from(translations || [], (translation) => [
      String(translation?.id ?? ""),
      translation
    ])
  );
  const acceptedTranslations = [];
  let untranslatedCount = 0;

  for (const segment of Array.from(segments || [])) {
    const id = String(segment?.id ?? "");
    const translation = translationById.get(id);

    if (!translation) {
      continue;
    }

    if (isUntranslatedPaidOutput(segment?.text, translation?.text)) {
      untranslatedCount += 1;
      continue;
    }

    acceptedTranslations.push(translation);
  }

  return {
    translations: acceptedTranslations,
    untranslatedCount,
    hasUntranslated: untranslatedCount > 0
  };
}

export function mergePaidOutputTranslations(primaryTranslations, fallbackTranslations, segments) {
  const byId = new Map();

  for (const translation of Array.from(fallbackTranslations || [])) {
    byId.set(String(translation?.id ?? ""), translation);
  }

  for (const translation of Array.from(primaryTranslations || [])) {
    byId.set(String(translation?.id ?? ""), translation);
  }

  return Array.from(segments || [])
    .map((segment) => byId.get(String(segment?.id ?? "")))
    .filter(Boolean);
}

export function isUntranslatedPaidOutput(source, translated) {
  const sourceText = normalizeText(source);
  const translatedText = normalizeText(translated);

  if (!sourceText || !translatedText) {
    return false;
  }

  const sourceWords = getLatinWords(sourceText);

  if (sourceWords.length < 3 || sourceText.length < 12) {
    return false;
  }

  const translatedCjkCount = countCjk(translatedText);
  const compactSource = compactForCopyCompare(sourceText);
  const compactTranslated = compactForCopyCompare(translatedText);

  if (translatedCjkCount < 2 && hasHighSourceWordOverlap(sourceWords, translatedText, 0.75)) {
    return true;
  }

  if (sourceWords.length >= 3 && compactTranslated.startsWith(compactSource)) {
    return true;
  }

  return sourceWords.length >= 6 &&
    translatedText.length >= sourceText.length * 0.8 &&
    hasHighSourceWordOverlap(sourceWords, translatedText, 0.8);
}

function hasHighSourceWordOverlap(sourceWords, translatedText, threshold) {
  const translatedWords = new Set(getLatinWords(translatedText));
  const matchedCount = sourceWords.filter((word) => translatedWords.has(word)).length;

  return matchedCount / sourceWords.length >= threshold;
}

function getLatinWords(value) {
  return Array.from(new Set(
    (String(value ?? "").match(LATIN_WORD_PATTERN) || [])
      .map((word) => word.toLowerCase())
      .filter((word) => word.length >= 3)
  ));
}

function countCjk(value) {
  return (String(value ?? "").match(CJK_PATTERN) || []).length;
}

function compactForCopyCompare(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
