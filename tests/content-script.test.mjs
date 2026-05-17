import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

test("dom collector includes readable text and excludes sensitive elements", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "h1", "Title text"));
  document.body.appendChild(el(document, "p", "Paragraph text"));
  document.body.appendChild(el(document, "li", "List item"));
  document.body.appendChild(el(document, "input", "Ignored input"));
  document.body.appendChild(el(document, "textarea", "Ignored textarea"));
  document.body.appendChild(el(document, "code", "Ignored code"));
  document.body.appendChild(el(document, "pre", "Ignored pre"));
  document.body.appendChild(el(document, "iframe", "Ignored frame"));
  document.body.appendChild(el(document, "div", "Ignored hidden", { hidden: "" }));
  document.body.appendChild(el(document, "div", "Ignored aria", { "aria-hidden": "true" }));
  document.body.appendChild(el(document, "div", "Ignored editable", { contenteditable: "true" }));

  const api = await loadContentApi(document);
  const result = api.collectSegments(document);

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.segments, (segment) => segment.text), [
    "Title text",
    "Paragraph text",
    "List item"
  ]);
});

test("dom collector skips lowercase svg diagram text", async () => {
  const document = createDocument();
  const svg = el(document, "svg", "");
  const group = el(document, "g", "");
  const label = el(document, "text", "Flowchart label");
  svg.tagName = "svg";
  group.tagName = "g";
  label.tagName = "text";
  group.appendChild(label);
  svg.appendChild(group);
  document.body.appendChild(svg);
  document.body.appendChild(el(document, "p", "Readable paragraph"));

  const api = await loadContentApi(document);
  const result = api.collectSegments(document);

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.segments, (segment) => segment.text), [
    "Readable paragraph"
  ]);
});

test("dom collector skips likely target-language translated text", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "已翻译段落"));
  document.body.appendChild(el(document, "p", "这是 OpenAI API 文档"));
  document.body.appendChild(el(document, "p", "The Chinese term 创业 means entrepreneurship."));
  document.body.appendChild(el(document, "p", "Readable English paragraph."));

  const api = await loadContentApi(document);
  const result = api.collectSegments(document);

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.segments, (segment) => segment.text), [
    "The Chinese term 创业 means entrepreneurship.",
    "Readable English paragraph."
  ]);
});

test("replace renderer replaces once and restores original text", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  const translation = [{ id: collected.segments[0].id, text: "[mock zh] Original paragraph" }];

  const firstRender = api.renderTranslations({ displayMode: "replace", translations: translation });
  const secondRender = api.renderTranslations({ displayMode: "replace", translations: translation });

  assert.equal(firstRender.renderedCount, 1);
  assert.equal(secondRender.renderedCount, 0);
  assert.equal(paragraph.textContent, "[mock zh] Original paragraph");
  assert.equal(paragraph.getAttribute("data-pbt-replaced"), "true");

  const restored = api.restoreOriginalText();

  assert.equal(restored.restoredCount, 1);
  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(paragraph.hasAttribute("data-pbt-replaced"), false);
});

test("replace renderer skips unchanged provider text", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  const rendered = api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: collected.segments[0].id, text: "Original paragraph" }]
  });

  assert.equal(rendered.renderedCount, 0);
  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(paragraph.hasAttribute("data-pbt-replaced"), false);
});

test("replace renderer translates sibling text nodes around inline code", async () => {
  const document = createDocument();
  const paragraph = document.createElement("p");
  paragraph.appendChild(document.createTextNode("You created an "));
  paragraph.appendChild(el(document, "code", "AGENTS.md"));
  paragraph.appendChild(document.createTextNode(" and packed every rule into it."));
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  const rendered = api.renderTranslations({
    displayMode: "replace",
    translations: [
      { id: collected.segments[0].id, text: "你创建了一个 " },
      { id: collected.segments[1].id, text: " 并把每条规则都放了进去。" }
    ]
  });

  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), [
    "You created an",
    "and packed every rule into it."
  ]);
  assert.equal(rendered.renderedCount, 2);
  assert.equal(paragraph.textContent, "你创建了一个 AGENTS.md 并把每条规则都放了进去。");
  assert.equal(paragraph.getAttribute("data-pbt-replaced"), "true");
});

test("replace restore skips stale text that was updated by the page", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: collected.segments[0].id, text: "[mock zh] Original paragraph" }]
  });
  paragraph.childNodes[0].nodeValue = "React updated paragraph";

  const restored = api.restoreOriginalText();
  const recollected = api.collectSegments(document);

  assert.equal(restored.restoredCount, 0);
  assert.equal(restored.skippedCount, 1);
  assert.equal(paragraph.textContent, "React updated paragraph");
  assert.equal(paragraph.hasAttribute("data-pbt-replaced"), false);
  assert.deepEqual(Array.from(recollected.segments, (segment) => segment.text), ["React updated paragraph"]);
});

test("replace cleanup lets updated dynamic text retranslate", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "First room label");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First room label" }]
  });
  paragraph.childNodes[0].nodeValue = "Updated room label";

  const secondCollected = api.collectSegments(document);

  assert.equal(paragraph.hasAttribute("data-pbt-replaced"), false);
  assert.deepEqual(Array.from(secondCollected.segments, (segment) => segment.text), ["Updated room label"]);
});

test("replace restore ignores disconnected text nodes", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: collected.segments[0].id, text: "[mock zh] Original paragraph" }]
  });
  paragraph.remove();

  const restored = api.restoreOriginalText();

  assert.equal(restored.restoredCount, 0);
  assert.equal(restored.cleanedCount, 1);
  assert.equal(paragraph.textContent, "[mock zh] Original paragraph");
});

test("restore page invalidates pending incremental replace translations", async () => {
  const document = createDocument();
  const nav = el(document, "nav", "Lectures");
  const headline = el(document, "h1", "Lecture title");
  document.body.appendChild(nav);
  document.body.appendChild(headline);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [
      { id: firstCollected.segments[0].id, text: "讲座" },
      { id: firstCollected.segments[1].id, text: "课程标题" }
    ]
  });

  nav.childNodes[0].nodeValue = "Lectures";
  const pendingCollected = api.collectSegments(document, { incremental: true });
  const restored = api.restorePage();
  const staleRender = api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: pendingCollected.segments[0].id, text: "讲座" }]
  });

  assert.deepEqual(Array.from(pendingCollected.segments, (segment) => segment.text), ["Lectures"]);
  assert.equal(restored.restoredCount, 1);
  assert.equal(staleRender.renderedCount, 0);
  assert.equal(nav.textContent, "Lectures");
  assert.equal(headline.textContent, "Lecture title");
});

test("collector skips pure numbers, currency, and percentages", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Room A"));
  document.body.appendChild(el(document, "p", "$1,800.00"));
  document.body.appendChild(el(document, "p", "3200"));
  document.body.appendChild(el(document, "p", "20%"));

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);

  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), ["Room A"]);
});

test("collector skips social user names and ids while keeping post text", async () => {
  const document = createDocument();
  const userName = el(document, "div", "", { "data-testid": "User-Name" });
  userName.appendChild(el(document, "span", "OpenAI"));
  userName.appendChild(el(document, "span", "@OpenAI"));
  document.body.appendChild(userName);
  document.body.appendChild(el(document, "span", "@standalone_id"));
  document.body.appendChild(el(document, "span", "Jane Doe", { class: "author-name" }));
  document.body.appendChild(el(document, "p", "OpenAI announced a new model."));

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);

  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), [
    "OpenAI announced a new model."
  ]);
});

test("collector skips social profile links on known social hosts", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "a", "OpenAI", { href: "/openai" }));
  document.body.appendChild(el(document, "a", "@openai", { href: "/openai" }));
  document.body.appendChild(el(document, "p", "Post body should translate."));

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/home" }
  });
  const collected = api.collectSegments(document);

  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), [
    "Post body should translate."
  ]);
});

test("replace renderer leaves skipped social identity text unchanged", async () => {
  const document = createDocument();
  const userName = el(document, "div", "", { "data-testid": "User-Name" });
  const displayName = el(document, "span", "Sam Altman");
  const handle = el(document, "span", "@sama");
  const post = el(document, "p", "This post should translate.");
  userName.appendChild(displayName);
  userName.appendChild(handle);
  document.body.appendChild(userName);
  document.body.appendChild(post);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  const rendered = api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: collected.segments[0].id, text: "这条帖子应该翻译。" }]
  });

  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), [
    "This post should translate."
  ]);
  assert.equal(rendered.renderedCount, 1);
  assert.equal(displayName.textContent, "Sam Altman");
  assert.equal(handle.textContent, "@sama");
  assert.equal(post.textContent, "这条帖子应该翻译。");
});

test("dynamic rent amounts are not restored from stale replace snapshots", async () => {
  const document = createDocument();
  const row = document.createElement("div");
  const label = el(document, "span", "Room A");
  const amount = el(document, "strong", "$1,800.00");
  row.appendChild(label);
  row.appendChild(amount);
  document.body.appendChild(row);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: collected.segments[0].id, text: "房间 A" }]
  });
  amount.childNodes[0].nodeValue = "$1,309.09";

  const restored = api.restoreOriginalText();
  const recollected = api.collectSegments(document);

  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), ["Room A"]);
  assert.equal(restored.restoredCount, 1);
  assert.equal(label.textContent, "Room A");
  assert.equal(amount.textContent, "$1,309.09");
  assert.equal(recollected.segments.length, 1);
  assert.equal(recollected.segments[0].text, "Room A");
});

test("bilingual renderer inserts once and removes translation nodes", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  const translation = [{ id: collected.segments[0].id, text: "[mock zh] Original paragraph" }];

  const firstRender = api.renderTranslations({ displayMode: "bilingual", translations: translation });
  const secondRender = api.renderTranslations({ displayMode: "bilingual", translations: translation });

  assert.equal(firstRender.renderedCount, 1);
  assert.equal(secondRender.renderedCount, 0);
  assert.equal(paragraph.textContent, "Original paragraph[mock zh] Original paragraph");
  assert.equal(countTranslationNodes(paragraph), 1);

  const removed = api.removeBilingualTranslations();

  assert.equal(removed.removedCount, 1);
  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(countTranslationNodes(paragraph), 0);
});

test("bilingual renderer skips unchanged provider text", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  const rendered = api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: collected.segments[0].id, text: "Original paragraph" }]
  });

  assert.equal(rendered.renderedCount, 0);
  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(countTranslationNodes(paragraph), 0);
});

test("restore page removes bilingual translations", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const collected = api.collectSegments(document);
  const translation = [{ id: collected.segments[0].id, text: "[mock zh] Original paragraph" }];
  api.renderTranslations({ displayMode: "bilingual", translations: translation });

  const restored = api.restorePage();

  assert.equal(restored.restoredCount, 0);
  assert.equal(restored.removedCount, 1);
  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(countTranslationNodes(paragraph), 0);
});

test("bilingual renderer prevents duplicates after recollecting segments", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  const firstTranslation = [{ id: firstCollected.segments[0].id, text: "[mock zh] Original paragraph" }];
  const firstRender = api.renderTranslations({ displayMode: "bilingual", translations: firstTranslation });
  const secondCollected = api.collectSegments(document);

  assert.equal(firstRender.renderedCount, 1);
  assert.equal(secondCollected.segments.length, 0);
  assert.equal(countTranslationNodes(paragraph), 1);
});

test("bilingual collector only includes new content after previous translations", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "Original paragraph");
  const secondParagraph = el(document, "p", "New paragraph");
  document.body.appendChild(firstParagraph);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] Original paragraph" }]
  });
  document.body.appendChild(secondParagraph);

  const secondCollected = api.collectSegments(document);

  assert.deepEqual(Array.from(secondCollected.segments, (segment) => segment.text), ["New paragraph"]);
});

test("replace renderer removes existing bilingual translations before replacing", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  const bilingualTranslation = [{ id: firstCollected.segments[0].id, text: "[bilingual zh] Original paragraph" }];
  api.renderTranslations({ displayMode: "bilingual", translations: bilingualTranslation });

  api.prepareTranslation({ displayMode: "replace" });
  const secondCollected = api.collectSegments(document);
  const replaceTranslation = [{ id: secondCollected.segments[0].id, text: "[replace zh] Original paragraph" }];
  const replaced = api.renderTranslations({ displayMode: "replace", translations: replaceTranslation });

  assert.equal(replaced.renderedCount, 1);
  assert.equal(countTranslationNodes(paragraph), 0);
  assert.equal(paragraph.textContent, "[replace zh] Original paragraph");

  const restored = api.restoreOriginalText();

  assert.equal(restored.restoredCount, 1);
  assert.equal(paragraph.textContent, "Original paragraph");
});

test("bilingual translation after replace restores source text before collecting", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: firstCollected.segments[0].id, text: "[replace zh] Original paragraph" }]
  });

  api.prepareTranslation({ displayMode: "bilingual" });
  const secondCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: secondCollected.segments[0].id, text: "[bilingual zh] Original paragraph" }]
  });

  assert.deepEqual(Array.from(secondCollected.segments, (segment) => segment.text), ["Original paragraph"]);
  assert.equal(paragraph.textContent, "Original paragraph[bilingual zh] Original paragraph");
  assert.equal(paragraph.hasAttribute("data-pbt-replaced"), false);
});

test("replace translation after replace restores source text before collecting", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: firstCollected.segments[0].id, text: "[natural zh] Original paragraph" }]
  });

  const prepared = api.prepareTranslation({ displayMode: "replace" });
  const secondCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: secondCollected.segments[0].id, text: "[deep zh] Original paragraph" }]
  });

  assert.equal(prepared.ok, true);
  assert.equal(prepared.restoredCount, 1);
  assert.deepEqual(Array.from(secondCollected.segments, (segment) => segment.text), ["Original paragraph"]);
  assert.equal(paragraph.textContent, "[deep zh] Original paragraph");
  assert.equal(paragraph.getAttribute("data-pbt-replaced"), "true");
});

test("floating controls show translate, settings, hide, and translate button toggles checkmark", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Readable paragraph");
  document.body.appendChild(paragraph);
  const sentMessages = [];
  let translated = false;

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      if (message.type === "PBT_TRANSLATE_PAGE") {
        translated = true;
        callback({ ok: true, status: "bilingual" });
        return;
      }

      if (message.type === "PBT_RESTORE_PAGE") {
        translated = false;
        callback({ ok: true, restoredCount: 0, removedCount: 1 });
        return;
      }

      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true });
    }
  });

  const firstShow = api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "replace",
    paidProvider: "custom_gemini"
  });
  const secondShow = api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual" });
  const panel = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-panel");
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const settingsButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "settings");
  const settingsPanel = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "settings-panel");
  const qualitySelect = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "quality-mode");
  const providerSelect = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "paid-provider");
  const modeSelect = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "display-mode");
  const providerNote = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "provider-note");
  const providerConfigNote = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "provider-config-note");
  const providerConfigFrame = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "provider-config-frame");
  const hideButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "hide");
  const showHandle = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "show-handle");
  const collected = api.collectSegments(document);

  assert.equal(firstShow.shown, true);
  assert.equal(secondShow.shown, false);
  assert.ok(panel);
  assert.ok(translateButton);
  assert.ok(settingsButton);
  assert.ok(settingsPanel);
  assert.ok(qualitySelect);
  assert.ok(providerSelect);
  assert.deepEqual(providerSelect.childNodes.map((option) => [option.getAttribute("value"), option.textContent]), [
    ["gemini", "Gemini API"],
    ["custom_openai", "自定义中转站"]
  ]);
  assert.ok(modeSelect);
  assert.ok(providerNote);
  assert.ok(providerConfigNote);
  assert.ok(providerConfigFrame);
  assert.equal(providerConfigFrame.hasAttribute("src"), false);
  assert.ok(hideButton);
  assert.ok(showHandle);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "mode-toggle"), null);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "restore"), null);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "remove"), null);
  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), ["Readable paragraph"]);

  assert.equal(settingsPanel.style.display, "none");
  settingsButton.click();
  assert.equal(settingsPanel.style.display, "block");
  assert.equal(providerConfigFrame.hasAttribute("src"), false);
  document.dispatchEvent({ type: "click", target: paragraph });
  assert.equal(settingsPanel.style.display, "none");
  assert.equal(providerConfigFrame.hasAttribute("src"), false);
  settingsButton.click();
  assert.equal(settingsPanel.style.display, "block");
  assert.equal(providerSelect.disabled, true);
  assert.equal(providerConfigFrame.style.display, "none");
  assert.equal(providerConfigNote.style.display, "none");
  qualitySelect.value = "natural";
  qualitySelect.dispatchEvent("change");
  assert.equal(providerConfigFrame.style.display, "block");
  assert.equal(providerConfigNote.style.display, "block");
  assert.match(providerConfigFrame.getAttribute("src"), /^chrome-extension:\/\/test-id\/src\/floating-settings\/floating-settings\.html\?provider=custom_openai$/);
  providerSelect.value = "gemini";
  providerSelect.dispatchEvent("change");
  assert.equal(providerSelect.disabled, false);
  assert.match(providerConfigFrame.getAttribute("src"), /^chrome-extension:\/\/test-id\/src\/floating-settings\/floating-settings\.html\?provider=gemini$/);
  settingsButton.click();
  assert.equal(settingsPanel.style.display, "none");
  assert.equal(providerConfigFrame.hasAttribute("src"), false);
  settingsButton.click();
  assert.equal(settingsPanel.style.display, "block");
  assert.match(providerConfigFrame.getAttribute("src"), /^chrome-extension:\/\/test-id\/src\/floating-settings\/floating-settings\.html\?provider=gemini$/);
  modeSelect.value = "replace";
  modeSelect.dispatchEvent("change");

  translateButton.click();

  assert.equal(translated, true);
  assert.equal(translateButton.getAttribute("data-pbt-active"), "true");
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));

  translateButton.click();

  assert.equal(translated, false);
  assert.equal(translateButton.getAttribute("data-pbt-active"), "false");
  assert.equal(translateButton.textContent, "译");
  assert.equal(getTranslateCheckmark(translateButton), null);

  hideButton.click();
  assert.equal(panel.getAttribute("data-pbt-hidden"), "true");
  assert.equal(showHandle.style.display, "block");
  showHandle.click();
  assert.equal(panel.getAttribute("data-pbt-hidden"), "false");

  assert.equal(sentMessages.length, 7);
  assert.equal(sentMessages[0].type, "PBT_SET_SITE_TRANSLATION_SETTINGS");
  assert.equal(sentMessages[0].qualityMode, "natural");
  assert.equal(sentMessages[0].paidProvider, "custom_openai");
  assert.equal(sentMessages[0].displayMode, "bilingual");
  assert.equal(sentMessages[0].autoTranslate, false);
  assert.equal(sentMessages[1].type, "PBT_SET_SITE_TRANSLATION_SETTINGS");
  assert.equal(sentMessages[1].qualityMode, "natural");
  assert.equal(sentMessages[1].paidProvider, "gemini");
  assert.equal(sentMessages[1].displayMode, "bilingual");
  assert.equal(sentMessages[1].autoTranslate, false);
  assert.equal(sentMessages[2].type, "PBT_SET_SITE_TRANSLATION_SETTINGS");
  assert.equal(sentMessages[2].qualityMode, "natural");
  assert.equal(sentMessages[2].paidProvider, "gemini");
  assert.equal(sentMessages[2].displayMode, "replace");
  assert.equal(sentMessages[2].autoTranslate, false);
  assert.equal(sentMessages[2].url, "https://example.com/article");
  assert.equal(sentMessages[3].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[3].displayMode, "replace");
  assert.equal(sentMessages[3].qualityMode, "natural");
  assert.equal(sentMessages[3].paidProvider, "gemini");
  assert.equal(sentMessages[3].url, "https://example.com/article");
  assert.equal(sentMessages[4].type, "PBT_SET_SITE_TRANSLATION_SETTINGS");
  assert.equal(sentMessages[4].autoTranslate, true);
  assert.equal(sentMessages[5].type, "PBT_RESTORE_PAGE");
  assert.equal(sentMessages[6].type, "PBT_SET_SITE_TRANSLATION_SETTINGS");
  assert.equal(sentMessages[6].autoTranslate, false);
});

test("floating settings embeds extension config frame without page api key fields", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });

  const settingsButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "settings");
  const settingsPanel = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "settings-panel");
  const providerConfigFrame = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "provider-config-frame");
  const passwordInput = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("type") === "password");

  settingsButton.click();

  assert.equal(settingsPanel.style.display, "block");
  assert.equal(providerConfigFrame.tagName, "IFRAME");
  assert.equal(providerConfigFrame.getAttribute("title"), "配置 Key / 中转站 / model");
  assert.equal(providerConfigFrame.getAttribute("referrerpolicy"), "no-referrer");
  assert.match(providerConfigFrame.getAttribute("src"), /^chrome-extension:\/\/test-id\/src\/floating-settings\/floating-settings\.html\?provider=custom_openai$/);
  assert.equal(passwordInput, null);
  assert.equal(sentMessages.length, 0);
});

test("floating replace toggle shows checkmark and restores rendered text", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);
  const sentMessages = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        const collected = api.collectSegments(document);
        api.renderTranslations({
          displayMode: "replace",
          translations: [{ id: collected.segments[0].id, text: "已翻译段落" }]
        });
        callback({ ok: true, status: "replaced" });
        return;
      }

      if (message.type === "PBT_RESTORE_PAGE") {
        callback(api.restorePage());
        return;
      }

      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "replace",
    paidProvider: "custom_openai"
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.equal(translateButton.textContent, "译");

  translateButton.click();

  assert.equal(paragraph.textContent, "已翻译段落");
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));
  assert.equal(translateButton.getAttribute("title"), "已翻译，点击还原并关闭本站默认翻译");

  translateButton.click();

  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(translateButton.textContent, "译");
  assert.equal(getTranslateCheckmark(translateButton), null);
  assert.deepEqual(
    sentMessages
      .filter((message) => message.type === "PBT_TRANSLATE_PAGE" || message.type === "PBT_RESTORE_PAGE")
      .map((message) => message.type),
    ["PBT_TRANSLATE_PAGE", "PBT_RESTORE_PAGE"]
  );
});

test("floating translate button shows animated loading dots while request is pending", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Original paragraph"));
  let pendingCallback = null;

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_PAGE") {
        pendingCallback = callback;
        return;
      }

      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "replace",
    paidProvider: "gemini"
  });

  const style = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-style");
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const progress = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress");

  translateButton.click();

  const loading = findNode(translateButton, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-loading");
  const dotDelays = Array.from(loading.childNodes, (node) => node.style.animationDelay);

  assert.match(style.textContent, /@keyframes pbt-floating-dot-wave/);
  assert.match(style.textContent, /@keyframes pbt-floating-status-pulse/);
  assert.equal(translateButton.disabled, true);
  assert.equal(translateButton.getAttribute("data-pbt-loading"), "translate");
  assert.equal(translateButton.getAttribute("title"), "正在翻译当前网址");
  assert.equal(translateButton.textContent, "...");
  assert.equal(progress.style.display, "inline-flex");
  assert.match(progress.textContent, /正在翻译，请稍等/);
  assert.equal(loading.getAttribute("data-pbt-control"), "translate-loading");
  assert.deepEqual(dotDelays, ["0ms", "120ms", "240ms"]);

  pendingCallback({ ok: true, status: "replaced" });

  assert.equal(translateButton.disabled, false);
  assert.equal(translateButton.hasAttribute("data-pbt-loading"), false);
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));
  assert.equal(progress.style.display, "none");
});

test("floating translate paints loading status before sending the request", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Original paragraph"));
  const sentMessages = [];
  const frameCallbacks = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    requestAnimationFrame(callback) {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "replaced" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "replace",
    paidProvider: "gemini"
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const progress = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress");

  translateButton.click();

  assert.equal(translateButton.disabled, true);
  assert.equal(progress.style.display, "inline-flex");
  assert.equal(sentMessages.length, 0);
  assert.equal(frameCallbacks.length, 1);

  frameCallbacks[0]();

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[1].type, "PBT_SET_SITE_TRANSLATION_SETTINGS");
  assert.equal(progress.style.display, "none");
  assert.equal(translateButton.disabled, false);
});

test("floating restore sends immediately after deferred translate", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);
  const sentMessages = [];
  const frameCallbacks = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    requestAnimationFrame(callback) {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        const collected = api.collectSegments(document);
        api.renderTranslations({
          displayMode: "replace",
          translations: [{ id: collected.segments[0].id, text: "已翻译段落" }]
        });
        callback({ ok: true, status: "replaced" });
        return;
      }

      if (message.type === "PBT_RESTORE_PAGE") {
        callback(api.restorePage());
        return;
      }

      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "replace",
    paidProvider: "gemini"
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const progress = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress");

  translateButton.click();
  assert.equal(sentMessages.length, 0);
  assert.equal(frameCallbacks.length, 1);

  frameCallbacks[0]();
  assert.equal(paragraph.textContent, "已翻译段落");
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));
  assert.equal(progress.style.display, "none");

  translateButton.click();

  assert.equal(frameCallbacks.length, 1);
  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(translateButton.textContent, "译");
  assert.equal(getTranslateCheckmark(translateButton), null);
  assert.equal(progress.style.display, "none");
  assert.deepEqual(
    sentMessages
      .filter((message) => message.type === "PBT_TRANSLATE_PAGE" || message.type === "PBT_RESTORE_PAGE")
      .map((message) => message.type),
    ["PBT_TRANSLATE_PAGE", "PBT_RESTORE_PAGE"]
  );
});

test("floating translated page toggle restores even when quality mode changes", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        callback({ ok: true, status: "replace" });
        return;
      }

      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "replace",
    paidProvider: "gemini"
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const qualitySelect = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "quality-mode");

  translateButton.click();
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));

  qualitySelect.value = "deep";
  qualitySelect.dispatchEvent("change");

  assert.equal(translateButton.getAttribute("title"), "已翻译，点击还原并关闭本站默认翻译");
  assert.equal(translateButton.textContent, "译✓");

  translateButton.click();

  const translateMessages = sentMessages.filter((message) => message.type === "PBT_TRANSLATE_PAGE");

  assert.equal(translateMessages.length, 1);
  assert.equal(translateMessages[0].qualityMode, "natural");
  assert.equal(translateMessages[0].displayMode, "replace");
  assert.equal(translateMessages[0].incremental, false);
  assert.equal(sentMessages.some((message) => message.type === "PBT_RESTORE_PAGE"), true);
});

test("floating display mode switch automatically restores replace text before retranslation", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);
  const sentMessages = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        assert.equal(paragraph.textContent, "Original paragraph");
        const collected = api.collectSegments(document);
        api.renderTranslations({
          displayMode: message.displayMode,
          translations: [{ id: collected.segments[0].id, text: message.displayMode === "replace" ? "已翻译段落" : "双语译文" }]
        });
        callback({ ok: true, status: message.displayMode === "replace" ? "replaced" : "bilingual" });
        return;
      }

      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "replace",
    paidProvider: "gemini"
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const modeSelect = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "display-mode");

  translateButton.click();

  assert.equal(paragraph.textContent, "已翻译段落");
  assert.equal(translateButton.textContent, "译✓");

  modeSelect.value = "bilingual";
  modeSelect.dispatchEvent("change");

  assert.equal(paragraph.textContent, "Original paragraph双语译文");
  assert.equal(translateButton.textContent, "译✓");
  assert.deepEqual(
    sentMessages
      .filter((message) => message.type === "PBT_TRANSLATE_PAGE")
      .map((message) => message.displayMode),
    ["replace", "bilingual"]
  );
  assert.equal(sentMessages.some((message) => message.type === "PBT_RESTORE_PAGE"), false);
});

test("floating display mode switch automatically removes bilingual text before replace retranslation", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);
  const sentMessages = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        assert.equal(paragraph.textContent, "Original paragraph");
        const collected = api.collectSegments(document);
        api.renderTranslations({
          displayMode: message.displayMode,
          translations: [{ id: collected.segments[0].id, text: message.displayMode === "replace" ? "已直翻段落" : "双语译文" }]
        });
        callback({ ok: true, status: message.displayMode === "replace" ? "replaced" : "bilingual" });
        return;
      }

      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "gemini"
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const modeSelect = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "display-mode");

  translateButton.click();

  assert.equal(paragraph.textContent, "Original paragraph双语译文");
  assert.equal(translateButton.textContent, "译✓");

  modeSelect.value = "replace";
  modeSelect.dispatchEvent("change");

  assert.equal(paragraph.textContent, "已直翻段落");
  assert.equal(translateButton.textContent, "译✓");
  assert.equal(countTranslationNodes(paragraph), 0);
  assert.deepEqual(
    sentMessages
      .filter((message) => message.type === "PBT_TRANSLATE_PAGE")
      .map((message) => message.displayMode),
    ["bilingual", "replace"]
  );
  assert.equal(sentMessages.some((message) => message.type === "PBT_RESTORE_PAGE"), false);
});

test("floating translate click removes stale ui when extension context is invalidated", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage() {
      throw new Error("Extension context invalidated.");
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.doesNotThrow(() => {
    translateButton.click();
  });
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-panel"), null);
});

test("floating translate click shows provider errors on the button", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      callback({
        ok: false,
        error: {
          code: "missing_api_key",
          message: "Custom provider API Key is required."
        }
      });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  translateButton.click();

  assert.equal(translateButton.textContent, "!");
  assert.equal(translateButton.disabled, false);
  assert.equal(translateButton.getAttribute("title"), "翻译失败：Custom provider API Key is required.");
  assert.equal(translateButton.getAttribute("aria-label"), "翻译失败：Custom provider API Key is required.");
});

test("floating translate click handles runtime lastError context invalidation", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      this.lastError = { message: "Extension context invalidated." };
      callback();
      this.lastError = null;
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.doesNotThrow(() => {
    translateButton.click();
  });
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-panel"), null);
});

test("floating auto translate disconnects observer when extension context is invalidated", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage() {
      throw new Error("Extension context invalidated.");
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);

  assert.doesNotThrow(() => {
    api.__mutationObservers[0].trigger([
      { type: "childList", addedNodes: [secondParagraph], target: document.body }
    ]);
  });
  assert.equal(api.__mutationObservers[0].disconnected, true);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-panel"), null);
});

test("floating translation reruns for new spa content while active", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [secondParagraph], target: document.body }
  ]);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].qualityMode, "natural");
  assert.equal(sentMessages[0].displayMode, "bilingual");
  assert.equal(sentMessages[0].paidProvider, "custom_openai");
  assert.equal(sentMessages[0].url, "https://example.com/lecture");
  assert.equal(sentMessages[0].incremental, true);
});

test("floating auto translation shows progress while spa content is translating", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  let pendingCallback = null;

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        pendingCallback = callback;
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const progress = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress");
  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [secondParagraph], target: document.body }
  ]);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].incremental, true);
  assert.equal(progress.style.display, "inline-flex");
  assert.match(progress.textContent, /正在翻译，请稍等/);

  pendingCallback({ ok: true, status: "bilingual" });

  assert.equal(progress.style.display, "none");
});

test("floating auto translation uses a short debounce for spa tab changes", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const timerDelays = [];
  let scheduledCallback = null;

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    setTimeout(callback, delay) {
      timerDelays.push(delay);
      scheduledCallback = callback;
      return 1;
    },
    clearTimeout() {},
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [secondParagraph], target: document.body }
  ]);

  assert.deepEqual(timerDelays, [80]);
  assert.equal(sentMessages.length, 0);

  scheduledCallback();

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].incremental, true);
});

test("floating translation retries after hidden spa tab content settles", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const collectedByMessage = [];
  const timers = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cleared = true;
      }
    },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        const collected = api.collectSegments(document, { incremental: message.incremental === true });
        collectedByMessage.push(collected);
        callback({
          ok: true,
          status: collected.segments.length > 0 ? "bilingual" : "no_text"
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const tabPanel = el(document, "section", "");
  tabPanel.style.display = "none";
  tabPanel.appendChild(el(document, "p", "Delayed tab paragraph"));
  document.body.appendChild(tabPanel);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [tabPanel], target: document.body }
  ]);

  assert.deepEqual(Array.from(timers, (timer) => timer.delay), [80, 400]);

  timers[0].callback();

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(Array.from(collectedByMessage[0].segments, (segment) => segment.text), []);

  tabPanel.style.display = "";
  timers[1].callback();

  assert.deepEqual(Array.from(timers, (timer) => timer.delay), [80, 400, 0]);

  timers[2].callback();

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[1].incremental, true);
  assert.deepEqual(Array.from(collectedByMessage[1].segments, (segment) => segment.text), [
    "Delayed tab paragraph"
  ]);
});

test("floating translation still settles when spa mutation mixes visible shell and hidden main content", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const collectedByMessage = [];
  const timers = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    setTimeout(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      if (timer) {
        timer.cleared = true;
      }
    },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        const collected = api.collectSegments(document, { incremental: message.incremental === true });
        collectedByMessage.push(collected);
        callback({
          ok: true,
          status: collected.segments.length > 0 ? "bilingual" : "no_text"
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const visibleShell = el(document, "aside", "New lecture outline");
  const hiddenMain = el(document, "main", "");
  hiddenMain.style.display = "none";
  hiddenMain.appendChild(el(document, "h1", "New lecture headline"));
  hiddenMain.appendChild(el(document, "p", "New lecture body paragraph"));
  document.body.appendChild(visibleShell);
  document.body.appendChild(hiddenMain);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [visibleShell, hiddenMain], target: document.body }
  ]);

  assert.deepEqual(Array.from(timers, (timer) => timer.delay), [80, 400]);

  timers[0].callback();

  assert.equal(sentMessages.length, 1);
  assert.deepEqual(Array.from(collectedByMessage[0].segments, (segment) => segment.text), [
    "New lecture outline"
  ]);

  hiddenMain.style.display = "";
  timers[1].callback();

  assert.deepEqual(Array.from(timers, (timer) => timer.delay), [80, 400, 0]);

  timers[2].callback();

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[1].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[1].incremental, true);
  assert.deepEqual(Array.from(collectedByMessage[1].segments, (segment) => segment.text), [
    "New lecture headline",
    "New lecture body paragraph"
  ]);
});

test("floating translation starts latest spa mutation while one paid request is in flight", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const collectedByMessage = [];
  const pendingCallbacks = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        collectedByMessage.push(api.collectSegments(document, { incremental: message.incremental === true }));
      }

      pendingCallbacks.push(callback);
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const progress = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress");
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [secondParagraph], target: document.body }
  ]);

  const thirdParagraph = el(document, "p", "Third paragraph");
  document.body.appendChild(thirdParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [thirdParagraph], target: document.body }
  ]);

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].qualityMode, "natural");
  assert.equal(sentMessages[0].displayMode, "bilingual");
  assert.equal(sentMessages[0].paidProvider, "custom_openai");
  assert.equal(sentMessages[0].url, "https://example.com/lecture");
  assert.equal(sentMessages[0].incremental, true);
  assert.equal(sentMessages[1].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[1].qualityMode, "natural");
  assert.equal(sentMessages[1].displayMode, "bilingual");
  assert.equal(sentMessages[1].paidProvider, "custom_openai");
  assert.equal(sentMessages[1].url, "https://example.com/lecture");
  assert.equal(sentMessages[1].incremental, true);
  assert.deepEqual(Array.from(collectedByMessage[0].segments, (segment) => segment.text), [
    "Second paragraph"
  ]);
  assert.deepEqual(Array.from(collectedByMessage[1].segments, (segment) => segment.text), [
    "Third paragraph"
  ]);
  assert.equal(progress.style.display, "inline-flex");

  pendingCallbacks[0]({ ok: true, status: "bilingual" });
  assert.equal(progress.style.display, "inline-flex");
  pendingCallbacks[1]({ ok: true, status: "bilingual" });
  assert.equal(progress.style.display, "none");
});

test("floating translation caps overlapping spa mutation requests", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const collectedByMessage = [];
  const pendingCallbacks = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        collectedByMessage.push(api.collectSegments(document, { incremental: message.incremental === true }));
      }

      pendingCallbacks.push(callback);
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "deep",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [secondParagraph], target: document.body }
  ]);

  const thirdParagraph = el(document, "p", "Third paragraph");
  document.body.appendChild(thirdParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [thirdParagraph], target: document.body }
  ]);

  const fourthParagraph = el(document, "p", "Fourth paragraph");
  document.body.appendChild(fourthParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [fourthParagraph], target: document.body }
  ]);

  assert.equal(sentMessages.length, 2);
  assert.deepEqual(Array.from(collectedByMessage[0].segments, (segment) => segment.text), [
    "Second paragraph"
  ]);
  assert.deepEqual(Array.from(collectedByMessage[1].segments, (segment) => segment.text), [
    "Third paragraph"
  ]);

  pendingCallbacks[0]({ ok: true, status: "bilingual" });

  assert.equal(sentMessages.length, 3);
  assert.equal(sentMessages[2].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[2].qualityMode, "deep");
  assert.equal(sentMessages[2].incremental, true);
  assert.deepEqual(Array.from(collectedByMessage[2].segments, (segment) => segment.text), [
    "Fourth paragraph"
  ]);
});

test("manual collection does not skip text held by pending incremental requests", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Second paragraph");
  document.body.appendChild(paragraph);

  const api = await loadContentApi(document);
  const incrementalCollected = api.collectSegments(document, { incremental: true });
  const manualCollected = api.collectSegments(document);

  const manualRender = api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: manualCollected.segments[0].id, text: "[mock zh] Second paragraph" }]
  });
  const staleIncrementalRender = api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: incrementalCollected.segments[0].id, text: "[mock zh] stale Second paragraph" }]
  });

  assert.deepEqual(Array.from(incrementalCollected.segments, (segment) => segment.text), [
    "Second paragraph"
  ]);
  assert.deepEqual(Array.from(manualCollected.segments, (segment) => segment.text), [
    "Second paragraph"
  ]);
  assert.notEqual(incrementalCollected.segments[0].id, manualCollected.segments[0].id);
  assert.equal(manualRender.renderedCount, 1);
  assert.equal(staleIncrementalRender.renderedCount, 0);
  assert.equal(paragraph.textContent, "Second paragraph[mock zh] Second paragraph");
});

test("renderer skips stale spa translations when source text changed before response", async () => {
  const document = createDocument();
  const headline = el(document, "h1", "Question title");
  document.body.appendChild(headline);

  const api = await loadContentApi(document);
  const firstCollected = api.collectSegments(document);
  headline.childNodes[0].nodeValue = "Answer title";
  const secondCollected = api.collectSegments(document);

  const staleRender = api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] Question title" }]
  });
  const freshRender = api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: secondCollected.segments[0].id, text: "[mock zh] Answer title" }]
  });

  assert.equal(staleRender.renderedCount, 0);
  assert.equal(freshRender.renderedCount, 1);
  assert.equal(headline.textContent, "Answer title[mock zh] Answer title");
});

test("floating replace translation reruns when a dynamic page overwrites translated text", async () => {
  const document = createDocument();
  const headline = el(document, "h1", "Welcome headline");
  document.body.appendChild(headline);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/react-page" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true, status: "replaced" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "deep",
    displayMode: "replace",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: firstCollected.segments[0].id, text: "欢迎标题" }]
  });
  headline.childNodes[0].nodeValue = "Welcome headline";
  api.__mutationObservers[0].trigger([
    { type: "characterData", target: headline.childNodes[0] }
  ]);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].qualityMode, "deep");
  assert.equal(sentMessages[0].displayMode, "replace");
  assert.equal(sentMessages[0].paidProvider, "custom_openai");
  assert.equal(sentMessages[0].url, "https://example.com/react-page");
  assert.equal(sentMessages[0].incremental, true);
});

test("floating replace translation reruns stale overwrites after render", async () => {
  const document = createDocument();
  const headline = el(document, "h1", "Hydrated headline");
  document.body.appendChild(headline);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/hydrated" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      if (message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS") {
        callback({
          ok: true,
          displayMode: message.displayMode,
          qualityMode: message.qualityMode,
          paidProvider: message.paidProvider,
          autoTranslate: message.autoTranslate === true
        });
        return;
      }

      callback({ ok: true, status: "replaced" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "deep",
    displayMode: "replace",
    paidProvider: "custom_openai"
  });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle"
  );
  button.click();

  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: firstCollected.segments[0].id, text: "已水合标题" }]
  });
  headline.childNodes[0].nodeValue = "Hydrated headline";
  api.__mutationObservers[0].trigger([
    { type: "characterData", target: headline.childNodes[0] }
  ]);

  const translateMessages = sentMessages.filter((message) => message.type === "PBT_TRANSLATE_PAGE");

  assert.equal(translateMessages.length, 2);
  assert.equal(translateMessages[1].displayMode, "replace");
  assert.equal(translateMessages[1].qualityMode, "deep");
  assert.equal(translateMessages[1].url, "https://example.com/hydrated");
  assert.equal(translateMessages[1].incremental, true);
});

test("floating bilingual translation reruns when a dynamic page updates translated text", async () => {
  const document = createDocument();
  const headline = el(document, "h1", "Question title");
  document.body.appendChild(headline);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/spa-tabs" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "gemini"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] Question title" }]
  });

  headline.childNodes[0].nodeValue = "Answer title";
  api.__mutationObservers[0].trigger([
    { type: "characterData", target: headline.childNodes[0] }
  ]);
  const nextCollected = api.collectSegments(document);

  assert.equal(countTranslationNodes(headline), 0);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].qualityMode, "natural");
  assert.equal(sentMessages[0].displayMode, "bilingual");
  assert.equal(sentMessages[0].url, "https://example.com/spa-tabs");
  assert.equal(sentMessages[0].incremental, true);
  assert.deepEqual(Array.from(nextCollected.segments, (segment) => segment.text), ["Answer title"]);
});

test("floating translation reruns when hidden content becomes visible", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  const hiddenPanel = el(document, "section", "", { hidden: "" });
  hiddenPanel.appendChild(el(document, "p", "Expanded paragraph"));
  document.body.appendChild(firstParagraph);
  document.body.appendChild(hiddenPanel);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/faq" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });
  hiddenPanel.removeAttribute("hidden");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "hidden", target: hiddenPanel }
  ]);

  assert.deepEqual(Array.from(firstCollected.segments, (segment) => segment.text), ["First paragraph"]);
  assert.equal(api.__mutationObservers[0].observerOptions.attributes, true);
  assert.deepEqual(Array.from(api.__mutationObservers[0].observerOptions.attributeFilter), [
    "class",
    "style",
    "lang",
    "hidden",
    "aria-hidden",
    "aria-selected",
    "aria-current",
    "aria-expanded",
    "data-state",
    "data-active",
    "data-selected",
    "data-current",
    "data-expanded",
    "data-open",
    "data-headlessui-state",
    "open"
  ]);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].qualityMode, "free");
  assert.equal(sentMessages[0].displayMode, "bilingual");
  assert.equal(sentMessages[0].url, "https://example.com/faq");
  assert.equal(sentMessages[0].incremental, true);
});

test("floating translation reruns when tab state attributes reveal content", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  const tabPanel = el(document, "section", "", { "data-state": "inactive" });
  tabPanel.style.display = "none";
  tabPanel.appendChild(el(document, "p", "Active tab paragraph"));
  document.body.appendChild(firstParagraph);
  document.body.appendChild(tabPanel);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/tabs" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  tabPanel.style.display = "";
  tabPanel.setAttribute("data-state", "active");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "data-state", target: tabPanel }
  ]);

  assert.deepEqual(Array.from(firstCollected.segments, (segment) => segment.text), ["First paragraph"]);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].displayMode, "bilingual");
  assert.equal(sentMessages[0].url, "https://example.com/tabs");
  assert.equal(sentMessages[0].incremental, true);
});

test("floating translation ignores inactive tab state attribute changes", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  const tabPanel = el(document, "section", "", { "data-state": "active" });
  tabPanel.appendChild(el(document, "p", "Inactive tab paragraph"));
  document.body.appendChild(firstParagraph);
  document.body.appendChild(tabPanel);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/tabs" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [
      { id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" },
      { id: firstCollected.segments[1].id, text: "[mock zh] Inactive tab paragraph" }
    ]
  });

  tabPanel.setAttribute("data-state", "inactive");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "data-state", target: tabPanel }
  ]);

  assert.equal(sentMessages.length, 0);
});

test("floating translation ignores svg diagram text mutations", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "First paragraph");
  const svg = el(document, "svg", "");
  const label = el(document, "text", "Flowchart label");
  svg.tagName = "svg";
  label.tagName = "text";
  svg.appendChild(label);
  document.body.appendChild(paragraph);
  document.body.appendChild(svg);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/diagram" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "gemini"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] First paragraph" }]
  });

  label.childNodes[0].nodeValue = "Updated flowchart label";
  api.__mutationObservers[0].trigger([
    { type: "characterData", target: label.childNodes[0] }
  ]);

  assert.deepEqual(Array.from(firstCollected.segments, (segment) => segment.text), ["First paragraph"]);
  assert.equal(countTranslationNodes(svg), 0);
  assert.equal(sentMessages.length, 0);
});

test("collector waits for closed details content until it is opened", async () => {
  const document = createDocument();
  const details = el(document, "details", "");
  details.appendChild(el(document, "summary", "Question title"));
  details.appendChild(el(document, "p", "Hidden answer"));
  document.body.appendChild(details);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/details" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "bilingual" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "[mock zh] Question title" }]
  });
  details.setAttribute("open", "");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "open", target: details }
  ]);

  assert.deepEqual(Array.from(firstCollected.segments, (segment) => segment.text), ["Question title"]);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].url, "https://example.com/details");
  assert.equal(sentMessages[0].incremental, true);
});

test("content script auto shows the floating panel on allowed http pages", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));
  const sentMessages = [];

  await loadContentApi(document, {
    autoPanel: true,
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({
        ok: true,
        policy: { blocked: false },
        qualityMode: "free",
        displayMode: "replace"
      });
    }
  });

  const panel = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-panel");
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_GET_PAGE_STATUS");
  assert.equal(sentMessages[0].url, "https://example.com/article");
  assert.ok(panel);
  assert.ok(translateButton);
});

test("content script auto translates when origin setting is enabled", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));
  const sentMessages = [];

  await loadContentApi(document, {
    autoPanel: true,
    location: { href: "https://example.com/lecture/two" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_GET_PAGE_STATUS") {
        callback({
          ok: true,
          policy: { blocked: false },
          qualityMode: "natural",
          displayMode: "replace",
          paidProvider: "gemini",
          autoTranslate: true
        });
        return;
      }

      callback({ ok: true, status: "replaced" });
    }
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].type, "PBT_GET_PAGE_STATUS");
  assert.equal(sentMessages[1].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[1].qualityMode, "natural");
  assert.equal(sentMessages[1].displayMode, "replace");
  assert.equal(sentMessages[1].paidProvider, "gemini");
  assert.equal(sentMessages[1].url, "https://example.com/lecture/two");
  assert.equal(translateButton.getAttribute("data-pbt-active"), "true");
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));
});

test("content script pauses stored auto translate on native target-language pages", async () => {
  const document = createDocument();
  document.documentElement.setAttribute("lang", "en-US");
  document.body.appendChild(el(document, "p", "欢迎来到中文版本"));
  const sentMessages = [];

  await loadContentApi(document, {
    autoPanel: true,
    location: { href: "https://walkinglabs.github.io/learn-harness-engineering/zh-cn/lectures/lecture-01-why-capable-agents-still-fail/" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_GET_PAGE_STATUS") {
        callback({
          ok: true,
          policy: { blocked: false },
          qualityMode: "natural",
          displayMode: "replace",
          paidProvider: "gemini",
          autoTranslate: true
        });
        return;
      }

      callback({ ok: true, status: "replaced" });
    }
  });

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_GET_PAGE_STATUS");
  assert.equal(translateButton.getAttribute("data-pbt-active"), "false");
  assert.equal(translateButton.textContent, "译");
  assert.equal(getTranslateCheckmark(translateButton), null);
});

test("floating auto translate pauses when spa switches to target-language content", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://walkinglabs.github.io/learn-harness-engineering/" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        const collected = api.collectSegments(document, { incremental: message.incremental === true });
        callback({
          ok: true,
          status: collected.segments.length > 0 ? "bilingual" : "no_text"
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "gemini",
    autoTranslate: true
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "第一段" }]
  });

  sentMessages.length = 0;
  document.documentElement.setAttribute("lang", "zh-CN");
  const chineseSection = el(document, "section", "欢迎来到中文版本");
  document.body.appendChild(chineseSection);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [chineseSection], target: document.body }
  ]);

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.equal(sentMessages.length, 0);
  assert.equal(translateButton.getAttribute("data-pbt-active"), "false");
  assert.equal(translateButton.textContent, "译");
  assert.equal(getTranslateCheckmark(translateButton), null);
});

test("floating target-language pause does not keep rewriting its own button", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://walkinglabs.github.io/learn-harness-engineering/" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        const collected = api.collectSegments(document, { incremental: message.incremental === true });
        callback({
          ok: true,
          status: collected.segments.length > 0 ? "bilingual" : "no_text"
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "bilingual",
    paidProvider: "gemini",
    autoTranslate: true
  });
  const firstCollected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "bilingual",
    translations: [{ id: firstCollected.segments[0].id, text: "第一段" }]
  });

  sentMessages.length = 0;
  document.documentElement.setAttribute("lang", "zh-CN");
  const chineseSection = el(document, "section", "欢迎来到中文版本");
  document.body.appendChild(chineseSection);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [chineseSection], target: document.body }
  ]);

  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");
  const stableTextNode = translateButton.childNodes[0];
  const anotherChineseSection = el(document, "section", "继续阅读中文章节");
  document.body.appendChild(anotherChineseSection);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [anotherChineseSection], target: document.body }
  ]);

  assert.equal(sentMessages.length, 0);
  assert.equal(translateButton.getAttribute("data-pbt-active"), "false");
  assert.equal(translateButton.textContent, "译");
  assert.equal(translateButton.childNodes[0], stableTextNode);
  assert.equal(getTranslateCheckmark(translateButton), null);
});

async function loadContentApi(document, options = {}) {
  const code = await readFile(new URL("../src/content/content-script.js", import.meta.url), "utf8");
  const mutationObservers = [];
  const sandbox = {
    document,
    location: options.location ?? { href: "https://example.com/" },
    URL,
    __PBT_DISABLE_AUTO_PANEL__: options.autoPanel !== true,
    chrome: {
      runtime: {
        sendMessage: options.sendMessage ?? function sendMessage(message, callback) {
          callback({ ok: true });
        },
        getURL: options.getURL ?? function getURL(path) {
          return `chrome-extension://test-id/${path}`;
        },
        onMessage: {
          addListener() {}
        }
      }
    }
  };

  if (options.mutationObserver) {
    sandbox.MutationObserver = class FakeMutationObserver {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        mutationObservers.push(this);
      }

      observe(target, observerOptions) {
        this.target = target;
        this.observerOptions = observerOptions;
      }

      trigger(mutations) {
        this.callback(mutations);
      }

      disconnect() {
        this.disconnected = true;
      }
    };
  }

  if (options.setTimeout) {
    sandbox.setTimeout = options.setTimeout;
    sandbox.clearTimeout = options.clearTimeout ?? function clearTimeout() {};
  } else if (options.immediateTimers) {
    sandbox.setTimeout = (callback) => {
      callback();
      return 1;
    };
    sandbox.clearTimeout = () => {};
  }

  if (options.requestAnimationFrame) {
    sandbox.requestAnimationFrame = options.requestAnimationFrame;
  }

  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: "content-script.js" });
  sandbox.PrivateBilingualTranslatorContent.__mutationObservers = mutationObservers;
  return sandbox.PrivateBilingualTranslatorContent;
}

function findNode(root, predicate) {
  let found = null;

  walk(root, (node) => {
    if (!found && predicate(node)) {
      found = node;
    }
  });

  return found;
}

function countTranslationNodes(root) {
  let count = 0;

  walk(root, (node) => {
    if (node.nodeType === 1 && node.hasAttribute("data-pbt-translation")) {
      count += 1;
    }
  });

  return count;
}

function getTranslateCheckmark(button) {
  return findNode(button, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-checkmark");
}

function walk(node, visitor) {
  visitor(node);

  for (const child of node.childNodes) {
    walk(child, visitor);
  }
}

function createDocument() {
  const document = {
    body: null,
    defaultView: {
      getComputedStyle(element) {
        return {
          display: element.style.display || "block",
          visibility: element.style.visibility || "visible"
        };
      }
    },
    createElement(tagName) {
      return new FakeElement(this, tagName);
    },
    createTextNode(text) {
      return new FakeTextNode(this, text);
    },
    listeners: new Map(),
    addEventListener(name, callback) {
      const listeners = this.listeners.get(name) ?? [];
      listeners.push(callback);
      this.listeners.set(name, listeners);
    },
    dispatchEvent(event) {
      for (const callback of this.listeners.get(event.type) ?? []) {
        callback(event);
      }
    }
  };

  document.documentElement = document.createElement("html");
  document.body = document.createElement("body");
  return document;
}

function el(document, tagName, text, attrs = {}) {
  const element = document.createElement(tagName);

  for (const entry of Object.entries(attrs)) {
    element.setAttribute(entry[0], entry[1]);
  }

  if (text) {
    element.appendChild(document.createTextNode(text));
  }

  return element;
}

class FakeNode {
  constructor(document, nodeType) {
    this.ownerDocument = document;
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
  }

  get nextSibling() {
    if (!this.parentNode) {
      return null;
    }

    const siblings = this.parentNode.childNodes;
    const index = siblings.indexOf(this);
    return index >= 0 ? siblings[index + 1] ?? null : null;
  }

  remove() {
    if (!this.parentNode) {
      return;
    }

    const siblings = this.parentNode.childNodes;
    const index = siblings.indexOf(this);

    if (index >= 0) {
      siblings.splice(index, 1);
    }

    this.parentNode = null;
  }
}

class FakeTextNode extends FakeNode {
  constructor(document, text) {
    super(document, 3);
    this.nodeValue = text;
  }

  get textContent() {
    return this.nodeValue;
  }

  set textContent(value) {
    this.nodeValue = value;
  }
}

class FakeElement extends FakeNode {
  constructor(document, tagName) {
    super(document, 1);
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.style = {};
    this.isContentEditable = false;
    this.disabled = false;
    this.listeners = new Map();
  }

  appendChild(node) {
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }

  insertBefore(node, referenceNode) {
    node.parentNode = this;

    if (!referenceNode) {
      this.childNodes.push(node);
      return node;
    }

    const index = this.childNodes.indexOf(referenceNode);

    if (index === -1) {
      this.childNodes.push(node);
      return node;
    }

    this.childNodes.splice(index, 0, node);
    return node;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "contenteditable" && String(value) === "true") {
      this.isContentEditable = true;
    }
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "contenteditable") {
      this.isContentEditable = false;
    }
  }

  addEventListener(name, callback) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(callback);
    this.listeners.set(name, listeners);
  }

  dispatchEvent(name) {
    for (const callback of this.listeners.get(name) ?? []) {
      callback();
    }
  }

  click() {
    for (const callback of this.listeners.get("click") ?? []) {
      callback();
    }
  }

  querySelector(selector) {
    const match = selector.match(/^\[data-pbt-control="([^"]+)"\]$/);

    if (!match) {
      return null;
    }

    return findNode(this, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === match[1]);
  }

  contains(node) {
    if (node === this) {
      return true;
    }

    return this.childNodes.some((child) => {
      if (child === node) {
        return true;
      }

      return typeof child.contains === "function" ? child.contains(node) : false;
    });
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value) {
    this.childNodes = [];
    this.appendChild(this.ownerDocument.createTextNode(value));
  }
}
