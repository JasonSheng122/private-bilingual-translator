import { evaluateDomainPolicy } from "../shared/domain-policy.mjs";
import {
  DISPLAY_MODES,
  MESSAGE_TYPES,
  QUALITY_MODES,
  normalizeDisplayMode,
  normalizePaidProvider,
  normalizeQualityMode,
  normalizeCaptionSize
} from "../shared/message-types.mjs";
import {
  getStoredCustomProviderConfig,
  saveCustomProviderConfig
} from "./custom-provider-config.mjs";
import { transcribeLocalWhisperAudio } from "./local-whisper-asr.mjs";
import { translateSegments } from "./provider-manager.mjs";
import { clearApiKey, getApiKeyStatus, saveApiKey } from "./secret-manager.mjs";
import {
  getStoredFloatingControlsHidden,
  getStoredTranslationSettingsForUrl,
  saveFloatingControlsHidden,
  saveDisplayModeForUrl,
  saveTranslationSettingsForUrl
} from "./site-settings.mjs";

const CONTENT_SCRIPT_READY_ATTEMPTS = 5;
const CONTENT_SCRIPT_READY_RETRY_DELAY_MS = 75;
const CONTENT_SCRIPT_FILE = "src/content/content-script.js";
const FLOATING_CONTROLS_PORT_NAME = "pbt-floating-controls";
const YOUTUBE_TRANSCRIPT_COST_WARNING_SEGMENT_COUNT = 80;
const YOUTUBE_LOCAL_ASR_OFFSCREEN_DOCUMENT = "src/offscreen/local-asr.html";
const YOUTUBE_LOCAL_ASR_CHUNK_MS = 3000;
const YOUTUBE_LOCAL_ASR_RUNTIME_MESSAGE_TIMEOUT_MS = 5000;
const YOUTUBE_LOCAL_ASR_FIRST_CHUNK_TIMEOUT_MS = YOUTUBE_LOCAL_ASR_CHUNK_MS + 7000;
const floatingControlsPorts = new Set();
const youtubeLocalAsrSessions = new Map();
let creatingYouTubeLocalAsrOffscreenDocument = null;

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    routeMessage(message, sender)
      .then(sendResponse)
      .catch(() => {
        sendResponse({
          ok: false,
          error: {
            code: "background_error",
            message: "Unknown background error."
          }
        });
      });

    return true;
  });
}

if (globalThis.chrome?.runtime?.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    connectFloatingControlsPort(port);
  });
}

export async function routeMessage(message, sender = {}) {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: { code: "invalid_message", message: "Invalid message." } };
  }

  if (message.type === MESSAGE_TYPES.GET_PAGE_STATUS) {
    return getPageStatus(message, sender);
  }

  if (message.type === MESSAGE_TYPES.TRANSLATE_PAGE) {
    return translatePage(message, sender);
  }

  if (message.type === MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT) {
    return translateYouTubeTranscript(message, sender);
  }

  if (message.type === MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR) {
    return stopYouTubeLocalAsr(message, sender);
  }

  if (message.type === MESSAGE_TYPES.YOUTUBE_LOCAL_ASR_AUDIO_CHUNK) {
    return handleYouTubeLocalAsrAudioChunk(message, sender);
  }

  if (message.type === MESSAGE_TYPES.RESTORE_PAGE) {
    return sendPageCommand(message.tabId, { type: MESSAGE_TYPES.RESTORE_PAGE }, sender);
  }

  if (message.type === MESSAGE_TYPES.REMOVE_TRANSLATIONS) {
    return sendPageCommand(message.tabId, { type: MESSAGE_TYPES.REMOVE_TRANSLATIONS }, sender);
  }

  if (message.type === MESSAGE_TYPES.SET_SITE_DISPLAY_MODE) {
    return setSiteDisplayMode(message, sender);
  }

  if (message.type === MESSAGE_TYPES.SET_SITE_TRANSLATION_SETTINGS) {
    return setSiteTranslationSettings(message, sender);
  }

  if (message.type === MESSAGE_TYPES.SET_FLOATING_CONTROLS_HIDDEN) {
    return setFloatingControlsHidden(message);
  }

  if (message.type === MESSAGE_TYPES.GET_CUSTOM_PROVIDER_CONFIG) {
    return getStoredCustomProviderConfig();
  }

  if (message.type === MESSAGE_TYPES.SAVE_CUSTOM_PROVIDER_CONFIG) {
    return saveCustomProviderConfig({
      baseUrl: message.baseUrl,
      model: message.model
    });
  }

  if (message.type === MESSAGE_TYPES.SAVE_API_KEY) {
    return saveApiKey({
      provider: message.provider,
      apiKey: message.apiKey,
      storageMode: message.storageMode
    });
  }

  if (message.type === MESSAGE_TYPES.GET_API_KEY_STATUS) {
    return getApiKeyStatus(message.provider);
  }

  if (message.type === MESSAGE_TYPES.CLEAR_API_KEY) {
    return clearApiKey({
      provider: message.provider,
      storageMode: message.storageMode
    });
  }

  if (message.type === MESSAGE_TYPES.OPEN_EXTENSION_POPUP) {
    return openExtensionPopup();
  }

  return { ok: false, error: { code: "unknown_message", message: "Unknown message type." } };
}

async function openExtensionPopup() {
  if (!globalThis.chrome?.action || typeof chrome.action.openPopup !== "function") {
    return makeOpenPopupUnavailableError();
  }

  try {
    await chrome.action.openPopup();
    return { ok: true, opened: true };
  } catch {
    return makeOpenPopupUnavailableError();
  }
}

async function getPageStatus(message, sender = {}) {
  const pageUrl = message.url || sender?.tab?.url || "";
  const senderTabId = Number(sender?.tab?.id);
  const tabId = Number.isInteger(Number(message.tabId)) ? Number(message.tabId) : senderTabId;
  const fromContentScript = Number.isInteger(senderTabId) && senderTabId === tabId;
  const storedSettings = await getStoredTranslationSettingsForUrl(pageUrl);
  const autoAllowlist = storedSettings?.autoTranslate ? [getHostname(pageUrl)].filter(Boolean) : [];
  const policy = evaluateDomainPolicy(pageUrl, { autoAllowlist });
  const qualityMode = storedSettings?.qualityMode ?? normalizeQualityMode(message.qualityMode);
  const displayMode = storedSettings?.displayMode ?? normalizeDisplayMode(message.displayMode);
  const paidProvider = storedSettings?.paidProvider ?? normalizePaidProvider(message.paidProvider);
  const captionSize = storedSettings?.captionSize ?? normalizeCaptionSize(message.captionSize);
  const autoTranslate = storedSettings?.autoTranslate === true;
  const floatingControlsHidden = await getStoredFloatingControlsHidden();

  if (!policy.blocked && Number.isInteger(tabId) && !fromContentScript) {
    try {
      if (await ensureContentScriptReady(tabId)) {
        await sendTabMessage(tabId, {
          type: MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON,
          qualityMode,
          displayMode,
          paidProvider,
          autoTranslate,
          captionSize,
          floatingControlsHidden
        });
      }
    } catch {
      // Page status should still be returned when a page cannot host content UI.
    }
  }

  return {
    ok: true,
    policy,
    qualityMode,
    displayMode,
    paidProvider,
    autoTranslate,
    captionSize,
    floatingControlsHidden
  };
}

async function setSiteDisplayMode(message, sender = {}) {
  const pageUrl = message.url || sender?.tab?.url || "";
  const policy = evaluateDomainPolicy(pageUrl);

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      policy,
      error: {
        code: "domain_blocked",
        message: "This page is blocked by the sensitive domain policy."
      }
    };
  }

  return saveDisplayModeForUrl({
    url: pageUrl,
    displayMode: message.displayMode
  });
}

async function setSiteTranslationSettings(message, sender = {}) {
  const pageUrl = message.url || sender?.tab?.url || "";
  const policy = evaluateDomainPolicy(pageUrl);

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      policy,
      error: {
        code: "domain_blocked",
        message: "This page is blocked by the sensitive domain policy."
      }
    };
  }

  return saveTranslationSettingsForUrl({
    url: pageUrl,
    displayMode: message.displayMode,
    qualityMode: message.qualityMode,
    paidProvider: message.paidProvider,
    autoTranslate: typeof message.autoTranslate === "boolean" ? message.autoTranslate : undefined,
    captionSize: message.captionSize
  });
}

async function setFloatingControlsHidden(message) {
  const saved = await saveFloatingControlsHidden(message.hidden === true);

  if (saved.ok) {
    broadcastFloatingControlsHidden(saved.floatingControlsHidden);
  }

  return saved;
}

async function translatePage(message, sender = {}) {
  const senderTabId = Number(sender?.tab?.id);
  const tabId = Number.isInteger(Number(message.tabId)) ? Number(message.tabId) : senderTabId;
  const qualityMode = normalizeQualityMode(message.qualityMode);
  const displayMode = normalizeDisplayMode(message.displayMode);
  const pageUrl = message.url || sender?.tab?.url || "";
  const policy = evaluateDomainPolicy(pageUrl);
  const fromContentScript = Number.isInteger(senderTabId) && senderTabId === tabId;

  if (!Number.isInteger(tabId)) {
    return { ok: false, error: { code: "missing_tab", message: "No active tab was found." } };
  }

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      policy,
      error: {
        code: "domain_blocked",
        message: "This page is blocked by the sensitive domain policy."
      }
    };
  }

  if (!fromContentScript && !(await ensureContentScriptReady(tabId))) {
    return makeContentScriptUnavailableError();
  }

  const incremental = fromContentScript && message.incremental === true;

  if (!incremental) {
    await sendTabMessage(tabId, {
      type: MESSAGE_TYPES.PREPARE_TRANSLATION,
      displayMode
    });
  }

  const collectResult = await sendTabMessage(tabId, {
    type: MESSAGE_TYPES.COLLECT_SEGMENTS,
    incremental,
    displayMode,
    showPendingIndicators: fromContentScript
  });

  if (!collectResult.ok || collectResult.segments.length === 0) {
    const cachedRenderedCount = Number.isInteger(collectResult.cachedRenderedCount)
      ? collectResult.cachedRenderedCount
      : 0;

    if (collectResult.ok && cachedRenderedCount > 0) {
      return {
        ok: true,
        status: displayMode === DISPLAY_MODES.REPLACE ? "replaced" : "bilingual",
        segmentCount: 0,
        renderedCount: cachedRenderedCount
      };
    }

    return {
      ok: true,
      status: "no_text",
      segmentCount: 0
    };
  }

  const providerResult = await translateSegments({
    qualityMode,
    segments: collectResult.segments,
    apiKey: message.apiKeyStorageMode === "once" ? message.apiKey : "",
    paidProvider: message.paidProvider
  });

  if (!providerResult.ok) {
    return providerResult;
  }

  const renderResult = await sendTabMessage(tabId, {
    type: MESSAGE_TYPES.RENDER_TRANSLATIONS,
    displayMode,
    translations: providerResult.translations
  });

  if (!renderResult.ok) {
    return renderResult;
  }

  const renderedCount = Number.isInteger(renderResult.renderedCount) ? renderResult.renderedCount : 0;

  if (renderedCount === 0) {
    return {
      ok: false,
      status: "no_render",
      segmentCount: providerResult.translations.length,
      renderedCount,
      provider: providerResult.provider,
      error: {
        code: "no_rendered_translations",
        message: "No translated text was rendered. The provider may have returned unchanged text."
      }
    };
  }

  return {
    ok: true,
    status: displayMode === DISPLAY_MODES.REPLACE ? "replaced" : "bilingual",
    segmentCount: providerResult.translations.length,
    renderedCount,
    provider: providerResult.provider
  };
}

async function translateYouTubeTranscript(message, sender = {}) {
  const senderTabId = Number(sender?.tab?.id);
  const tabId = Number.isInteger(Number(message.tabId)) ? Number(message.tabId) : senderTabId;
  const pageUrl = message.url || sender?.tab?.url || "";
  const qualityMode = normalizeQualityMode(message.qualityMode);
  const paidProvider = normalizePaidProvider(message.paidProvider);
  const requestId = Number.isInteger(Number(message.requestId)) ? Number(message.requestId) : undefined;
  const policy = evaluateDomainPolicy(pageUrl);
  const fromContentScript = Number.isInteger(senderTabId) && senderTabId === tabId;

  if (!Number.isInteger(tabId)) {
    return { ok: false, error: { code: "missing_tab", message: "No active tab was found." } };
  }

  if (policy.blocked) {
    return {
      ok: false,
      blocked: true,
      policy,
      error: {
        code: "domain_blocked",
        message: "This page is blocked by the sensitive domain policy."
      }
    };
  }

  if (!isYouTubeWatchUrl(pageUrl)) {
    return {
      ok: false,
      error: {
        code: "youtube_transcript_unsupported_page",
        message: "YouTube transcript translation only works on a watch page."
      }
    };
  }

  if (!fromContentScript && !(await ensureContentScriptReady(tabId))) {
    return makeContentScriptUnavailableError();
  }

  const collectMessage = {
    type: MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT,
    requestId
  };

  if (fromContentScript && message.allowYouTubeCaptionTrack === true) {
    collectMessage.allowYouTubeCaptionTrack = true;
  }

  if (fromContentScript && message.allowYouTubePlayerCaptionToggle === true) {
    collectMessage.allowYouTubePlayerCaptionToggle = true;
  }

  if (fromContentScript && message.allowYouTubeLocalWhisperAsr === true) {
    collectMessage.allowYouTubeLocalWhisperAsr = true;
  }

  const collectResult = await sendTabMessage(tabId, collectMessage);

  if (!collectResult?.ok) {
    return collectResult || makeYouTubeTranscriptUnavailableError();
  }

  const segments = Array.isArray(collectResult.segments) ? collectResult.segments : [];

  if (collectResult.status === "ready_cached") {
    return {
      ok: true,
      status: "translated",
      segmentCount: 0,
      renderedCount: Math.max(0, Number(collectResult.cachedCueCount) || 0)
    };
  }

  if (segments.length === 0) {
    if (
      fromContentScript &&
      message.allowYouTubeLocalWhisperAsr === true &&
      isYouTubeLocalAsrFallbackStatus(collectResult.status)
    ) {
      return startYouTubeLocalAsr({
        tabId,
        requestId,
        qualityMode,
        paidProvider
      });
    }

    return makeYouTubeTranscriptUnavailableError(collectResult.status);
  }

  if (
    qualityMode !== QUALITY_MODES.FREE &&
    segments.length > YOUTUBE_TRANSCRIPT_COST_WARNING_SEGMENT_COUNT &&
    message.confirmCost !== true
  ) {
    return {
      ok: false,
      status: "cost_confirmation_required",
      segmentCount: segments.length,
      error: {
        code: "youtube_transcript_cost_confirmation_required",
        message: "This transcript is long. Click the transcript button again to translate with your paid provider."
      }
    };
  }

  const providerResult = await translateSegments({
    qualityMode,
    segments,
    paidProvider
  });

  if (!providerResult.ok) {
    return providerResult;
  }

  const renderResult = await sendTabMessage(tabId, {
    type: MESSAGE_TYPES.RENDER_YOUTUBE_TRANSCRIPT,
    requestId,
    videoId: typeof collectResult.videoId === "string" ? collectResult.videoId : "",
    translations: providerResult.translations
  });

  if (!renderResult.ok) {
    return renderResult;
  }

  const renderedCount = Number.isInteger(renderResult.renderedCount) ? renderResult.renderedCount : 0;

  if (renderedCount === 0) {
    const renderDiagnostics = sanitizeYouTubeTranscriptRenderDiagnostics(renderResult.diagnostics);
    const renderError = getYouTubeTranscriptRenderError(renderDiagnostics);

    return {
      ok: false,
      status: "no_render",
      segmentCount: providerResult.translations.length,
      renderedCount,
      provider: providerResult.provider,
      renderDiagnostics,
      error: renderError
    };
  }

  return {
    ok: true,
    status: "translated",
    segmentCount: providerResult.translations.length,
    renderedCount,
    provider: providerResult.provider
  };
}

async function startYouTubeLocalAsr({ tabId, requestId, qualityMode, paidProvider }) {
  if (!isChromeLocalAsrAvailable()) {
    return makeYouTubeLocalAsrError("youtube_local_asr_unavailable", "Local Whisper ASR is unavailable in this browser.");
  }

  let streamId;
  try {
    streamId = await getYouTubeLocalAsrStreamId(tabId);
  } catch (error) {
    if (isYouTubeLocalAsrActiveTabGrantError(error)) {
      return makeYouTubeLocalAsrError(
        "youtube_local_asr_capture_denied",
        "Chrome did not allow tab audio capture for the current YouTube tab."
      );
    }

    return makeYouTubeLocalAsrError("youtube_local_asr_capture_denied", "Chrome did not allow tab audio capture.");
  }

  if (!streamId) {
    return makeYouTubeLocalAsrError("youtube_local_asr_capture_denied", "Chrome did not return a tab audio stream.");
  }

  try {
    await ensureYouTubeLocalAsrOffscreenDocument();
  } catch {
    return makeYouTubeLocalAsrError("youtube_local_asr_offscreen_unavailable", "The local ASR recorder could not be opened.");
  }

  await stopYouTubeLocalAsrByTab(tabId);

  const session = {
    tabId,
    requestId,
    qualityMode,
    paidProvider,
    active: true,
    processing: false,
    firstChunkReceived: false,
    firstChunkTimer: null
  };
  youtubeLocalAsrSessions.set(tabId, session);

  try {
    const startResult = await sendRuntimeMessageWithTimeout({
      type: MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR,
      target: "pbt-local-asr-offscreen",
      tabId,
      requestId,
      streamId,
      chunkMs: YOUTUBE_LOCAL_ASR_CHUNK_MS
    }, YOUTUBE_LOCAL_ASR_RUNTIME_MESSAGE_TIMEOUT_MS);

    if (!startResult?.ok) {
      throw new Error("local_asr_start_failed");
    }
  } catch {
    await stopYouTubeLocalAsrByTab(tabId);
    return makeYouTubeLocalAsrError("youtube_local_asr_capture_failed", "The local ASR recorder could not start.");
  }

  scheduleYouTubeLocalAsrFirstChunkTimeout(session);

  return {
    ok: true,
    status: "local_asr_started"
  };
}

async function stopYouTubeLocalAsr(message, sender = {}) {
  const senderTabId = Number(sender?.tab?.id);
  const tabId = Number.isInteger(Number(message.tabId)) ? Number(message.tabId) : senderTabId;

  if (!Number.isInteger(tabId)) {
    return { ok: false, error: { code: "missing_tab", message: "No active tab was found." } };
  }

  await stopYouTubeLocalAsrByTab(tabId);
  return { ok: true, status: "local_asr_stopped" };
}

async function stopYouTubeLocalAsrByTab(tabId) {
  const session = youtubeLocalAsrSessions.get(tabId);
  clearYouTubeLocalAsrFirstChunkTimer(session);
  youtubeLocalAsrSessions.delete(tabId);

  if (!globalThis.chrome?.runtime?.sendMessage) {
    return;
  }

  try {
    await sendRuntimeMessageWithTimeout({
      type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR,
      target: "pbt-local-asr-offscreen",
      tabId
    }, YOUTUBE_LOCAL_ASR_RUNTIME_MESSAGE_TIMEOUT_MS);
  } catch {}
}

async function handleYouTubeLocalAsrAudioChunk(message, sender = {}) {
  if (!isYouTubeLocalAsrOffscreenSender(sender)) {
    return { ok: false, error: { code: "youtube_local_asr_sender_invalid", message: "Invalid local ASR sender." } };
  }

  const tabId = Number(message.tabId);
  const session = youtubeLocalAsrSessions.get(tabId);

  if (!session || session.active !== true) {
    return { ok: false, ignored: true };
  }

  if (session.firstChunkReceived !== true) {
    session.firstChunkReceived = true;
    clearYouTubeLocalAsrFirstChunkTimer(session);
  }

  if (session.processing === true) {
    return { ok: true, skipped: true };
  }

  session.processing = true;

  try {
    await reportYouTubeLocalAsrStatus(session, makeSanitizedError(
      "youtube_local_asr_processing",
      "Local Whisper is processing the current audio chunk."
    ), { active: true });

    const transcription = await transcribeLocalWhisperAudio({
      audioBase64: message.audioBase64,
      mimeType: message.mimeType
    });

    if (!transcription.ok) {
      const error = getYouTubeLocalAsrChunkError(transcription.error);
      const active = !isTerminalYouTubeLocalAsrChunkError(error);
      await reportYouTubeLocalAsrStatus(session, error, { active });

      if (!active) {
        await stopYouTubeLocalAsrByTab(tabId);
      }

      return makeYouTubeLocalAsrError(error.code, error.message);
    }

    const segmentId = `pbt-youtube-local-asr-${Number(message.sequence) || Date.now()}`;
    const providerResult = await translateSegments({
      qualityMode: session.qualityMode,
      paidProvider: session.paidProvider,
      segments: [{ id: segmentId, text: transcription.text }]
    });

    if (!providerResult.ok) {
      const error = getYouTubeLocalAsrChunkError(providerResult.error);
      await reportYouTubeLocalAsrStatus(session, error, { active: false });
      await stopYouTubeLocalAsrByTab(tabId);
      return makeYouTubeLocalAsrError(error.code, error.message);
    }

    const translation = providerResult.translations.find((item) => item.id === segmentId);
    const translatedText = String(translation?.text || "").trim();

    if (!translatedText) {
      const error = makeSanitizedError("youtube_local_asr_no_translation", "No usable translation was returned for local ASR.");
      await reportYouTubeLocalAsrStatus(session, error, { active: false });
      await stopYouTubeLocalAsrByTab(tabId);
      return makeYouTubeLocalAsrError(error.code, error.message);
    }

    const renderResult = await sendTabMessage(tabId, {
      type: MESSAGE_TYPES.RENDER_YOUTUBE_LOCAL_ASR,
      requestId: session.requestId,
      id: segmentId,
      sourceText: transcription.text,
      translatedText,
      sequence: Number(message.sequence) || 0
    });

    if (!renderResult?.ok) {
      const error = makeSanitizedError("youtube_local_asr_render_failed", "Local ASR subtitles could not be rendered.");
      await reportYouTubeLocalAsrStatus(session, error, { active: false });
      await stopYouTubeLocalAsrByTab(tabId);
      return makeYouTubeLocalAsrError(error.code, error.message);
    }

    return { ok: true, status: "local_asr_rendered" };
  } finally {
    session.processing = false;
  }
}

function scheduleYouTubeLocalAsrFirstChunkTimeout(session) {
  if (!session || typeof globalThis.setTimeout !== "function") {
    return;
  }

  clearYouTubeLocalAsrFirstChunkTimer(session);
  session.firstChunkTimer = globalThis.setTimeout(() => {
    void handleYouTubeLocalAsrFirstChunkTimeout(session.tabId, session.requestId);
  }, YOUTUBE_LOCAL_ASR_FIRST_CHUNK_TIMEOUT_MS);
  session.firstChunkTimer?.unref?.();
}

function clearYouTubeLocalAsrFirstChunkTimer(session) {
  if (!session?.firstChunkTimer || typeof globalThis.clearTimeout !== "function") {
    return;
  }

  globalThis.clearTimeout(session.firstChunkTimer);
  session.firstChunkTimer = null;
}

async function handleYouTubeLocalAsrFirstChunkTimeout(tabId, requestId) {
  const session = youtubeLocalAsrSessions.get(Number(tabId));

  if (!session || session.requestId !== requestId || session.firstChunkReceived === true) {
    return;
  }

  const error = makeSanitizedError(
    "youtube_local_asr_no_audio_chunk",
    "No audio chunk was received from the current YouTube tab."
  );
  await reportYouTubeLocalAsrStatus(session, error, { active: false });
  await stopYouTubeLocalAsrByTab(session.tabId);
}

async function reportYouTubeLocalAsrStatus(session, error, { active } = {}) {
  if (!session || !Number.isInteger(Number(session.tabId))) {
    return;
  }

  try {
    await sendTabMessage(session.tabId, {
      type: MESSAGE_TYPES.REPORT_YOUTUBE_LOCAL_ASR_STATUS,
      requestId: session.requestId,
      status: String(error?.code || "youtube_local_asr_chunk_failed"),
      active: active === true,
      error: makeSanitizedError(error?.code, error?.message)
    });
  } catch {}
}

function getYouTubeLocalAsrChunkError(error) {
  const code = String(error?.code || "");

  if (code === "local_whisper_audio_invalid") {
    return makeSanitizedError("youtube_local_asr_audio_invalid", "The captured audio chunk was not usable.");
  }

  if (code === "local_whisper_unavailable") {
    return makeSanitizedError("youtube_local_asr_whisper_unavailable", "Local Whisper is not reachable.");
  }

  if (code === "local_whisper_response_invalid") {
    return makeSanitizedError("youtube_local_asr_whisper_response_invalid", "Local Whisper returned an invalid response.");
  }

  if (code === "local_whisper_no_speech") {
    return makeSanitizedError("youtube_local_asr_no_speech", "Local Whisper did not return readable speech.");
  }

  if (code === "youtube_local_asr_no_translation" || code === "youtube_local_asr_render_failed") {
    return makeSanitizedError(code, error?.message);
  }

  if (code.startsWith("provider_") || code === "provider_response_invalid") {
    return makeSanitizedError("youtube_local_asr_provider_failed", "The translation provider did not return usable local ASR subtitles.");
  }

  return makeSanitizedError("youtube_local_asr_chunk_failed", "Local ASR chunk processing failed.");
}

function isTerminalYouTubeLocalAsrChunkError(error) {
  return String(error?.code || "") !== "youtube_local_asr_no_speech";
}

function makeSanitizedError(code, message) {
  return {
    code: String(code || "youtube_local_asr_chunk_failed"),
    message: String(message || "Local ASR chunk processing failed.").replace(/\s+/g, " ").slice(0, 160)
  };
}

function isYouTubeLocalAsrOffscreenSender(sender = {}) {
  const url = String(sender.url || "");
  const expectedUrl = globalThis.chrome?.runtime?.getURL
    ? chrome.runtime.getURL(YOUTUBE_LOCAL_ASR_OFFSCREEN_DOCUMENT)
    : YOUTUBE_LOCAL_ASR_OFFSCREEN_DOCUMENT;

  return url === expectedUrl || url.endsWith(`/${YOUTUBE_LOCAL_ASR_OFFSCREEN_DOCUMENT}`);
}

function isYouTubeLocalAsrFallbackStatus(status) {
  return status === "caption_track_missing" ||
    status === "caption_track_not_english" ||
    status === "caption_track_token_missing" ||
    status === "caption_track_fetch_failed" ||
    status === "caption_track_no_segments";
}

function isChromeLocalAsrAvailable() {
  return Boolean(
    globalThis.chrome?.tabCapture?.getMediaStreamId &&
    globalThis.chrome?.offscreen?.createDocument &&
    globalThis.chrome?.runtime?.sendMessage
  );
}

function isYouTubeLocalAsrActiveTabGrantError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return message.includes("activetab") ||
    message.includes("extension has not been invoked") ||
    message.includes("has not been invoked") ||
    message.includes("not invoked");
}

async function getYouTubeLocalAsrStreamId(tabId) {
  try {
    return await getYouTubeLocalAsrStreamIdWithOptions({ targetTabId: tabId });
  } catch (error) {
    if (!isYouTubeLocalAsrActiveTabGrantError(error)) {
      throw error;
    }
  }

  return getYouTubeLocalAsrStreamIdWithOptions({});
}

function getYouTubeLocalAsrStreamIdWithOptions(options) {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(options, (streamId) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(streamId);
    });
  });
}

async function ensureYouTubeLocalAsrOffscreenDocument() {
  const contexts = await getYouTubeLocalAsrOffscreenContexts();

  if (contexts.length > 0) {
    return;
  }

  if (creatingYouTubeLocalAsrOffscreenDocument) {
    await creatingYouTubeLocalAsrOffscreenDocument;
    return;
  }

  creatingYouTubeLocalAsrOffscreenDocument = chrome.offscreen.createDocument({
    url: YOUTUBE_LOCAL_ASR_OFFSCREEN_DOCUMENT,
    reasons: ["USER_MEDIA"],
    justification: "Capture the current YouTube tab audio for user-enabled local Whisper transcription."
  });

  try {
    await creatingYouTubeLocalAsrOffscreenDocument;
  } finally {
    creatingYouTubeLocalAsrOffscreenDocument = null;
  }
}

async function getYouTubeLocalAsrOffscreenContexts() {
  const documentUrl = chrome.runtime.getURL(YOUTUBE_LOCAL_ASR_OFFSCREEN_DOCUMENT);

  if (typeof chrome.runtime.getContexts === "function") {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl]
    });

    return Array.isArray(contexts) ? contexts : [];
  }

  if (typeof chrome.offscreen.getContexts === "function") {
    const contexts = await chrome.offscreen.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl]
    });

    return Array.isArray(contexts) ? contexts : [];
  }

  return [];
}

function sanitizeYouTubeTranscriptRenderDiagnostics(diagnostics) {
  const value = diagnostics && typeof diagnostics === "object" ? diagnostics : {};
  const numericKeys = [
    "translationCount",
    "entryCount",
    "usableTranslationCount",
    "overlayCueCount",
    "missingEntryCount",
    "disconnectedEntryCount",
    "emptyTranslationCount",
    "unmeaningfulTranslationCount",
    "missingTimestampCount",
    "fallbackCueCount"
  ];
  const sanitized = {};

  for (const key of numericKeys) {
    const number = Number(value[key]);
    sanitized[key] = Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
  }

  sanitized.overlayNodeAvailable = value.overlayNodeAvailable === true;
  sanitized.status = sanitizeDiagnosticStatus(value.status) || "unknown";

  return sanitized;
}

function sanitizeDiagnosticStatus(value) {
  const status = String(value ?? "").trim();

  return /^[a-z0-9_:-]{1,80}$/i.test(status) ? status : "";
}

function getYouTubeTranscriptRenderError(diagnostics) {
  if (
    diagnostics.status === "no_usable_translations" ||
    (diagnostics.translationCount > 0 && diagnostics.usableTranslationCount === 0)
  ) {
    return {
      code: "youtube_transcript_no_usable_translations",
      message: "The translation provider did not return usable transcript text."
    };
  }

  if (diagnostics.status === "overlay_unavailable" || diagnostics.overlayNodeAvailable !== true) {
    return {
      code: "youtube_transcript_overlay_unavailable",
      message: "The video overlay container could not be rendered."
    };
  }

  return {
    code: "no_rendered_translations",
    message: "No translated transcript text was rendered."
  };
}

async function sendPageCommand(tabId, message, sender = {}) {
  const senderTabId = Number(sender?.tab?.id);
  const numericTabId = Number.isInteger(Number(tabId)) ? Number(tabId) : senderTabId;
  const fromContentScript = Number.isInteger(senderTabId) && senderTabId === numericTabId;

  if (!Number.isInteger(numericTabId)) {
    return { ok: false, error: { code: "missing_tab", message: "No active tab was found." } };
  }

  if (!fromContentScript && !(await ensureContentScriptReady(numericTabId))) {
    return makeContentScriptUnavailableError();
  }

  return sendTabMessage(numericTabId, message);
}

function connectFloatingControlsPort(port) {
  if (!port || port.name !== FLOATING_CONTROLS_PORT_NAME) {
    return;
  }

  floatingControlsPorts.add(port);

  try {
    port.onDisconnect?.addListener?.(() => {
      floatingControlsPorts.delete(port);
    });
  } catch {
    floatingControlsPorts.delete(port);
  }

  getStoredFloatingControlsHidden()
    .then((hidden) => {
      postFloatingControlsHidden(port, hidden);
    })
    .catch(() => {});
}

function broadcastFloatingControlsHidden(hidden) {
  for (const port of Array.from(floatingControlsPorts)) {
    postFloatingControlsHidden(port, hidden);
  }
}

function postFloatingControlsHidden(port, hidden) {
  try {
    port.postMessage({
      type: MESSAGE_TYPES.APPLY_FLOATING_CONTROLS_HIDDEN,
      floatingControlsHidden: hidden === true
    });
  } catch {
    floatingControlsPorts.delete(port);
  }
}

async function isContentScriptReady(tabId) {
  for (let attempt = 1; attempt <= CONTENT_SCRIPT_READY_ATTEMPTS; attempt += 1) {
    try {
      const response = await sendTabMessage(tabId, {
        type: MESSAGE_TYPES.PING_CONTENT_SCRIPT
      });

      if (response?.ok === true) {
        return true;
      }
    } catch {
      // A manifest content script can be briefly unavailable while the page is still loading.
    }

    if (attempt < CONTENT_SCRIPT_READY_ATTEMPTS) {
      await waitForContentScriptRetry();
    }
  }

  return false;
}

async function ensureContentScriptReady(tabId) {
  if (await isContentScriptReady(tabId)) {
    return true;
  }

  if (!(await injectContentScript(tabId))) {
    return false;
  }

  return isContentScriptReady(tabId);
}

async function injectContentScript(tabId) {
  try {
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== "function") {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE]
    });
    return true;
  } catch {
    return false;
  }
}

function makeContentScriptUnavailableError() {
  return {
    ok: false,
    error: {
      code: "content_script_unavailable",
      message: "This page is not connected to the extension yet. Refresh this page once and try again."
    }
  };
}

function makeOpenPopupUnavailableError() {
  return {
    ok: false,
    error: {
      code: "open_popup_unavailable",
      message: "Open the extension popup from the toolbar to configure Key, Base URL, and model."
    }
  };
}

function makeYouTubeLocalAsrError(code, message) {
  return {
    ok: false,
    status: code,
    error: { code, message }
  };
}

function makeYouTubeTranscriptUnavailableError(status = "") {
  const statusCode = String(status || "caption_track_missing");
  const errorByStatus = {
    caption_track_missing: {
      code: "youtube_caption_track_unavailable",
      message: "This video has no readable YouTube captions."
    },
    caption_track_not_english: {
      code: "youtube_transcript_no_english",
      message: "No readable English caption track was found."
    },
    caption_track_token_missing: {
      code: "youtube_caption_track_token_missing",
      message: "The YouTube player caption request was not observed. Reload the page and try again."
    },
    caption_track_fetch_failed: {
      code: "youtube_caption_track_fetch_failed",
      message: "The YouTube caption track could not be read."
    },
    caption_track_no_segments: {
      code: "youtube_caption_track_unavailable",
      message: "No readable YouTube caption track text was found."
    },
    caption_track_ad_showing: {
      code: "youtube_caption_track_ad_showing",
      message: "Wait until the YouTube ad finishes, then try again."
    },
    caption_track_not_allowed: {
      code: "youtube_caption_track_not_allowed",
      message: "Use the video caption button to start YouTube captions."
    },
    caption_request_cancelled: {
      code: "stale_youtube_transcript_request",
      message: "The transcript translation request is no longer active."
    },
    youtube_local_asr_video_muted: {
      code: "youtube_local_asr_video_muted",
      message: "The YouTube video is muted."
    },
    youtube_local_asr_video_paused: {
      code: "youtube_local_asr_video_paused",
      message: "The YouTube video is paused."
    }
  };
  const error = errorByStatus[statusCode] || {
    code: "youtube_transcript_unavailable",
    message: "YouTube captions are unavailable."
  };

  return {
    ok: false,
    status: statusCode,
    segmentCount: 0,
    error
  };
}

function waitForContentScriptRetry() {
  return new Promise((resolve) => {
    setTimeout(resolve, CONTENT_SCRIPT_READY_RETRY_DELAY_MS);
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response);
    });
  });
}

function sendRuntimeMessageWithTimeout(message, timeoutMs) {
  const timeout = Number(timeoutMs);

  if (!Number.isFinite(timeout) || timeout <= 0 || typeof globalThis.setTimeout !== "function") {
    return sendRuntimeMessage(message);
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error("runtime_message_timeout"));
    }, timeout);

    sendRuntimeMessage(message)
      .then((response) => {
        if (settled) {
          return;
        }
        settled = true;
        if (typeof globalThis.clearTimeout === "function") {
          globalThis.clearTimeout(timer);
        }
        resolve(response);
      })
      .catch((error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (typeof globalThis.clearTimeout === "function") {
          globalThis.clearTimeout(timer);
        }
        reject(error);
      });
  });
}

function getHostname(url) {
  try {
    return new URL(String(url ?? "")).hostname;
  } catch {
    return "";
  }
}

function isYouTubeWatchUrl(url) {
  try {
    const parsed = new URL(String(url ?? ""));
    return /(^|\.)youtube\.com$/i.test(parsed.hostname) && parsed.pathname === "/watch";
  } catch {
    return false;
  }
}
