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

test("background returns, forwards and saves the YouTube caption size", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_site_settings_v1: {
          captionSizesByOrigin: {
            "https://www.youtube.com": "xlarge"
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
      url: "https://www.youtube.com/watch?v=abc",
      qualityMode: QUALITY_MODES.FREE,
      displayMode: DISPLAY_MODES.BILINGUAL
    });
    const showMessage = sentMessages.find((entry) => entry.message.type === MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON);
    const saved = await routeMessage({
      type: MESSAGE_TYPES.SET_SITE_TRANSLATION_SETTINGS,
      url: "https://www.youtube.com/watch?v=abc",
      displayMode: DISPLAY_MODES.BILINGUAL,
      qualityMode: QUALITY_MODES.FREE,
      paidProvider: "gemini",
      captionSize: "small"
    });

    assert.equal(response.captionSize, "xlarge");
    assert.equal(showMessage.message.captionSize, "xlarge");
    assert.equal(saved.captionSize, "small");
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

test("background uses stored global floating hidden preference for page status", async () => {
  const originalChrome = globalThis.chrome;
  const sentMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: makeStorageArea({
        pbt_site_settings_v1: {
          floatingControlsHidden: true
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
      displayMode: DISPLAY_MODES.BILINGUAL,
      paidProvider: "gemini"
    });

    assert.equal(response.ok, true);
    assert.equal(response.floatingControlsHidden, true);
    const showMessage = sentMessages.find((entry) => entry.message.type === MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON);
    assert.equal(showMessage.message.floatingControlsHidden, true);
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

test("background stores global floating hidden preference", async () => {
  const originalChrome = globalThis.chrome;
  const storageArea = makeStorageArea();

  globalThis.chrome = {
    runtime: { lastError: null },
    storage: {
      local: storageArea
    }
  };

  try {
    const hidden = await routeMessage({
      type: MESSAGE_TYPES.SET_FLOATING_CONTROLS_HIDDEN,
      hidden: true
    });
    const shown = await routeMessage({
      type: MESSAGE_TYPES.SET_FLOATING_CONTROLS_HIDDEN,
      hidden: false
    });

    assert.deepEqual(hidden, {
      ok: true,
      floatingControlsHidden: true
    });
    assert.deepEqual(shown, {
      ok: true,
      floatingControlsHidden: false
    });
    assert.equal(storageArea.data.pbt_site_settings_v1.floatingControlsHidden, false);
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
    assert.equal(tabMessages[1].message.showPendingIndicators, true);
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
    assert.equal(tabMessages[0].message.showPendingIndicators, true);
    assert.equal(tabMessages[1].message.translations[0].text, "新段落");
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background treats cached incremental render as translated without provider request", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
          callback({ ok: true, segments: [], cachedRenderedCount: 1 });
          return;
        }

        callback({ ok: true, renderedCount: 1 });
      }
    }
  };
  globalThis.fetch = async () => {
    throw new Error("provider should not be called for cached incremental render");
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        url: "https://example.com/article",
        qualityMode: QUALITY_MODES.FREE,
        displayMode: DISPLAY_MODES.BILINGUAL,
        incremental: true
      },
      { tab: { id: 9, url: "https://example.com/article" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "bilingual");
    assert.equal(response.segmentCount, 0);
    assert.equal(response.renderedCount, 1);
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.COLLECT_SEGMENTS
    ]);
    assert.equal(tabMessages[0].message.incremental, true);
    assert.equal(tabMessages[0].message.displayMode, DISPLAY_MODES.BILINGUAL);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background translates youtube transcript with dedicated collect and render messages", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({
            ok: true,
            status: "ready",
            segments: [{ id: "yt-1", text: "Hello from the transcript" }],
            videoId: "test-video"
          });
          return;
        }

        if (message.type === MESSAGE_TYPES.RENDER_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, renderedCount: message.translations.length });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText.replace("Hello from the transcript", "来自转写稿的你好"), sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        paidProvider: "gemini",
        requestId: 7,
        allowYouTubeVisibleCaptionLayer: true,
        allowYouTubeCaptionTrack: true,
        allowYouTubePlayerCaptionToggle: true
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "translated");
    assert.equal(response.renderedCount, 1);
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT,
      MESSAGE_TYPES.RENDER_YOUTUBE_TRANSCRIPT
    ]);
    assert.equal(tabMessages[0].message.requestId, 7);
    assert.equal(tabMessages[0].message.allowYouTubeVisibleCaptionLayer, undefined);
    assert.equal(tabMessages[0].message.allowYouTubeCaptionTrack, true);
    assert.equal(tabMessages[0].message.allowYouTubePlayerCaptionToggle, true);
    assert.equal(tabMessages[1].message.requestId, 7);
    assert.equal(tabMessages[1].message.videoId, "test-video");
    assert.equal(tabMessages[1].message.windowStartSeconds, undefined);
    assert.equal(tabMessages[1].message.translations[0].text, "来自转写稿的你好");
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background treats cached youtube rolling timeline windows as translated without provider request", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "ready_cached", cachedCueCount: 3, segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 9,
        allowYouTubeCaptionTrack: true
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "translated");
    assert.equal(response.segmentCount, 0);
    assert.equal(response.renderedCount, 3);
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT
    ]);
    assert.equal(tabMessages[0].message.allowYouTubeCaptionTrack, true);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background does not forward caption permissions for popup youtube transcript requests", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.PING_CONTENT_SCRIPT) {
          callback({ ok: true });
          return;
        }

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_not_allowed", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
      tabId: 9,
      url: "https://www.youtube.com/watch?v=test-video",
      qualityMode: QUALITY_MODES.FREE,
      allowYouTubeCaptionTrack: true,
      allowYouTubePlayerCaptionToggle: true,
      allowYouTubeLocalWhisperAsr: true
    });

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_caption_track_not_allowed");
    assert.deepEqual(tabMessages.map((entry) => entry.message.type), [
      MESSAGE_TYPES.PING_CONTENT_SCRIPT,
      MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT
    ]);
    assert.equal(tabMessages[1].message.allowYouTubeCaptionTrack, undefined);
    assert.equal(tabMessages[1].message.allowYouTubePlayerCaptionToggle, undefined);
    assert.equal(tabMessages[1].message.allowYouTubeLocalWhisperAsr, undefined);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background maps youtube transcript no-render diagnostics to sanitized errors", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "ready", segments: [{ id: "yt-1", text: "Hello from the transcript" }] });
          return;
        }

        if (message.type === MESSAGE_TYPES.RENDER_YOUTUBE_TRANSCRIPT) {
          callback({
            ok: true,
            renderedCount: 0,
            diagnostics: {
              status: "no_usable_translations",
              translationCount: 1,
              entryCount: 1,
              usableTranslationCount: 0,
              overlayCueCount: 0,
              unmeaningfulTranslationCount: 1,
              overlayNodeAvailable: true,
              sourceText: "Hello from the transcript"
            }
          });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async (url) => {
    const sourceText = new URL(url).searchParams.get("q");

    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText.replace("Hello from the transcript", "来自转写稿的你好"), sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 7
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.status, "no_render");
    assert.equal(response.error.code, "youtube_transcript_no_usable_translations");
    assert.equal(response.error.message.includes("Hello from the transcript"), false);
    assert.equal(response.renderDiagnostics.status, "no_usable_translations");
    assert.equal(response.renderDiagnostics.unmeaningfulTranslationCount, 1);
    assert.equal(Object.hasOwn(response.renderDiagnostics, "sourceText"), false);
    assert.equal(JSON.stringify(response.renderDiagnostics).includes("Hello from the transcript"), false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background rejects youtube transcript translation outside watch pages before provider request", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/",
        qualityMode: QUALITY_MODES.FREE
      },
      { tab: { id: 9, url: "https://www.youtube.com/" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_transcript_unsupported_page");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("background does not call provider when youtube transcript DOM is unavailable", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "no_transcript", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_transcript_unavailable");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background does not call provider when the youtube player caption request is not observed", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_token_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        allowYouTubeCaptionTrack: true
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_caption_track_token_missing");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background starts local Whisper ASR when youtube visible captions are missing and content script allows it", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  const runtimeMessages = [];
  const offscreenCreates = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(details, callback) {
        assert.deepEqual(details, { targetTabId: 31 });
        callback("stream-31");
      }
    },
    offscreen: {
      async getContexts() {
        return [];
      },
      async createDocument(details) {
        offscreenCreates.push(details);
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 88,
        allowYouTubeCaptionTrack: true,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "local_asr_started");
    assert.equal(fetchCalled, false);
    assert.equal(tabMessages[0].message.allowYouTubeCaptionTrack, true);
    assert.equal(offscreenCreates.length, 1);
    assert.equal(offscreenCreates[0].url, "src/offscreen/local-asr.html");
    assert.deepEqual(offscreenCreates[0].reasons, ["USER_MEDIA"]);
    assert.deepEqual(runtimeMessages.map((message) => message.type), [
      MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR,
      MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR
    ]);
    assert.equal(runtimeMessages[1].target, "pbt-local-asr-offscreen");
    assert.equal(runtimeMessages[1].tabId, 31);
    assert.equal(runtimeMessages[1].requestId, 88);
    assert.equal(runtimeMessages[1].streamId, "stream-31");
    assert.equal(runtimeMessages[1].chunkMs, 3000);
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 31 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background falls back once to current active tab stream when target tab capture requires activeTab", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  const offscreenCreates = [];
  const runtimeMessages = [];
  const captureDetails = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(details, callback) {
        captureDetails.push(details);

        if (captureDetails.length === 1) {
          globalThis.chrome.runtime.lastError = {
            message: "Extension has not been invoked for the current page (see activeTab permission)."
          };
          callback();
          globalThis.chrome.runtime.lastError = null;
          return;
        }

        callback("stream-current-active-tab");
        globalThis.chrome.runtime.lastError = null;
      }
    },
    offscreen: {
      async getContexts() {
        return [];
      },
      async createDocument(details) {
        offscreenCreates.push(details);
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 90,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "local_asr_started");
    assert.deepEqual(captureDetails, [{ targetTabId: 31 }, {}]);
    assert.equal(fetchCalled, false);
    assert.equal(offscreenCreates.length, 1);
    assert.equal(runtimeMessages.at(-1).type, MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR);
    assert.equal(runtimeMessages.at(-1).streamId, "stream-current-active-tab");
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 31 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background returns sanitized capture denial when both tabCapture stream attempts fail", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  const offscreenCreates = [];
  const captureDetails = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      sendMessage(_message, callback) {
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(details, callback) {
        captureDetails.push(details);
        globalThis.chrome.runtime.lastError = {
          message: "Extension has not been invoked for the current page (see activeTab permission)."
        };
        callback();
        globalThis.chrome.runtime.lastError = null;
      }
    },
    offscreen: {
      async getContexts() {
        return [];
      },
      async createDocument(details) {
        offscreenCreates.push(details);
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 90,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_local_asr_capture_denied");
    assert.deepEqual(captureDetails, [{ targetTabId: 31 }, {}]);
    assert.equal(fetchCalled, false);
    assert.equal(offscreenCreates.length, 0);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background reuses existing local ASR offscreen document discovered by runtime contexts", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const runtimeMessages = [];
  let runtimeContextsCalled = false;
  let createDocumentCalled = false;
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      async getContexts(details) {
        runtimeContextsCalled = true;
        assert.deepEqual(details, {
          contextTypes: ["OFFSCREEN_DOCUMENT"],
          documentUrls: ["chrome-extension://test-id/src/offscreen/local-asr.html"]
        });
        return [{ documentUrl: "chrome-extension://test-id/src/offscreen/local-asr.html" }];
      },
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-31");
      }
    },
    offscreen: {
      async createDocument() {
        createDocumentCalled = true;
        throw new Error("offscreen should already exist");
      }
    },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 91,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, true);
    assert.equal(response.status, "local_asr_started");
    assert.equal(runtimeContextsCalled, true);
    assert.equal(createDocumentCalled, false);
    assert.equal(fetchCalled, false);
    assert.deepEqual(runtimeMessages.map((message) => message.type), [
      MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR,
      MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR
    ]);
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 31 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background coalesces concurrent local ASR offscreen document creation", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const runtimeMessages = [];
  const offscreenCreates = [];
  let fetchCalled = false;
  let resolveCreateDocument;
  let createStarted;
  const createStartedPromise = new Promise((resolve) => {
    createStarted = resolve;
  });
  const createDocumentPromise = new Promise((resolve) => {
    resolveCreateDocument = resolve;
  });

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      async getContexts() {
        return [];
      },
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-31");
      }
    },
    offscreen: {
      async createDocument(details) {
        offscreenCreates.push(details);
        createStarted();
        await createDocumentPromise;
      }
    },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const first = routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 92,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );
    await createStartedPromise;

    const second = routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 93,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    await Promise.resolve();
    assert.equal(offscreenCreates.length, 1);
    resolveCreateDocument();

    const responses = await Promise.all([first, second]);
    assert.equal(responses[0].ok, true);
    assert.equal(responses[0].status, "local_asr_started");
    assert.equal(responses[1].ok, true);
    assert.equal(responses[1].status, "local_asr_started");
    assert.equal(fetchCalled, false);
    assert.deepEqual(offscreenCreates[0].reasons, ["USER_MEDIA"]);
    assert.equal(
      runtimeMessages.filter((message) => message.type === MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR).length,
      2
    );
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 31 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background returns sanitized local ASR failure when offscreen start fails", async () => {
  const originalChrome = globalThis.chrome;
  const tabMessages = [];
  const runtimeMessages = [];

  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        if (message.type === MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR) {
          callback({ ok: false, error: { code: "local_asr_capture_failed" } });
          return;
        }
        callback({ ok: true });
      },
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-31");
      }
    },
    offscreen: {
      async getContexts() {
        return [];
      },
      async createDocument() {}
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 89,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_local_asr_capture_failed");
    assert.deepEqual(runtimeMessages.map((message) => message.type), [
      MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR,
      MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR,
      MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR
    ]);
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 31 });
    globalThis.chrome = originalChrome;
  }
});

test("background times out local ASR start when offscreen does not acknowledge", async () => {
  const originalChrome = globalThis.chrome;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const runtimeMessages = [];
  let observedTimeoutMs = 0;

  globalThis.setTimeout = (callback, ms) => {
    observedTimeoutMs = Number(ms);
    queueMicrotask(callback);
    return 1;
  };
  globalThis.clearTimeout = () => {};
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        if (message.type === MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR) {
          return;
        }
        callback({ ok: true });
      },
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-31");
      }
    },
    offscreen: {
      async getContexts() {
        return [];
      },
      async createDocument() {}
    },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 90,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 31, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_local_asr_capture_failed");
    assert.equal(observedTimeoutMs, 5000);
    assert.deepEqual(runtimeMessages.map((message) => message.type), [
      MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR,
      MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR,
      MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR
    ]);
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 31 });
    globalThis.chrome = originalChrome;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("background does not start local Whisper ASR for popup youtube transcript requests", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  let captureCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabCapture: {
      getMediaStreamId() {
        captureCalled = true;
      }
    },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.PING_CONTENT_SCRIPT) {
          callback({ ok: true });
          return;
        }

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage({
      type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
      tabId: 32,
      url: "https://www.youtube.com/watch?v=test-video",
      qualityMode: QUALITY_MODES.FREE,
      allowYouTubeLocalWhisperAsr: true
    });

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_caption_track_unavailable");
    assert.equal(captureCalled, false);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background transcribes local Whisper chunks and renders sanitized youtube ASR overlay messages", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  const fetchCalls = [];

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      sendMessage(_message, callback) {
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-33");
      }
    },
    offscreen: {
      async getContexts() {
        return [{ documentUrl: "chrome-extension://test-id/src/offscreen/local-asr.html" }];
      },
      async createDocument() {
        throw new Error("offscreen should already exist");
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        if (message.type === MESSAGE_TYPES.RENDER_YOUTUBE_LOCAL_ASR) {
          callback({ ok: true, renderedCount: 1 });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url: String(url), options });

    if (String(url) === "http://127.0.0.1:8765/transcribe") {
      const body = JSON.parse(options.body);
      assert.equal(body.audioBase64, "AAAA");
      assert.equal(body.language, "en");

      return {
        ok: true,
        async json() {
          return { ok: true, text: "Hello from local whisper", language: "en" };
        }
      };
    }

    const sourceText = new URL(url).searchParams.get("q");
    return {
      ok: true,
      status: 200,
      async json() {
        return [[[sourceText.replace("Hello from local whisper", "来自本机 Whisper 的你好"), sourceText, null, null]], null, "en"];
      }
    };
  };

  try {
    const started = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 89,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 33, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(started.ok, true);
    assert.equal(started.status, "local_asr_started");

    const rendered = await routeMessage(
      {
        type: MESSAGE_TYPES.YOUTUBE_LOCAL_ASR_AUDIO_CHUNK,
        tabId: 33,
        requestId: 89,
        sequence: 1,
        mimeType: "audio/webm",
        audioBase64: "AAAA"
      },
      { url: "chrome-extension://test-id/src/offscreen/local-asr.html" }
    );

    assert.equal(rendered.ok, true);
    assert.equal(rendered.status, "local_asr_rendered");
    assert.deepEqual(fetchCalls.map((call) => call.url === "http://127.0.0.1:8765/transcribe" ? call.url : "provider"), [
      "http://127.0.0.1:8765/transcribe",
      "provider"
    ]);

    const renderMessage = tabMessages.find((entry) => entry.message.type === MESSAGE_TYPES.RENDER_YOUTUBE_LOCAL_ASR).message;
    const processingReport = tabMessages.find((entry) =>
      entry.message.type === MESSAGE_TYPES.REPORT_YOUTUBE_LOCAL_ASR_STATUS &&
      entry.message.error.code === "youtube_local_asr_processing"
    );
    assert.equal(processingReport.tabId, 33);
    assert.equal(processingReport.message.requestId, 89);
    assert.equal(processingReport.message.active, true);
    assert.equal(renderMessage.requestId, 89);
    assert.equal(renderMessage.id, "pbt-youtube-local-asr-1");
    assert.equal(renderMessage.sourceText, "Hello from local whisper");
    assert.equal(renderMessage.translatedText, "来自本机 Whisper 的你好");
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 33 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background reports local Whisper chunk failures back to the youtube page", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  const fetchCalls = [];

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      sendMessage(_message, callback) {
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-35");
      }
    },
    offscreen: {
      async getContexts() {
        return [{ documentUrl: "chrome-extension://test-id/src/offscreen/local-asr.html" }];
      },
      async createDocument() {
        throw new Error("offscreen should already exist");
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    throw new Error("connect ECONNREFUSED 127.0.0.1:8765");
  };

  try {
    const started = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 91,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 35, url: "https://www.youtube.com/watch?v=test-video" } }
    );
    const failed = await routeMessage(
      {
        type: MESSAGE_TYPES.YOUTUBE_LOCAL_ASR_AUDIO_CHUNK,
        tabId: 35,
        requestId: 91,
        sequence: 1,
        mimeType: "audio/webm",
        audioBase64: "AAAA"
      },
      { url: "chrome-extension://test-id/src/offscreen/local-asr.html" }
    );

    assert.equal(started.ok, true);
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, "youtube_local_asr_whisper_unavailable");
    assert.deepEqual(fetchCalls, ["http://127.0.0.1:8765/transcribe"]);

    const report = tabMessages.find((entry) =>
      entry.message.type === MESSAGE_TYPES.REPORT_YOUTUBE_LOCAL_ASR_STATUS &&
      entry.message.error.code === "youtube_local_asr_whisper_unavailable"
    );
    assert.equal(report.tabId, 35);
    assert.equal(report.message.requestId, 91);
    assert.equal(report.message.active, false);
    assert.equal(report.message.error.code, "youtube_local_asr_whisper_unavailable");
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 35 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background reports a sanitized error when local ASR starts but no audio chunk arrives", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const tabMessages = [];
  const runtimeMessages = [];
  const timers = [];
  let fetchCalled = false;

  globalThis.setTimeout = (callback, delay) => {
    const timer = {
      callback,
      delay,
      cleared: false,
      unref() {}
    };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    if (timer) {
      timer.cleared = true;
    }
  };

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-36");
      }
    },
    offscreen: {
      async getContexts() {
        return [{ documentUrl: "chrome-extension://test-id/src/offscreen/local-asr.html" }];
      },
      async createDocument() {
        throw new Error("offscreen should already exist");
      }
    },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const started = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 92,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 36, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(started.ok, true);
    assert.equal(started.status, "local_asr_started");
    assert.equal(fetchCalled, false);

    const firstChunkTimer = timers.find((timer) => timer.delay === 10000 && timer.cleared === false);
    assert.ok(firstChunkTimer, "expected first audio chunk watchdog timer");
    firstChunkTimer.callback();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const report = tabMessages.find((entry) =>
      entry.message.type === MESSAGE_TYPES.REPORT_YOUTUBE_LOCAL_ASR_STATUS &&
      entry.message.error.code === "youtube_local_asr_no_audio_chunk"
    );
    assert.equal(report.tabId, 36);
    assert.equal(report.message.requestId, 92);
    assert.equal(report.message.active, false);
    assert.equal(runtimeMessages.at(-1).type, MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR);
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 36 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("background rejects spoofed local Whisper ASR chunks before local service or provider calls", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return `chrome-extension://test-id/${path}`;
      },
      sendMessage(_message, callback) {
        callback({ ok: true });
      }
    },
    tabCapture: {
      getMediaStreamId(_details, callback) {
        callback("stream-34");
      }
    },
    offscreen: {
      async getContexts() {
        return [{ documentUrl: "chrome-extension://test-id/src/offscreen/local-asr.html" }];
      },
      async createDocument() {}
    },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_missing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const started = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE,
        requestId: 90,
        allowYouTubeLocalWhisperAsr: true
      },
      { tab: { id: 34, url: "https://www.youtube.com/watch?v=test-video" } }
    );
    const rejected = await routeMessage(
      {
        type: MESSAGE_TYPES.YOUTUBE_LOCAL_ASR_AUDIO_CHUNK,
        tabId: 34,
        requestId: 90,
        sequence: 1,
        mimeType: "audio/webm",
        audioBase64: "AAAA"
      },
      { tab: { id: 34, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(started.ok, true);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, "youtube_local_asr_sender_invalid");
    assert.equal(fetchCalled, false);
  } finally {
    await routeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR, tabId: 34 });
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background does not call provider when youtube caption track fetch fails", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_fetch_failed", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_caption_track_fetch_failed");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background does not call provider while a youtube ad is showing", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_track_ad_showing", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "youtube_caption_track_ad_showing");
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background maps cancelled youtube caption collection to a stale request error", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  const tabMessages = [];
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(tabId, message, callback) {
        tabMessages.push({ tabId, message });

        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({ ok: true, status: "caption_request_cancelled", segments: [] });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.FREE
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.error.code, "stale_youtube_transcript_request");
    assert.equal(fetchCalled, false);
    assert.equal(tabMessages[0].message.allowYouTubeCaptionTrack, undefined);
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.fetch = originalFetch;
  }
});

test("background asks for confirmation before translating long paid youtube transcripts", async () => {
  const originalChrome = globalThis.chrome;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  globalThis.chrome = {
    runtime: { lastError: null },
    tabs: {
      sendMessage(_tabId, message, callback) {
        if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
          callback({
            ok: true,
            status: "ready",
            segments: Array.from({ length: 81 }, (_, index) => ({
              id: `yt-${index}`,
              text: `Transcript line ${index}`
            }))
          });
          return;
        }

        callback({ ok: true });
      }
    }
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    return { ok: true, async json() { return []; } };
  };

  try {
    const response = await routeMessage(
      {
        type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
        url: "https://www.youtube.com/watch?v=test-video",
        qualityMode: QUALITY_MODES.NATURAL,
        paidProvider: "gemini"
      },
      { tab: { id: 9, url: "https://www.youtube.com/watch?v=test-video" } }
    );

    assert.equal(response.ok, false);
    assert.equal(response.status, "cost_confirmation_required");
    assert.equal(response.error.code, "youtube_transcript_cost_confirmation_required");
    assert.equal(fetchCalled, false);
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
    assert.equal(tabMessages[2].message.showPendingIndicators, false);
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
