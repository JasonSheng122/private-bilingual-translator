import {
  API_KEY_STORAGE_MODES,
  MESSAGE_TYPES,
  PAID_PROVIDERS,
  normalizeApiKeyStorageMode,
  normalizePaidProvider
} from "../shared/message-types.mjs";

const providerName = document.getElementById("providerName");
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
const status = document.getElementById("status");

saveCustomProviderConfigButton.addEventListener("click", saveCurrentCustomProviderConfig);
saveKeyButton.addEventListener("click", saveCurrentApiKey);
clearSessionKeyButton.addEventListener("click", () => clearCurrentApiKey(API_KEY_STORAGE_MODES.SESSION));
clearLocalKeyButton.addEventListener("click", () => clearCurrentApiKey(API_KEY_STORAGE_MODES.LOCAL));

initialize();

async function initialize() {
  updateProviderUi();
  await refreshState();
}

async function refreshState() {
  await loadCustomProviderConfig();
  await updateApiKeyStatus();
}

function getSelectedPaidProvider() {
  const params = new URLSearchParams(globalThis.location?.search ?? "");
  return normalizePaidProvider(params.get("provider"));
}

function isCustomPaidProvider() {
  return getSelectedPaidProvider() === PAID_PROVIDERS.CUSTOM_OPENAI;
}

function updateProviderUi() {
  providerName.textContent = isCustomPaidProvider()
    ? "自定义中转站"
    : "Gemini API";
  customProviderConfig.hidden = !isCustomPaidProvider();
}

async function loadCustomProviderConfig() {
  if (!isCustomPaidProvider()) {
    return;
  }

  const response = await sendMessage({
    type: MESSAGE_TYPES.GET_CUSTOM_PROVIDER_CONFIG
  });

  if (!response.ok || !response.configured) {
    return;
  }

  customBaseUrlInput.value = response.baseUrl;
  customModelInput.value = response.model;
}

async function saveCurrentCustomProviderConfig() {
  if (!isCustomPaidProvider()) {
    setStatus("Gemini API 不需要中转站配置。");
    return;
  }

  const response = await sendMessage({
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
  setStatus("Custom provider config saved.");
}

async function saveCurrentApiKey() {
  const storageMode = normalizeApiKeyStorageMode(apiKeyStorageMode.value);

  if (storageMode === API_KEY_STORAGE_MODES.ONCE) {
    setStatus("单次 Key 请在扩展弹窗随翻译使用。");
    return;
  }

  const response = await sendMessage({
    type: MESSAGE_TYPES.SAVE_API_KEY,
    provider: getSelectedPaidProvider(),
    apiKey: apiKeyInput.value,
    storageMode
  });

  if (!response.ok) {
    setStatus(response.error.message);
    return;
  }

  apiKeyInput.value = "";
  await updateApiKeyStatus();
  setStatus(response.storageMode === API_KEY_STORAGE_MODES.LOCAL ? "Key saved locally." : "Key saved for this session.");
}

async function clearCurrentApiKey(storageMode) {
  const response = await sendMessage({
    type: MESSAGE_TYPES.CLEAR_API_KEY,
    provider: getSelectedPaidProvider(),
    storageMode
  });

  if (!response.ok) {
    setStatus(response.error.message);
    return;
  }

  await updateApiKeyStatus();
  setStatus(storageMode === API_KEY_STORAGE_MODES.LOCAL ? "Local Key cleared." : "Session Key cleared.");
}

async function updateApiKeyStatus() {
  const response = await sendMessage({
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

  setApiKeyStatus("Key 未保存；自然版 / 深度版需要先保存 Key", "missing");
}

function setApiKeyStatus(value, state) {
  apiKeyStatus.textContent = value;
  apiKeyStatus.setAttribute("data-state", state);
}

function setStatus(value) {
  status.textContent = value;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        resolve({
          ok: false,
          error: {
            code: "floating_settings_error",
            message: "Settings request failed."
          }
        });
        return;
      }

      resolve(response ?? {
        ok: false,
        error: {
          code: "floating_settings_error",
          message: "Settings request failed."
        }
      });
    });
  });
}
