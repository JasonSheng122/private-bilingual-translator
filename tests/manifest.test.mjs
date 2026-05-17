import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("manifest uses only approved permissions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["activeTab", "storage", "scripting"]);
  assert.deepEqual(manifest.host_permissions, [
    "https://translate.googleapis.com/*",
    "https://generativelanguage.googleapis.com/*"
  ]);
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
  assert.deepEqual(manifest.web_accessible_resources, [
    {
      resources: [
        "src/floating-settings/floating-settings.html",
        "src/floating-settings/floating-settings.css",
        "src/floating-settings/floating-settings.js"
      ],
      matches: ["http://*/*", "https://*/*"],
      use_dynamic_url: true
    }
  ]);
  assert.deepEqual(manifest.content_scripts, [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/content-script.js"],
      run_at: "document_idle"
    }
  ]);
});

test("manifest uses a module service worker and popup action", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.background.service_worker, "src/background/background.js");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.action.default_popup, "src/popup/popup.html");
});
