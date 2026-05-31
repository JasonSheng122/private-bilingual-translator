import { evaluateDomainPolicy } from "../shared/domain-policy.mjs";
import {
  DISPLAY_MODES,
  MESSAGE_TYPES,
  normalizeDisplayMode,
  normalizePaidProvider,
  normalizeQualityMode
} from "../shared/message-types.mjs";
import {
  getStoredCustomProviderConfig,
  saveCustomProviderConfig
} from "./custom-provider-config.mjs";
import { translateSegments } from "./provider-manager.mjs";
import { clearApiKey, getApiKeyStatus, saveApiKey } from "./secret-manager.mjs";
import {
  getStoredFloatingControlsHidden,
  getStoredTranslationSettingsForUrl,
  saveFloatingControlsHidden,
  saveDisplayModeForUrl,
  saveTranslationSettingsForUrl
} from "./site-settings.mjs";

const CONTENT_SCRIPT_READY_ATTEMPTS = 5;
const CONTENT_SCRIPT_READY_RETRY_DELAY_MS = 75;
const CONTENT_SCRIPT_FILE = "src/content/content-script.js";
const FLOATING_CONTROLS_PORT_NAME = "pbt-floating-controls";
const floatingControlsPorts = new Set();

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    routeMessage(message, sender)
      .then(sendResponse)
      .catch(() => {
        sendResponse({
          ok: false,
          error: {
            code: "background_error",
            message: "Unknown background error."
          }
        });
      });

    return true;
  });
}

if (globalThis.chrome?.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    connectFloatingControlsPort(port);
  });
}

export async function routeMessage(message, sender = {}) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: { code: "invalid_message", message: "Invalid message." } };
  }

  if (message.type === MESSAGE_TYPES.GET_PAGE_STATUS) {
    return getPageStatus(message, sender);
  }

  if (message.type === MESSAGE_TYPES.TRANSLATE_PAGE) {
    return translatePage(message, sender);
  }

  if (message.type === MESSAGE_TYPES.RESTORE_PAGE) {
    return sendPageCommand(message.tabId, { type: MESSAGE_TYPES.RESTORE_PAGE }, sender);
  }

  if (message.type === MESSAGE_TYPES.REMOVE_TRANSLATIONS) {
    return sendPageCommand(message.tabId, { type: MESSAGE_TYPES.REMOVE_TRANSLATIONS }, sender);
  }

  if (message.type === MESSAGE_TYPES.SET_SITE_DISPLAY_MODE) {
    return setSiteDisplayMode(message, sender);
  }

  if (message.type === MESSAGE_TYPES.SET_SITE_TRANSLATION_SETTINGS) {
    return setSiteTranslationSettings(message, sender);
  }

  if (message.type === MESSAGE_TYPES.SET_FLOATING_CONTROLS_HIDDEN) {
    return setFloatingControlsHidden(message);
  }

  if (message.type === MESSAGE_TYPES.GET_CUSTOM_PROVIDER_CONFIG) {
    return getStoredCustomProviderConfig();
  }

  if (message.type === MESSAGE_TYPES.SAVE_CUSTOM_PROVIDER_CONFIG) {
    return saveCustomProviderConfig({
      baseUrl: message.baseUrl,
      model: message.model
    });
  }

  if (message.type === MESSAGE_TYPES.SAVE_API_KEY) {
    return saveApiKey({
      provider: message.provider,
      apiKey: message.apiKey,
      storageMode: message.storageMode
    });
  }

  if (message.type === MESSAGE_TYPES.GET_API_KEY_STATUS) {
    return getApiKeyStatus(message.provider);
  }

  if (message.type === MESSAGE_TYPES.CLEAR_API_KEY) {
    return clearApiKey({
      provider: message.provider,
      storageMode: message.storageMode
    });
  }

  if (message.type === MESSAGE_TYPES.OPEN_EXTENSION_POPUP) {
    return openExtensionPopup();
  }

  return { ok: false, error: { code: "unknown_message", message: "Unknown message type." } };
}

async function openExtensionPopup() {
  if (!globalThis.chrome?.action || typeof chrome.action.openPopup !== "function") {
    return makeOpenPopupUnavailableError();
  }

  try {
    await chrome.action.openPopup();
    return { ok: true, opened: true };
  } catch {
    return makeOpenPopupUnavailableError();
  }
}

async function getPageStatus(message, sender = {}) {
  const pageUrl = message.url || sender?.tab?.url || "";
  const senderTabId = Number(sender?.tab?.id);
  const tabId = Number.isInteger(Number(message.tabId)) ? Number(message.tabId) : senderTabId;
  const fromContentScript = Number.isInteger(senderTabId) && senderTabId === tabId;
  const storedSettings = await getStoredTranslationSettingsForUrl(pageUrl);
  const autoAllowlist = storedSettings?.autoTranslate ? [getHostname(pageUrl)].filter(Boolean) : [];
  const policy = evaluateDomainPolicy(pageUrl, { autoAllowlist });
  const qualityMode = storedSettings?.qualityMode ?? normalizeQualityMode(message.qualityMode);
  const displayMode = storedSettings?.displayMode ?? normalizeDisplayMode(message.displayMode);
  const paidProvider = storedSettings?.paidProvider ?? normalizePaidProvider(message.paidProvider);
  const autoTranslate = storedSettings?.autoTranslate === true;
  const floatingControlsHidden = await getStoredFloatingControlsHidden();

  if (!policy.blocked && Number.isInteger(tabId) && !fromContentScript) {
    try {
      if (await ensureContentScriptReady(tabId)) {
        await sendTabMessage(tabId, {
          type: MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON,
          qualityMode,
          displayMode,
          paidProvider,
          autoTranslate,
          floatingControlsHidden
        });
      }
    } catch {
      // Page status should still be returned when a page cannot host content UI.
    }
  }

  return {
    ok: true,
    policy,
    qualityMode,
    displayMode,
    paidProvider,
    autoTranslate,
    floatingControlsHidden
  };
}

async function setSiteDisplayMode(message, sender = {}) {
  const pageUrl = message.url || sender?.tab?.url || "";
  const policy = evaluateDomainPolicy(pageUrl);

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      policy,
      error: {
        code: "domain_blocked",
        message: "This page is blocked by the sensitive domain policy."
      }
    };
  }

  return saveDisplayModeForUrl({
    url: pageUrl,
    displayMode: message.displayMode
  });
}

async function setSiteTranslationSettings(message, sender = {}) {
  const pageUrl = message.url || sender?.tab?.url || "";
  const policy = evaluateDomainPolicy(pageUrl);

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      policy,
      error: {
        code: "domain_blocked",
        message: "This page is blocked by the sensitive domain policy."
      }
    };
  }

  return saveTranslationSettingsForUrl({
    url: pageUrl,
    displayMode: message.displayMode,
    qualityMode: message.qualityMode,
    paidProvider: message.paidProvider,
    autoTranslate: typeof message.autoTranslate === "boolean" ? message.autoTranslate : undefined
  });
}

async function setFloatingControlsHidden(message) {
  const saved = await saveFloatingControlsHidden(message.hidden === true);

  if (saved.ok) {
    broadcastFloatingControlsHidden(saved.floatingControlsHidden);
  }

  return saved;
}

async function translatePage(message, sender = {}) {
  const senderTabId = Number(sender?.tab?.id);
  const tabId = Number.isInteger(Number(message.tabId)) ? Number(message.tabId) : senderTabId;
  const qualityMode = normalizeQualityMode(message.qualityMode);
  const displayMode = normalizeDisplayMode(message.displayMode);
  const pageUrl = message.url || sender?.tab?.url || "";
  const policy = evaluateDomainPolicy(pageUrl);
  const fromContentScript = Number.isInteger(senderTabId) && senderTabId === tabId;

  if (!Number.isInteger(tabId)) {
    return { ok: false, error: { code: "missing_tab", message: "No active tab was found." } };
  }

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      policy,
      error: {
        code: "domain_blocked",
        message: "This page is blocked by the sensitive domain policy."
      }
    };
  }

  if (!fromContentScript && !(await ensureContentScriptReady(tabId))) {
    return makeContentScriptUnavailableError();
  }

  const incremental = fromContentScript && message.incremental === true;

  if (!incremental) {
    await sendTabMessage(tabId, {
      type: MESSAGE_TYPES.PREPARE_TRANSLATION,
      displayMode
    });
  }

  const collectResult = await sendTabMessage(tabId, {
    type: MESSAGE_TYPES.COLLECT_SEGMENTS,
    incremental,
    displayMode,
    showPendingIndicators: fromContentScript
  });

  if (!collectResult.ok || collectResult.segments.length === 0) {
    const cachedRenderedCount = Number.isInteger(collectResult.cachedRenderedCount)
      ? collectResult.cachedRenderedCount
      : 0;

    if (collectResult.ok && cachedRenderedCount > 0) {
      return {
        ok: true,
        status: displayMode === DISPLAY_MODES.REPLACE ? "replaced" : "bilingual",
        segmentCount: 0,
        renderedCount: cachedRenderedCount
      };
    }

    return {
      ok: true,
      status: "no_text",
      segmentCount: 0
    };
  }

  const providerResult = await translateSegments({
    qualityMode,
    segments: collectResult.segments,
    apiKey: message.apiKeyStorageMode === "once" ? message.apiKey : "",
    paidProvider: message.paidProvider
  });

  if (!providerResult.ok) {
    return providerResult;
  }

  const renderResult = await sendTabMessage(tabId, {
    type: MESSAGE_TYPES.RENDER_TRANSLATIONS,
    displayMode,
    translations: providerResult.translations
  });

  if (!renderResult.ok) {
    return renderResult;
  }

  const renderedCount = Number.isInteger(renderResult.renderedCount) ? renderResult.renderedCount : 0;

  if (renderedCount === 0) {
    return {
      ok: false,
      status: "no_render",
      segmentCount: providerResult.translations.length,
      renderedCount,
      provider: providerResult.provider,
      error: {
        code: "no_rendered_translations",
        message: "No translated text was rendered. The provider may have returned unchanged text."
      }
    };
  }

  return {
    ok: true,
    status: displayMode === DISPLAY_MODES.REPLACE ? "replaced" : "bilingual",
    segmentCount: providerResult.translations.length,
    renderedCount,
    provider: providerResult.provider
  };
}

async function sendPageCommand(tabId, message, sender = {}) {
  const senderTabId = Number(sender?.tab?.id);
  const numericTabId = Number.isInteger(Number(tabId)) ? Number(tabId) : senderTabId;
  const fromContentScript = Number.isInteger(senderTabId) && senderTabId === numericTabId;

  if (!Number.isInteger(numericTabId)) {
    return { ok: false, error: { code: "missing_tab", message: "No active tab was found." } };
  }

  if (!fromContentScript && !(await ensureContentScriptReady(numericTabId))) {
    return makeContentScriptUnavailableError();
  }

  return sendTabMessage(numericTabId, message);
}

function connectFloatingControlsPort(port) {
  if (!port || port.name !== FLOATING_CONTROLS_PORT_NAME) {
    return;
  }

  floatingControlsPorts.add(port);

  try {
    port.onDisconnect?.addListener?.(() => {
      floatingControlsPorts.delete(port);
    });
  } catch {
    floatingControlsPorts.delete(port);
  }

  getStoredFloatingControlsHidden()
    .then((hidden) => {
      postFloatingControlsHidden(port, hidden);
    })
    .catch(() => {});
}

function broadcastFloatingControlsHidden(hidden) {
  for (const port of Array.from(floatingControlsPorts)) {
    postFloatingControlsHidden(port, hidden);
  }
}

function postFloatingControlsHidden(port, hidden) {
  try {
    port.postMessage({
      type: MESSAGE_TYPES.APPLY_FLOATING_CONTROLS_HIDDEN,
      floatingControlsHidden: hidden === true
    });
  } catch {
    floatingControlsPorts.delete(port);
  }
}

async function isContentScriptReady(tabId) {
  for (let attempt = 1; attempt <= CONTENT_SCRIPT_READY_ATTEMPTS; attempt += 1) {
    try {
      const response = await sendTabMessage(tabId, {
        type: MESSAGE_TYPES.PING_CONTENT_SCRIPT
      });

      if (response?.ok === true) {
        return true;
      }
    } catch {
      // A manifest content script can be briefly unavailable while the page is still loading.
    }

    if (attempt < CONTENT_SCRIPT_READY_ATTEMPTS) {
      await waitForContentScriptRetry();
    }
  }

  return false;
}

async function ensureContentScriptReady(tabId) {
  if (await isContentScriptReady(tabId)) {
    return true;
  }

  if (!(await injectContentScript(tabId))) {
    return false;
  }

  return isContentScriptReady(tabId);
}

async function injectContentScript(tabId) {
  try {
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== "function") {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE]
    });
    return true;
  } catch {
    return false;
  }
}

function makeContentScriptUnavailableError() {
  return {
    ok: false,
    error: {
      code: "content_script_unavailable",
      message: "This page is not connected to the extension yet. Refresh this page once and try again."
    }
  };
}

function makeOpenPopupUnavailableError() {
  return {
    ok: false,
    error: {
      code: "open_popup_unavailable",
      message: "Open the extension popup from the toolbar to configure Key, Base URL, and model."
    }
  };
}

function waitForContentScriptRetry() {
  return new Promise((resolve) => {
    setTimeout(resolve, CONTENT_SCRIPT_READY_RETRY_DELAY_MS);
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function getHostname(url) {
  try {
    return new URL(String(url ?? "")).hostname;
  } catch {
    return "";
  }
}
