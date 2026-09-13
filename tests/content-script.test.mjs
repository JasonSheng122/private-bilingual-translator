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

test("dom collector skips transient overlay text", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable article paragraph."));

  const hoverCard = el(document, "div", "", { "data-testid": "HoverCard" });
  hoverCard.appendChild(el(document, "p", "Hover biography preview paragraph."));
  document.body.appendChild(hoverCard);

  const tooltip = el(document, "div", "Tooltip helper text.", { role: "tooltip" });
  document.body.appendChild(tooltip);

  const api = await loadContentApi(document);
  const result = api.collectSegments(document);

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.segments, (segment) => segment.text), [
    "Readable article paragraph."
  ]);
});

test("dom collector skips interactive controls and compact social metrics", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable article paragraph."));
  document.body.appendChild(el(document, "button", "Subscribe"));
  document.body.appendChild(el(document, "div", "2.4K", { role: "button", "aria-label": "2458 reposts. Repost" }));
  document.body.appendChild(el(document, "a", "453.6K", { href: "/example/status/1/analytics" }));
  document.body.appendChild(el(document, "a", "b00kd.com", { href: "https://t.co/example" }));

  const api = await loadContentApi(document);
  const result = api.collectSegments(document);

  assert.equal(result.ok, true);
  assert.deepEqual(Array.from(result.segments, (segment) => segment.text), [
    "Readable article paragraph."
  ]);
});

test("incremental collector skips secondary recommendation rails without changing manual collection", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "article", "Main timeline paragraph."));
  const sidebar = el(document, "div", "", { "data-testid": "sidebarColumn" });
  sidebar.appendChild(el(document, "p", "Trending sidebar item."));
  document.body.appendChild(sidebar);

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/example/status/1" }
  });
  const incremental = api.collectSegments(document, { incremental: true });
  const manual = api.collectSegments(document);

  assert.deepEqual(Array.from(incremental.segments, (segment) => segment.text), [
    "Main timeline paragraph."
  ]);
  assert.deepEqual(Array.from(manual.segments, (segment) => segment.text), [
    "Main timeline paragraph.",
    "Trending sidebar item."
  ]);
});

test("incremental collector keeps ordinary document sidebars", async () => {
  const document = createDocument();
  const aside = el(document, "aside", "", { "aria-label": "Table of contents", role: "complementary" });
  aside.appendChild(el(document, "p", "Section navigation paragraph."));
  document.body.appendChild(aside);

  const api = await loadContentApi(document, {
    location: { href: "https://docs.example.test/guide/" }
  });
  const result = api.collectSegments(document, { incremental: true });

  assert.deepEqual(Array.from(result.segments, (segment) => segment.text), [
    "Section navigation paragraph."
  ]);
});

test("youtube transcript explicit clear removes stale sync diagnostics from button", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 3 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() })
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findYouTubeControl(fixture.document, "youtube-transcript-toggle");
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  api.renderYouTubeTranscriptTranslations({ translations: manualCaptionFixtureTranslations(collected.segments) });

  assert.equal(button.getAttribute("data-pbt-sync-source"), "caption_track");
  assert.equal(button.getAttribute("data-pbt-sync-status"), "translated");
  assert.equal(button.getAttribute("data-pbt-active"), "true");

  api.clearYouTubeTranscriptTranslations();

  assert.equal(button.hasAttribute("data-pbt-sync-source"), false);
  assert.equal(button.hasAttribute("data-pbt-sync-status"), false);
  assert.equal(button.getAttribute("data-pbt-active"), "false");
  assert.equal(findYouTubeOverlay(fixture.document), null);
  assert.equal(findYouTubeControl(fixture.document, "youtube-native-caption-style"), null);
});

test("youtube transcript in-flight mutations do not run ordinary page rescans", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const sentMessages = [];
  const poisonNode = {
    nodeType: 1,
    ownerDocument: document,
    tagName: "DIV",
    get childNodes() {
      throw new Error("ordinary mutation scan should be deferred");
    },
    getAttribute() {
      return null;
    },
    hasAttribute() {
      return false;
    }
  };

  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    mutationObserver: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click();

  assert.equal(button.getAttribute("data-pbt-loading"), "youtube-transcript");
  assert.doesNotThrow(() => {
    api.__mutationObservers[0].trigger([
      { type: "childList", addedNodes: [poisonNode], target: document.body }
    ]);
  });
  assert.deepEqual(sentMessages.map((message) => message.type), ["PBT_TRANSLATE_YOUTUBE_TRANSCRIPT"]);
  assert.equal(sentMessages[0].allowLongVideoAutoOpen, undefined);
  assert.equal(sentMessages[0].allowYouTubeVisibleCaptionLayer, undefined);
  assert.equal(sentMessages[0].allowYouTubeLocalWhisperAsr, undefined);
  assert.equal(sentMessages[0].allowYouTubeCaptionTrack, true);
  assert.equal(sentMessages[0].allowYouTubePlayerCaptionToggle, true);
});

test("youtube transcript floating button only sends transcript-specific translate messages", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const sentMessages = [];
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "translated", renderedCount: 1 });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );
  const rail = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-rail"
  );

  assert.equal(button.style.display, "inline-flex");
  assert.equal(button.parentNode, player);
  assert.equal(rail.contains(button), false);
  button.click();
  assert.equal(sentMessages.at(-1).type, "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT");
  assert.equal(sentMessages.at(-1).qualityMode, "free");
  assert.equal(sentMessages.at(-1).requestId, 1);
  assert.equal(sentMessages.at(-1).allowLongVideoAutoOpen, undefined);
  assert.equal(sentMessages.at(-1).allowYouTubeVisibleCaptionLayer, undefined);
  assert.equal(sentMessages.at(-1).allowYouTubeLocalWhisperAsr, undefined);
  assert.equal(sentMessages.at(-1).allowYouTubeCaptionTrack, true);
  assert.equal(sentMessages.at(-1).allowYouTubePlayerCaptionToggle, true);
  assert.equal(sentMessages.at(-1).preserveExistingYouTubeTranscriptOverlay, undefined);
  assert.equal(Object.hasOwn(sentMessages.at(-1), "apiKey"), false);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "idle");
  assert.equal(button.getAttribute("data-pbt-local-asr-request-id"), "none");
});

test("youtube transcript ordinary click does not expose local Whisper fallback errors", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const sentMessages = [];
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({
        ok: false,
        error: {
          code: "youtube_local_asr_whisper_unavailable",
          message: "Local Whisper is not reachable."
        }
      });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click();

  const hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].allowYouTubeLocalWhisperAsr, undefined);
  assert.equal(sentMessages[0].allowYouTubePlayerCaptionToggle, true);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "idle");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "none");
  assert.doesNotMatch(hint.textContent, /Whisper/);
  assert.doesNotMatch(hint.textContent, /127\.0\.0\.1:8765/);
  assert.match(hint.textContent, /没有读到 YouTube 字幕/);
});

test("youtube transcript floating button starts local Whisper ASR fallback only on Alt click and stops it on second click", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const video = el(document, "video", "");
  const sentMessages = [];

  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  video.currentTime = 1500;
  video.duration = 8583;
  player.appendChild(video);
  document.body.appendChild(player);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: true, status: "local_asr_started" });
        return;
      }

      if (message.type === "PBT_STOP_YOUTUBE_LOCAL_ASR") {
        callback({ ok: true, status: "local_asr_stopped" });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });

  const hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT");
  assert.equal(sentMessages[0].allowYouTubeVisibleCaptionLayer, undefined);
  assert.equal(sentMessages[0].allowYouTubeLocalWhisperAsr, true);
  assert.equal(sentMessages[0].allowYouTubeCaptionTrack, true);
  assert.equal(sentMessages[0].allowYouTubePlayerCaptionToggle, true);
  assert.equal(button.getAttribute("data-pbt-runtime-version"), "t120-youtube-caption-layout-v2");
  assert.equal(hint.getAttribute("data-pbt-runtime-version"), "t120-youtube-caption-layout-v2");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "local-asr-started");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "none");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "true");
  assert.equal(button.getAttribute("data-pbt-local-asr-request-id"), "1");
  assert.equal(button.getAttribute("data-pbt-local-asr-video-muted"), "false");
  assert.equal(button.getAttribute("data-pbt-local-asr-video-paused"), "false");
  assert.equal(hint.getAttribute("data-pbt-local-asr-state"), "local-asr-started");
  assert.match(hint.textContent, /本机 Whisper/);

  const rendered = api.renderYouTubeLocalAsrTranslation({
    requestId: 1,
    id: "asr-1",
    sourceText: "do not bring me flowers anymore",
    translatedText: "别再给我送花了"
  });
  const overlay = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-overlay"
  );

  assert.equal(rendered.ok, true);
  assert.equal(rendered.renderedCount, 1);
  assert.equal(overlay.getAttribute("data-pbt-local-asr-state"), "rendered");
  assert.equal(overlay.getAttribute("data-pbt-local-asr-error"), "none");
  assert.equal(overlay.getAttribute("data-pbt-local-asr-active"), "true");
  assert.equal(overlay.getAttribute("data-pbt-local-asr-request-id"), "1");
  assert.equal(
    overlay.textContent,
    youtubeOverlayText("别再给我送花了", "do not bring me flowers anymore")
  );
  assert.equal(overlay.getAttribute("data-pbt-sync-source"), "local_asr");
  assert.equal(overlay.getAttribute("data-pbt-sync-track"), "local_asr");

  button.click();

  assert.equal(sentMessages.at(-1).type, "PBT_STOP_YOUTUBE_LOCAL_ASR");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "stopped");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "false");
  assert.equal(
    findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-overlay"),
    null
  );
});

test("youtube local ASR clears session id for terminal status and rejects late render", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const video = el(document, "video", "");
  const sentMessages = [];

  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  video.currentTime = 1500;
  video.duration = 8583;
  player.appendChild(video);
  document.body.appendChild(player);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "local_asr_started" });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });

  const status = api.handleYouTubeLocalAsrStatus({
    requestId: 1,
    error: { code: "youtube_local_asr_no_audio_chunk", message: "No audio chunk." },
    active: false
  });
  const lateRender = api.renderYouTubeLocalAsrTranslation({
    requestId: 1,
    id: "asr-late",
    sourceText: "late local asr text",
    translatedText: "过期字幕"
  });

  assert.equal(status.ok, true);
  assert.equal(lateRender.ok, false);
  assert.equal(lateRender.error.code, "stale_youtube_local_asr_request");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "render-stale");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "stale_youtube_local_asr_request");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "false");
  assert.equal(
    findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-overlay"),
    null
  );
});

test("youtube local ASR clears pending session id when caption translation succeeds", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const captionWindow = el(document, "div", "");
  const captionSegment = el(document, "span", "current english caption");
  const sentMessages = [];

  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  captionWindow.setAttribute("class", "caption-window");
  captionSegment.setAttribute("class", "ytp-caption-segment");
  captionWindow.appendChild(captionSegment);
  player.appendChild(captionWindow);
  document.body.appendChild(player);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "translated", renderedCount: 1 });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click();

  const lateRender = api.renderYouTubeLocalAsrTranslation({
    requestId: 1,
    id: "asr-late",
    sourceText: "late local asr text",
    translatedText: "过期字幕"
  });

  assert.equal(sentMessages[0].allowYouTubeLocalWhisperAsr, undefined);
  assert.equal(lateRender.ok, false);
  assert.equal(lateRender.error.code, "stale_youtube_local_asr_request");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "render-stale");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "false");
});

test("youtube transcript floating button warns before local Whisper when video is muted", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const video = el(document, "video", "");
  const sentMessages = [];

  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  video.currentTime = 1500;
  video.duration = 8583;
  video.muted = true;
  video.volume = 1;
  video.paused = false;
  player.appendChild(video);
  document.body.appendChild(player);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({
        ok: false,
        error: {
          code: "youtube_local_asr_video_muted",
          message: "当前 YouTube 视频处于静音状态；请先取消静音，再点“幕”使用本机 Whisper。"
        }
      });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });

  const hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].allowYouTubeCaptionTrack, true);
  assert.equal(sentMessages[0].allowYouTubeVisibleCaptionLayer, undefined);
  assert.equal(sentMessages[0].allowYouTubeLocalWhisperAsr, true);
  assert.equal(button.hasAttribute("data-pbt-loading"), false);
  assert.equal(button.textContent, "!");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "preflight-muted");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_video_muted");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "false");
  assert.equal(button.getAttribute("data-pbt-local-asr-request-id"), "1");
  assert.equal(button.getAttribute("data-pbt-local-asr-video-muted"), "true");
  assert.equal(button.getAttribute("data-pbt-local-asr-video-paused"), "false");
  assert.equal(hint.getAttribute("data-pbt-local-asr-state"), "preflight-muted");
  assert.match(hint.textContent, /静音/);
  assert.match(hint.textContent, /再点“幕”/);
});

test("youtube transcript floating button warns before local Whisper when video is paused", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const video = el(document, "video", "");
  const sentMessages = [];

  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  video.currentTime = 1500;
  video.duration = 8583;
  video.muted = false;
  video.volume = 1;
  video.paused = true;
  player.appendChild(video);
  document.body.appendChild(player);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({
        ok: false,
        error: {
          code: "youtube_local_asr_video_paused",
          message: "当前 YouTube 视频已暂停；请先播放视频，再点“幕”使用本机 Whisper。"
        }
      });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });

  const hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].allowYouTubeCaptionTrack, true);
  assert.equal(sentMessages[0].allowYouTubeVisibleCaptionLayer, undefined);
  assert.equal(sentMessages[0].allowYouTubeLocalWhisperAsr, true);
  assert.equal(button.hasAttribute("data-pbt-loading"), false);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "preflight-paused");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_video_paused");
  assert.equal(button.getAttribute("data-pbt-local-asr-video-muted"), "false");
  assert.equal(button.getAttribute("data-pbt-local-asr-video-paused"), "true");
  assert.equal(hint.getAttribute("data-pbt-local-asr-state"), "preflight-paused");
  assert.match(hint.textContent, /已暂停/);
});

test("content script replaces stale runtime instead of returning early", async () => {
  const document = createDocument();
  const staleButton = el(document, "button", "幕", {
    "data-pbt-control": "youtube-transcript-toggle"
  });
  document.body.appendChild(staleButton);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    beforeRun(sandbox) {
      sandbox.PrivateBilingualTranslatorContent = { __runtimeVersion: "old-runtime" };
      sandbox.__PBT_CONTENT_LISTENER_ATTACHED__ = true;
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  assert.equal(api.__runtimeVersion, "t120-youtube-caption-layout-v2");
  assert.equal(staleButton.parentNode, null);
  assert.notEqual(button, null);
  assert.equal(button.getAttribute("data-pbt-runtime-version"), "t120-youtube-caption-layout-v2");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "idle");
});

test("youtube transcript floating button clears loading when runtime message fails", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        this.lastError = { message: "The message port closed before a response was received." };
        callback(undefined);
        this.lastError = null;
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });

  assert.equal(button.disabled, false);
  assert.equal(button.hasAttribute("data-pbt-loading"), false);
  assert.equal(button.textContent, "!");
});

test("youtube transcript floating button does not tell users to click the extension action for local ASR capture denial", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({
          ok: false,
          error: {
            code: "youtube_local_asr_active_tab_required",
            message: "Chrome requires an extension invocation before tab audio capture."
          }
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });

  const hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(button.disabled, false);
  assert.equal(button.hasAttribute("data-pbt-loading"), false);
  assert.equal(button.textContent, "!");
  assert.doesNotMatch(hint.textContent, /扩展工具栏/);
  assert.doesNotMatch(hint.textContent, /Private Bilingual Translator/);
  assert.match(hint.textContent, /YouTube 标签页激活/);
  assert.match(hint.textContent, /再点“幕”/);
});

test("youtube transcript floating button shows local Whisper chunk failures after ASR starts", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const sentMessages = [];
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: true, status: "local_asr_started" });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });
  const reported = api.handleYouTubeLocalAsrStatus({
    requestId: 1,
    active: false,
    error: {
      code: "youtube_local_asr_whisper_unavailable",
      message: "Local Whisper is not reachable."
    }
  });
  const hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(reported.ok, true);
  assert.equal(button.textContent, "!");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "whisper-unavailable");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_whisper_unavailable");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "false");
  assert.equal(hint.getAttribute("data-pbt-local-asr-state"), "whisper-unavailable");
  assert.match(hint.textContent, /本机 Whisper 服务没有响应/);
  assert.match(hint.textContent, /127\.0\.0\.1:8765/);
  assert.equal(sentMessages[0].allowYouTubeLocalWhisperAsr, true);
});

test("youtube transcript floating button shows local Whisper processing and missing audio chunk statuses", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: true, status: "local_asr_started" });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });
  const processing = api.handleYouTubeLocalAsrStatus({
    requestId: 1,
    active: true,
    error: {
      code: "youtube_local_asr_processing",
      message: "Local Whisper is processing the current audio chunk."
    }
  });
  let hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(processing.ok, true);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "processing");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_processing");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "true");
  assert.equal(hint.getAttribute("data-pbt-local-asr-state"), "processing");
  assert.match(hint.textContent, /正在识别当前音频片段/);

  const noSpeech = api.handleYouTubeLocalAsrStatus({
    requestId: 1,
    active: true,
    error: {
      code: "youtube_local_asr_no_speech",
      message: "Local Whisper did not return readable speech."
    }
  });
  hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(noSpeech.ok, true);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "no-speech");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_no_speech");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "true");
  assert.equal(hint.getAttribute("data-pbt-local-asr-state"), "no-speech");
  assert.match(hint.textContent, /没有识别到清晰英文语音/);

  const missingAudio = api.handleYouTubeLocalAsrStatus({
    requestId: 1,
    active: false,
    error: {
      code: "youtube_local_asr_no_audio_chunk",
      message: "No audio chunk was received from the current YouTube tab."
    }
  });
  hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(missingAudio.ok, true);
  assert.equal(button.textContent, "!");
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "no-audio-chunk");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_no_audio_chunk");
  assert.equal(button.getAttribute("data-pbt-local-asr-active"), "false");
  assert.equal(hint.getAttribute("data-pbt-local-asr-state"), "no-audio-chunk");
  assert.match(hint.textContent, /没有收到当前标签页音频块/);
  assert.match(hint.textContent, /没有静音/);
});

test("youtube local ASR diagnostics classify provider render and stale states", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: true, status: "local_asr_started" });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click({ altKey: true });

  const providerFailed = api.handleYouTubeLocalAsrStatus({
    requestId: 1,
    active: false,
    error: {
      code: "youtube_local_asr_provider_failed",
      message: "Provider did not return subtitles."
    }
  });
  assert.equal(providerFailed.ok, true);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "provider-failed");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_provider_failed");

  button.click({ altKey: true });

  const renderFailed = api.handleYouTubeLocalAsrStatus({
    requestId: 2,
    active: false,
    error: {
      code: "youtube_local_asr_render_failed",
      message: "Local ASR subtitles could not be rendered."
    }
  });
  assert.equal(renderFailed.ok, true);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "render-failed");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "youtube_local_asr_render_failed");

  button.click({ altKey: true });

  const staleRender = api.renderYouTubeLocalAsrTranslation({
    requestId: 99,
    id: "asr-stale",
    sourceText: "stale local ASR source",
    translatedText: "旧字幕"
  });
  assert.equal(staleRender.ok, false);
  assert.equal(staleRender.stale, true);
  assert.equal(button.getAttribute("data-pbt-local-asr-state"), "render-stale");
  assert.equal(button.getAttribute("data-pbt-local-asr-error"), "stale_youtube_local_asr_request");
});

test("youtube transcript runtime invalidation does not rethrow when getURL is unavailable", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  let contextInvalidated = false;
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        contextInvalidated = true;
        throw new Error("Extension context invalidated.");
      }

      callback({ ok: true });
    },
    getURL(path) {
      if (contextInvalidated) {
        throw new Error("Extension context invalidated.");
      }

      return `chrome-extension://test-id/${path}`;
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  assert.doesNotThrow(() => {
    button.click();
  });
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-panel"), null);
  assert.equal(
    findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"),
    null
  );
});

test("youtube transcript floating button shows a reload hint when the player caption request is not observed", async () => {
  const fixture = createYouTubeWatchFixture();
  let api = null;

  api = await loadYouTubeCaptionApi(fixture, {
    performanceEntries: [],
    async fetch() {
      throw new Error("caption fetch should not run");
    },
    sendMessage(message, callback) {
      if (message.type !== "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: true });
        return;
      }

      void api.collectYouTubeTranscriptSegmentsForTranslation({
        doc: fixture.document,
        requestId: message.requestId,
        allowYouTubeCaptionTrack: message.allowYouTubeCaptionTrack,
        allowYouTubePlayerCaptionToggle: message.allowYouTubePlayerCaptionToggle
      }).then((collected) => {
        callback({
          ok: false,
          status: collected.status,
          error: {
            code: "youtube_caption_track_token_missing",
            message: "The YouTube player caption request was not observed."
          }
        });
      });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findYouTubeControl(fixture.document, "youtube-transcript-toggle");

  button.click();

  assert.notEqual(findYouTubeControl(fixture.document, "youtube-native-caption-style"), null);

  await flushYouTubeTasks();
  const hint = findYouTubeControl(fixture.document, "youtube-transcript-hint");

  assert.equal(button.textContent, "!");
  assert.match(hint.textContent, /刷新 YouTube 页面/);
  assert.match(hint.textContent, /再点“幕”/);
  assert.equal(findYouTubeControl(fixture.document, "youtube-native-caption-style"), null);
});

test("youtube transcript floating button shows a visible hint when overlay render has no usable translations", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({
          ok: false,
          error: {
            code: "youtube_transcript_no_usable_translations",
            message: "The translation provider did not return usable transcript text."
          }
        });
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click();

  const hint = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-hint"
  );

  assert.equal(button.textContent, "!");
  assert.match(hint.textContent, /没有返回可显示的中文字幕/);
  assert.equal(hint.textContent.includes("The translation provider"), false);
});

test("youtube transcript floating button times out local loading when background never responds", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  const timers = [];
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    setTimeout(callback, delayMs) {
      const timer = { callback, delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  button.click();
  const loading = findNode(button, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-loading");
  const timeout = timers.find((timer) => timer.delayMs === 30000);

  assert.equal(button.getAttribute("data-pbt-loading"), "youtube-transcript");
  assert.equal(loading.style.animation, "pbt-spinner-rotate 680ms linear infinite");

  timeout.callback();

  assert.equal(button.hasAttribute("data-pbt-loading"), false);
  assert.equal(button.textContent, "!");
  assert.match(button.getAttribute("title"), /超过 30 秒/);
});

test("youtube transcript floating button second click cancels local loading and ignores late render", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 3 });
  const timers = [];
  let pendingCallback = null;
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    setTimeout(callback, delayMs) {
      const timer = { callback, delayMs, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      timer.cleared = true;
    },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        pendingCallback = callback;
        return;
      }

      callback({ ok: true });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findYouTubeControl(fixture.document, "youtube-transcript-toggle");

  button.click();
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    requestId: 1,
    allowYouTubeCaptionTrack: true
  });
  const timeout = timers.find((timer) => timer.delayMs === 30000);

  assert.equal(button.getAttribute("data-pbt-loading"), "youtube-transcript");
  assert.notEqual(findYouTubeOverlay(fixture.document), null);

  button.click();

  assert.equal(timeout.cleared, true);
  assert.equal(button.hasAttribute("data-pbt-loading"), false);
  assert.equal(button.textContent, "幕");
  assert.equal(findYouTubeOverlay(fixture.document), null);

  const staleRender = api.renderYouTubeTranscriptTranslations({
    requestId: 1,
    videoId: "test-video",
    translations: manualCaptionFixtureTranslations(collected.segments)
  });

  assert.equal(staleRender.ok, false);
  assert.equal(staleRender.error.code, "stale_youtube_transcript_request");

  pendingCallback({ ok: true, status: "translated", renderedCount: 1 });

  assert.equal(button.getAttribute("data-pbt-active"), "false");
  assert.equal(button.textContent, "幕");
});

test("youtube transcript floating button is positioned at the video bottom right", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 100, top: 50, right: 900, bottom: 550, width: 800, height: 500 };
  document.body.appendChild(player);

  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  assert.equal(button.style.display, "inline-flex");
  assert.equal(button.parentNode, player);
  assert.equal(button.style.right, "18px");
  assert.equal(button.style.bottom, "72px");
});

test("youtube transcript floating button is hidden outside watch pages", async () => {
  const document = createDocument();
  const player = el(document, "div", "", { id: "movie_player" });
  player.rect = { left: 80, top: 40, right: 880, bottom: 520, width: 800, height: 480 };
  document.body.appendChild(player);
  const api = await loadContentApi(document, {
    location: { href: "https://www.youtube.com/" }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findNode(
    document.body,
    (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "youtube-transcript-toggle"
  );

  assert.equal(button.style.display, "none");
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
  paragraph.appendChild(el(document, "code", "README.md"));
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
  assert.equal(paragraph.textContent, "你创建了一个 README.md 并把每条规则都放了进去。");
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

  assert.equal(sentMessages.length, 9);
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
  assert.equal(sentMessages[7].type, "PBT_SET_FLOATING_CONTROLS_HIDDEN");
  assert.equal(sentMessages[7].hidden, true);
  assert.equal(sentMessages[8].type, "PBT_SET_FLOATING_CONTROLS_HIDDEN");
  assert.equal(sentMessages[8].hidden, false);
});

test("floating controls follow global hidden state from page status and runtime sync", async () => {
  const document = createDocument();
  document.body.appendChild(el(document, "p", "Readable paragraph"));
  const portMessages = [];
  let connectName = "";

  const api = await loadContentApi(document, {
    connect(options) {
      connectName = options?.name ?? "";

      return {
        onMessage: {
          addListener(listener) {
            portMessages.push(listener);
          }
        },
        onDisconnect: {
          addListener() {}
        },
        postMessage() {}
      };
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    floatingControlsHidden: true
  });

  const panel = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "floating-panel");
  const showHandle = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "show-handle");

  assert.ok(panel);
  assert.equal(panel.getAttribute("data-pbt-hidden"), "true");
  assert.equal(showHandle.style.display, "block");
  assert.equal(connectName, "pbt-floating-controls");
  assert.equal(portMessages.length, 1);

  portMessages[0]({
    type: "PBT_APPLY_FLOATING_CONTROLS_HIDDEN",
    floatingControlsHidden: false
  });

  assert.equal(panel.getAttribute("data-pbt-hidden"), "false");
  assert.equal(showHandle.style.display, "none");

  portMessages[0]({
    type: "PBT_APPLY_FLOATING_CONTROLS_HIDDEN",
    floatingControlsHidden: true
  });

  assert.equal(panel.getAttribute("data-pbt-hidden"), "true");
  assert.equal(showHandle.style.display, "block");
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

test("restore page does not reapply cached replace translations from restore mutations", async () => {
  const document = createDocument();
  const nav = el(document, "nav", "Home");
  const account = el(document, "div", "Account menu", { "data-testid": "SideNav_AccountSwitcher_Button" });
  document.body.appendChild(nav);
  document.body.appendChild(account);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/example" },
    mutationObserver: true,
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    sendMessage(message, callback) {
      sentMessages.push(message);
      callback({ ok: true, status: "replaced" });
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "natural",
    displayMode: "replace",
    paidProvider: "custom_openai",
    autoTranslate: true
  });
  const collected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [
      { id: collected.segments[0].id, text: "首页" },
      { id: collected.segments[1].id, text: "账号菜单" }
    ]
  });

  const restored = api.restorePage();
  api.__mutationObservers[0].trigger([
    { type: "characterData", target: nav.childNodes[0] },
    { type: "characterData", target: account.childNodes[0] }
  ]);

  assert.equal(restored.restoredCount, 2);
  assert.equal(nav.textContent, "Home");
  assert.equal(account.textContent, "Account menu");
  assert.equal(nav.hasAttribute("data-pbt-replaced"), false);
  assert.equal(account.hasAttribute("data-pbt-replaced"), false);
  assert.equal(sentMessages.length, 0);
});

test("floating restore reloads when direct translation markers lost their restore snapshots", async () => {
  const document = createDocument();
  const nav = el(document, "nav", "首页");
  nav.setAttribute("data-pbt-replaced", "true");
  document.body.appendChild(nav);
  const sentMessages = [];
  let reloadCalled = false;
  let api;

  api = await loadContentApi(document, {
    location: {
      href: "https://x.com/example",
      reload() {
        reloadCalled = true;
      }
    },
    sendMessage(message, callback) {
      sentMessages.push(message);

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
    paidProvider: "gemini"
  });
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.equal(translateButton.textContent, "译✓");

  translateButton.click();

  assert.equal(reloadCalled, true);
  assert.equal(sentMessages.some((message) => message.type === "PBT_RESTORE_PAGE"), true);
  assert.equal(sentMessages.some((message) => message.type === "PBT_TRANSLATE_PAGE"), false);
});

test("floating translate button shows spinner while request is pending", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);
  let pendingCallback = null;
  let collected = null;
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_PAGE") {
        collected = api.collectSegments(document, { showPendingIndicators: true });
        pendingCallback = () => {
          api.renderTranslations({
            displayMode: "replace",
            translations: [{ id: collected.segments[0].id, text: "已翻译段落" }]
          });
          callback({ ok: true, status: "replaced" });
        };
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

  translateButton.click();

  const loading = findNode(translateButton, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-loading");
  const pendingIndicator = findNode(paragraph, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translation-pending");
  const pendingSpinner = findNode(pendingIndicator, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translation-pending-spinner");

  assert.match(style.textContent, /@keyframes pbt-spinner-rotate/);
  assert.equal(translateButton.disabled, true);
  assert.equal(translateButton.getAttribute("data-pbt-loading"), "translate");
  assert.equal(translateButton.getAttribute("title"), "正在翻译当前网址");
  assert.equal(translateButton.textContent, "");
  assert.equal(loading.getAttribute("data-pbt-control"), "translate-loading");
  assert.equal(loading.style.animation, "pbt-spinner-rotate 680ms linear infinite");
  assert.equal(pendingSpinner.style.animation, "pbt-spinner-rotate 680ms linear infinite");
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);

  pendingCallback();

  assert.equal(translateButton.disabled, false);
  assert.equal(translateButton.hasAttribute("data-pbt-loading"), false);
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));
  assert.equal(paragraph.textContent, "已翻译段落");
  assert.equal(countPendingIndicators(document.body), 0);
});

test("floating translate clears loading spinner when runtime message fails", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Original paragraph");
  document.body.appendChild(paragraph);
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_PAGE") {
        api.collectSegments(document, { showPendingIndicators: true });
        this.lastError = { message: "The message port closed before a response was received." };
        callback(undefined);
        this.lastError = null;
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

  translateButton.click();

  assert.equal(translateButton.disabled, false);
  assert.equal(translateButton.hasAttribute("data-pbt-loading"), false);
  assert.equal(translateButton.textContent, "!");
  assert.equal(countPendingIndicators(document.body), 0);
});

test("floating translate paints loading spinner before sending the request", async () => {
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

  translateButton.click();

  assert.equal(translateButton.disabled, true);
  assert.equal(findNode(translateButton, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-loading").style.animation, "pbt-spinner-rotate 680ms linear infinite");
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);
  assert.equal(sentMessages.length, 0);
  assert.equal(frameCallbacks.length, 1);

  frameCallbacks[0]();

  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[1].type, "PBT_SET_SITE_TRANSLATION_SETTINGS");
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

  translateButton.click();
  assert.equal(sentMessages.length, 0);
  assert.equal(frameCallbacks.length, 1);

  frameCallbacks[0]();
  assert.equal(paragraph.textContent, "已翻译段落");
  assert.equal(translateButton.textContent, "译✓");
  assert.ok(getTranslateCheckmark(translateButton));
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);

  translateButton.click();

  assert.equal(frameCallbacks.length, 1);
  assert.equal(paragraph.textContent, "Original paragraph");
  assert.equal(translateButton.textContent, "译");
  assert.equal(getTranslateCheckmark(translateButton), null);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);
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

test("floating translate click restores rendered text and removes stale ui when extension context is invalidated", async () => {
  const document = createDocument();
  const paragraph = el(document, "p", "Readable paragraph");
  document.body.appendChild(paragraph);
  let contextInvalidated = false;
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/article" },
    sendMessage() {
      contextInvalidated = true;
      throw new Error("Extension context invalidated.");
    },
    getURL(path) {
      if (contextInvalidated) {
        throw new Error("Extension context invalidated.");
      }

      return `chrome-extension://test-id/${path}`;
    }
  });

  api.showFloatingTranslateButton({
    qualityMode: "free",
    displayMode: "bilingual",
    paidProvider: "custom_openai"
  });
  const collected = api.collectSegments(document);
  api.renderTranslations({
    displayMode: "replace",
    translations: [{ id: collected.segments[0].id, text: "已翻译段落" }]
  });
  const translateButton = findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-toggle");

  assert.doesNotThrow(() => {
    translateButton.click();
  });
  assert.equal(paragraph.textContent, "Readable paragraph");
  assert.equal(paragraph.hasAttribute("data-pbt-replaced"), false);
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

test("floating auto translation shows pending spinner on new source text", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  let pendingCallback = null;
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        api.collectSegments(document, {
          incremental: message.incremental === true,
          showPendingIndicators: true
        });
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

  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [secondParagraph], target: document.body }
  ]);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].incremental, true);
  assert.equal(countPendingIndicators(secondParagraph), 1);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);

  pendingCallback({ ok: true, status: "bilingual" });

  assert.equal(countPendingIndicators(document.body), 0);
});

test("floating auto translation clears pending spinner when runtime message fails", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://example.com/lecture" },
    mutationObserver: true,
    immediateTimers: true,
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        api.collectSegments(document, {
          incremental: message.incremental === true,
          showPendingIndicators: true
        });
        this.lastError = { message: "The message port closed before a response was received." };
        callback(undefined);
        this.lastError = null;
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

  const secondParagraph = el(document, "p", "Second paragraph");
  document.body.appendChild(secondParagraph);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [secondParagraph], target: document.body }
  ]);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
  assert.equal(sentMessages[0].incremental, true);
  assert.equal(countPendingIndicators(document.body), 0);
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

test("floating auto translation ignores transient hover overlays", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const timerDelays = [];

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/example/status/1" },
    mutationObserver: true,
    setTimeout(callback, delay) {
      timerDelays.push(delay);
      return callback;
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

  const hoverCard = el(document, "div", "", { "data-testid": "HoverCard" });
  hoverCard.appendChild(el(document, "p", "Hover biography preview paragraph."));
  document.body.appendChild(hoverCard);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [hoverCard], target: document.body }
  ]);

  const tooltip = el(document, "div", "Tooltip helper text.", { role: "tooltip" });
  document.body.appendChild(tooltip);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [tooltip], target: document.body }
  ]);

  assert.deepEqual(timerDelays, []);
  assert.equal(sentMessages.length, 0);
  assert.equal(countPendingIndicators(document.body), 0);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);
});

test("floating auto translation follows new social scroll content", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const collectedByMessage = [];
  const timerDelays = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://www.reddit.com/r/example/comments/abc/post/" },
    mutationObserver: true,
    setTimeout(callback, delay) {
      timerDelays.push(delay);
      callback();
      return 1;
    },
    clearTimeout() {},
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        collectedByMessage.push(api.collectSegments(document, {
          incremental: message.incremental === true,
          showPendingIndicators: true
        }));
      }

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

  const lateComment = el(document, "article", "");
  lateComment.appendChild(el(document, "p", "Late comment paragraph should auto translate."));
  document.body.appendChild(lateComment);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [lateComment], target: document.body }
  ]);

  const translateMessages = sentMessages.filter((message) => message.type === "PBT_TRANSLATE_PAGE");

  assert.deepEqual(timerDelays, [80]);
  assert.equal(translateMessages.length, 1);
  assert.equal(translateMessages[0].incremental, true);
  assert.deepEqual(Array.from(collectedByMessage[0].segments, (segment) => segment.text), [
    "Late comment paragraph should auto translate."
  ]);
  assert.equal(countPendingIndicators(document.body), 0);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);
});

test("floating auto translation follows new X scroll content", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const collectedByMessage = [];
  const timerDelays = [];
  let api;

  api = await loadContentApi(document, {
    location: { href: "https://x.com/example/status/1" },
    mutationObserver: true,
    setTimeout(callback, delay) {
      timerDelays.push(delay);
      callback();
      return 1;
    },
    clearTimeout() {},
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type === "PBT_TRANSLATE_PAGE") {
        collectedByMessage.push(api.collectSegments(document, {
          incremental: message.incremental === true,
          showPendingIndicators: true
        }));
      }

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

  const latePost = el(document, "article", "");
  latePost.appendChild(el(document, "p", "Late X post paragraph should auto translate."));
  latePost.appendChild(el(document, "div", "2.4K", { role: "button", "aria-label": "2458 reposts. Repost" }));
  latePost.appendChild(el(document, "a", "453.6K", { href: "/example/status/1/analytics" }));
  latePost.appendChild(el(document, "a", "b00kd.com", { href: "https://t.co/example" }));
  document.body.appendChild(latePost);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [latePost], target: document.body }
  ]);

  const translateMessages = sentMessages.filter((message) => message.type === "PBT_TRANSLATE_PAGE");

  assert.deepEqual(timerDelays, [80]);
  assert.equal(translateMessages.length, 1);
  assert.equal(translateMessages[0].incremental, true);
  assert.deepEqual(Array.from(collectedByMessage[0].segments, (segment) => segment.text), [
    "Late X post paragraph should auto translate."
  ]);
});

test("floating auto translation ignores secondary recommendation rail mutations", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];
  const timerDelays = [];

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/example/status/1" },
    mutationObserver: true,
    setTimeout(callback, delay) {
      timerDelays.push(delay);
      return callback;
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

  const rightRail = el(document, "div", "", { "data-testid": "sidebarColumn" });
  rightRail.appendChild(el(document, "p", "Live sidebar card should not auto translate."));
  document.body.appendChild(rightRail);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [rightRail], target: document.body }
  ]);

  assert.deepEqual(timerDelays, []);
  assert.equal(sentMessages.length, 0);
  assert.equal(countPendingIndicators(document.body), 0);
});

test("floating auto translation ignores cached reuse inside secondary recommendation rails", async () => {
  const document = createDocument();
  const article = el(document, "article", "");
  article.appendChild(el(document, "p", "Main paragraph."));
  document.body.appendChild(article);
  const initialRail = el(document, "div", "", { "data-testid": "sidebarColumn" });
  initialRail.appendChild(el(document, "p", "Stable sidebar item."));
  document.body.appendChild(initialRail);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/example/status/1" },
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
    translations: Array.from(firstCollected.segments, (segment) => ({
      id: segment.id,
      text: segment.text === "Stable sidebar item." ? "稳定侧栏项目。" : "主段落。"
    }))
  });

  initialRail.remove();
  const returningRail = el(document, "div", "", { "data-testid": "sidebarColumn" });
  returningRail.appendChild(el(document, "p", "Stable sidebar item."));
  document.body.appendChild(returningRail);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [returningRail], target: document.body }
  ]);

  assert.equal(sentMessages.length, 0);
  assert.equal(returningRail.textContent, "Stable sidebar item.");
  assert.equal(countPendingIndicators(document.body), 0);
});

test("floating auto translation reuses cached bilingual translation when virtualized social content returns", async () => {
  const document = createDocument();
  const firstArticle = el(document, "article", "");
  firstArticle.appendChild(el(document, "p", "Returning comment paragraph."));
  document.body.appendChild(firstArticle);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/example/status/1" },
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
    translations: [{ id: firstCollected.segments[0].id, text: "回来的评论段落。" }]
  });

  firstArticle.remove();

  const returningArticle = el(document, "article", "");
  returningArticle.appendChild(el(document, "p", "Returning comment paragraph."));
  document.body.appendChild(returningArticle);
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [returningArticle], target: document.body }
  ]);

  assert.equal(sentMessages.length, 0);
  assert.equal(returningArticle.textContent, "Returning comment paragraph.回来的评论段落。");
  assert.equal(countPendingIndicators(document.body), 0);
});

test("floating auto translation reuses cached bilingual translation when page removes the marker", async () => {
  const document = createDocument();
  const article = el(document, "article", "");
  const paragraph = el(document, "p", "Stable comment paragraph.");
  article.appendChild(paragraph);
  document.body.appendChild(article);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://x.com/example/status/1" },
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
    translations: [{ id: firstCollected.segments[0].id, text: "稳定的评论段落。" }]
  });

  const marker = findNode(paragraph, (node) => node.nodeType === 1 && node.hasAttribute("data-pbt-translation"));
  marker.remove();
  api.__mutationObservers[0].trigger([
    { type: "childList", addedNodes: [], removedNodes: [marker], target: paragraph }
  ]);

  assert.equal(sentMessages.length, 0);
  assert.equal(paragraph.textContent, "Stable comment paragraph.稳定的评论段落。");
  assert.equal(countPendingIndicators(document.body), 0);
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
        collectedByMessage.push(api.collectSegments(document, {
          incremental: message.incremental === true,
          showPendingIndicators: true
        }));
      }

      pendingCallbacks.push(callback);
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
  assert.equal(countPendingIndicators(document.body), 2);
  assert.equal(findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translate-progress"), null);

  pendingCallbacks[0]({ ok: true, status: "bilingual" });
  assert.equal(countPendingIndicators(document.body), 2);
  pendingCallbacks[1]({ ok: true, status: "bilingual" });
  assert.equal(countPendingIndicators(document.body), 0);
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

test("floating replace translation reuses cache when a dynamic page restores the same source text", async () => {
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

  assert.equal(sentMessages.length, 0);
  assert.equal(headline.textContent, "欢迎标题");
});

test("floating replace translation sends provider request when a dynamic page changes to new source text", async () => {
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
  headline.childNodes[0].nodeValue = "Updated headline";
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

test("floating replace translation reuses cache for stale overwrites after render", async () => {
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

  assert.equal(translateMessages.length, 1);
  assert.equal(headline.textContent, "已水合标题");
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
  assert.equal(api.__mutationObservers[0].observerOptions.attributeOldValue, true);
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

test("floating translation ignores cosmetic class and style attribute changes", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
  const sentMessages = [];

  const api = await loadContentApi(document, {
    location: { href: "https://example.com/live" },
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

  const liveCard = el(document, "aside", "Live stream status");
  document.body.appendChild(liveCard);

  liveCard.setAttribute("class", "pulse-on");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "class", oldValue: "pulse-off", target: liveCard }
  ]);

  liveCard.setAttribute("style", "transform: translateY(1px)");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "style", oldValue: "transform: translateY(0px)", target: liveCard }
  ]);

  liveCard.setAttribute("class", "active pulse-2");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "class", oldValue: "active pulse-1", target: liveCard }
  ]);

  assert.equal(sentMessages.length, 0);
  assert.equal(countPendingIndicators(document.body), 0);
});

test("floating translation reruns when class reveals content", async () => {
  const document = createDocument();
  const firstParagraph = el(document, "p", "First paragraph");
  document.body.appendChild(firstParagraph);
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

  const tabPanel = el(document, "section", "Active tab paragraph", { class: "hidden" });
  document.body.appendChild(tabPanel);
  tabPanel.setAttribute("class", "active");
  api.__mutationObservers[0].trigger([
    { type: "attributes", attributeName: "class", oldValue: "hidden", target: tabPanel }
  ]);

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_PAGE");
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
    location: { href: "https://docs.example.test/guide/zh-cn/lectures/lecture-01-why-capable-agents-still-fail/" },
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
    location: { href: "https://docs.example.test/guide/" },
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
    location: { href: "https://docs.example.test/guide/" },
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

test("youtube transcript plugin-owned mutations do not reschedule transcript button controls", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1.2 });
  const frameCallbacks = [];
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    mutationObserver: true,
    requestAnimationFrame(callback) {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  api.renderYouTubeTranscriptTranslations({ translations: manualCaptionFixtureTranslations(collected.segments) });

  const overlay = findYouTubeOverlay(fixture.document);
  const observer = api.__mutationObservers[0];

  observer.trigger([
    { type: "attributes", attributeName: "style", target: overlay }
  ]);
  observer.trigger([
    { type: "characterData", target: overlay.childNodes[0] }
  ]);
  observer.trigger([
    { type: "childList", target: fixture.document.body, addedNodes: [overlay], removedNodes: [] }
  ]);

  assert.equal(frameCallbacks.length, 0);

  const pageUpdate = el(fixture.document, "div", "Recommended video title");
  fixture.document.body.appendChild(pageUpdate);
  observer.trigger([
    { type: "childList", target: fixture.document.body, addedNodes: [pageUpdate], removedNodes: [] }
  ]);

  assert.equal(frameCallbacks.length, 1);
});

test("youtube caption collector reuses the player's timed text request for the current video", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 3 });
  const fetched = [];
  const stalePlayerResponse = {
    videoDetails: { videoId: "old-video" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [{ languageCode: "fr", baseUrl: "https://www.youtube.com/api/timedtext?v=old-video&lang=fr" }]
      }
    }
  };

  fixture.document.body.appendChild(el(
    fixture.document,
    "script",
    `var ytInitialPlayerResponse = ${JSON.stringify(stalePlayerResponse)};`
  ));

  const api = await loadYouTubeCaptionApi(fixture, {
    performanceEntries: [
      { name: youtubeTimedTextRequestUrl({ v: "old-video", lang: "fr", pot: "old-pot" }) },
      { name: youtubeTimedTextRequestUrl({ lang: "zh-CN", tlang: "zh-Hans" }) },
      { name: "https://www.youtube.com/api/timedtext?v=test-video&lang=en" }
    ],
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }, fetched)
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  const requestUrl = fetched[0].url;

  assert.equal(collected.status, "ready");
  assert.equal(collected.source, "caption_track");
  assert.equal(collected.videoId, "test-video");
  assert.equal(fetched.length, 1);
  assert.equal(`${requestUrl.origin}${requestUrl.pathname}`, "https://www.youtube.com/api/timedtext");
  assert.equal(requestUrl.searchParams.get("v"), "test-video");
  assert.equal(requestUrl.searchParams.get("lang"), "en");
  assert.equal(requestUrl.searchParams.get("pot"), "player-pot-token");
  assert.equal(requestUrl.searchParams.get("tlang"), null);
  assert.equal(requestUrl.searchParams.get("kind"), null);
  assert.equal(requestUrl.searchParams.get("fmt"), "json3");
  assert.equal(fetched[0].options.credentials, "omit");
  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), [
    "Now, when a normal student writes a paper, they spread the work out.",
    "Then they finish.",
    "Much later line."
  ]);
});

test("youtube caption collector prefers the current video's listed English manual track", async () => {
  const fixture = createYouTubeWatchFixture();
  const fetched = [];
  const playerResponse = {
    videoDetails: { videoId: "test-video" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [
          { languageCode: "en", kind: "asr", name: { simpleText: "English (auto-generated)" } },
          { languageCode: "en-GB", name: { simpleText: "English (United Kingdom)" } }
        ]
      }
    }
  };

  fixture.document.body.appendChild(el(
    fixture.document,
    "script",
    `var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};`
  ));

  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ "en-GB": manualCaptionFixturePayload() }, fetched)
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  assert.equal(collected.status, "ready");
  assert.deepEqual(fetched.map((entry) => entry.key), ["en-GB"]);
});

test("youtube caption collector stops before touching CC when the current video has no English track", async () => {
  const fixture = createYouTubeWatchFixture();
  const fetched = [];
  let clicks = 0;
  const playerResponse = {
    videoDetails: { videoId: "test-video" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [{ languageCode: "fr", name: { simpleText: "French" } }]
      }
    }
  };

  fixture.captionButton.addEventListener("click", () => {
    clicks += 1;
  });
  fixture.document.body.appendChild(el(
    fixture.document,
    "script",
    `var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};`
  ));

  const api = await loadYouTubeCaptionApi(fixture, {
    performanceEntries: [],
    fetch: createYouTubeCaptionFetch({}, fetched)
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true,
    allowYouTubePlayerCaptionToggle: true
  });

  assert.equal(collected.status, "caption_track_not_english");
  assert.equal(clicks, 0);
  assert.equal(fetched.length, 0);
});

test("youtube caption collector turns CC on once to capture the player request and then restores it", async () => {
  const fixture = createYouTubeWatchFixture();
  const fetched = [];
  let clicks = 0;
  let api = null;

  fixture.captionButton.addEventListener("click", () => {
    const wasOn = fixture.captionButton.getAttribute("aria-pressed") === "true";
    clicks += 1;
    fixture.captionButton.setAttribute("aria-pressed", wasOn ? "false" : "true");

    if (!wasOn) {
      api.__performanceObservers[0].emit([{ name: youtubeTimedTextRequestUrl({ lang: "zh-CN" }) }]);
    }
  });

  api = await loadYouTubeCaptionApi(fixture, {
    performanceEntries: [],
    performanceObserver: true,
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }, fetched)
  });

  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true,
    allowYouTubePlayerCaptionToggle: true
  });
  const observer = api.__performanceObservers[0];
  const nativeCaptionStyle = findYouTubeControl(fixture.document, "youtube-native-caption-style");

  assert.equal(collected.status, "ready");
  assert.equal(observer.observerOptions.type, "resource");
  assert.equal(observer.observerOptions.buffered, true);
  assert.equal(clicks, 2);
  assert.equal(fixture.captionButton.getAttribute("aria-pressed"), "false");
  assert.deepEqual(fetched.map((entry) => entry.key), ["en"]);
  assert.match(nativeCaptionStyle.textContent, /ytp-caption-window-container\{visibility:hidden !important;\}/);
});

test("youtube caption collector reports why the player caption request is unavailable", async () => {
  const cases = [
    { name: "missing CC button", fixture: { captionButton: false }, status: "caption_track_missing" },
    { name: "disabled CC button", fixture: { captionButtonAttributes: { "aria-disabled": "true" } }, status: "caption_track_missing" },
    { name: "request not observed", fixture: {}, status: "caption_track_token_missing" },
    { name: "CC label says captions cannot be shown", fixture: { captionButtonAttributes: { "aria-label": "无法显示字幕" } }, status: "caption_track_token_missing" },
    { name: "ad showing", fixture: { playerClass: "html5-video-player ad-showing" }, status: "caption_track_ad_showing" }
  ];

  for (const entry of cases) {
    const fixture = createYouTubeWatchFixture(entry.fixture);
    let fetchCalled = false;
    const api = await loadYouTubeCaptionApi(fixture, {
      performanceEntries: [],
      async fetch() {
        fetchCalled = true;
        return { ok: true, async text() { return ""; } };
      }
    });
    const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
      doc: fixture.document,
      allowYouTubeCaptionTrack: true,
      allowYouTubePlayerCaptionToggle: true
    });

    assert.equal(collected.status, entry.status, entry.name);
    assert.equal(collected.segments.length, 0, entry.name);
    assert.equal(fetchCalled, false, entry.name);
  }
});

test("youtube caption collector still asks the player for captions when the CC label says they cannot be shown", async () => {
  const fixture = createYouTubeWatchFixture({
    captionButtonAttributes: { "aria-label": "无法显示字幕", "aria-pressed": "true" }
  });
  const fetched = [];
  let clicks = 0;
  let api = null;

  fixture.captionButton.addEventListener("click", () => {
    clicks += 1;

    if (clicks === 2) {
      api.__performanceObservers[0].emit([{ name: youtubeTimedTextRequestUrl({ kind: "asr" }) }]);
    }
  });

  api = await loadYouTubeCaptionApi(fixture, {
    performanceEntries: [],
    performanceObserver: true,
    fetch: createYouTubeCaptionFetch({ "en|asr": asrCaptionFixturePayload() }, fetched)
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true,
    allowYouTubePlayerCaptionToggle: true
  });

  assert.equal(collected.status, "ready");
  assert.equal(clicks, 2);
  assert.deepEqual(fetched.map((entry) => entry.key), ["en", "en|asr"]);
});

test("youtube caption collector does not report missing captions when the current video lists English tracks", async () => {
  const fixture = createYouTubeWatchFixture({ captionButton: false });
  const playerResponse = {
    videoDetails: { videoId: "test-video" },
    captions: {
      playerCaptionsTracklistRenderer: {
        captionTracks: [{ languageCode: "en", kind: "asr", name: { simpleText: "English (auto-generated)" } }]
      }
    }
  };

  fixture.document.body.appendChild(el(
    fixture.document,
    "script",
    `var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};`
  ));

  const api = await loadYouTubeCaptionApi(fixture, {
    performanceEntries: [],
    fetch: createYouTubeCaptionFetch({})
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true,
    allowYouTubePlayerCaptionToggle: true
  });

  assert.equal(collected.status, "caption_track_token_missing");
});

test("youtube caption collector requires the caption permission and a watch page", async () => {
  let fetchCalled = false;
  const fetch = async () => {
    fetchCalled = true;
    return { ok: true, async text() { return ""; } };
  };
  const watchFixture = createYouTubeWatchFixture();
  const watchApi = await loadYouTubeCaptionApi(watchFixture, { fetch });
  const searchFixture = createYouTubeWatchFixture();
  const searchApi = await loadYouTubeCaptionApi(searchFixture, {
    location: { href: "https://www.youtube.com/results?search_query=captions" },
    fetch
  });

  const notAllowed = await watchApi.collectYouTubeTranscriptSegmentsForTranslation({ doc: watchFixture.document });
  const unsupported = await searchApi.collectYouTubeTranscriptSegmentsForTranslation({
    doc: searchFixture.document,
    allowYouTubeCaptionTrack: true
  });

  assert.equal(notAllowed.status, "caption_track_not_allowed");
  assert.equal(unsupported.status, "unsupported_page");
  assert.equal(fetchCalled, false);
});

test("youtube caption collector falls back to the auto-generated track and merges words into sentences", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1.5 });
  const fetched = [];
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ "en|asr": asrCaptionFixturePayload() }, fetched)
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.equal(collected.status, "ready");
  assert.deepEqual(fetched.map((entry) => entry.key), ["en", "en|asr"]);
  assert.deepEqual(Array.from(collected.segments, (segment) => segment.text), [
    "so today we talk about captions",
    "[Music]",
    "next part"
  ]);
  assert.equal(overlay.textContent, "so today we talk about captions");
  assert.equal(overlay.getAttribute("data-pbt-sync-track"), "asr");
  assert.equal(overlay.getAttribute("data-pbt-sync-cue"), "1.00");
  assert.equal(overlay.getAttribute("data-pbt-sync-cue-end"), "3.60");
});

test("youtube caption collector groups auto-generated tracks without word timing by caption lines", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 7 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ "en|asr": manualCaptionFixturePayload() })
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.equal(collected.status, "ready");
  assert.equal(collected.segments.length, 3);
  assert.equal(overlay.getAttribute("data-pbt-sync-track"), "asr_lines");
  assert.equal(overlay.getAttribute("data-pbt-sync-cue"), "6.50");
});

test("youtube caption collector reports caption fetch failures", async () => {
  const fixture = createYouTubeWatchFixture();
  const api = await loadYouTubeCaptionApi(fixture, {
    async fetch() {
      throw new Error("network down");
    }
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  assert.equal(collected.status, "caption_track_fetch_failed");
  assert.equal(collected.segments.length, 0);
  assert.equal(findYouTubeOverlay(fixture.document), null);
});

test("youtube caption overlay follows video currentTime instead of player control text", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 3 });
  const staleControlTime = el(fixture.document, "span", "0:41", { class: "ytp-time-current" });
  const previewVideo = el(fixture.document, "video", "");

  staleControlTime.rect = { left: 120, top: 520, right: 160, bottom: 540, width: 40, height: 20 };
  fixture.player.appendChild(staleControlTime);
  fixture.player.getCurrentTime = () => 41;
  previewVideo.currentTime = 12.5;
  fixture.document.body.appendChild(previewVideo);

  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() })
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.equal(overlay.textContent, "Now, when a normal student writes a paper, they spread the work out.");
  assert.equal(overlay.getAttribute("data-pbt-sync-status"), "source_only");

  const rendered = api.renderYouTubeTranscriptTranslations({
    videoId: "test-video",
    translations: manualCaptionFixtureTranslations(collected.segments)
  });

  assert.equal(rendered.renderedCount, 3);
  assert.equal(
    overlay.textContent,
    youtubeOverlayText("现在，普通学生写论文时会把工作分散开。", "Now, when a normal student writes a paper, they spread the work out.")
  );
  assert.equal(overlay.style.display, "block");
  assert.equal(overlay.parentNode, fixture.player);
  assert.equal(overlay.style.left, "50%");
  assert.equal(overlay.style.bottom, "82px");
  assert.equal(overlay.style.fontSize, "18px");
  assert.equal(overlay.getAttribute("data-pbt-sync-source"), "caption_track");
  assert.equal(overlay.getAttribute("data-pbt-sync-track"), "manual");
  assert.equal(overlay.getAttribute("data-pbt-sync-status"), "translated");
  assert.equal(overlay.getAttribute("data-pbt-sync-playback"), "3.00");
  assert.equal(overlay.getAttribute("data-pbt-sync-cue"), "0.00");
  assert.equal(overlay.getAttribute("data-pbt-sync-cue-end"), "6.50");

  fixture.video.currentTime = 6.49;
  fixture.video.dispatchEvent("timeupdate");
  assert.match(overlay.textContent, /^现在/);

  fixture.video.currentTime = 6.5;
  fixture.video.dispatchEvent("timeupdate");
  assert.equal(overlay.textContent, youtubeOverlayText("然后他们就写完了。", "Then they finish."));

  fixture.video.currentTime = 10;
  fixture.video.dispatchEvent("timeupdate");
  assert.equal(overlay.style.display, "none");
  assert.equal(overlay.textContent, "");
  assert.equal(overlay.getAttribute("data-pbt-sync-status"), "no_cue");

  fixture.video.currentTime = 12.5;
  fixture.video.dispatchEvent("timeupdate");
  assert.equal(overlay.textContent, youtubeOverlayText("很久之后的一句。", "Much later line."));
});

test("youtube caption overlay advances on animation frames while the video plays", async () => {
  const frameCallbacks = [];
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });

  fixture.video.paused = false;

  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    requestAnimationFrame(callback) {
      frameCallbacks.push(callback);
      return frameCallbacks.length;
    }
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  api.renderYouTubeTranscriptTranslations({ translations: manualCaptionFixtureTranslations(collected.segments) });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.match(overlay.textContent, /^现在/);
  assert.equal(frameCallbacks.length, 1);

  fixture.video.currentTime = 7;
  frameCallbacks.shift()();

  assert.match(overlay.textContent, /^然后/);
  assert.equal(frameCallbacks.length, 1);

  fixture.video.paused = true;
  fixture.video.currentTime = 13;
  frameCallbacks.shift()();

  assert.match(overlay.textContent, /^很久/);
  assert.equal(frameCallbacks.length, 0);
});

test("youtube caption overlay hides during ads and clears when the watch video changes", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 3 });
  const location = { href: "https://www.youtube.com/watch?v=test-video" };
  const api = await loadYouTubeCaptionApi(fixture, {
    location,
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() })
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  api.renderYouTubeTranscriptTranslations({ translations: manualCaptionFixtureTranslations(collected.segments) });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.equal(overlay.style.display, "block");
  assert.notEqual(findYouTubeControl(fixture.document, "youtube-native-caption-style"), null);

  fixture.player.setAttribute("class", "html5-video-player ad-showing");
  fixture.video.dispatchEvent("timeupdate");

  assert.equal(overlay.style.display, "none");
  assert.equal(overlay.getAttribute("data-pbt-sync-status"), "ad");

  fixture.player.setAttribute("class", "html5-video-player");
  fixture.video.dispatchEvent("timeupdate");

  assert.equal(overlay.style.display, "block");

  location.href = "https://www.youtube.com/watch?v=next-video";
  fixture.video.dispatchEvent("timeupdate");
  const staleRender = api.renderYouTubeTranscriptTranslations({
    translations: [{ id: collected.segments[0].id, text: "旧视频的字幕。" }]
  });

  assert.equal(findYouTubeOverlay(fixture.document), null);
  assert.equal(findYouTubeControl(fixture.document, "youtube-native-caption-style"), null);
  assert.equal(staleRender.ok, false);
  assert.equal(staleRender.error.code, "stale_youtube_transcript_request");
});

test("youtube caption collector translates only untranslated sentences around the current time", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 100 });
  const fetched = [];
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: spacedCaptionFixturePayload(40) }, fetched)
  });
  const collect = () => api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  const first = await collect();

  assert.equal(first.status, "ready");
  assert.deepEqual(
    Array.from(first.segments, (segment) => segment.text),
    Array.from({ length: 10 }, (_, index) => `Sentence number ${index + 10}.`)
  );

  api.renderYouTubeTranscriptTranslations({ translations: spacedCaptionFixtureTranslations(first.segments) });
  const cached = await collect();

  assert.equal(cached.status, "ready_cached");
  assert.equal(cached.segments.length, 0);
  assert.equal(cached.cachedCueCount, 10);

  fixture.video.currentTime = 150;
  const next = await collect();

  assert.deepEqual(Array.from(next.segments, (segment) => segment.text), [
    "Sentence number 20.",
    "Sentence number 21.",
    "Sentence number 22.",
    "Sentence number 23.",
    "Sentence number 24."
  ]);
  assert.equal(fetched.length, 1);
});

test("youtube caption render keeps late translations after a seek but rejects another video", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 100 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: spacedCaptionFixturePayload(40) })
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  fixture.video.currentTime = 400;
  const lateRender = api.renderYouTubeTranscriptTranslations({
    videoId: "test-video",
    translations: spacedCaptionFixtureTranslations(collected.segments)
  });
  const otherVideoRender = api.renderYouTubeTranscriptTranslations({
    videoId: "other-video",
    translations: spacedCaptionFixtureTranslations(collected.segments)
  });

  assert.equal(lateRender.ok, true);
  assert.equal(lateRender.renderedCount, 10);
  assert.equal(otherVideoRender.ok, false);
  assert.equal(otherVideoRender.error.code, "stale_youtube_transcript_request");

  fixture.video.currentTime = 110;
  fixture.video.dispatchEvent("timeupdate");

  assert.equal(findYouTubeOverlay(fixture.document).textContent, youtubeOverlayText("第 11 句。", "Sentence number 11."));
});

test("youtube caption overlay prefetches the next minute once while translated", async () => {
  const sentMessages = [];
  const fixture = createYouTubeWatchFixture({ currentTime: 100 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: spacedCaptionFixturePayload(40) }),
    sendMessage(message) {
      sentMessages.push(message);
    }
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  api.renderYouTubeTranscriptTranslations({ translations: spacedCaptionFixtureTranslations(collected.segments) });
  fixture.video.currentTime = 135;
  fixture.video.dispatchEvent("timeupdate");

  assert.equal(sentMessages.length, 0);

  fixture.video.currentTime = 140;
  fixture.video.dispatchEvent("timeupdate");
  fixture.video.currentTime = 141;
  fixture.video.dispatchEvent("timeupdate");

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].type, "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT");
  assert.equal(sentMessages[0].allowYouTubeCaptionTrack, true);
  assert.equal(sentMessages[0].allowYouTubePlayerCaptionToggle, undefined);
  assert.equal(sentMessages[0].confirmCost, true);
});

test("youtube caption overlay follows the bilingual or replace display mode", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() })
  });
  const sourceText = "Now, when a normal student writes a paper, they spread the work out.";

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "replace", paidProvider: "gemini" });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.equal(overlay.textContent, sourceText);

  api.renderYouTubeTranscriptTranslations({
    translations: [{ id: collected.segments[0].id, text: "第一句中文。" }]
  });

  assert.equal(overlay.textContent, "第一句中文。");

  api.showFloatingTranslateButton({ displayMode: "bilingual" });

  assert.equal(overlay.textContent, youtubeOverlayText("第一句中文。", sourceText));
});

test("youtube caption translations survive display mode changes without another provider request", async () => {
  const sentMessages = [];
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    sendMessage(message) {
      sentMessages.push(message);
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  api.renderYouTubeTranscriptTranslations({
    translations: collected.segments.map((segment, index) => ({ id: segment.id, text: ["第一句中文。", "第二句中文。", "第三句中文。"][index] }))
  });
  api.showFloatingTranslateButton({ displayMode: "replace" });
  fixture.video.currentTime = 7;
  fixture.video.dispatchEvent("timeupdate");
  const again = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  assert.equal(sentMessages.filter((message) => message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT").length, 0);
  assert.equal(again.status, "ready_cached");
  assert.equal(findYouTubeOverlay(fixture.document).textContent, "第二句中文。");
});

test("youtube caption provider changes re-translate the window while keeping the previous text", async () => {
  const sentMessages = [];
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    sendMessage(message) {
      sentMessages.push(message);
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "replace", paidProvider: "gemini" });
  const first = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  api.renderYouTubeTranscriptTranslations({
    translations: first.segments.map((segment, index) => ({ id: segment.id, text: ["第一句免费译文。", "第二句免费译文。", "第三句免费译文。"][index] }))
  });
  api.showFloatingTranslateButton({ qualityMode: "natural", paidProvider: "gemini" });

  const overlay = findYouTubeOverlay(fixture.document);
  const translateMessages = sentMessages.filter((message) => message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT");

  assert.equal(translateMessages.length, 1);
  assert.equal(translateMessages[0].qualityMode, "natural");
  assert.equal(overlay.textContent, "第一句免费译文。");

  const second = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true,
    requestId: translateMessages[0].requestId
  });

  assert.equal(second.segments.length, 3);

  api.renderYouTubeTranscriptTranslations({
    requestId: translateMessages[0].requestId,
    translations: second.segments.map((segment, index) => ({ id: segment.id, text: ["第一句自然译文。", "第二句自然译文。", "第三句自然译文。"][index] }))
  });

  assert.equal(overlay.textContent, "第一句自然译文。");
});

test("youtube caption background updates explain missing paid keys in Chinese and keep old text", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: false, error: { code: "missing_api_key", message: "Gemini API Key is required." } });
      }
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "replace", paidProvider: "gemini" });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  api.renderYouTubeTranscriptTranslations({
    translations: collected.segments.map((segment, index) => ({ id: segment.id, text: ["第一句免费译文。", "第二句免费译文。", "第三句免费译文。"][index] }))
  });
  api.showFloatingTranslateButton({ qualityMode: "natural", paidProvider: "gemini" });

  assert.match(findYouTubeControl(fixture.document, "youtube-transcript-hint").textContent, /请先在设置里填写翻译服务的 Key/);
  assert.equal(findYouTubeOverlay(fixture.document).textContent, "第一句免费译文。");
});

test("youtube caption button explains provider key rejections in Chinese", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    sendMessage(message, callback) {
      if (message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: false, error: { code: "provider_http_error", message: "Provider request failed.", status: 401 } });
      }
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "natural", displayMode: "bilingual", paidProvider: "gemini" });
  findYouTubeControl(fixture.document, "youtube-transcript-toggle").click();

  const hint = findYouTubeControl(fixture.document, "youtube-transcript-hint");

  assert.match(hint.textContent, /HTTP 401/);
  assert.match(hint.textContent, /Key 是否正确/);
});

test("youtube caption overlay scales with the player, caption size setting and control visibility", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() })
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  api.renderYouTubeTranscriptTranslations({
    translations: [{ id: collected.segments[0].id, text: "第一句中文。" }]
  });
  const overlay = findYouTubeOverlay(fixture.document);
  const lines = overlay.childNodes.filter((node) => node.nodeType === 1);

  assert.equal(overlay.parentNode, fixture.player);
  assert.equal(overlay.style.fontSize, "18px");
  assert.equal(overlay.style.bottom, "82px");
  assert.deepEqual(lines.map((line) => line.getAttribute("data-pbt-caption-line")), ["translation", "source"]);
  assert.equal(lines[1].style.fontSize, "0.75em");

  fixture.player.rect = { left: 0, top: 0, right: 1920, bottom: 1080, width: 1920, height: 1080 };
  fixture.video.dispatchEvent("timeupdate");

  assert.equal(overlay.style.fontSize, "39px");
  assert.equal(overlay.style.bottom, "108px");

  fixture.player.setAttribute("class", "html5-video-player ytp-autohide");
  fixture.video.dispatchEvent("timeupdate");

  assert.equal(overlay.style.bottom, "54px");

  api.showFloatingTranslateButton({ captionSize: "large" });

  assert.equal(overlay.style.fontSize, "47px");

  fixture.player.rect = { left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180 };
  api.showFloatingTranslateButton({ captionSize: "standard" });

  assert.equal(overlay.style.fontSize, "16px");
});

test("youtube caption button lives inside the player and keeps clicks away from the player", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const sentMessages = [];
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    sendMessage(message) {
      sentMessages.push(message);
    }
  });
  let stopped = 0;
  const stopPropagation = () => {
    stopped += 1;
  };

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findYouTubeControl(fixture.document, "youtube-transcript-toggle");

  assert.equal(button.parentNode, fixture.player);

  button.dispatchEvent({ type: "dblclick", stopPropagation });
  button.click({ stopPropagation });

  assert.equal(stopped, 2);
  assert.equal(sentMessages.filter((message) => message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT").length, 1);
});

test("youtube caption layout refreshes when the player is resized while paused", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const resizeObservers = [];
  const frames = [];
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
    beforeRun(sandbox) {
      sandbox.ResizeObserver = class FakeResizeObserver {
        constructor(callback) {
          this.callback = callback;
          resizeObservers.push(this);
        }

        observe(target) {
          this.target = target;
        }

        disconnect() {}
      };
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  api.renderYouTubeTranscriptTranslations({
    translations: [{ id: collected.segments[0].id, text: "第一句中文。" }]
  });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.equal(resizeObservers.length, 1);
  assert.equal(resizeObservers[0].target, fixture.player);
  assert.equal(overlay.style.fontSize, "18px");

  fixture.player.rect = { left: 0, top: 0, right: 2314, bottom: 866, width: 2314, height: 866 };
  resizeObservers[0].callback([]);
  frames.splice(0).forEach((frame) => frame());

  assert.equal(overlay.style.fontSize, "31px");
  assert.equal(findYouTubeControl(fixture.document, "youtube-transcript-toggle").style.right, "18px");
});

test("caption size setting shows on YouTube watch pages and saves with site settings", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 1 });
  const sentMessages = [];
  const api = await loadYouTubeCaptionApi(fixture, {
    sendMessage(message) {
      sentMessages.push(message);
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini", captionSize: "large" });
  const field = findYouTubeControl(fixture.document, "caption-size-field");
  const select = findYouTubeControl(fixture.document, "caption-size");

  assert.equal(field.style.display, "grid");
  assert.equal(select.value, "large");

  select.value = "xlarge";
  select.dispatchEvent("change");

  assert.equal(sentMessages.find((message) => message.type === "PBT_SET_SITE_TRANSLATION_SETTINGS").captionSize, "xlarge");
});

test("caption size setting stays hidden outside YouTube watch pages", async () => {
  const document = createDocument();
  const api = await loadContentApi(document, {
    location: { href: "https://example.com/article" }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });

  assert.equal(findYouTubeControl(document, "caption-size-field").style.display, "none");
});

test("youtube caption render reports unusable translations and keeps the English line", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 7 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() })
  });
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });
  const rendered = api.renderYouTubeTranscriptTranslations({
    translations: [{ id: collected.segments[1].id, text: "Then they finish." }]
  });
  const overlay = findYouTubeOverlay(fixture.document);

  assert.equal(rendered.ok, true);
  assert.equal(rendered.renderedCount, 0);
  assert.equal(rendered.diagnostics.status, "no_usable_translations");
  assert.equal(rendered.diagnostics.unmeaningfulTranslationCount, 1);
  assert.equal(overlay.textContent, "Then they finish.");
  assert.equal(overlay.getAttribute("data-pbt-sync-status"), "source_only");
});

test("youtube transcript floating button clears the English preview when translation fails", async () => {
  const fixture = createYouTubeWatchFixture({ currentTime: 3 });
  let api = null;
  let previewText = "";

  api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: manualCaptionFixturePayload() }),
    sendMessage(message, callback) {
      if (message.type !== "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: true });
        return;
      }

      void api.collectYouTubeTranscriptSegmentsForTranslation({
        doc: fixture.document,
        requestId: message.requestId,
        allowYouTubeCaptionTrack: message.allowYouTubeCaptionTrack,
        allowYouTubePlayerCaptionToggle: message.allowYouTubePlayerCaptionToggle
      }).then(() => {
        previewText = findYouTubeOverlay(fixture.document)?.textContent ?? "";
        callback({
          ok: false,
          error: { code: "youtube_transcript_no_usable_translations", message: "No usable translations." }
        });
      });
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findYouTubeControl(fixture.document, "youtube-transcript-toggle");

  button.click();
  await flushYouTubeTasks();

  assert.equal(previewText, "Now, when a normal student writes a paper, they spread the work out.");
  assert.equal(findYouTubeOverlay(fixture.document), null);
  assert.equal(findYouTubeControl(fixture.document, "youtube-native-caption-style"), null);
  assert.equal(button.getAttribute("data-pbt-active"), "false");
  assert.match(findYouTubeControl(fixture.document, "youtube-transcript-hint").textContent, /没有返回可显示的中文字幕/);
});

test("youtube transcript click while a background refresh is in flight turns captions off", async () => {
  const sentMessages = [];
  const fixture = createYouTubeWatchFixture({ currentTime: 100 });
  const api = await loadYouTubeCaptionApi(fixture, {
    fetch: createYouTubeCaptionFetch({ en: spacedCaptionFixturePayload(40) }),
    sendMessage(message, callback) {
      sentMessages.push(message);

      if (message.type !== "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT") {
        callback({ ok: true });
      }
    }
  });

  api.showFloatingTranslateButton({ qualityMode: "free", displayMode: "bilingual", paidProvider: "gemini" });
  const button = findYouTubeControl(fixture.document, "youtube-transcript-toggle");
  const collected = await api.collectYouTubeTranscriptSegmentsForTranslation({
    doc: fixture.document,
    allowYouTubeCaptionTrack: true
  });

  api.renderYouTubeTranscriptTranslations({ translations: spacedCaptionFixtureTranslations(collected.segments) });
  fixture.video.currentTime = 140;
  fixture.video.dispatchEvent("timeupdate");
  const translateMessages = () => sentMessages.filter((message) => message.type === "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT");

  assert.equal(translateMessages().length, 1);
  assert.equal(button.hasAttribute("data-pbt-loading"), false);

  button.click();

  assert.equal(findYouTubeOverlay(fixture.document), null);
  assert.equal(button.getAttribute("data-pbt-active"), "false");
  assert.equal(translateMessages().length, 1);
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
        connect: options.connect,
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

  if (options.fetch) {
    sandbox.fetch = options.fetch;
  }

  if (options.performanceEntries) {
    sandbox.performance = {
      getEntriesByType(type) {
        return type === "resource" ? options.performanceEntries.slice() : [];
      }
    };
  }

  const performanceObservers = [];

  if (options.performanceObserver) {
    sandbox.PerformanceObserver = class FakePerformanceObserver {
      constructor(callback) {
        this.callback = callback;
        this.disconnected = false;
        performanceObservers.push(this);
      }

      observe(observerOptions) {
        this.observerOptions = observerOptions;
      }

      disconnect() {
        this.disconnected = true;
      }

      emit(entries) {
        this.callback({ getEntries: () => entries });
      }
    };
  }

  if (options.beforeRun) {
    options.beforeRun(sandbox);
  }

  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: "content-script.js" });
  sandbox.PrivateBilingualTranslatorContent.__mutationObservers = mutationObservers;
  sandbox.PrivateBilingualTranslatorContent.__performanceObservers = performanceObservers;
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

function countPendingIndicators(root) {
  let count = 0;

  walk(root, (node) => {
    if (node.nodeType === 1 && node.getAttribute("data-pbt-control") === "translation-pending") {
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

function youtubeOverlayText(translatedText, sourceText) {
  return sourceText ? `${translatedText}\n${sourceText}` : translatedText;
}

function createYouTubeWatchFixture(options = {}) {
  const document = createDocument();
  const player = el(document, "div", "", {
    id: "movie_player",
    class: options.playerClass ?? "html5-video-player"
  });
  const video = el(document, "video", "", { class: "html5-main-video" });
  let captionButton = null;

  player.rect = { left: 100, top: 50, right: 900, bottom: 550, width: 800, height: 500 };
  video.currentTime = options.currentTime ?? 0;
  video.duration = options.duration ?? 600;
  player.appendChild(video);

  if (options.captionButton !== false) {
    captionButton = el(document, "button", "", {
      class: "ytp-subtitles-button ytp-button",
      "aria-label": "Subtitles/closed captions (c)",
      "aria-pressed": "false",
      ...(options.captionButtonAttributes ?? {})
    });
    player.appendChild(captionButton);
  }

  document.body.appendChild(player);
  return { document, player, video, captionButton };
}

function loadYouTubeCaptionApi(fixture, options = {}) {
  return loadContentApi(fixture.document, {
    location: { href: "https://www.youtube.com/watch?v=test-video" },
    performanceEntries: [{ name: youtubeTimedTextRequestUrl() }],
    ...options
  });
}

function youtubeTimedTextRequestUrl(params = {}) {
  const url = new URL("https://www.youtube.com/api/timedtext");
  url.searchParams.set("v", params.v ?? "test-video");
  url.searchParams.set("caps", "asr");
  url.searchParams.set("lang", params.lang ?? "en");

  if (params.kind) {
    url.searchParams.set("kind", params.kind);
  }

  if (params.tlang) {
    url.searchParams.set("tlang", params.tlang);
  }

  url.searchParams.set("pot", params.pot ?? "player-pot-token");
  url.searchParams.set("c", "WEB");
  return url.toString();
}

function createYouTubeCaptionFetch(tracks, fetched = []) {
  return async (url, options) => {
    const requestUrl = new URL(String(url));
    const key = [requestUrl.searchParams.get("lang"), requestUrl.searchParams.get("kind")].filter(Boolean).join("|");
    const payload = tracks[key];

    fetched.push({ url: requestUrl, options, key });
    return {
      ok: true,
      async text() {
        return payload ? JSON.stringify(payload) : "";
      }
    };
  };
}

function manualCaptionPayload(lines) {
  return {
    events: lines.map(([startMs, durationMs, text]) => ({
      tStartMs: startMs,
      dDurationMs: durationMs,
      segs: [{ utf8: text }]
    }))
  };
}

function manualCaptionFixturePayload() {
  return manualCaptionPayload([
    [0, 2000, "Now, when a normal student"],
    [2000, 2000, "writes a paper,"],
    [4000, 2500, "they spread the work out."],
    [6500, 2000, "Then they finish."],
    [12000, 3000, "Much later line."]
  ]);
}

function manualCaptionFixtureTranslations(segments) {
  const translatedBySource = {
    "Now, when a normal student writes a paper, they spread the work out.": "现在，普通学生写论文时会把工作分散开。",
    "Then they finish.": "然后他们就写完了。",
    "Much later line.": "很久之后的一句。"
  };

  return Array.from(segments, (segment) => ({ id: segment.id, text: translatedBySource[segment.text] }));
}

function spacedCaptionFixturePayload(count) {
  return manualCaptionPayload(Array.from({ length: count }, (_, index) => [index * 10000, 3000, `Sentence number ${index}.`]));
}

function spacedCaptionFixtureTranslations(segments) {
  return Array.from(segments, (segment) => ({
    id: segment.id,
    text: segment.text.replace(/^Sentence number (\d+)\.$/, "第 $1 句。")
  }));
}

function asrCaptionFixturePayload() {
  return {
    events: [
      { tStartMs: 0, dDurationMs: 9000, wWinId: 1 },
      {
        tStartMs: 1000,
        dDurationMs: 3000,
        wWinId: 1,
        segs: [{ utf8: "so" }, { utf8: " today", tOffsetMs: 300 }, { utf8: " we", tOffsetMs: 700 }, { utf8: " talk", tOffsetMs: 1000 }]
      },
      { tStartMs: 2400, dDurationMs: 2000, wWinId: 1, aAppend: 1, segs: [{ utf8: "\n" }] },
      { tStartMs: 2400, dDurationMs: 3000, wWinId: 1, segs: [{ utf8: "about" }, { utf8: " captions", tOffsetMs: 300 }] },
      { tStartMs: 5200, dDurationMs: 3000, wWinId: 1, segs: [{ utf8: "[Music]" }] },
      { tStartMs: 7000, dDurationMs: 3000, wWinId: 1, segs: [{ utf8: "next" }, { utf8: " part", tOffsetMs: 400 }] }
    ]
  };
}

function findYouTubeOverlay(document) {
  return findYouTubeControl(document, "youtube-transcript-overlay");
}

function findYouTubeControl(document, control) {
  return findNode(document.body, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === control);
}

function flushYouTubeTasks() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
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
    this.rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
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

  dispatchEvent(event) {
    const eventObject = typeof event === "string"
      ? { type: event, target: this }
      : { ...event, target: event?.target ?? this };

    for (const callback of this.listeners.get(eventObject.type) ?? []) {
      callback(eventObject);
    }
  }

  click(event = {}) {
    const eventObject = { type: "click", target: this, ...event };

    for (const callback of this.listeners.get("click") ?? []) {
      callback(eventObject);
    }
  }

  querySelector(selector) {
    const match = selector.match(/^\[data-pbt-control="([^"]+)"\]$/);

    if (!match) {
      return null;
    }

    return findNode(this, (node) => node.nodeType === 1 && node.getAttribute("data-pbt-control") === match[1]);
  }

  getBoundingClientRect() {
    return this.rect;
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
