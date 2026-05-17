export function normalizeCustomProviderConfig(value) {
  const baseUrl = normalizeCustomProviderBaseUrl(value?.baseUrl);
  const model = normalizeCustomProviderModel(value?.model);

  if (!baseUrl || !model) {
    return null;
  }

  return { baseUrl, model };
}

export function normalizeCustomProviderBaseUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());

    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
      return "";
    }

    return url.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

export function normalizeCustomProviderModel(value) {
  const model = String(value ?? "").trim().replace(/^models\//i, "").toLowerCase();

  if (!/^[A-Za-z0-9._-]{1,120}$/.test(model)) {
    return "";
  }

  return model;
}

export function buildCustomGeminiEndpoint({ baseUrl, model } = {}) {
  const normalizedConfig = normalizeCustomProviderConfig({ baseUrl, model });

  if (!normalizedConfig) {
    return "";
  }

  return `${normalizedConfig.baseUrl}/v1beta/models/${normalizedConfig.model}:generateContent`;
}

export function buildCustomOpenAiEndpoint({ baseUrl, model } = {}) {
  const normalizedConfig = normalizeCustomProviderConfig({ baseUrl, model });

  if (!normalizedConfig) {
    return "";
  }

  try {
    const url = new URL(normalizedConfig.baseUrl);
    const pathname = url.pathname.replace(/\/+$/, "");

    if (/\/chat\/completions$/i.test(pathname)) {
      return normalizedConfig.baseUrl;
    }

    return /\/v1$/i.test(pathname)
      ? `${normalizedConfig.baseUrl}/chat/completions`
      : `${normalizedConfig.baseUrl}/v1/chat/completions`;
  } catch {
    return "";
  }
}

export function getCustomProviderOriginPattern(baseUrl) {
  const normalizedBaseUrl = normalizeCustomProviderBaseUrl(baseUrl);

  if (!normalizedBaseUrl) {
    return "";
  }

  try {
    return `${new URL(normalizedBaseUrl).origin}/*`;
  } catch {
    return "";
  }
}
