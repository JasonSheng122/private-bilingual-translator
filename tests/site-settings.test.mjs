import assert from "node:assert/strict";
import test from "node:test";
import {
  getStoredFloatingControlsHidden,
  getSiteSettingsKey,
  getStoredDisplayModeForUrl,
  getStoredTranslationSettingsForUrl,
  saveFloatingControlsHidden,
  saveDisplayModeForUrl,
  saveTranslationSettingsForUrl
} from "../src/background/site-settings.mjs";

test("site settings store display mode by origin and global default", async () => {
  const storageArea = makeStorageArea();

  const saved = await saveDisplayModeForUrl({
    url: "https://example.com/articles/one?ref=private",
    displayMode: "replace"
  }, storageArea);
  const sameOriginMode = await getStoredDisplayModeForUrl("https://example.com/articles/two", storageArea);
  const otherOriginMode = await getStoredDisplayModeForUrl("https://other.example.com/articles/two", storageArea);

  assert.equal(saved.ok, true);
  assert.equal(saved.siteKey, "https://example.com");
  assert.equal(sameOriginMode, "replace");
  assert.equal(otherOriginMode, "replace");
  assert.equal(storageArea.data.pbt_site_settings_v1.defaultDisplayMode, "replace");
  assert.deepEqual(Object.keys(storageArea.data.pbt_site_settings_v1.displayModesByOrigin), [
    "https://example.com"
  ]);
});

test("site settings store translation settings by origin and global defaults", async () => {
  const storageArea = makeStorageArea();

  const saved = await saveTranslationSettingsForUrl({
    url: "https://example.com/articles/one?ref=private",
    displayMode: "replace",
    qualityMode: "natural",
    paidProvider: "gemini",
    autoTranslate: true
  }, storageArea);
  const sameOriginSettings = await getStoredTranslationSettingsForUrl("https://example.com/articles/two", storageArea);
  const otherOriginSettings = await getStoredTranslationSettingsForUrl("https://other.example.com/articles/two", storageArea);

  assert.equal(saved.ok, true);
  assert.equal(saved.siteKey, "https://example.com");
  assert.deepEqual(sameOriginSettings, {
    siteKey: "https://example.com",
    displayMode: "replace",
    qualityMode: "natural",
    paidProvider: "gemini",
    autoTranslate: true
  });
  assert.deepEqual(otherOriginSettings, {
    siteKey: "https://other.example.com",
    displayMode: "replace",
    qualityMode: "natural",
    paidProvider: "gemini",
    autoTranslate: false
  });
  assert.equal(storageArea.data.pbt_site_settings_v1.defaultDisplayMode, "replace");
  assert.equal(storageArea.data.pbt_site_settings_v1.defaultQualityMode, "natural");
  assert.equal(storageArea.data.pbt_site_settings_v1.defaultPaidProvider, "gemini");
  assert.deepEqual(Object.keys(storageArea.data.pbt_site_settings_v1.autoTranslateByOrigin), [
    "https://example.com"
  ]);
});

test("site settings keep origin overrides while latest choice becomes global default", async () => {
  const storageArea = makeStorageArea();

  await saveTranslationSettingsForUrl({
    url: "https://example.com/article",
    displayMode: "replace",
    qualityMode: "natural",
    paidProvider: "gemini",
    autoTranslate: true
  }, storageArea);
  await saveTranslationSettingsForUrl({
    url: "https://docs.example.org/page",
    displayMode: "bilingual",
    qualityMode: "deep",
    paidProvider: "custom_openai"
  }, storageArea);

  assert.deepEqual(await getStoredTranslationSettingsForUrl("https://example.com/subpage", storageArea), {
    siteKey: "https://example.com",
    displayMode: "replace",
    qualityMode: "natural",
    paidProvider: "gemini",
    autoTranslate: true
  });
  assert.deepEqual(await getStoredTranslationSettingsForUrl("https://new.example.net/one", storageArea), {
    siteKey: "https://new.example.net",
    displayMode: "bilingual",
    qualityMode: "deep",
    paidProvider: "custom_openai",
    autoTranslate: false
  });
});

test("site settings preserve auto translate when popup updates translation preferences", async () => {
  const storageArea = makeStorageArea();

  await saveTranslationSettingsForUrl({
    url: "https://example.com/article",
    displayMode: "bilingual",
    qualityMode: "free",
    paidProvider: "custom_gemini",
    autoTranslate: true
  }, storageArea);
  const saved = await saveTranslationSettingsForUrl({
    url: "https://example.com/other",
    displayMode: "replace",
    qualityMode: "deep",
    paidProvider: "gemini"
  }, storageArea);

  assert.equal(saved.ok, true);
  assert.equal(saved.autoTranslate, true);
  assert.deepEqual(await getStoredTranslationSettingsForUrl("https://example.com/subpage", storageArea), {
    siteKey: "https://example.com",
    displayMode: "replace",
    qualityMode: "deep",
    paidProvider: "gemini",
    autoTranslate: true
  });
});

test("site settings store global floating controls hidden preference", async () => {
  const storageArea = makeStorageArea();

  assert.equal(await getStoredFloatingControlsHidden(storageArea), false);

  const hidden = await saveFloatingControlsHidden(true, storageArea);
  const hiddenValue = await getStoredFloatingControlsHidden(storageArea);

  assert.deepEqual(hidden, {
    ok: true,
    floatingControlsHidden: true
  });
  assert.equal(hiddenValue, true);
  assert.equal(storageArea.data.pbt_site_settings_v1.floatingControlsHidden, true);

  const shown = await saveFloatingControlsHidden(false, storageArea);
  const shownValue = await getStoredFloatingControlsHidden(storageArea);

  assert.deepEqual(shown, {
    ok: true,
    floatingControlsHidden: false
  });
  assert.equal(shownValue, false);
  assert.equal(storageArea.data.pbt_site_settings_v1.floatingControlsHidden, false);
  assert.deepEqual(Object.keys(storageArea.data.pbt_site_settings_v1.displayModesByOrigin), []);
  assert.deepEqual(Object.keys(storageArea.data.pbt_site_settings_v1.autoTranslateByOrigin), []);
});

test("site settings reject non web urls", async () => {
  const storageArea = makeStorageArea();

  const saved = await saveDisplayModeForUrl({
    url: "chrome://extensions",
    displayMode: "replace"
  }, storageArea);

  assert.equal(getSiteSettingsKey("chrome://extensions"), "");
  assert.equal(saved.ok, false);
  assert.equal(saved.error.code, "site_settings_invalid_url");

  const fullSaved = await saveTranslationSettingsForUrl({
    url: "chrome://extensions",
    displayMode: "replace",
    qualityMode: "natural",
    paidProvider: "gemini",
    autoTranslate: true
  }, storageArea);

  assert.equal(fullSaved.ok, false);
  assert.equal(fullSaved.error.code, "site_settings_invalid_url");
});

function makeStorageArea() {
  return {
    data: {},
    get(key, callback) {
      callback({ [key]: this.data[key] });
    },
    set(value, callback) {
      Object.assign(this.data, value);
      callback();
    }
  };
}
