import assert from "node:assert/strict";
import test from "node:test";
import {
  clearApiKey,
  getApiKeyStatus,
  getStoredApiKey,
  saveApiKey
} from "../src/background/secret-manager.mjs";

test("secret manager stores session api key by default target", async () => {
  const storageAreas = makeStorageAreas();

  const saved = await saveApiKey({
    provider: "gemini",
    apiKey: " session-key ",
    storageMode: "session"
  }, storageAreas);
  const apiKey = await getStoredApiKey("gemini", storageAreas);

  assert.equal(saved.ok, true);
  assert.equal(saved.saved, true);
  assert.equal(apiKey, "session-key");
  assert.equal(storageAreas.local.data.pbt_api_keys_v1, undefined);
});

test("secret manager only stores local api key when explicitly selected", async () => {
  const storageAreas = makeStorageAreas();

  const saved = await saveApiKey({
    provider: "gemini",
    apiKey: "local-key",
    storageMode: "local"
  }, storageAreas);

  assert.equal(saved.ok, true);
  assert.equal(storageAreas.local.data.pbt_api_keys_v1.gemini, "local-key");
  assert.equal(storageAreas.session.data.pbt_api_keys_v1, undefined);
});

test("secret manager does not store single use api key", async () => {
  const storageAreas = makeStorageAreas();

  const saved = await saveApiKey({
    provider: "gemini",
    apiKey: "once-key",
    storageMode: "once"
  }, storageAreas);
  const apiKey = await getStoredApiKey("gemini", storageAreas);

  assert.equal(saved.ok, true);
  assert.equal(saved.saved, false);
  assert.equal(apiKey, "");
  assert.equal(storageAreas.session.data.pbt_api_keys_v1, undefined);
  assert.equal(storageAreas.local.data.pbt_api_keys_v1, undefined);
});

test("secret manager clears session and local api keys", async () => {
  const storageAreas = makeStorageAreas();

  await saveApiKey({ provider: "gemini", apiKey: "session-key", storageMode: "session" }, storageAreas);
  await saveApiKey({ provider: "gemini", apiKey: "local-key", storageMode: "local" }, storageAreas);
  await clearApiKey({ provider: "gemini", storageMode: "session" }, storageAreas);

  assert.equal(await getStoredApiKey("gemini", storageAreas), "local-key");

  await clearApiKey({ provider: "gemini", storageMode: "local" }, storageAreas);

  assert.equal(await getStoredApiKey("gemini", storageAreas), "");
});

test("secret manager stores custom provider keys separately", async () => {
  const storageAreas = makeStorageAreas();

  await saveApiKey({ provider: "gemini", apiKey: "gemini-key", storageMode: "session" }, storageAreas);
  await saveApiKey({ provider: "custom_openai", apiKey: "openai-gateway-key", storageMode: "session" }, storageAreas);
  await saveApiKey({ provider: "custom_gemini", apiKey: "gateway-key", storageMode: "session" }, storageAreas);

  assert.equal(await getStoredApiKey("gemini", storageAreas), "gemini-key");
  assert.equal(await getStoredApiKey("custom_openai", storageAreas), "openai-gateway-key");
  assert.equal(await getStoredApiKey("custom_gemini", storageAreas), "gateway-key");
});

test("secret manager reports api key status without exposing key", async () => {
  const storageAreas = makeStorageAreas();

  await saveApiKey({ provider: "custom_gemini", apiKey: "session-key", storageMode: "session" }, storageAreas);
  await saveApiKey({ provider: "custom_gemini", apiKey: "local-key", storageMode: "local" }, storageAreas);

  const status = await getApiKeyStatus("custom_gemini", storageAreas);

  assert.equal(status.ok, true);
  assert.equal(status.provider, "custom_gemini");
  assert.equal(status.hasSessionKey, true);
  assert.equal(status.hasLocalKey, true);
  assert.equal(Object.hasOwn(status, "apiKey"), false);
  assert.equal(JSON.stringify(status).includes("session-key"), false);
  assert.equal(JSON.stringify(status).includes("local-key"), false);
});

function makeStorageAreas() {
  return {
    session: makeStorageArea(),
    local: makeStorageArea()
  };
}

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
