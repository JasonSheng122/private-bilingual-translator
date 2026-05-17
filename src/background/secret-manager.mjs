import { API_KEY_STORAGE_MODES, normalizeApiKeyStorageMode } from "../shared/message-types.mjs";

const API_KEYS_STORAGE_KEY = "pbt_api_keys_v1";
const GEMINI_PROVIDER_ID = "gemini";
const CUSTOM_OPENAI_PROVIDER_ID = "custom_openai";
const CUSTOM_GEMINI_PROVIDER_ID = "custom_gemini";

export async function saveApiKey({ provider = GEMINI_PROVIDER_ID, apiKey, storageMode } = {}, storageAreas = getDefaultStorageAreas()) {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedApiKey = normalizeApiKey(apiKey);
  const normalizedStorageMode = normalizeApiKeyStorageMode(storageMode);

  if (!normalizedProvider) {
    return makeSecretError("secret_provider_invalid", "The API key provider is not supported.");
  }

  if (!normalizedApiKey) {
    return makeSecretError("secret_key_missing", "API Key is required.");
  }

  if (normalizedStorageMode === API_KEY_STORAGE_MODES.ONCE) {
    return {
      ok: true,
      provider: normalizedProvider,
      storageMode: normalizedStorageMode,
      saved: false
    };
  }

  const storageArea = selectStorageArea(normalizedStorageMode, storageAreas);

  if (!storageArea) {
    return makeSecretError("secret_storage_unavailable", "API Key storage is unavailable.");
  }

  const keys = await readApiKeys(storageArea);
  await writeApiKeys(storageArea, {
    ...keys,
    [normalizedProvider]: normalizedApiKey
  });

  return {
    ok: true,
    provider: normalizedProvider,
    storageMode: normalizedStorageMode,
    saved: true
  };
}

export async function getStoredApiKey(provider = GEMINI_PROVIDER_ID, storageAreas = getDefaultStorageAreas()) {
  const normalizedProvider = normalizeProvider(provider);

  if (!normalizedProvider) {
    return "";
  }

  const sessionKey = storageAreas.session
    ? (await readApiKeys(storageAreas.session))[normalizedProvider]
    : "";

  if (sessionKey) {
    return sessionKey;
  }

  return storageAreas.local
    ? (await readApiKeys(storageAreas.local))[normalizedProvider] ?? ""
    : "";
}

export async function getApiKeyStatus(provider = GEMINI_PROVIDER_ID, storageAreas = getDefaultStorageAreas()) {
  const normalizedProvider = normalizeProvider(provider);

  if (!normalizedProvider) {
    return makeSecretError("secret_provider_invalid", "The API key provider is not supported.");
  }

  const sessionKeys = storageAreas.session ? await readApiKeys(storageAreas.session) : {};
  const localKeys = storageAreas.local ? await readApiKeys(storageAreas.local) : {};

  return {
    ok: true,
    provider: normalizedProvider,
    hasSessionKey: Boolean(sessionKeys[normalizedProvider]),
    hasLocalKey: Boolean(localKeys[normalizedProvider])
  };
}

export async function clearApiKey({ provider = GEMINI_PROVIDER_ID, storageMode } = {}, storageAreas = getDefaultStorageAreas()) {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedStorageMode = normalizeApiKeyStorageMode(storageMode);

  if (!normalizedProvider) {
    return makeSecretError("secret_provider_invalid", "The API key provider is not supported.");
  }

  if (normalizedStorageMode === API_KEY_STORAGE_MODES.LOCAL || normalizedStorageMode === API_KEY_STORAGE_MODES.SESSION) {
    const storageArea = selectStorageArea(normalizedStorageMode, storageAreas);

    if (!storageArea) {
      return makeSecretError("secret_storage_unavailable", "API Key storage is unavailable.");
    }

    await removeStoredKey(storageArea, normalizedProvider);
    return { ok: true, provider: normalizedProvider, storageMode: normalizedStorageMode };
  }

  if (storageAreas.session) {
    await removeStoredKey(storageAreas.session, normalizedProvider);
  }

  if (storageAreas.local) {
    await removeStoredKey(storageAreas.local, normalizedProvider);
  }

  return { ok: true, provider: normalizedProvider, storageMode: API_KEY_STORAGE_MODES.ONCE };
}

export function normalizeApiKey(value) {
  return String(value ?? "").trim();
}

function normalizeProvider(value) {
  if (value === GEMINI_PROVIDER_ID || value === CUSTOM_OPENAI_PROVIDER_ID || value === CUSTOM_GEMINI_PROVIDER_ID) {
    return value;
  }

  return "";
}

async function removeStoredKey(storageArea, provider) {
  const keys = await readApiKeys(storageArea);
  const nextKeys = { ...keys };
  delete nextKeys[provider];
  await writeApiKeys(storageArea, nextKeys);
}

async function readApiKeys(storageArea) {
  const stored = await storageGet(storageArea, API_KEYS_STORAGE_KEY);
  const keys = stored?.[API_KEYS_STORAGE_KEY];

  if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
    return {};
  }

  return { ...keys };
}

function writeApiKeys(storageArea, keys) {
  return storageSet(storageArea, { [API_KEYS_STORAGE_KEY]: keys });
}

function selectStorageArea(storageMode, storageAreas) {
  if (storageMode === API_KEY_STORAGE_MODES.LOCAL) {
    return storageAreas.local ?? null;
  }

  return storageAreas.session ?? null;
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

function getDefaultStorageAreas() {
  return {
    session: globalThis.chrome?.storage?.session ?? null,
    local: globalThis.chrome?.storage?.local ?? null
  };
}

function makeSecretError(code, message) {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}
