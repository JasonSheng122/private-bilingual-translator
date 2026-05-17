import assert from "node:assert/strict";
import test from "node:test";
import { routeMessage } from "../src/background/background.js";
import { DISPLAY_MODES, MESSAGE_TYPES, QUALITY_MODES } from "../src/shared/message-types.mjs";

test("background opens extension popup for floating provider config", async () => {
  const originalChrome = globalThis.chrome;
  let opened = 0;

  globalThis.chrome = {
    action: {
      async openPopup() {
        opened += 1;
      }
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.OPEN_EXTENSION_POPUP
    });

    assert.equal(response.ok, true);
    assert.equal(response.opened, true);
    assert.equal(opened, 1);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background returns a sanitized error when extension popup cannot be opened", async () => {
  const originalChrome = globalThis.chrome;

  globalThis.chrome = {};

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.OPEN_EXTENSION_POPUP
    });

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "open_popup_unavailable");
    assert.doesNotMatch(response.error.message, /api[_-]?key|sk-/i);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background blocks sensitive domains before content script or provider requests", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.TRANSLATE_PAGE,
      tabId: 1,
      url: "https://mail.google.com/mail/u/0/",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL
    });

    assert.equal(response.ok, false);
    assert.equal(response.blocked, true);
    assert.equal(response.error.code, "domain_blocked");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("background sends floating translate button when content script is ready", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea()
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.GET_PAGE_STATUS,
      tabId: 7,
      url: "https://example.com/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.REPLACE,
      paidProvider: "gemini"
    });

    assert.equal(response.ok, true);
    assert.equal(response.policy.blocked, false);
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[0].message.type, MESSAGE_TYPES.PING_CONTENT_SCRIPT);
    assert.equal(sentMessages[1].message.type, MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON);
    assert.equal(sentMessages[1].message.displayMode, DISPLAY_MODES.REPLACE);
    assert.equal(sentMessages[1].message.paidProvider, "gemini");
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background injects content script fallback before showing floating button", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];
  const injections = [];
  let injected = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea()
    },
    scripting: {
      async executeScript(details) {
        injections.push(details);
        injected = true;
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.PING_CONTENT_SCRIPT && !injected) {
          globalThis.chrome.runtime.lastError = { message: "No receiving end." };
          callback();
          globalThis.chrome.runtime.lastError = null;
          return;
        }

        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.GET_PAGE_STATUS,
      tabId: 7,
      url: "https://example.com/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL
    });

    assert.equal(response.ok, true);
    assert.equal(response.policy.blocked, false);
    assert.equal(injections.length, 1);
    assert.deepEqual(injections[0], {
      target: { tabId: 7 },
      files: ["src/content/content-script.js"]
    });
    assert.equal(sentMessages.at(-1).message.type, MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON);
    assert.equal(sentMessages.at(-1).message.displayMode, DISPLAY_MODES.BILINGUAL);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background uses stored site display mode for page status", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_site_settings_v1: {
          displayModesByOrigin: {
            "https://example.com": DISPLAY_MODES.REPLACE
          }
        }
      })
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.GET_PAGE_STATUS,
      tabId: 7,
      url: "https://example.com/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL
    });

    assert.equal(response.ok, true);
    assert.equal(response.displayMode, DISPLAY_MODES.REPLACE);
    const showMessage = sentMessages.find((entry) => entry.message.type === MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON);
    assert.equal(showMessage.message.displayMode, DISPLAY_MODES.REPLACE);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background uses stored origin translation settings for page status", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_site_settings_v1: {
          displayModesByOrigin: {
            "https://example.com": DISPLAY_MODES.REPLACE
          },
          qualityModesByOrigin: {
            "https://example.com": QUALITY_MODES.NATURAL
          },
          paidProvidersByOrigin: {
            "https://example.com": "gemini"
          },
          autoTranslateByOrigin: {
            "https://example.com": true
          }
        }
      })
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.GET_PAGE_STATUS,
      tabId: 7,
      url: "https://example.com/lecture/one",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL,
      paidProvider: "custom_gemini"
    });

    assert.equal(response.ok, true);
    assert.equal(response.displayMode, DISPLAY_MODES.REPLACE);
    assert.equal(response.qualityMode, QUALITY_MODES.NATURAL);
    assert.equal(response.paidProvider, "gemini");
    assert.equal(response.autoTranslate, true);
    assert.equal(response.policy.canAutoTranslate, true);
    const showMessage = sentMessages.find((entry) => entry.message.type === MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON);
    assert.equal(showMessage.message.displayMode, DISPLAY_MODES.REPLACE);
    assert.equal(showMessage.message.qualityMode, QUALITY_MODES.NATURAL);
    assert.equal(showMessage.message.paidProvider, "gemini");
    assert.equal(showMessage.message.autoTranslate, true);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background uses global translation defaults for other sites", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_site_settings_v1: {
          displayModesByOrigin: {
            "https://example.com": DISPLAY_MODES.REPLACE
          },
          qualityModesByOrigin: {
            "https://example.com": QUALITY_MODES.NATURAL
          },
          paidProvidersByOrigin: {
            "https://example.com": "gemini"
          },
          defaultDisplayMode: DISPLAY_MODES.REPLACE,
          defaultQualityMode: QUALITY_MODES.DEEP,
          defaultPaidProvider: "custom_gemini"
        }
      })
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.GET_PAGE_STATUS,
      tabId: 7,
      url: "https://other.example.org/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL,
      paidProvider: "gemini"
    });

    assert.equal(response.ok, true);
    assert.equal(response.displayMode, DISPLAY_MODES.REPLACE);
    assert.equal(response.qualityMode, QUALITY_MODES.DEEP);
    assert.equal(response.paidProvider, "custom_gemini");
    assert.equal(response.autoTranslate, false);
    const showMessage = sentMessages.find((entry) => entry.message.type === MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON);
    assert.equal(showMessage.message.displayMode, DISPLAY_MODES.REPLACE);
    assert.equal(showMessage.message.qualityMode, QUALITY_MODES.DEEP);
    assert.equal(showMessage.message.paidProvider, "custom_gemini");
    assert.equal(showMessage.message.autoTranslate, false);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background saves current site display mode without full url", async () => {
  const originalChrome = globalThis.chrome;
  const storageArea = makeStorageArea();

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: storageArea
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.SET_SITE_DISPLAY_MODE,
      url: "https://example.com/article?private=1",
      displayMode: DISPLAY_MODES.REPLACE
    });

    assert.equal(response.ok, true);
    assert.equal(response.siteKey, "https://example.com");
    assert.equal(storageArea.data.pbt_site_settings_v1.defaultDisplayMode, DISPLAY_MODES.REPLACE);
    assert.deepEqual(Object.keys(storageArea.data.pbt_site_settings_v1.displayModesByOrigin), [
      "https://example.com"
    ]);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background saves origin translation settings without full url", async () => {
  const originalChrome = globalThis.chrome;
  const storageArea = makeStorageArea();

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: storageArea
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.SET_SITE_TRANSLATION_SETTINGS,
      url: "https://example.com/article?private=1",
      displayMode: DISPLAY_MODES.REPLACE,
      qualityMode: QUALITY_MODES.DEEP,
      paidProvider: "gemini",
      autoTranslate: true
    });

    assert.equal(response.ok, true);
    assert.equal(response.siteKey, "https://example.com");
    assert.equal(response.displayMode, DISPLAY_MODES.REPLACE);
    assert.equal(response.qualityMode, QUALITY_MODES.DEEP);
    assert.equal(response.paidProvider, "gemini");
    assert.equal(response.autoTranslate, true);
    assert.equal(storageArea.data.pbt_site_settings_v1.defaultDisplayMode, DISPLAY_MODES.REPLACE);
    assert.equal(storageArea.data.pbt_site_settings_v1.defaultQualityMode, QUALITY_MODES.DEEP);
    assert.equal(storageArea.data.pbt_site_settings_v1.defaultPaidProvider, "gemini");
    assert.deepEqual(Object.keys(storageArea.data.pbt_site_settings_v1.displayModesByOrigin), [
      "https://example.com"
    ]);
    assert.deepEqual(storageArea.data.pbt_site_settings_v1.autoTranslateByOrigin, {
      "https://example.com": true
    });
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background blocks site translation setting saves on sensitive domains", async () => {
  const originalChrome = globalThis.chrome;
  const storageArea = makeStorageArea();

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: storageArea
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.SET_SITE_TRANSLATION_SETTINGS,
      url: "https://mail.google.com/mail/u/0/",
      displayMode: DISPLAY_MODES.REPLACE,
      qualityMode: QUALITY_MODES.NATURAL,
      paidProvider: "gemini",
      autoTranslate: true
    });

    assert.equal(response.ok, false);
    assert.equal(response.blocked, true);
    assert.equal(storageArea.data.pbt_site_settings_v1, undefined);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background stores and clears gemini api keys only in selected storage", async () => {
  const originalChrome = globalThis.chrome;
  const sessionArea = makeStorageArea();
  const localArea = makeStorageArea();

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      session: sessionArea,
      local: localArea
    }
  };

  try {
    const saved = await routeMessage({
      type: MESSAGE_TYPES.SAVE_API_KEY,
      apiKey: "session-key",
      storageMode: "session"
    });

    assert.equal(saved.ok, true);
    assert.equal(sessionArea.data.pbt_api_keys_v1.gemini, "session-key");
    assert.equal(localArea.data.pbt_api_keys_v1, undefined);

    const cleared = await routeMessage({
      type: MESSAGE_TYPES.CLEAR_API_KEY,
      storageMode: "session"
    });

    assert.equal(cleared.ok, true);
    assert.equal(sessionArea.data.pbt_api_keys_v1.gemini, undefined);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background stores custom gemini api keys separately", async () => {
  const originalChrome = globalThis.chrome;
  const sessionArea = makeStorageArea();
  const localArea = makeStorageArea();

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      session: sessionArea,
      local: localArea
    }
  };

  try {
    const saved = await routeMessage({
      type: MESSAGE_TYPES.SAVE_API_KEY,
      provider: "custom_gemini",
      apiKey: "gateway-key",
      storageMode: "session"
    });

    assert.equal(saved.ok, true);
    assert.equal(sessionArea.data.pbt_api_keys_v1.custom_gemini, "gateway-key");
    assert.equal(sessionArea.data.pbt_api_keys_v1.gemini, undefined);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background reports api key status without exposing key", async () => {
  const originalChrome = globalThis.chrome;
  const sessionArea = makeStorageArea({
    pbt_api_keys_v1: {
      custom_gemini: "session-key"
    }
  });
  const localArea = makeStorageArea({
    pbt_api_keys_v1: {
      custom_gemini: "local-key"
    }
  });

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      session: sessionArea,
      local: localArea
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.GET_API_KEY_STATUS,
      provider: "custom_gemini"
    });

    assert.equal(response.ok, true);
    assert.equal(response.provider, "custom_gemini");
    assert.equal(response.hasSessionKey, true);
    assert.equal(response.hasLocalKey, true);
    assert.equal(Object.hasOwn(response, "apiKey"), false);
    assert.equal(JSON.stringify(response).includes("session-key"), false);
    assert.equal(JSON.stringify(response).includes("local-key"), false);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background stores and returns custom provider config without api key", async () => {
  const originalChrome = globalThis.chrome;
  const localArea = makeStorageArea();

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: localArea
    }
  };

  try {
    const saved = await routeMessage({
      type: MESSAGE_TYPES.SAVE_CUSTOM_PROVIDER_CONFIG,
      baseUrl: "https://custom.example/",
      model: "models/gemini-2.5-flash-lite"
    });
    const loaded = await routeMessage({
      type: MESSAGE_TYPES.GET_CUSTOM_PROVIDER_CONFIG
    });

    assert.equal(saved.ok, true);
    assert.equal(saved.baseUrl, "https://custom.example");
    assert.equal(saved.model, "gemini-2.5-flash-lite");
    assert.equal(loaded.ok, true);
    assert.equal(loaded.configured, true);
    assert.equal(loaded.baseUrl, "https://custom.example");
    assert.equal(loaded.model, "gemini-2.5-flash-lite");
    assert.equal(JSON.stringify(localArea.data).includes("apiKey"), false);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background returns page status to content script without reinjecting", async () => {
  const originalChrome = globalThis.chrome;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(_tabId, _message, callback) {
        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.GET_PAGE_STATUS,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.FREE,
        displayMode: DISPLAY_MODES.BILINGUAL
      },
      { tab: { id: 8, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.policy.blocked, false);
    assert.equal(response.displayMode, DISPLAY_MODES.BILINGUAL);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

function makeStorageArea(initialData = {}) {
  return {
    data: { ...initialData },
    get(key, callback) {
      callback({ [key]: this.data[key] });
    },
    set(value, callback) {
      Object.assign(this.data, value);
      callback();
    }
  };
}

test("background accepts translate requests from content script sender tab", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_custom_gemini_provider_config_v1: {
          baseUrl: "https://custom.example",
          model: "gemini-2.5-flash-lite"
        }
      })
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "a", text: "Hello" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");
    const translatedText = sourceText.replace("Hello", "你好");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[translatedText, sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.FREE,
        displayMode: DISPLAY_MODES.REPLACE
      },
      { tab: { id: 9, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "replaced");
    assert.equal(tabMessages.length, 3);
    assert.equal(tabMessages[0].tabId, 9);
    assert.equal(tabMessages[0].message.type, MESSAGE_TYPES.PREPARE_TRANSLATION);
    assert.equal(tabMessages[1].message.type, MESSAGE_TYPES.COLLECT_SEGMENTS);
    assert.equal(tabMessages[2].message.translations[0].text, "你好");
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background skips restore prepare for incremental content script translation", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_custom_gemini_provider_config_v1: {
          baseUrl: "https://custom.example",
          model: "gemini-2.5-flash-lite"
        }
      })
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "b", text: "New paragraph" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText.replace("New paragraph", "新段落"), sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.FREE,
        displayMode: DISPLAY_MODES.REPLACE,
        incremental: true
      },
      { tab: { id: 9, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "replaced");
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.COLLECT_SEGMENTS,
      MESSAGE_TYPES.RENDER_TRANSLATIONS
    ]);
    assert.equal(tabMessages[0].message.incremental, true);
    assert.equal(tabMessages[1].message.translations[0].text, "新段落");
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background keeps existing page state when incremental paid translation lacks stored key", async () => {
  const originalChrome = globalThis.chrome;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      session: makeStorageArea(),
      local: makeStorageArea({
        pbt_custom_gemini_provider_config_v1: {
          baseUrl: "https://custom.example",
          model: "gemini-2.5-flash-lite"
        }
      })
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "b", text: "New paragraph" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.DEEP,
        displayMode: DISPLAY_MODES.REPLACE,
        paidProvider: "custom_gemini",
        incremental: true
      },
      { tab: { id: 9, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "missing_api_key");
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.COLLECT_SEGMENTS
    ]);
    assert.equal(tabMessages[0].message.incremental, true);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background ignores incremental flag from popup translation", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.PING_CONTENT_SCRIPT) {
          callback({ ok: true });
          return;
        }

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "a", text: "Hello" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText.replace("Hello", "你好"), sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.TRANSLATE_PAGE,
      tabId: 10,
      url: "https://example.com/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.REPLACE,
      incremental: true
    });

    assert.equal(response.ok, true);
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PREPARE_TRANSLATION,
      MESSAGE_TYPES.COLLECT_SEGMENTS,
      MESSAGE_TYPES.RENDER_TRANSLATIONS
    ]);
    assert.equal(tabMessages[2].message.incremental, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background reports no rendered translations when provider output does not land", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "a", text: "Hello" }] });
          return;
        }

        if (message.type === MESSAGE_TYPES.RENDER_TRANSLATIONS) {
          callback({ ok: true, renderedCount: 0 });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText, sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.FREE,
        displayMode: DISPLAY_MODES.REPLACE
      },
      { tab: { id: 9, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.status, "no_render");
    assert.equal(response.segmentCount, 1);
    assert.equal(response.renderedCount, 0);
    assert.equal(response.error.code, "no_rendered_translations");
    assert.equal(response.error.message.includes("Hello"), false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background accepts natural translation with single use api key", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "a", text: "Hello" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url.includes("key="), false);
    assert.equal(options.headers["x-goog-api-key"], "once-key");
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify([{ id: "a", text: "你好" }])
                  }
                ]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.NATURAL,
        displayMode: DISPLAY_MODES.BILINGUAL,
        paidProvider: "gemini",
        apiKey: "once-key",
        apiKeyStorageMode: "once"
      },
      { tab: { id: 10, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.provider.id, "gemini");
    assert.equal(tabMessages[2].message.translations[0].text, "你好");
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background accepts custom gemini translation with single use api key", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_custom_gemini_provider_config_v1: {
          baseUrl: "https://custom.example",
          model: "gemini-2.5-flash-lite"
        }
      })
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "a", text: "Hello" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url, options) => {
    assert.equal(url.includes("key="), false);
    assert.equal(url.includes("api_key="), false);
    assert.equal(options.headers["x-goog-api-key"], "gateway-key");
    assert.deepEqual(Object.keys(options.headers).sort(), ["Content-Type", "x-goog-api-key"]);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                role: "model",
                parts: [
                  {
                    text: JSON.stringify([{ id: "a", text: "你好" }])
                  }
                ]
              }
            }
          ]
        };
      }
    };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.NATURAL,
        displayMode: DISPLAY_MODES.BILINGUAL,
        paidProvider: "custom_gemini",
        apiKey: "gateway-key",
        apiKeyStorageMode: "once"
      },
      { tab: { id: 10, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.provider.id, "custom_gemini");
    assert.equal(tabMessages[2].message.translations[0].text, "你好");
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background accepts restore and remove requests from content script sender tab", async () => {
  const originalChrome = globalThis.chrome;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });
        callback({ ok: true, restoredCount: 1, removedCount: 1 });
      }
    }
  };

  try {
    const restored = await routeMessage(
      { type: MESSAGE_TYPES.RESTORE_PAGE },
      { tab: { id: 11, url: "https://example.com/article" } }
    );
    const removed = await routeMessage(
      { type: MESSAGE_TYPES.REMOVE_TRANSLATIONS },
      { tab: { id: 11, url: "https://example.com/article" } }
    );

    assert.equal(restored.ok, true);
    assert.equal(removed.ok, true);
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.RESTORE_PAGE,
      MESSAGE_TYPES.REMOVE_TRANSLATIONS
    ]);
    assert.deepEqual(tabMessages.map((entry) => entry.tabId), [11, 11]);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background returns structured error when popup translate has no content script", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        sentMessages.push({ tabId, message });
        globalThis.chrome.runtime.lastError = { message: "No receiving end." };
        callback();
        globalThis.chrome.runtime.lastError = null;
      }
    }
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.TRANSLATE_PAGE,
      tabId: 12,
      url: "https://example.com/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL
    });

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "content_script_unavailable");
    assert.equal(response.error.message, "This page is not connected to the extension yet. Refresh this page once and try again.");
    assert.deepEqual(sentMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT
    ]);
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("background injects content script fallback before popup translation", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  const injections = [];
  let injected = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    scripting: {
      async executeScript(details) {
        injections.push(details);
        injected = true;
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.PING_CONTENT_SCRIPT && !injected) {
          globalThis.chrome.runtime.lastError = { message: "No receiving end." };
          callback();
          globalThis.chrome.runtime.lastError = null;
          return;
        }

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "a", text: "Hello" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText.replace("Hello", "你好"), sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.TRANSLATE_PAGE,
      tabId: 12,
      url: "https://example.com/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL
    });

    assert.equal(response.ok, true);
    assert.equal(response.status, "bilingual");
    assert.deepEqual(injections, [{
      target: { tabId: 12 },
      files: ["src/content/content-script.js"]
    }]);
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PREPARE_TRANSLATION,
      MESSAGE_TYPES.COLLECT_SEGMENTS,
      MESSAGE_TYPES.RENDER_TRANSLATIONS
    ]);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background retries transient content script unavailability before translating", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  let pingAttempts = 0;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.PING_CONTENT_SCRIPT) {
          pingAttempts += 1;

          if (pingAttempts === 1) {
            globalThis.chrome.runtime.lastError = { message: "No receiving end." };
            callback();
            globalThis.chrome.runtime.lastError = null;
            return;
          }

          callback({ ok: true });
          return;
        }

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [{ id: "a", text: "Hello" }] });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText.replace("Hello", "你好"), sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.TRANSLATE_PAGE,
      tabId: 12,
      url: "https://example.com/article",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL
    });

    assert.equal(response.ok, true);
    assert.equal(response.status, "bilingual");
    assert.equal(pingAttempts, 2);
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.PREPARE_TRANSLATION,
      MESSAGE_TYPES.COLLECT_SEGMENTS,
      MESSAGE_TYPES.RENDER_TRANSLATIONS
    ]);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});
