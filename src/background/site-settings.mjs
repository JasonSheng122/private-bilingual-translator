import {
  DISPLAY_MODES,
  PAID_PROVIDERS,
  QUALITY_MODES,
  normalizeDisplayMode,
  normalizePaidProvider,
  normalizeQualityMode
} from "../shared/message-types.mjs";

const SITE_SETTINGS_KEY = "pbt_site_settings_v1";

export function getSiteSettingsKey(url) {
  try {
    const parsed = new URL(String(url ?? ""));

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }

    return parsed.origin;
  } catch {
    return "";
  }
}

export async function getStoredDisplayModeForUrl(url, storageArea = getDefaultStorageArea()) {
  const settings = await getStoredTranslationSettingsForUrl(url, storageArea);
  return settings?.displayMode ?? null;
}

export async function getStoredTranslationSettingsForUrl(url, storageArea = getDefaultStorageArea()) {
  const siteKey = getSiteSettingsKey(url);

  if (!siteKey || !storageArea) {
    return null;
  }

  const settings = await readSiteSettings(storageArea);

  return {
    siteKey,
    displayMode: normalizeStoredDisplayMode(settings.displayModesByOrigin[siteKey]) ?? settings.defaultDisplayMode,
    qualityMode: normalizeStoredQualityMode(settings.qualityModesByOrigin[siteKey]) ?? settings.defaultQualityMode,
    paidProvider: normalizeStoredPaidProvider(settings.paidProvidersByOrigin[siteKey]) ?? settings.defaultPaidProvider,
    autoTranslate: settings.autoTranslateByOrigin[siteKey] === true
  };
}

export async function getStoredFloatingControlsHidden(storageArea = getDefaultStorageArea()) {
  if (!storageArea) {
    return false;
  }

  const settings = await readSiteSettings(storageArea);
  return settings.floatingControlsHidden === true;
}

export async function saveDisplayModeForUrl({ url, displayMode }, storageArea = getDefaultStorageArea()) {
  const siteKey = getSiteSettingsKey(url);
  const normalizedDisplayMode = normalizeDisplayMode(displayMode);

  if (!siteKey) {
    return {
      ok: false,
      error: {
        code: "site_settings_invalid_url",
        message: "This site cannot save a display mode."
      }
    };
  }

  if (!storageArea) {
    return {
      ok: false,
      error: {
        code: "site_settings_unavailable",
        message: "Site settings storage is unavailable."
      }
    };
  }

  const settings = await readSiteSettings(storageArea);
  const nextSettings = {
    ...settings,
    defaultDisplayMode: normalizedDisplayMode,
    displayModesByOrigin: {
      ...settings.displayModesByOrigin,
      [siteKey]: normalizedDisplayMode
    }
  };

  await writeSiteSettings(storageArea, nextSettings);

  return {
    ok: true,
    siteKey,
    displayMode: normalizedDisplayMode
  };
}

export async function saveTranslationSettingsForUrl({
  url,
  displayMode,
  qualityMode,
  paidProvider,
  autoTranslate
}, storageArea = getDefaultStorageArea()) {
  const siteKey = getSiteSettingsKey(url);

  if (!siteKey) {
    return {
      ok: false,
      error: {
        code: "site_settings_invalid_url",
        message: "This site cannot save translation settings."
      }
    };
  }

  if (!storageArea) {
    return {
      ok: false,
      error: {
        code: "site_settings_unavailable",
        message: "Site settings storage is unavailable."
      }
    };
  }

  const settings = await readSiteSettings(storageArea);
  const normalizedDisplayMode = normalizeDisplayMode(displayMode);
  const normalizedQualityMode = normalizeQualityMode(qualityMode);
  const normalizedPaidProvider = normalizePaidProvider(paidProvider);
  const nextSettings = {
    ...settings,
    defaultDisplayMode: normalizedDisplayMode,
    defaultQualityMode: normalizedQualityMode,
    defaultPaidProvider: normalizedPaidProvider,
    displayModesByOrigin: {
      ...settings.displayModesByOrigin,
      [siteKey]: normalizedDisplayMode
    },
    qualityModesByOrigin: {
      ...settings.qualityModesByOrigin,
      [siteKey]: normalizedQualityMode
    },
    paidProvidersByOrigin: {
      ...settings.paidProvidersByOrigin,
      [siteKey]: normalizedPaidProvider
    },
    autoTranslateByOrigin: {
      ...settings.autoTranslateByOrigin
    }
  };

  if (typeof autoTranslate === "boolean") {
    nextSettings.autoTranslateByOrigin[siteKey] = autoTranslate;
  }

  await writeSiteSettings(storageArea, nextSettings);

  return {
    ok: true,
    siteKey,
    displayMode: nextSettings.displayModesByOrigin[siteKey],
    qualityMode: nextSettings.qualityModesByOrigin[siteKey],
    paidProvider: nextSettings.paidProvidersByOrigin[siteKey],
    autoTranslate: nextSettings.autoTranslateByOrigin[siteKey] === true
  };
}

export async function saveFloatingControlsHidden(hidden, storageArea = getDefaultStorageArea()) {
  if (!storageArea) {
    return {
      ok: false,
      error: {
        code: "site_settings_unavailable",
        message: "Site settings storage is unavailable."
      }
    };
  }

  const floatingControlsHidden = hidden === true;
  const settings = await readSiteSettings(storageArea);
  const nextSettings = {
    ...settings,
    floatingControlsHidden
  };

  await writeSiteSettings(storageArea, nextSettings);

  return {
    ok: true,
    floatingControlsHidden
  };
}

async function readSiteSettings(storageArea) {
  const stored = await storageGet(storageArea, SITE_SETTINGS_KEY);
  const settings = stored?.[SITE_SETTINGS_KEY];

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return createEmptySettings();
  }

  return {
    displayModesByOrigin: normalizeMap(settings.displayModesByOrigin, normalizeStoredDisplayMode),
    qualityModesByOrigin: normalizeMap(settings.qualityModesByOrigin, normalizeStoredQualityMode),
    paidProvidersByOrigin: normalizeMap(settings.paidProvidersByOrigin, normalizeStoredPaidProvider),
    autoTranslateByOrigin: normalizeBooleanMap(settings.autoTranslateByOrigin),
    defaultDisplayMode: normalizeStoredDisplayMode(settings.defaultDisplayMode),
    defaultQualityMode: normalizeStoredQualityMode(settings.defaultQualityMode),
    defaultPaidProvider: normalizeStoredPaidProvider(settings.defaultPaidProvider),
    floatingControlsHidden: settings.floatingControlsHidden === true
  };
}

function writeSiteSettings(storageArea, settings) {
  return storageSet(storageArea, { [SITE_SETTINGS_KEY]: settings });
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

function getDefaultStorageArea() {
  return globalThis.chrome?.storage?.local ?? null;
}

function createEmptySettings() {
  return {
    displayModesByOrigin: {},
    qualityModesByOrigin: {},
    paidProvidersByOrigin: {},
    autoTranslateByOrigin: {},
    defaultDisplayMode: null,
    defaultQualityMode: null,
    defaultPaidProvider: null,
    floatingControlsHidden: false
  };
}

function normalizeMap(value, normalizeValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value)
    .map(([siteKey, settingValue]) => [siteKey, normalizeValue(settingValue)])
    .filter((entry) => entry[1] !== null);

  return Object.fromEntries(entries);
}

function normalizeBooleanMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry) => typeof entry[1] === "boolean")
  );
}

function normalizeStoredDisplayMode(value) {
  return value === DISPLAY_MODES.BILINGUAL || value === DISPLAY_MODES.REPLACE ? value : null;
}

function normalizeStoredQualityMode(value) {
  return value === QUALITY_MODES.FREE || value === QUALITY_MODES.NATURAL || value === QUALITY_MODES.DEEP ? value : null;
}

function normalizeStoredPaidProvider(value) {
  return value === PAID_PROVIDERS.GEMINI ||
    value === PAID_PROVIDERS.CUSTOM_OPENAI ||
    value === PAID_PROVIDERS.CUSTOM_GEMINI
    ? value
    : null;
}
