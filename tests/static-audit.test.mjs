import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

test("network APIs are restricted to approved provider modules", async () => {
  const files = await readSourceAndManifestFiles();

  for (const file of files) {
    assert.doesNotMatch(file.text, /\bXMLHttpRequest\b/);
    assert.doesNotMatch(file.text, /\bWebSocket\b/);
    assert.doesNotMatch(file.text, /\bEventSource\b/);
    assert.doesNotMatch(file.text, /\bsendBeacon\b/);
    assert.doesNotMatch(file.text, /\bimportScripts\b/);

    if (/\bfetch\b/.test(file.text)) {
      assert.equal(
        file.path.endsWith("src/providers/google-free-provider.mjs") ||
          file.path.endsWith("src/providers/gemini-provider.mjs") ||
          file.path.endsWith("src/providers/custom-gemini-provider.mjs") ||
          file.path.endsWith("src/providers/custom-openai-provider.mjs"),
        true
      );
    }
  }
});

test("source only declares approved provider network destinations", async () => {
  const text = await readSourceAndManifest();
  const urls = [...text.matchAll(/https?:\/\/[^"'\s`]+/g)].map((match) => match[0]);

  assert.deepEqual([...new Set(urls)].sort(), [
    "http://*/*",
    "https://*/*",
    "https://generativelanguage.googleapis.com",
    "https://generativelanguage.googleapis.com/*",
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
    "https://translate.googleapis.com",
    "https://translate.googleapis.com/*",
    "https://translate.googleapis.com/translate_a/single"
  ]);
});

test("source does not use forbidden Chrome permissions or unsafe storage", async () => {
  const files = await readSourceAndManifestFiles();
  const text = files.map((file) => file.text).join("\n");

  assert.doesNotMatch(text, /\ball_urls\b/);
  assert.doesNotMatch(text, /\bhistory\b/);
  assert.doesNotMatch(text, /\bcookies\b/);
  assert.doesNotMatch(text, /\bwebRequest\b/);
  assert.doesNotMatch(text, /\bdebugger\b/);
  assert.doesNotMatch(text, /\bstorage\.sync\b/);

  for (const file of files) {
    if (/\bexecuteScript\b/.test(file.text)) {
      assert.equal(file.path.endsWith("src/background/background.js"), true);
    }

    if (/\bscripting\b/.test(file.text)) {
      assert.equal(
        file.path.endsWith("manifest.json") ||
          file.path.endsWith("src/background/background.js"),
        true
      );
    }

    if (/\bstorage\.local\b/.test(file.text)) {
      assert.equal(
        file.path.endsWith("src/background/site-settings.mjs") ||
          file.path.endsWith("src/background/custom-provider-config.mjs") ||
          file.path.endsWith("src/background/secret-manager.mjs"),
        true
      );
    }

    if (/\bstorage\.session\b/.test(file.text)) {
      assert.equal(file.path.endsWith("src/background/secret-manager.mjs"), true);
    }
  }
});

test("source has no broad logging, unsafe auth headers, or dynamic code execution", async () => {
  const files = await readSourceAndManifestFiles();
  const text = files.map((file) => file.text).join("\n");

  assert.doesNotMatch(text, /console\.(log|debug|info|warn|error)\b/);
  assert.doesNotMatch(text, /\bauthorization\b/i);
  assert.doesNotMatch(text, /\bbearer\b/i);
  assert.doesNotMatch(text, /\beval\s*\(/);
  assert.doesNotMatch(text, /\bnew Function\b/);
  assert.doesNotMatch(text, /\binnerHTML\b/);
  assert.doesNotMatch(text, /\bouterHTML\b/);
  assert.doesNotMatch(text, /\binsertAdjacentHTML\b/);

  for (const file of files) {
    if (/\bheaders\b/.test(file.text) && /\bx-api-key\b/.test(file.text)) {
      assert.equal(
        file.path.endsWith("src/providers/gemini-provider.mjs") ||
          file.path.endsWith("src/providers/custom-gemini-provider.mjs") ||
          file.path.endsWith("src/providers/custom-openai-provider.mjs"),
        true
      );
    }

    if (/\bapiKey\b/.test(file.text)) {
      assert.equal(
        file.path.endsWith("src/background/background.js") ||
          file.path.endsWith("src/background/provider-manager.mjs") ||
          file.path.endsWith("src/background/secret-manager.mjs") ||
          file.path.endsWith("src/providers/gemini-provider.mjs") ||
          file.path.endsWith("src/providers/custom-gemini-provider.mjs") ||
          file.path.endsWith("src/providers/custom-openai-provider.mjs") ||
          file.path.endsWith("src/popup/popup.js") ||
          file.path.endsWith("src/floating-settings/floating-settings.js"),
        true
      );
    }
  }
});

test("content script avoids unicode property regex for browser load compatibility", async () => {
  const contentScript = await readFile(new URL("../src/content/content-script.js", import.meta.url), "utf8");

  assert.doesNotMatch(contentScript, /\\p\{/);
});

async function readSourceAndManifest() {
  const files = await readSourceAndManifestFiles();
  return files.map((file) => file.text).join("\n");
}

async function readSourceAndManifestFiles() {
  const files = [
    new URL("../manifest.json", import.meta.url),
    ...(await listFiles(new URL("../src/", import.meta.url)))
  ];
  const contents = await Promise.all(files.map(async (file) => ({
    path: file.pathname,
    text: await readFile(file, "utf8")
  })));

  return contents;
}

async function listFiles(dirUrl) {
  const entries = await readdir(dirUrl, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dirUrl);

    if (entry.isDirectory()) {
      files.push(...await listFiles(child));
      continue;
    }

    if (path.extname(entry.name) === ".js" || path.extname(entry.name) === ".mjs" || path.extname(entry.name) === ".json") {
      files.push(child);
    }
  }

  return files;
}
