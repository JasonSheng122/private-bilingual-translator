import {
  buildCustomGeminiEndpoint,
  buildCustomOpenAiEndpoint,
  getCustomProviderOriginPattern,
  normalizeCustomProviderBaseUrl,
  normalizeCustomProviderConfig,
  normalizeCustomProviderModel
} from "../shared/custom-provider-config.mjs";

const CUSTOM_PROVIDER_CONFIG_KEY = "pbt_custom_gemini_provider_config_v1";

export {
  buildCustomGeminiEndpoint,
  buildCustomOpenAiEndpoint,
  getCustomProviderOriginPattern,
  normalizeCustomProviderBaseUrl,
  normalizeCustomProviderConfig,
  normalizeCustomProviderModel
};

export async function saveCustomProviderConfig({ baseUrl, model } = {}, storageArea = getDefaultStorageArea()) {
  const normalizedConfig = normalizeCustomProviderConfig({ baseUrl, model });

  if (!normalizedConfig) {
    return makeConfigError("custom_provider_config_invalid", "Custom provider Base URL and model are required.");
  }

  if (!storageArea) {
    return makeConfigError("custom_provider_config_unavailable", "Custom provider config storage is unavailable.");
  }

  await storageSet(storageArea, {
    [CUSTOM_PROVIDER_CONFIG_KEY]: normalizedConfig
  });

  return {
    ok: true,
    configured: true,
    ...normalizedConfig
  };
}

export async function getStoredCustomProviderConfig(storageArea = getDefaultStorageArea()) {
  if (!storageArea) {
    return {
      ok: true,
      configured: false,
      baseUrl: "",
      model: ""
    };
  }

  const stored = await storageGet(storageArea, CUSTOM_PROVIDER_CONFIG_KEY);
  const normalizedConfig = normalizeCustomProviderConfig(stored?.[CUSTOM_PROVIDER_CONFIG_KEY]);

  if (!normalizedConfig) {
    return {
      ok: true,
      configured: false,
      baseUrl: "",
      model: ""
    };
  }

  return {
    ok: true,
    configured: true,
    ...normalizedConfig
  };
}

function getDefaultStorageArea() {
  return globalThis.chrome?.storage?.local ?? null;
}

function storageGet(storageArea, key) {
  return new Promise((resolve) => {
    try {
      storageArea.get(key, (result) => {
        resolve(result ?? {});
      });
    } catch {
      resolve({});
    }
  });
}

function storageSet(storageArea, value) {
  return new Promise((resolve) => {
    try {
      storageArea.set(value, () => {
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

function makeConfigError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}
