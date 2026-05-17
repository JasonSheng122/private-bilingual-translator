export const MOCK_PROVIDER = Object.freeze({
  id: "mock",
  displayName: "Mock Provider",
  allowedOrigins: [],
  maxRequestSize: 50000,
  requiresKey: false
});

export function translateWithMockProvider(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    return {
      ok: false,
      error: {
        code: "empty_segments",
        message: "No translatable text was found."
      }
    };
  }

  return {
    ok: true,
    provider: {
      id: MOCK_PROVIDER.id,
      displayName: MOCK_PROVIDER.displayName,
      allowedOrigins: MOCK_PROVIDER.allowedOrigins,
      requiresKey: MOCK_PROVIDER.requiresKey
    },
    translations: segments.map((segment) => ({
      id: segment.id,
      text: makeMockTranslation(segment.text)
    }))
  };
}

function makeMockTranslation(text) {
  const compactText = String(text ?? "").replace(/\s+/g, " ").trim();
  return `[mock zh] ${compactText}`;
}
