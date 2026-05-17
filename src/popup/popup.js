import { MESSAGE_TYPES, QUALITY_MODES } from "../shared/message-types.mjs";
import { getCustomProviderOriginPattern } from "../shared/custom-provider-config.mjs";

const qualityMode = document.getElementById("qualityMode");
const displayMode = document.getElementById("displayMode");
const paidProvider = document.getElementById("paidProvider");
const keyPanel = document.getElementById("keyPanel");
const providerNote = document.getElementById("providerNote");
const customProviderConfig = document.getElementById("customProviderConfig");
const customBaseUrlInput = document.getElementById("customBaseUrlInput");
const customModelInput = document.getElementById("customModelInput");
const saveCustomProviderConfigButton = document.getElementById("saveCustomProviderConfigButton");
const apiKeyStatus = document.getElementById("apiKeyStatus");
const apiKeyInput = document.getElementById("apiKeyInput");
const apiKeyStorageMode = document.getElementById("apiKeyStorageMode");
const saveKeyButton = document.getElementById("saveKeyButton");
const clearSessionKeyButton = document.getElementById("clearSessionKeyButton");
const clearLocalKeyButton = document.getElementById("clearLocalKeyButton");
const translateButton = document.getElementById("translateButton");
const restoreButton = document.getElementById("restoreButton");
const removeButton = document.getElementById("removeButton");
const status = document.getElementById("status");

translateButton.addEventListener("click", () => runPageAction(MESSAGE_TYPES.TRANSLATE_PAGE));
restoreButton.addEventListener("click", () => runPageAction(MESSAGE_TYPES.RESTORE_PAGE));
removeButton.addEventListener("click", () => runPageAction(MESSAGE_TYPES.REMOVE_TRANSLATIONS));
saveKeyButton.addEventListener("click", saveCurrentApiKey);
saveCustomProviderConfigButton.addEventListener("click", saveCurrentCustomProviderConfig);
clearSessionKeyButton.addEventListener("click", () => clearCurrentApiKey("session"));
clearLocalKeyButton.addEventListener("click", () => clearCurrentApiKey("local"));
qualityMode.addEventListener("change", async () => {
  updatePaidPanelVisibility();
  await saveCurrentSiteTranslationSettings();
  await refreshPaidPanelState();
});
displayMode.addEventListener("change", saveCurrentSiteTranslationSettings);
apiKeyStorageMode.addEventListener("change", updateApiKeyStatus);
paidProvider.addEventListener("change", async () => {
  updateProviderNote();
  updateCustomProviderVisibility();
  await loadCustomProviderConfig();
  await saveCurrentSiteTranslationSettings();
  await updateApiKeyStatus();
});

updateProviderNote();
updateCustomProviderVisibility();
updatePaidPanelVisibility();
refreshPageStatus();

function getSelectedPaidProvider() {
  return normalizePopupPaidProvider(paidProvider.value);
}

async function refreshPageStatus() {
  const tab = await getActiveTab();

  if (!tab) {
    setStatus("No active tab.");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_PAGE_STATUS,
    tabId: tab.id,
    url: tab.url,
    qualityMode: qualityMode.value,
    displayMode: displayMode.value,
    paidProvider: getSelectedPaidProvider()
  });

  if (response.ok && response.policy.blocked) {
    setStatus("Blocked on this sensitive page.");
    translateButton.disabled = true;
    return;
  }

  if (response.ok && response.displayMode) {
    displayMode.value = response.displayMode;
  }

  if (response.ok && response.qualityMode) {
    qualityMode.value = response.qualityMode;
    updatePaidPanelVisibility();
  }

  if (response.ok && response.paidProvider) {
    paidProvider.value = normalizePopupPaidProvider(response.paidProvider);
    updateProviderNote();
    updateCustomProviderVisibility();
  }

  await refreshPaidPanelState();
  translateButton.disabled = false;
  setStatus("Ready.");
}

async function saveCurrentSiteTranslationSettings() {
  const tab = await getActiveTab();

  if (!tab) {
    setStatus("No active tab.");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.SET_SITE_TRANSLATION_SETTINGS,
    tabId: tab.id,
    url: tab.url,
    qualityMode: qualityMode.value,
    paidProvider: getSelectedPaidProvider(),
    displayMode: displayMode.value
  });

  if (!response.ok) {
    setStatus(response.blocked ? "Blocked on this sensitive page." : response.error.message);
    return;
  }

  await refreshPageStatus();
}

async function runPageAction(type) {
  const tab = await getActiveTab();

  if (!tab) {
    setStatus("No active tab.");
    return;
  }

  if (type === MESSAGE_TYPES.TRANSLATE_PAGE && isPaidQualityMode() && isCustomPaidProvider()) {
    const permission = await requestCustomProviderPermission(customBaseUrlInput.value);

    if (!permission.ok) {
      setStatus(permission.message);
      return;
    }
  }

  setStatus("Working...");

  const singleUseApiKey = isPaidQualityMode() && apiKeyStorageMode.value === "once" ? apiKeyInput.value : "";
  const response = await chrome.runtime.sendMessage({
    type,
    tabId: tab.id,
    url: tab.url,
    qualityMode: qualityMode.value,
    displayMode: displayMode.value,
    paidProvider: getSelectedPaidProvider(),
    apiKey: singleUseApiKey,
    apiKeyStorageMode: apiKeyStorageMode.value
  });

  if (singleUseApiKey) {
    apiKeyInput.value = "";
  }

  if (!response.ok) {
    setStatus(response.blocked ? "Blocked on this sensitive page." : response.error.message);
    return;
  }

  if (type === MESSAGE_TYPES.RESTORE_PAGE) {
    const restoredCount = Number(response.restoredCount ?? 0) + Number(response.removedCount ?? 0);
    setStatus(`Restored ${restoredCount} item(s).`);
    return;
  }

  if (type === MESSAGE_TYPES.REMOVE_TRANSLATIONS) {
    setStatus(`Removed ${response.removedCount} item(s).`);
    return;
  }

  if (response.status === "no_text") {
    setStatus("No translatable text found.");
    return;
  }

  if (response.status === "no_render") {
    setStatus("No translated text was rendered.");
    return;
  }

  const translatedCount = Number.isInteger(response.renderedCount)
    ? response.renderedCount
    : response.segmentCount;

  setStatus(`Translated ${translatedCount} item(s).`);
}

async function saveCurrentApiKey() {
  if (!isPaidQualityMode()) {
    setStatus("免费版不需要 API Key.");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.SAVE_API_KEY,
    provider: getSelectedPaidProvider(),
    apiKey: apiKeyInput.value,
    storageMode: apiKeyStorageMode.value
  });

  if (!response.ok) {
    setStatus(response.error.message);
    return;
  }

  if (response.saved) {
    apiKeyInput.value = "";
    await updateApiKeyStatus();
    setStatus(response.storageMode === "local" ? "Key saved locally." : "Key saved for this session.");
    return;
  }

  await updateApiKeyStatus();
  setStatus("Single-use Key will only be used when you click Translate.");
}

async function saveCurrentCustomProviderConfig() {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.SAVE_CUSTOM_PROVIDER_CONFIG,
    baseUrl: customBaseUrlInput.value,
    model: customModelInput.value
  });

  if (!response.ok) {
    setStatus(response.error.message);
    return;
  }

  customBaseUrlInput.value = response.baseUrl;
  customModelInput.value = response.model;
  updateProviderNote();
  setStatus("Custom provider config saved.");
}

async function clearCurrentApiKey(storageMode) {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CLEAR_API_KEY,
    provider: getSelectedPaidProvider(),
    storageMode
  });

  if (!response.ok) {
    setStatus(response.error.message);
    return;
  }

  await updateApiKeyStatus();
  setStatus(storageMode === "local" ? "Local Key cleared." : "Session Key cleared.");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function loadCustomProviderConfig() {
  if (!isPaidQualityMode()) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_CUSTOM_PROVIDER_CONFIG
  });

  if (!response.ok || !response.configured) {
    updateProviderNote();
    return;
  }

  customBaseUrlInput.value = response.baseUrl;
  customModelInput.value = response.model;
  updateProviderNote();
}

async function requestCustomProviderPermission(baseUrl) {
  const originPattern = getCustomProviderOriginPattern(baseUrl);

  if (!originPattern) {
    return {
      ok: false,
      message: "Custom provider Base URL must be a valid HTTPS URL."
    };
  }

  if (!chrome.permissions || typeof chrome.permissions.request !== "function") {
    return { ok: true };
  }

  const alreadyGranted = typeof chrome.permissions.contains === "function"
    ? await checkPermission(originPattern)
    : false;

  if (alreadyGranted) {
    return { ok: true };
  }

  const granted = await new Promise((resolve) => {
    chrome.permissions.request({ origins: [originPattern] }, (result) => {
      resolve(result === true);
    });
  });

  return granted
    ? { ok: true }
    : { ok: false, message: "Custom provider permission was not granted." };
}

function checkPermission(originPattern) {
  return new Promise((resolve) => {
    try {
      chrome.permissions.contains({ origins: [originPattern] }, (result) => {
        resolve(result === true);
      });
    } catch {
      resolve(false);
    }
  });
}

function setStatus(value) {
  status.textContent = value;
}

function updateProviderNote() {
  if (isCustomPaidProvider()) {
    providerNote.textContent = "自定义中转站 · Base URL 可填中转站根地址";
    return;
  }

  providerNote.textContent = "https://generativelanguage.googleapis.com · gemini-2.5-flash-lite";
}

function updateCustomProviderVisibility() {
  customProviderConfig.hidden = !isPaidQualityMode() || !isCustomPaidProvider();
}

async function refreshPaidPanelState() {
  updatePaidPanelVisibility();
  updateCustomProviderVisibility();

  if (!isPaidQualityMode()) {
    return;
  }

  await loadCustomProviderConfig();
  await updateApiKeyStatus();
}

function updatePaidPanelVisibility() {
  keyPanel.hidden = !isPaidQualityMode();
}

function isPaidQualityMode() {
  return qualityMode.value === QUALITY_MODES.NATURAL || qualityMode.value === QUALITY_MODES.DEEP;
}

function isCustomPaidProvider() {
  return getSelectedPaidProvider() === "custom_openai";
}

async function updateApiKeyStatus() {
  if (!isPaidQualityMode()) {
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_API_KEY_STATUS,
    provider: getSelectedPaidProvider()
  });

  if (!response.ok) {
    setApiKeyStatus("Key 状态不可用", "unknown");
    return;
  }

  if (response.hasSessionKey && response.hasLocalKey) {
    setApiKeyStatus("Key 已保存：本次会话 + 本地", "saved");
    return;
  }

  if (response.hasSessionKey) {
    setApiKeyStatus("Key 已保存：本次会话", "saved");
    return;
  }

  if (response.hasLocalKey) {
    setApiKeyStatus("Key 已保存：本地", "saved");
    return;
  }

  const message = qualityMode.value === "free"
    ? "Key 未保存；免费版不需要 Key"
    : "Key 未保存；自然版 / 深度版需要先保存 Key";
  setApiKeyStatus(message, "missing");
}

function setApiKeyStatus(value, state) {
  apiKeyStatus.textContent = value;
  apiKeyStatus.setAttribute("data-state", state);
}

function normalizePopupPaidProvider(value) {
  return value === "custom_openai" || value === "custom_gemini" ? "custom_openai" : "gemini";
}
