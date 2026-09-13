(function initPrivateBilingualTranslatorContent(root) {
  const CONTENT_SCRIPT_RUNTIME_VERSION = "t120-youtube-caption-layout-v2";
  const existingContentApi = root.PrivateBilingualTranslatorContent;

  if (existingContentApi?.__runtimeVersion === CONTENT_SCRIPT_RUNTIME_VERSION) {
    return;
  }

  if (existingContentApi) {
    cleanupStaleContentRuntime(root);
  }

  const TEXT_NODE = 3;
  const ELEMENT_NODE = 1;
  const DISPLAY_MODES = {
    BILINGUAL: "bilingual",
    REPLACE: "replace"
  };
  const REVEAL_ATTRIBUTE_NAMES = [
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
  ];
  const FLOATING_AUTO_TRANSLATE_DELAY_MS = 80;
  const FLOATING_AUTO_TRANSLATE_SETTLE_DELAY_MS = 400;
  const FLOATING_AUTO_TRANSLATE_MAX_IN_FLIGHT = 2;
  const YOUTUBE_TRANSCRIPT_BUTTON_TEXT = "幕";
  const YOUTUBE_TRANSCRIPT_RUNTIME_VERSION = CONTENT_SCRIPT_RUNTIME_VERSION;
  const YOUTUBE_TRANSCRIPT_TRANSLATE_TIMEOUT_MS = 30000;
  const YOUTUBE_TRANSCRIPT_CONTROL_UPDATE_DELAY_MS = 80;
  const YOUTUBE_TRANSCRIPT_SILENT_UPDATE_RETRY_MS = 10000;
  const YOUTUBE_CAPTION_CONFIGURATION_ERROR_CODES = new Set([
    "missing_api_key",
    "missing_custom_provider_config",
    "provider_http_error"
  ]);
  const YOUTUBE_CAPTION_TRANSLATE_BEFORE_SECONDS = 5;
  const YOUTUBE_CAPTION_TRANSLATE_AFTER_SECONDS = 90;
  const YOUTUBE_CAPTION_PREFETCH_LEAD_SECONDS = 60;
  const YOUTUBE_CAPTION_TRANSLATE_BATCH_LIMIT = 60;
  const YOUTUBE_CAPTION_WORD_MAX_MS = 500;
  const YOUTUBE_CAPTION_LINE_MAX_MS = 5000;
  const YOUTUBE_CAPTION_ASR_PAUSE_MS = 700;
  const YOUTUBE_CAPTION_LINE_PAUSE_MS = 1500;
  const YOUTUBE_CAPTION_ASR_SENTENCE_MAX_MS = 7000;
  const YOUTUBE_CAPTION_LINE_SENTENCE_MAX_MS = 8000;
  const YOUTUBE_CAPTION_ASR_SENTENCE_MAX_CHARS = 110;
  const YOUTUBE_CAPTION_LINE_SENTENCE_MAX_CHARS = 160;
  const YOUTUBE_CAPTION_SENTENCE_MIN_MS = 1200;
  const YOUTUBE_CAPTION_SENTENCE_TAIL_MS = 400;
  const YOUTUBE_CAPTION_SENTENCE_BRIDGE_GAP_MS = 1000;
  const YOUTUBE_CAPTION_SENTENCE_END_PATTERN = /[.!?…。！？]["'”’)\]]*$/;
  const YOUTUBE_CAPTION_BRACKET_CUE_PATTERN = /^[[(（【][^\])）】]{1,40}[\])）】]$/;
  const YOUTUBE_CAPTION_TRACK_DEFAULT_CANDIDATES = Object.freeze([
    Object.freeze({ languageCode: "en", kind: "" }),
    Object.freeze({ languageCode: "en", kind: "asr" })
  ]);
  const YOUTUBE_CAPTION_TRACK_REQUEST_WAIT_MS = 3000;
  const YOUTUBE_CAPTION_TRACK_REQUEST_POLL_MS = 100;
  const YOUTUBE_CAPTION_TRACK_REQUEST_MEMORY_LIMIT = 8;
  const YOUTUBE_CAPTION_TRACK_SCRIPT_SCAN_LIMIT = 80;
  const YOUTUBE_CAPTION_FONT_HEIGHT_RATIO = 0.036;
  const YOUTUBE_CAPTION_FONT_MIN_PX = 16;
  const YOUTUBE_CAPTION_FONT_MAX_PX = 40;
  const YOUTUBE_CAPTION_SIZE_SCALES = Object.freeze({
    small: 0.85,
    standard: 1,
    large: 1.2,
    xlarge: 1.4
  });
  const YOUTUBE_CAPTION_OVERLAY_Z_INDEX = "40";
  const YOUTUBE_CAPTION_BUTTON_Z_INDEX = "60";
  const YOUTUBE_CAPTION_HINT_Z_INDEX = "61";
  const YOUTUBE_CAPTION_BUTTON_STOPPED_EVENTS = ["dblclick", "mousedown", "mouseup", "pointerdown", "pointerup"];
  const YOUTUBE_PLAYER_CAPTION_TOGGLE_SELECTOR = ".ytp-subtitles-button";
  const YOUTUBE_PLAYER_CAPTION_TOGGLE_DEBOUNCE_MS = 2500;
  const YOUTUBE_NATIVE_CAPTION_SELECTOR = "#movie_player .ytp-caption-window-container";
  const YOUTUBE_LOCAL_ASR_SOURCE = "local_whisper_asr";
  const YOUTUBE_LOCAL_ASR_OVERLAY_MAX_SECONDS = 12;
  const YOUTUBE_TRANSCRIPT_SYNC_DIAGNOSTIC_ATTRIBUTES = [
    "data-pbt-sync-source",
    "data-pbt-sync-track",
    "data-pbt-sync-status",
    "data-pbt-sync-playback",
    "data-pbt-sync-cue",
    "data-pbt-sync-cue-end",
    "data-pbt-sync-cue-count",
    "data-pbt-sync-translated-count"
  ];
  const YOUTUBE_PLAYER_SELECTOR = "#movie_player,.html5-video-player,ytd-player,video";
  const YOUTUBE_CAPTION_TRACK_SOURCE = "caption_track";
  const SESSION_TRANSLATION_CACHE_LIMIT = 600;
  const TARGET_LANGUAGE_SAMPLE_LIMIT = 2400;
  const TARGET_LANGUAGE_MIN_CJK_CHARS = 24;
  const TARGET_LANGUAGE_MIN_CJK_RATIO = 0.58;
  const MESSAGE_TYPES = {
    GET_PAGE_STATUS: "PBT_GET_PAGE_STATUS",
    COLLECT_SEGMENTS: "PBT_COLLECT_SEGMENTS",
    PING_CONTENT_SCRIPT: "PBT_PING_CONTENT_SCRIPT",
    RENDER_TRANSLATIONS: "PBT_RENDER_TRANSLATIONS",
    TRANSLATE_YOUTUBE_TRANSCRIPT: "PBT_TRANSLATE_YOUTUBE_TRANSCRIPT",
    COLLECT_YOUTUBE_TRANSCRIPT: "PBT_COLLECT_YOUTUBE_TRANSCRIPT",
    RENDER_YOUTUBE_TRANSCRIPT: "PBT_RENDER_YOUTUBE_TRANSCRIPT",
    STOP_YOUTUBE_LOCAL_ASR: "PBT_STOP_YOUTUBE_LOCAL_ASR",
    RENDER_YOUTUBE_LOCAL_ASR: "PBT_RENDER_YOUTUBE_LOCAL_ASR",
    REPORT_YOUTUBE_LOCAL_ASR_STATUS: "PBT_REPORT_YOUTUBE_LOCAL_ASR_STATUS",
    RESTORE_PAGE: "PBT_RESTORE_PAGE",
    REMOVE_TRANSLATIONS: "PBT_REMOVE_TRANSLATIONS",
    PREPARE_TRANSLATION: "PBT_PREPARE_TRANSLATION",
    SHOW_FLOATING_TRANSLATE_BUTTON: "PBT_SHOW_FLOATING_TRANSLATE_BUTTON",
    TRANSLATE_PAGE: "PBT_TRANSLATE_PAGE",
    SET_SITE_DISPLAY_MODE: "PBT_SET_SITE_DISPLAY_MODE",
    SET_SITE_TRANSLATION_SETTINGS: "PBT_SET_SITE_TRANSLATION_SETTINGS",
    SET_FLOATING_CONTROLS_HIDDEN: "PBT_SET_FLOATING_CONTROLS_HIDDEN",
    APPLY_FLOATING_CONTROLS_HIDDEN: "PBT_APPLY_FLOATING_CONTROLS_HIDDEN",
    OPEN_EXTENSION_POPUP: "PBT_OPEN_EXTENSION_POPUP"
  };
  const FLOATING_CONTROLS_PORT_NAME = "pbt-floating-controls";
  const EXCLUDED_TAGS = new Set([
    "INPUT",
    "TEXTAREA",
    "SCRIPT",
    "STYLE",
    "CODE",
    "PRE",
    "KBD",
    "SAMP",
    "NOSCRIPT",
    "BUTTON",
    "SVG",
    "CANVAS",
    "MATH",
    "IFRAME"
  ]);
  const INTERACTIVE_TEXT_EXCLUDED_ROLES = new Set([
    "button",
    "checkbox",
    "menuitem",
    "option",
    "radio",
    "switch",
    "tab"
  ]);
  const IDENTITY_ATTRIBUTE_NAMES = [
    "data-testid",
    "data-test-id",
    "data-qa",
    "class",
    "id",
    "name",
    "itemprop",
    "rel",
    "aria-label",
    "title",
    "alt"
  ];
  const IDENTITY_CONTEXT_PATTERN = /(^|[^a-z0-9])(user[-_ ]?name|screen[-_ ]?name|display[-_ ]?name|profile[-_ ]?name|account[-_ ]?name|author[-_ ]?name|user[-_ ]?id|profile[-_ ]?id|account[-_ ]?id|handle|byline)([^a-z0-9]|$)/i;
  const AUTHOR_ITEMPROP_PATTERN = /(^|[^a-z0-9])(author|creator)([^a-z0-9]|$)/i;
  const SOCIAL_HANDLE_PATTERN = /^@[\w.-]{1,64}(?:\s*[·•]\s*(?:now|\d+[smhdwy]))?$/i;
  const EXPLICIT_ID_PATTERN = /^(?:id|uid|user\s*id|account\s*id|用户\s*id|账号\s*id)\s*[:#]?\s*[a-z0-9_-]{2,80}$/i;
  const TRANSIENT_OVERLAY_ROLES = new Set(["tooltip", "menu", "listbox"]);
  const TRANSIENT_OVERLAY_DATA_ATTRIBUTE_NAMES = ["data-testid", "data-test-id"];
  const TRANSIENT_OVERLAY_UI_ATTRIBUTE_NAMES = ["class", "id"];
  const TRANSIENT_OVERLAY_DATA_PATTERN = /(^|[^a-z0-9])(hover[-_ ]?card|profile[-_ ]?card|user[-_ ]?card|tooltip|popover|popper|tippy|dropdown|flyout)([^a-z0-9]|$)/i;
  const TRANSIENT_OVERLAY_UI_PATTERN = /(^|[^a-z0-9])(hover[-_ ]?card|tooltip|popover|popper|tippy|dropdown|flyout)([^a-z0-9]|$)/i;
  const SECONDARY_RAIL_ATTRIBUTE_NAMES = ["data-testid", "data-test-id", "data-qa", "class", "id", "aria-label", "title"];
  const SECONDARY_RAIL_PATTERN = /(^|[^a-z0-9])(right rail|right sidebar|side rail|sidebar|sidebar column|recommend(?:ed|ation|ations|s)?|suggest(?:ed|ion|ions|s)?|related|trend(?:ing|s)?|what s happening|who to follow|live|broadcast|promoted|sponsor(?:ed)?)([^a-z0-9]|$)/i;
  const SOCIAL_HOST_PATTERN = /(^|\.)((x|twitter|instagram|threads|facebook|linkedin|tiktok|reddit)\.com|bsky\.app|mastodon\.social)$/i;
  const NON_PROFILE_SOCIAL_PATHS = new Set([
    "about",
    "compose",
    "explore",
    "hashtag",
    "help",
    "home",
    "i",
    "messages",
    "notifications",
    "p",
    "reel",
    "search",
    "settings"
  ]);
  const state = {
    nextSegmentId: 1,
    pendingTranslationIndicators: new Map(),
    sessionTranslationCache: new Map(),
    sessionTranslationReuseSuspended: false,
    textNodesById: new Map(),
    textNodeCollectionIds: new WeakMap(),
    replacedTextNodes: new Map(),
    replaceMarkedElements: new Set(),
    bilingualTranslatedTextNodes: new Map(),
    bilingualTranslationNodes: new Map(),
    floatingPanel: null,
    floatingQualityMode: "free",
    floatingPaidProvider: "gemini",
    floatingDisplayMode: DISPLAY_MODES.BILINGUAL,
    floatingCaptionSize: "standard",
    floatingTranslated: false,
    floatingTranslatedSettingsSignature: "",
    floatingSettingsOpen: false,
    floatingHidden: false,
    floatingControlsPort: null,
    floatingOutsideClickBound: false,
    floatingObserver: null,
    floatingManualTranslateInFlight: false,
    floatingAutoTranslateNextRequestId: 1,
    floatingAutoTranslateProgressIds: new Set(),
    floatingAutoTranslateTimer: null,
    floatingAutoTranslateSettleTimer: null,
    floatingAutoTranslateSettlePending: false,
    floatingAutoTranslatePausedForTargetLanguage: false,
    floatingAutoTranslateForce: false,
    floatingAutoTranslateInFlight: false,
    floatingAutoTranslateInFlightCount: 0,
    floatingAutoTranslatePending: false,
    floatingStoredAutoTranslate: false,
    floatingInitialAutoTranslateRequested: false,
    floatingContextInvalidated: false,
    youtubeTranscriptButton: null,
    youtubeTranscriptHint: null,
    youtubeTranscriptHintTimer: null,
    youtubeTranscriptButtonPositionKey: "",
    youtubeTranscriptPositionEventsBound: false,
    youtubeTranscriptTranslateRequestId: 0,
    youtubeTranscriptTranslateTimer: null,
    youtubeTranscriptOverlayNode: null,
    youtubeCaptionTimeline: createEmptyYouTubeCaptionTimeline(),
    youtubeCaptionOverlayRender: createYouTubeCaptionOverlayRenderState(),
    youtubeCaptionOverlayFrameRequested: false,
    youtubeCaptionPrefetchCheckKey: "",
    youtubeCaptionConfigurationHintKey: "",
    youtubeTimedTextRequestUrls: new Map(),
    youtubeTimedTextObserver: null,
    youtubeNativeCaptionStyle: null,
    youtubeTranscriptAutoUpdateLastFailedTime: 0,
    youtubeTranscriptAutoUpdateLastRequestKey: "",
    youtubeTranscriptAutoUpdateLastRequestTime: 0,
    youtubeTranscriptOverlayVideo: null,
    youtubeTranscriptPlayerElement: null,
    youtubeTranscriptVideoElement: null,
    youtubePlayerCaptionToggleRequestedVideoId: "",
    youtubePlayerCaptionToggleRequestedAt: 0,
    youtubeTranscriptTranslated: false,
    youtubeTranscriptTranslateInFlight: false,
    youtubeLocalAsrActive: false,
    youtubeLocalAsrRequestId: 0,
    youtubeLocalAsrDiagnostics: {
      state: "idle",
      error: "none",
      active: false,
      requestId: "none",
      videoMuted: "unknown",
      videoPaused: "unknown"
    },
    youtubeTranscriptCostConfirmationPending: false,
    youtubeTranscriptControlsUpdateQueued: false,
    youtubeCaptionHostResizeObserver: null,
    youtubeCaptionObservedHost: null
  };

  function collectSegments(doc, options = {}) {
    const currentDocument = doc || root.document;
    const incremental = options.incremental === true;
    const showPendingIndicators = options.showPendingIndicators === true;
    const displayMode = normalizeDisplayMode(options.displayMode ?? state.floatingDisplayMode);
    const segments = [];
    let cachedRenderedCount = 0;

    cleanupStaleReplacedEntries();
    cleanupStaleBilingualEntries();

    if (incremental) {
      cleanupCollectedTextNodes();
    } else {
      clearCollectedTextNodes();
    }

    if (!currentDocument || !currentDocument.body) {
      return { ok: true, segments };
    }

    walkNode(currentDocument.body, (textNode) => {
      const text = normalizeText(textNode.nodeValue);

      if (!text) {
        return;
      }

      if (incremental && hasCollectedTextNode(textNode, text)) {
        return;
      }

      if (incremental && !state.sessionTranslationReuseSuspended && renderCachedSessionTranslationForTextNode(textNode, text, displayMode)) {
        cachedRenderedCount += 1;
        return;
      }

      const id = `pbt-segment-${state.nextSegmentId}`;
      state.nextSegmentId += 1;
      state.textNodesById.set(id, { textNode, sourceText: text });
      state.textNodeCollectionIds.set(textNode, { id, sourceText: text });
      if (showPendingIndicators) {
        attachPendingTranslationIndicator(id, textNode);
      }
      segments.push({ id, text });
    }, { skipAutoIncrementalSecondarySurfaces: incremental });

    return { ok: true, segments, cachedRenderedCount };
  }

  function renderTranslations({ displayMode, translations }) {
    if (!Array.isArray(translations)) {
      return { ok: false, error: { code: "invalid_translations", message: "Invalid translations." } };
    }

    let result;

    if (displayMode === DISPLAY_MODES.REPLACE) {
      removeBilingualTranslations();
      result = renderReplace(translations);
    } else {
      result = renderBilingual(translations);
    }

    if (result.ok && result.renderedCount > 0) {
      resumeSessionTranslationReuse();
      setFloatingTranslated(true);
    }

    return result;
  }

  function createEmptyYouTubeCaptionTimeline() {
    return {
      videoId: "",
      source: "none",
      trackKind: "none",
      sentences: [],
      sentencesById: new Map(),
      translationsById: new Map(),
      settledKeys: new Set(),
      pendingSignature: ""
    };
  }

  function createYouTubeCaptionOverlayRenderState() {
    return {
      cueKey: "",
      positionKey: "",
      diagnosticsKey: ""
    };
  }

  function resetYouTubeCaptionTimeline() {
    state.youtubeCaptionTimeline = createEmptyYouTubeCaptionTimeline();
    return state.youtubeCaptionTimeline;
  }

  function setYouTubeCaptionTimelineSentences(timeline, sentences) {
    timeline.sentences = Array.isArray(sentences) ? sentences : [];
    timeline.sentencesById = new Map(timeline.sentences.map((sentence) => [sentence.id, sentence]));
  }

  async function collectYouTubeTranscriptSegmentsForTranslation(options = {}) {
    const currentDocument = options.doc || root.document;

    if (!isYouTubeWatchPage() || !currentDocument || !currentDocument.body) {
      return { ok: true, status: "unsupported_page", segments: [] };
    }

    if (options.allowYouTubeCaptionTrack !== true) {
      return { ok: true, status: "caption_track_not_allowed", segments: [] };
    }

    const videoId = getYouTubeWatchVideoId();
    let timeline = state.youtubeCaptionTimeline;

    if (
      timeline.source !== YOUTUBE_CAPTION_TRACK_SOURCE ||
      timeline.videoId !== videoId ||
      timeline.sentences.length === 0
    ) {
      const allowPlayerCaptionToggle = options.allowYouTubePlayerCaptionToggle === true;

      if (allowPlayerCaptionToggle) {
        hideYouTubeNativeCaptions(currentDocument);
      }

      const loaded = await loadYouTubeCaptionTrack(currentDocument, videoId, { allowPlayerCaptionToggle });

      if (!isActiveYouTubeTranscriptRequest(options.requestId) || getYouTubeWatchVideoId() !== videoId) {
        return { ok: true, status: "caption_request_cancelled", segments: [] };
      }

      if (loaded.status !== "ready") {
        return getYouTubeCaptionUnavailableResult(currentDocument, loaded.status, options);
      }

      timeline = resetYouTubeCaptionTimeline();
      timeline.videoId = videoId;
      timeline.source = YOUTUBE_CAPTION_TRACK_SOURCE;
      timeline.trackKind = loaded.trackKind;
      setYouTubeCaptionTimelineSentences(timeline, loaded.sentences);
    }

    timeline.pendingSignature = getYouTubeCaptionProviderSignature();
    startYouTubeTranscriptOverlay();

    const segments = pickYouTubeCaptionSentencesForTranslation(timeline, getYouTubePlaybackSeconds(currentDocument))
      .map((sentence) => ({ id: sentence.id, text: sentence.text }));

    return {
      ok: true,
      status: segments.length > 0 ? "ready" : "ready_cached",
      source: YOUTUBE_CAPTION_TRACK_SOURCE,
      segments,
      cachedCueCount: timeline.translationsById.size,
      videoId
    };
  }

  function getYouTubeCaptionUnavailableResult(doc, status, options = {}) {
    if (options.allowYouTubeLocalWhisperAsr === true && status !== "caption_track_ad_showing") {
      const localAsrPlaybackError = getYouTubeLocalAsrPlaybackPreflightError(doc);

      if (localAsrPlaybackError?.code) {
        return { ok: true, status: localAsrPlaybackError.code, segments: [] };
      }
    }

    return { ok: true, status: String(status || "caption_track_missing"), segments: [] };
  }

  async function loadYouTubeCaptionTrack(doc, videoId, options = {}) {
    if (!videoId) {
      return { status: "caption_track_missing" };
    }

    if (typeof root.fetch !== "function") {
      return { status: "caption_track_fetch_failed" };
    }

    const trackCandidates = getYouTubeCaptionTrackCandidates(doc, videoId);

    if (trackCandidates.status !== "ready") {
      return { status: trackCandidates.status };
    }

    const request = await ensureYouTubeTimedTextRequestUrl(doc, videoId, {
      ...options,
      captionsListed: trackCandidates.listed && trackCandidates.tracks.length > 0
    });

    try {
      if (!request.url) {
        return { status: request.status };
      }

      return await fetchYouTubeCaptionTrackSentences(
        getYouTubeCaptionTrackRequestCandidates(request.url, trackCandidates),
        request.url
      );
    } finally {
      if (request.captionsTurnedOn) {
        restoreYouTubePlayerCaptions(doc);
      }
    }
  }

  function getYouTubeCaptionTrackCandidates(doc, videoId) {
    const response = extractYouTubeInitialPlayerResponse(doc);

    if (!response || String(response?.videoDetails?.videoId ?? "") !== videoId) {
      return { status: "ready", listed: false, tracks: [] };
    }

    const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!Array.isArray(tracks) || tracks.length === 0) {
      return { status: "caption_track_missing", listed: true, tracks: [] };
    }

    const englishTracks = tracks
      .filter((track) => isYouTubeEnglishCaptionTrack(track) && String(track?.languageCode ?? ""))
      .sort((left, right) => getYouTubeCaptionTrackScore(right) - getYouTubeCaptionTrackScore(left))
      .map((track) => ({
        languageCode: String(track.languageCode),
        kind: String(track?.kind ?? "").toLowerCase() === "asr" ? "asr" : ""
      }));

    return englishTracks.length > 0
      ? { status: "ready", listed: true, tracks: englishTracks }
      : { status: "caption_track_not_english", listed: true, tracks: [] };
  }

  function getYouTubeCaptionTrackRequestCandidates(requestUrl, trackCandidates) {
    const candidates = [];
    const seen = new Set();
    const add = (candidate) => {
      const languageCode = String(candidate?.languageCode ?? "");
      const kind = candidate?.kind === "asr" ? "asr" : "";
      const key = `${languageCode.toLowerCase()}|${kind}`;

      if (languageCode && !seen.has(key)) {
        seen.add(key);
        candidates.push({ languageCode, kind });
      }
    };

    if (trackCandidates.listed) {
      trackCandidates.tracks.forEach(add);
      return candidates;
    }

    const capturedUrl = parseYouTubeTimedTextRequestUrl(requestUrl);
    const capturedLanguage = String(capturedUrl?.searchParams.get("lang") ?? "");

    add(YOUTUBE_CAPTION_TRACK_DEFAULT_CANDIDATES[0]);

    if (/^en(?:-|$)/i.test(capturedLanguage)) {
      add({ languageCode: capturedLanguage, kind: capturedUrl.searchParams.get("kind") });
    }

    add(YOUTUBE_CAPTION_TRACK_DEFAULT_CANDIDATES[1]);
    return candidates;
  }

  async function fetchYouTubeCaptionTrackSentences(candidates, requestUrl) {
    let fetchFailed = false;

    for (const candidate of candidates) {
      const url = createYouTubeCaptionTrackRequestUrl(requestUrl, candidate);

      if (!url) {
        continue;
      }

      const result = await fetchYouTubeCaptionTrackPayload(url);

      if (!result.ok) {
        fetchFailed = fetchFailed || result.failed === true;
        continue;
      }

      const built = buildYouTubeCaptionSentences(result.payload, candidate.kind);

      if (built.sentences.length > 0) {
        return { status: "ready", trackKind: built.trackKind, sentences: built.sentences };
      }
    }

    return { status: fetchFailed ? "caption_track_fetch_failed" : "caption_track_no_segments" };
  }

  async function fetchYouTubeCaptionTrackPayload(url) {
    try {
      const response = await root.fetch(url, {
        method: "GET",
        credentials: "omit"
      });

      if (!response || response.ok !== true) {
        return { ok: false, failed: true };
      }

      if (typeof response.text === "function") {
        const text = String(await response.text() ?? "");

        return text.trim()
          ? { ok: true, payload: JSON.parse(text) }
          : { ok: false, failed: false };
      }

      if (typeof response.json === "function") {
        return { ok: true, payload: await response.json() };
      }
    } catch {
      return { ok: false, failed: true };
    }

    return { ok: false, failed: true };
  }

  function createYouTubeCaptionTrackRequestUrl(requestUrl, candidate) {
    const url = parseYouTubeTimedTextRequestUrl(requestUrl);

    if (!url) {
      return "";
    }

    url.searchParams.set("lang", String(candidate?.languageCode || "en"));

    if (candidate?.kind === "asr") {
      url.searchParams.set("kind", "asr");
    } else {
      url.searchParams.delete("kind");
    }

    url.searchParams.delete("tlang");
    url.searchParams.set("fmt", "json3");
    return url.toString();
  }

  async function ensureYouTubeTimedTextRequestUrl(doc, videoId, options = {}) {
    startYouTubeTimedTextRequestObserver();

    const existingUrl = findYouTubeTimedTextRequestUrl(videoId);

    if (existingUrl) {
      return { url: existingUrl, status: "ready", captionsTurnedOn: false };
    }

    if (options.allowPlayerCaptionToggle !== true) {
      return { url: "", status: "caption_track_token_missing", captionsTurnedOn: false };
    }

    if (isYouTubeAdShowing(findYouTubePlayerElement(doc))) {
      return { url: "", status: "caption_track_ad_showing", captionsTurnedOn: false };
    }

    const toggle = requestYouTubePlayerCaptions(doc, videoId);

    if (toggle.status === "player_caption_toggle_missing" || toggle.status === "player_caption_toggle_disabled") {
      return {
        url: "",
        status: options.captionsListed === true ? "caption_track_token_missing" : "caption_track_missing",
        captionsTurnedOn: false
      };
    }

    const url = await waitForYouTubeTimedTextRequestUrl(videoId);

    return {
      url,
      status: url ? "ready" : "caption_track_token_missing",
      captionsTurnedOn: toggle.captionsTurnedOn === true
    };
  }

  function startYouTubeTimedTextRequestObserver() {
    if (state.youtubeTimedTextObserver || typeof root.PerformanceObserver !== "function") {
      return;
    }

    try {
      const observer = new root.PerformanceObserver((list) => {
        rememberYouTubeTimedTextRequestEntries(typeof list?.getEntries === "function" ? list.getEntries() : []);
      });
      observer.observe({ type: "resource", buffered: true });
      state.youtubeTimedTextObserver = observer;
    } catch {
      state.youtubeTimedTextObserver = null;
    }
  }

  function stopYouTubeTimedTextRequestObserver() {
    try {
      state.youtubeTimedTextObserver?.disconnect?.();
    } catch {}

    state.youtubeTimedTextObserver = null;
    state.youtubeTimedTextRequestUrls.clear();
  }

  function rememberYouTubeTimedTextRequestEntries(entries) {
    for (const entry of Array.from(entries || [])) {
      const name = String(entry?.name ?? "");

      if (!name.includes("/api/timedtext")) {
        continue;
      }

      const url = parseYouTubeTimedTextRequestUrl(name);
      const videoId = String(url?.searchParams.get("v") ?? "");

      if (!videoId) {
        continue;
      }

      state.youtubeTimedTextRequestUrls.delete(videoId);
      state.youtubeTimedTextRequestUrls.set(videoId, url.toString());

      while (state.youtubeTimedTextRequestUrls.size > YOUTUBE_CAPTION_TRACK_REQUEST_MEMORY_LIMIT) {
        state.youtubeTimedTextRequestUrls.delete(state.youtubeTimedTextRequestUrls.keys().next().value);
      }
    }
  }

  function parseYouTubeTimedTextRequestUrl(value) {
    let url = null;

    try {
      url = new URL(String(value ?? ""));
    } catch {
      return null;
    }

    return isYouTubeCaptionTrackTimedTextUrl(url) && url.searchParams.get("pot") ? url : null;
  }

  function findYouTubeTimedTextRequestUrl(videoId) {
    if (!videoId) {
      return "";
    }

    if (!state.youtubeTimedTextRequestUrls.has(videoId)) {
      try {
        rememberYouTubeTimedTextRequestEntries(root.performance?.getEntriesByType?.("resource"));
      } catch {}
    }

    return state.youtubeTimedTextRequestUrls.get(videoId) || "";
  }

  async function waitForYouTubeTimedTextRequestUrl(videoId) {
    const attempts = Math.max(1, Math.ceil(
      YOUTUBE_CAPTION_TRACK_REQUEST_WAIT_MS / YOUTUBE_CAPTION_TRACK_REQUEST_POLL_MS
    ));

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const url = findYouTubeTimedTextRequestUrl(videoId);

      if (url || typeof root.setTimeout !== "function") {
        return url;
      }

      await new Promise((resolve) => {
        root.setTimeout(resolve, YOUTUBE_CAPTION_TRACK_REQUEST_POLL_MS);
      });
    }

    return findYouTubeTimedTextRequestUrl(videoId);
  }

  function requestYouTubePlayerCaptions(doc, videoId) {
    const button = findYouTubePlayerCaptionToggleButton(doc);

    if (!button) {
      return { status: "player_caption_toggle_missing", captionsTurnedOn: false };
    }

    if (isYouTubePlayerCaptionToggleDisabled(button)) {
      return { status: "player_caption_toggle_disabled", captionsTurnedOn: false };
    }

    const now = Date.now();
    const requestedAt = Number(state.youtubePlayerCaptionToggleRequestedAt);

    if (
      state.youtubePlayerCaptionToggleRequestedVideoId === videoId &&
      Number.isFinite(requestedAt) &&
      now - requestedAt < YOUTUBE_PLAYER_CAPTION_TOGGLE_DEBOUNCE_MS
    ) {
      return { status: "player_caption_toggle_pending", captionsTurnedOn: false };
    }

    state.youtubePlayerCaptionToggleRequestedVideoId = videoId;
    state.youtubePlayerCaptionToggleRequestedAt = now;

    if (isYouTubePlayerCaptionTogglePressed(button)) {
      // Captions are already on but their request was not observed; toggling makes the player request the track again.
      const reloaded = clickYouTubePageControl(button) && clickYouTubePageControl(button);
      return { status: reloaded ? "player_caption_toggle_reloaded" : "player_caption_toggle_click_failed", captionsTurnedOn: false };
    }

    const clicked = clickYouTubePageControl(button);
    return { status: clicked ? "player_caption_toggle_clicked" : "player_caption_toggle_click_failed", captionsTurnedOn: clicked };
  }

  function restoreYouTubePlayerCaptions(doc) {
    const button = findYouTubePlayerCaptionToggleButton(doc);

    if (button && isYouTubePlayerCaptionTogglePressed(button)) {
      clickYouTubePageControl(button);
    }
  }

  function hideYouTubeNativeCaptions(doc) {
    if (state.youtubeNativeCaptionStyle?.parentNode || !doc || typeof doc.createElement !== "function") {
      return;
    }

    const parent = doc.head || doc.body;

    if (!parent || typeof parent.appendChild !== "function") {
      return;
    }

    const style = doc.createElement("style");
    style.setAttribute("data-pbt-control", "youtube-native-caption-style");
    style.textContent = `${YOUTUBE_NATIVE_CAPTION_SELECTOR}{visibility:hidden !important;}`;
    parent.appendChild(style);
    state.youtubeNativeCaptionStyle = style;
  }

  function showYouTubeNativeCaptions() {
    if (state.youtubeNativeCaptionStyle && typeof state.youtubeNativeCaptionStyle.remove === "function") {
      state.youtubeNativeCaptionStyle.remove();
    }

    state.youtubeNativeCaptionStyle = null;
  }

  function buildYouTubeCaptionSentences(payload, requestedKind = "") {
    const tokens = collectYouTubeCaptionTokens(payload);
    const wordTimed = tokens.some((token) => token.word);

    return {
      trackKind: wordTimed ? "asr" : requestedKind === "asr" ? "asr_lines" : "manual",
      sentences: finalizeYouTubeCaptionSentences(groupYouTubeCaptionTokens(tokens, wordTimed ? "asr" : "manual"))
    };
  }

  function collectYouTubeCaptionTokens(payload) {
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const tokens = [];

    for (const event of events) {
      const startMs = Number(event?.tStartMs);
      const segments = Array.isArray(event?.segs) ? event.segs : [];

      if (!Number.isFinite(startMs) || startMs < 0 || segments.length === 0) {
        continue;
      }

      const durationMs = Number(event?.dDurationMs);
      const eventEndMs = Number.isFinite(durationMs) && durationMs > 0 ? startMs + durationMs : null;
      const wordTimed = segments.some((segment) => Number.isFinite(Number(segment?.tOffsetMs)));

      if (!wordTimed) {
        const text = normalizeYouTubeCaptionText(segments.map((segment) => String(segment?.utf8 ?? "")).join(""));

        if (text) {
          tokens.push({ startMs, endMs: eventEndMs, eventEndMs, text, word: false });
        }

        continue;
      }

      for (const segment of segments) {
        const text = normalizeYouTubeCaptionText(segment?.utf8);
        const offsetMs = Number(segment?.tOffsetMs);

        if (text) {
          tokens.push({
            startMs: startMs + (Number.isFinite(offsetMs) && offsetMs > 0 ? offsetMs : 0),
            endMs: null,
            eventEndMs,
            text,
            word: true
          });
        }
      }
    }

    tokens.sort((left, right) => left.startMs - right.startMs);

    for (let index = 0; index < tokens.length; index += 1) {
      const token = tokens[index];

      if (Number.isFinite(token.endMs) && token.endMs > token.startMs) {
        continue;
      }

      let endMs = token.startMs + (token.word ? YOUTUBE_CAPTION_WORD_MAX_MS : YOUTUBE_CAPTION_LINE_MAX_MS);
      const nextStartMs = Number(tokens[index + 1]?.startMs);

      if (Number.isFinite(nextStartMs) && nextStartMs > token.startMs) {
        endMs = Math.min(endMs, nextStartMs);
      }

      if (Number.isFinite(token.eventEndMs) && token.eventEndMs > token.startMs) {
        endMs = Math.min(endMs, token.eventEndMs);
      }

      token.endMs = endMs;
    }

    return tokens;
  }

  function groupYouTubeCaptionTokens(tokens, trackKind) {
    const asr = trackKind === "asr";
    const pauseMs = asr ? YOUTUBE_CAPTION_ASR_PAUSE_MS : YOUTUBE_CAPTION_LINE_PAUSE_MS;
    const maxMs = asr ? YOUTUBE_CAPTION_ASR_SENTENCE_MAX_MS : YOUTUBE_CAPTION_LINE_SENTENCE_MAX_MS;
    const maxChars = asr ? YOUTUBE_CAPTION_ASR_SENTENCE_MAX_CHARS : YOUTUBE_CAPTION_LINE_SENTENCE_MAX_CHARS;
    const groups = [];
    let current = null;

    const flush = () => {
      if (current) {
        groups.push({
          startMs: current.startMs,
          endMs: current.endMs,
          text: normalizeYouTubeCaptionText(current.parts.join(" "))
        });
      }

      current = null;
    };

    for (const token of tokens) {
      const bracketCue = YOUTUBE_CAPTION_BRACKET_CUE_PATTERN.test(token.text);

      if (current && (
        bracketCue ||
        current.bracketCue ||
        token.startMs - current.endMs >= pauseMs ||
        token.endMs - current.startMs > maxMs ||
        current.length + 1 + token.text.length > maxChars
      )) {
        flush();
      }

      if (!current) {
        current = { startMs: token.startMs, endMs: token.endMs, parts: [], length: -1, bracketCue };
      }

      current.parts.push(token.text);
      current.length += 1 + token.text.length;
      current.endMs = Math.max(current.endMs, token.endMs);

      if (
        YOUTUBE_CAPTION_SENTENCE_END_PATTERN.test(token.text) &&
        current.endMs - current.startMs >= YOUTUBE_CAPTION_SENTENCE_MIN_MS
      ) {
        flush();
      }
    }

    flush();
    return groups.filter((group) => group.text);
  }

  function finalizeYouTubeCaptionSentences(groups) {
    const sentences = [];
    const seen = new Set();

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const nextStartMs = Number(groups[index + 1]?.startMs);
      let endMs = Math.max(
        group.endMs + YOUTUBE_CAPTION_SENTENCE_TAIL_MS,
        group.startMs + YOUTUBE_CAPTION_SENTENCE_MIN_MS
      );

      if (Number.isFinite(nextStartMs)) {
        if (nextStartMs - endMs < YOUTUBE_CAPTION_SENTENCE_BRIDGE_GAP_MS) {
          endMs = nextStartMs;
        }

        endMs = Math.min(endMs, nextStartMs);
      }

      if (endMs <= group.startMs) {
        continue;
      }

      const startSeconds = group.startMs / 1000;
      const id = getYouTubeTimelineCueId("caption", startSeconds, group.text);

      if (seen.has(id)) {
        continue;
      }

      seen.add(id);
      sentences.push({ id, startSeconds, endSeconds: endMs / 1000, text: group.text });
    }

    return sentences;
  }

  function normalizeYouTubeCaptionText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function findYouTubeCaptionSentenceIndexAt(sentences, seconds) {
    let low = 0;
    let high = sentences.length - 1;
    let found = -1;

    while (low <= high) {
      const middle = Math.floor((low + high) / 2);

      if (sentences[middle].startSeconds <= seconds) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    return found;
  }

  function findYouTubeCaptionSentenceAt(sentences, seconds) {
    if (!Array.isArray(sentences) || typeof seconds !== "number" || !Number.isFinite(seconds)) {
      return null;
    }

    const sentence = sentences[findYouTubeCaptionSentenceIndexAt(sentences, seconds)] ?? null;
    return sentence && seconds < sentence.endSeconds ? sentence : null;
  }

  function pickYouTubeCaptionSentencesForTranslation(timeline, playbackSeconds, options = {}) {
    const sentences = Array.isArray(timeline?.sentences) ? timeline.sentences : [];
    const currentSeconds = typeof playbackSeconds === "number" && Number.isFinite(playbackSeconds) ? playbackSeconds : 0;
    const fromSeconds = Math.max(0, currentSeconds - YOUTUBE_CAPTION_TRANSLATE_BEFORE_SECONDS);
    const toSeconds = currentSeconds + (options.horizonSeconds ?? YOUTUBE_CAPTION_TRANSLATE_AFTER_SECONDS);
    const limit = options.limit ?? YOUTUBE_CAPTION_TRANSLATE_BATCH_LIMIT;
    const signature = options.signature ?? getYouTubeCaptionProviderSignature();
    const picked = [];

    for (
      let index = Math.max(0, findYouTubeCaptionSentenceIndexAt(sentences, fromSeconds));
      index < sentences.length && picked.length < limit;
      index += 1
    ) {
      const sentence = sentences[index];

      if (sentence.startSeconds > toSeconds) {
        break;
      }

      if (sentence.endSeconds > fromSeconds && !timeline.settledKeys.has(getYouTubeCaptionSettledKey(signature, sentence.id))) {
        picked.push(sentence);
      }
    }

    return picked;
  }

  function getYouTubePlaybackSeconds(doc) {
    const seconds = Number(findYouTubeVideoElement(doc)?.currentTime);

    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  function isYouTubeAdShowing(player) {
    const className = String(player?.className ?? player?.getAttribute?.("class") ?? "");

    return /(^|\s)ad-(showing|interrupting)(\s|$)/.test(className);
  }

  function renderYouTubeTranscriptTranslations(payload = {}) {
    const { translations, requestId } = payload;

    if (isStaleYouTubeTranscriptRenderRequest(requestId)) {
      return makeStaleYouTubeTranscriptRenderResult();
    }

    if (!Array.isArray(translations)) {
      return { ok: false, error: { code: "invalid_translations", message: "Invalid translations." } };
    }

    const timeline = state.youtubeCaptionTimeline;
    const payloadVideoId = String(payload.videoId ?? "");

    if (
      timeline.source !== YOUTUBE_CAPTION_TRACK_SOURCE ||
      !timeline.videoId ||
      timeline.videoId !== getYouTubeWatchVideoId() ||
      (payloadVideoId && payloadVideoId !== timeline.videoId)
    ) {
      return makeStaleYouTubeTranscriptRenderResult();
    }

    const diagnostics = createYouTubeTranscriptRenderDiagnostics(translations);
    const signature = timeline.pendingSignature || getYouTubeCaptionProviderSignature();

    for (const translation of translations) {
      const id = String(translation?.id ?? "");
      const sentence = timeline.sentencesById.get(id);
      const translatedText = String(translation?.text ?? "").trim();

      if (!sentence) {
        diagnostics.missingEntryCount += 1;
        continue;
      }

      timeline.settledKeys.add(getYouTubeCaptionSettledKey(signature, id));

      if (!translatedText) {
        diagnostics.emptyTranslationCount += 1;
        continue;
      }

      if (!isMeaningfulTranslation(sentence.text, translatedText)) {
        diagnostics.unmeaningfulTranslationCount += 1;
        continue;
      }

      timeline.translationsById.set(id, { text: translatedText, signature });
      diagnostics.usableTranslationCount += 1;
    }

    startYouTubeTranscriptOverlay();
    diagnostics.overlayNodeAvailable = Boolean(state.youtubeTranscriptOverlayNode);
    diagnostics.overlayCueCount = timeline.translationsById.size;
    diagnostics.status = getYouTubeTranscriptRenderStatus(diagnostics);
    state.youtubeTranscriptTranslated = timeline.translationsById.size > 0;
    updateFloatingPanelControls();

    return { ok: true, renderedCount: diagnostics.usableTranslationCount, diagnostics };
  }

  function makeStaleYouTubeTranscriptRenderResult() {
    return {
      ok: false,
      stale: true,
      error: {
        code: "stale_youtube_transcript_request",
        message: "The transcript translation request is no longer active."
      }
    };
  }

  function renderYouTubeLocalAsrTranslation({ id, sourceText, translatedText, requestId } = {}) {
    const currentDocument = root.document;

    if (!isYouTubeWatchPage() || !currentDocument || !currentDocument.body) {
      setYouTubeLocalAsrDiagnosticState("render-failed", {
        error: "youtube_local_asr_unsupported_page",
        requestId
      });
      return { ok: false, renderedCount: 0, error: { code: "youtube_local_asr_unsupported_page" } };
    }

    const normalizedSource = sanitizeYouTubeLocalAsrOverlayText(sourceText);
    const normalizedTranslation = sanitizeYouTubeLocalAsrOverlayText(translatedText);

    if (
      !isActiveYouTubeLocalAsrRequest(requestId) ||
      (!state.youtubeLocalAsrActive && state.youtubeTranscriptTranslated === false)
    ) {
      setYouTubeLocalAsrDiagnosticState("render-stale", {
        active: state.youtubeLocalAsrActive,
        error: "stale_youtube_local_asr_request",
        requestId
      });
      return {
        ok: false,
        stale: true,
        error: {
          code: "stale_youtube_local_asr_request",
          message: "The local ASR subtitle request is no longer active."
        }
      };
    }

    if (!normalizedSource || !normalizedTranslation) {
      setYouTubeLocalAsrDiagnosticState("render-failed", {
        error: "youtube_local_asr_empty_text",
        requestId
      });
      return { ok: false, renderedCount: 0, error: { code: "youtube_local_asr_empty_text" } };
    }

    const startSeconds = getYouTubePlaybackSeconds(currentDocument) ?? 0;
    const segmentId = String(id || `pbt-youtube-local-asr-${Date.now()}`);
    let renderedCount = 0;

    clearYouTubeTranscriptOverlay();
    const timeline = resetYouTubeCaptionTimeline();
    timeline.videoId = getYouTubeWatchVideoId();
    timeline.source = YOUTUBE_LOCAL_ASR_SOURCE;
    timeline.trackKind = "local_asr";
    setYouTubeCaptionTimelineSentences(timeline, [{
      id: segmentId,
      startSeconds,
      endSeconds: startSeconds + YOUTUBE_LOCAL_ASR_OVERLAY_MAX_SECONDS,
      text: normalizedSource
    }]);
    timeline.settledKeys.add(getYouTubeCaptionSettledKey(YOUTUBE_LOCAL_ASR_SOURCE, segmentId));

    if (isMeaningfulTranslation(normalizedSource, normalizedTranslation)) {
      timeline.translationsById.set(segmentId, { text: normalizedTranslation, signature: YOUTUBE_LOCAL_ASR_SOURCE });
      renderedCount = startYouTubeTranscriptOverlay() > 0 ? 1 : 0;
    }

    state.youtubeLocalAsrActive = true;
    state.youtubeTranscriptTranslated = renderedCount > 0;
    setYouTubeLocalAsrDiagnosticState(
      renderedCount > 0 ? "rendered" : "render-failed",
      {
        active: state.youtubeLocalAsrActive,
        error: renderedCount > 0 ? "none" : "youtube_local_asr_render_failed",
        requestId
      }
    );
    updateFloatingPanelControls();

    return { ok: true, renderedCount };
  }

  function createYouTubeTranscriptRenderDiagnostics(translations) {
    return {
      status: "pending",
      translationCount: Array.isArray(translations) ? translations.length : 0,
      entryCount: state.youtubeCaptionTimeline.sentences.length,
      usableTranslationCount: 0,
      overlayCueCount: 0,
      missingEntryCount: 0,
      disconnectedEntryCount: 0,
      emptyTranslationCount: 0,
      unmeaningfulTranslationCount: 0,
      missingTimestampCount: 0,
      fallbackCueCount: 0,
      overlayNodeAvailable: false
    };
  }

  function getYouTubeTranscriptRenderStatus(diagnostics) {
    if (diagnostics.usableTranslationCount > 0) {
      return "rendered";
    }

    if (diagnostics.translationCount > 0) {
      return "no_usable_translations";
    }

    return diagnostics.overlayNodeAvailable ? "no_overlay_cues" : "overlay_unavailable";
  }

  function clearYouTubeTranscriptTranslations(options = {}) {
    const updateControls = options.updateControls !== false;
    const removedCount = state.youtubeTranscriptOverlayNode ? 1 : 0;

    if (options.stopLocalAsr !== false && state.youtubeLocalAsrActive) {
      state.youtubeTranscriptTranslateRequestId += 1;
      sendRuntimeMessage({ type: MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR });
      state.youtubeLocalAsrRequestId = 0;
      setYouTubeLocalAsrDiagnosticState("stopped", {
        active: false,
        error: "none",
        requestId: state.youtubeTranscriptTranslateRequestId
      });
    }

    state.youtubeLocalAsrActive = false;
    if (options.stopLocalAsr !== false) {
      state.youtubeLocalAsrRequestId = 0;
    }
    state.youtubeTranscriptAutoUpdateLastFailedTime = 0;
    state.youtubeTranscriptAutoUpdateLastRequestKey = "";
    state.youtubeTranscriptAutoUpdateLastRequestTime = 0;
    state.youtubeCaptionPrefetchCheckKey = "";
    state.youtubeCaptionConfigurationHintKey = "";
    clearYouTubeTranscriptOverlay();
    showYouTubeNativeCaptions();
    resetYouTubeCaptionTimeline();
    state.youtubeTranscriptTranslated = false;

    if (updateControls) {
      updateFloatingPanelControls();
    }

    return { ok: true, removedCount };
  }

  function startYouTubeTranscriptOverlay() {
    const timeline = state.youtubeCaptionTimeline;

    if (!timeline || timeline.sentences.length === 0) {
      clearYouTubeTranscriptOverlay();
      return 0;
    }

    const overlay = ensureYouTubeTranscriptOverlayNode(root.document);

    if (!overlay) {
      return 0;
    }

    if (timeline.source === YOUTUBE_CAPTION_TRACK_SOURCE) {
      hideYouTubeNativeCaptions(overlay.ownerDocument);
    }

    syncYouTubeTranscriptOverlayVideo(overlay.ownerDocument);
    updateYouTubeTranscriptOverlay();
    scheduleYouTubeCaptionOverlayFrame();
    return timeline.sentences.length;
  }

  function syncYouTubeTranscriptOverlayVideo(doc) {
    const video = findYouTubeVideoElement(doc);

    if (!video || state.youtubeTranscriptOverlayVideo === video) {
      return;
    }

    state.youtubeTranscriptOverlayVideo = video;

    if (typeof video.addEventListener !== "function") {
      return;
    }

    const update = () => {
      if (state.youtubeTranscriptOverlayVideo !== video) {
        return;
      }

      updateYouTubeTranscriptOverlay();
      scheduleYouTubeCaptionOverlayFrame();
    };

    for (const eventName of ["timeupdate", "seeking", "seeked", "play", "playing", "pause", "ratechange", "loadedmetadata"]) {
      video.addEventListener(eventName, update, { passive: true });
    }
  }

  function scheduleYouTubeCaptionOverlayFrame() {
    const video = state.youtubeTranscriptOverlayVideo;

    if (
      state.youtubeCaptionOverlayFrameRequested ||
      !state.youtubeTranscriptOverlayNode ||
      typeof root.requestAnimationFrame !== "function" ||
      !video ||
      video.paused !== false ||
      video.ended === true
    ) {
      return;
    }

    state.youtubeCaptionOverlayFrameRequested = true;
    root.requestAnimationFrame(() => {
      state.youtubeCaptionOverlayFrameRequested = false;
      updateYouTubeTranscriptOverlay();
      scheduleYouTubeCaptionOverlayFrame();
    });
  }

  function updateYouTubeTranscriptOverlay() {
    const overlay = state.youtubeTranscriptOverlayNode;

    if (!overlay) {
      return;
    }

    const doc = overlay.ownerDocument || root.document;
    const timeline = state.youtubeCaptionTimeline;

    if (timeline.videoId && getYouTubeWatchVideoId() !== timeline.videoId) {
      clearYouTubeTranscriptTranslations();
      return;
    }

    syncYouTubeTranscriptOverlayVideo(doc);

    const player = findYouTubePlayerElement(doc);
    const playbackSeconds = getYouTubePlaybackSeconds(doc);
    const adShowing = isYouTubeAdShowing(player);
    const sentence = adShowing ? null : findYouTubeCaptionSentenceAt(timeline.sentences, playbackSeconds);
    const translatedText = sentence ? getYouTubeCaptionTranslationText(timeline, sentence.id) : "";
    const displayMode = normalizeDisplayMode(state.floatingDisplayMode);
    const status = adShowing
      ? "ad"
      : playbackSeconds === null
        ? "no_time"
        : !sentence
          ? "no_cue"
          : translatedText ? "translated" : "source_only";

    applyYouTubeCaptionSyncDiagnostics(overlay, { timeline, sentence, status, playbackSeconds });

    const cueKey = sentence ? `${sentence.id}|${displayMode}|${translatedText}` : "";

    if (!sentence || !isYouTubeWatchPage() || !layoutYouTubeTranscriptOverlay(overlay, getYouTubeCaptionHost(doc), player)) {
      hideYouTubeTranscriptOverlayNode(overlay);
    } else {
      const render = state.youtubeCaptionOverlayRender;

      if (render.cueKey !== cueKey) {
        renderYouTubeTranscriptOverlayText(overlay, translatedText, sentence.text, displayMode);
        render.cueKey = cueKey;
      }

      if (overlay.style.display !== "block") {
        overlay.style.display = "block";
      }
    }

    if (!adShowing) {
      maybePrefetchYouTubeCaptionTranslations(doc, playbackSeconds);
    }
  }

  function getYouTubeCaptionHost(doc) {
    const player = findYouTubePlayerElement(doc);

    if (player && getElementTagName(player) === "VIDEO") {
      return player.parentElement || null;
    }

    return player || null;
  }

  function layoutYouTubeTranscriptOverlay(overlay, host, player) {
    const rect = getUsableElementRect(host);
    const render = state.youtubeCaptionOverlayRender;

    if (!rect) {
      render.positionKey = "";
      return false;
    }

    if (overlay.parentNode !== host) {
      host.appendChild(overlay);
    }

    const fontSize = getYouTubeCaptionFontSize(rect.height);
    const bottomInset = getYouTubeCaptionBottomInset(rect.height, isYouTubePlayerControlsHidden(player));
    const maxWidth = Math.max(160, Math.round(rect.width * 0.84));
    const positionKey = `${fontSize}|${bottomInset}|${maxWidth}`;

    if (render.positionKey !== positionKey) {
      overlay.style.fontSize = `${fontSize}px`;
      overlay.style.bottom = `${bottomInset}px`;
      overlay.style.maxWidth = `${maxWidth}px`;
      render.positionKey = positionKey;
    }

    return true;
  }

  function getYouTubeCaptionFontSize(playerHeight) {
    const baseSize = Math.min(
      YOUTUBE_CAPTION_FONT_MAX_PX,
      Math.max(YOUTUBE_CAPTION_FONT_MIN_PX, playerHeight * YOUTUBE_CAPTION_FONT_HEIGHT_RATIO)
    );

    return Math.round(baseSize * YOUTUBE_CAPTION_SIZE_SCALES[normalizeCaptionSize(state.floatingCaptionSize)]);
  }

  function getYouTubeCaptionBottomInset(playerHeight, controlsHidden) {
    if (controlsHidden) {
      return Math.round(Math.max(24, playerHeight * 0.05));
    }

    return playerHeight >= 280 ? Math.round(Math.max(82, playerHeight * 0.1)) : 54;
  }

  function isYouTubePlayerControlsHidden(player) {
    const className = String(player?.className ?? player?.getAttribute?.("class") ?? "");

    return /(^|\s)ytp-autohide(\s|$)/.test(className);
  }

  function hideYouTubeTranscriptOverlayNode(overlay) {
    const render = state.youtubeCaptionOverlayRender;

    if (overlay.style.display !== "none") {
      overlay.style.display = "none";
    }

    if (render.cueKey || overlay.textContent) {
      overlay.textContent = "";
    }

    render.cueKey = "";
  }

  function renderYouTubeTranscriptOverlayText(overlay, translatedText, sourceText, displayMode) {
    const translated = String(translatedText ?? "").trim();
    const source = String(sourceText ?? "").trim();

    overlay.textContent = translated ? "" : source;

    if (!translated) {
      return;
    }

    overlay.appendChild(createYouTubeCaptionLine(overlay.ownerDocument, translated, "translation"));

    if (source && displayMode !== DISPLAY_MODES.REPLACE) {
      overlay.appendChild(overlay.ownerDocument.createTextNode("\n"));
      overlay.appendChild(createYouTubeCaptionLine(overlay.ownerDocument, source, "source"));
    }
  }

  function createYouTubeCaptionLine(doc, text, role) {
    const line = doc.createElement("span");
    line.setAttribute("data-pbt-caption-line", role);
    setStyles(line, role === "source"
      ? { display: "block", fontSize: "0.75em", fontWeight: "400", opacity: "0.86" }
      : { display: "block" });
    line.textContent = text;
    return line;
  }

  function applyYouTubeCaptionSyncDiagnostics(overlay, { timeline, sentence, status, playbackSeconds }) {
    const diagnostics = {
      source: timeline.source === YOUTUBE_CAPTION_TRACK_SOURCE
        ? "caption_track"
        : timeline.source === YOUTUBE_LOCAL_ASR_SOURCE ? "local_asr" : "none",
      track: sanitizeYouTubeLocalAsrDiagnosticValue(timeline.trackKind, "none"),
      status,
      playback: formatYouTubeCaptionDiagnosticSeconds(playbackSeconds),
      cue: formatYouTubeCaptionDiagnosticSeconds(sentence?.startSeconds),
      cueEnd: formatYouTubeCaptionDiagnosticSeconds(sentence?.endSeconds),
      cueCount: String(timeline.sentences.length),
      translatedCount: String(timeline.translationsById.size)
    };
    const key = [
      diagnostics.source,
      diagnostics.track,
      diagnostics.status,
      playbackSeconds === null ? "none" : Math.floor(playbackSeconds),
      diagnostics.cue,
      diagnostics.cueEnd,
      diagnostics.cueCount,
      diagnostics.translatedCount
    ].join("|");

    if (state.youtubeCaptionOverlayRender.diagnosticsKey === key) {
      return;
    }

    state.youtubeCaptionOverlayRender.diagnosticsKey = key;
    writeYouTubeCaptionSyncDiagnostics(overlay, diagnostics, true);
    writeYouTubeCaptionSyncDiagnostics(state.youtubeTranscriptButton, diagnostics, false);
  }

  function writeYouTubeCaptionSyncDiagnostics(element, diagnostics, includeTitle) {
    if (!element || typeof element.setAttribute !== "function") {
      return;
    }

    element.setAttribute("data-pbt-sync-source", diagnostics.source);
    element.setAttribute("data-pbt-sync-track", diagnostics.track);
    element.setAttribute("data-pbt-sync-status", diagnostics.status);
    element.setAttribute("data-pbt-sync-playback", diagnostics.playback);
    element.setAttribute("data-pbt-sync-cue", diagnostics.cue);
    element.setAttribute("data-pbt-sync-cue-end", diagnostics.cueEnd);
    element.setAttribute("data-pbt-sync-cue-count", diagnostics.cueCount);
    element.setAttribute("data-pbt-sync-translated-count", diagnostics.translatedCount);

    if (includeTitle) {
      element.setAttribute(
        "title",
        `同步诊断 来源=${diagnostics.source} 字幕=${diagnostics.track} 状态=${diagnostics.status} 播放=${diagnostics.playback}s 句子=${diagnostics.cue}-${diagnostics.cueEnd}s 句数=${diagnostics.cueCount} 已译=${diagnostics.translatedCount}`
      );
    }
  }

  function formatYouTubeCaptionDiagnosticSeconds(seconds) {
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
      ? seconds.toFixed(2)
      : "none";
  }

  function maybePrefetchYouTubeCaptionTranslations(doc, playbackSeconds) {
    const timeline = state.youtubeCaptionTimeline;

    if (
      timeline.source !== YOUTUBE_CAPTION_TRACK_SOURCE ||
      playbackSeconds === null ||
      !state.youtubeTranscriptTranslated ||
      state.youtubeTranscriptTranslateInFlight ||
      state.youtubeLocalAsrActive
    ) {
      return false;
    }

    const checkKey = [
      timeline.videoId,
      Math.floor(playbackSeconds),
      timeline.settledKeys.size,
      getYouTubeCaptionProviderSignature()
    ].join("|");

    if (state.youtubeCaptionPrefetchCheckKey === checkKey) {
      return false;
    }

    state.youtubeCaptionPrefetchCheckKey = checkKey;

    const [nextSentence] = pickYouTubeCaptionSentencesForTranslation(timeline, playbackSeconds, {
      horizonSeconds: YOUTUBE_CAPTION_PREFETCH_LEAD_SECONDS,
      limit: 1
    });

    return nextSentence
      ? runYouTubeTranscriptSilentUpdateIfAllowed(doc, `${timeline.videoId}:${nextSentence.id}`)
      : false;
  }

  function getYouTubeCaptionProviderSignature() {
    const qualityMode = normalizeQualityMode(state.floatingQualityMode);

    return qualityMode === "free"
      ? qualityMode
      : `${qualityMode}|${normalizePaidProvider(state.floatingPaidProvider)}`;
  }

  function getYouTubeCaptionSettledKey(signature, id) {
    return `${signature}|${id}`;
  }

  function getYouTubeCaptionTranslationText(timeline, id) {
    return String(timeline.translationsById.get(id)?.text ?? "");
  }

  function showYouTubeCaptionConfigurationHint(error) {
    const code = String(error?.code ?? "");

    if (!YOUTUBE_CAPTION_CONFIGURATION_ERROR_CODES.has(code)) {
      return;
    }

    const hintKey = `${code}|${error?.status ?? ""}|${getYouTubeCaptionProviderSignature()}`;

    if (state.youtubeCaptionConfigurationHintKey === hintKey) {
      return;
    }

    state.youtubeCaptionConfigurationHintKey = hintKey;
    showYouTubeTranscriptHint(state.youtubeTranscriptButton, getYouTubeTranscriptUserHint(error));
  }

  function runYouTubeTranscriptSilentUpdateIfAllowed(doc, requestKey = "") {
    if (
      !state.youtubeTranscriptTranslated ||
      state.youtubeTranscriptTranslateInFlight ||
      state.youtubeLocalAsrActive
    ) {
      return false;
    }

    const now = Date.now();

    if (now - (state.youtubeTranscriptAutoUpdateLastFailedTime || 0) < YOUTUBE_TRANSCRIPT_SILENT_UPDATE_RETRY_MS) {
      return false;
    }

    if (
      requestKey &&
      state.youtubeTranscriptAutoUpdateLastRequestKey === requestKey &&
      now - (state.youtubeTranscriptAutoUpdateLastRequestTime || 0) < YOUTUBE_TRANSCRIPT_SILENT_UPDATE_RETRY_MS
    ) {
      return false;
    }

    state.youtubeTranscriptAutoUpdateLastRequestKey = requestKey;
    state.youtubeTranscriptAutoUpdateLastRequestTime = now;
    runYouTubeTranscriptSilentUpdate(doc);
    return true;
  }

  function runYouTubeTranscriptSilentUpdate() {
    if (state.youtubeTranscriptTranslateInFlight || state.youtubeLocalAsrActive) {
      return;
    }

    const button = state.youtubeTranscriptButton;

    if (button && button.disabled) {
      return;
    }

    const requestId = state.youtubeTranscriptTranslateRequestId + 1;
    state.youtubeTranscriptTranslateRequestId = requestId;
    state.youtubeTranscriptTranslateInFlight = true;
    scheduleYouTubeTranscriptSilentTimeout(requestId);

    const sent = sendRuntimeMessage({
      type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
      url: root.location ? root.location.href : "",
      qualityMode: state.floatingQualityMode,
      paidProvider: state.floatingPaidProvider,
      requestId,
      allowYouTubeCaptionTrack: true,
      confirmCost: true
    }, (response) => {
      if (requestId !== state.youtubeTranscriptTranslateRequestId) {
        return;
      }

      state.youtubeTranscriptTranslateInFlight = false;
      clearYouTubeTranscriptTranslateTimer();

      if (!response || response.ok !== true) {
        state.youtubeTranscriptAutoUpdateLastFailedTime = Date.now();
        showYouTubeCaptionConfigurationHint(response?.error);
        return;
      }

      updateFloatingPanelControls();
    });

    if (!sent) {
      state.youtubeTranscriptTranslateInFlight = false;
      clearYouTubeTranscriptTranslateTimer();
    }
  }

  function clearYouTubeTranscriptOverlay() {
    if (state.youtubeTranscriptOverlayNode && typeof state.youtubeTranscriptOverlayNode.remove === "function") {
      state.youtubeTranscriptOverlayNode.remove();
    }

    state.youtubeTranscriptOverlayNode = null;
    state.youtubeCaptionOverlayRender = createYouTubeCaptionOverlayRenderState();
    clearYouTubeTranscriptSyncDiagnostics(state.youtubeTranscriptButton);
  }

  function findYouTubePlayerCaptionToggleButton(doc) {
    const player = findYouTubePlayerElement(doc);
    const candidates = dedupeElements([
      ...querySelectorAllElements(player, YOUTUBE_PLAYER_CAPTION_TOGGLE_SELECTOR, 4),
      ...querySelectorAllElements(doc?.body, YOUTUBE_PLAYER_CAPTION_TOGGLE_SELECTOR, 4)
    ]);

    if (candidates.length === 0) {
      const walked = [];

      walkElementNodes(player || doc?.body, (element) => {
        if (walked.length >= 4) {
          return;
        }

        if (isYouTubePlayerCaptionToggleButton(element)) {
          walked.push(element);
        }
      });

      candidates.push(...walked);
    }

    return candidates.find((element) => (
      isYouTubePlayerCaptionToggleButton(element) &&
      isNodeConnected(element) &&
      !isHiddenYouTubeTranscriptTextContainer(element)
    )) || null;
  }

  function isYouTubePlayerCaptionToggleButton(element) {
    if (!element || element.nodeType !== ELEMENT_NODE || typeof element.getAttribute !== "function") {
      return false;
    }

    const className = String(element.className ?? element.getAttribute("class") ?? "");
    if (/(^|\s)ytp-subtitles-button(\s|$)/.test(className)) {
      return true;
    }

    const label = getYouTubePageControlLabel(element).toLowerCase();
    return /subtitles|captions|closed captions|字幕|cc/.test(label) && isClickableYouTubePageControl(element);
  }

  function isYouTubePlayerCaptionToggleDisabled(element) {
    if (!element || element.disabled === true) {
      return true;
    }

    return element.getAttribute?.("aria-disabled") === "true" ||
      element.getAttribute?.("disabled") !== null;
  }

  function isYouTubePlayerCaptionTogglePressed(element) {
    if (!element || typeof element.getAttribute !== "function") {
      return false;
    }

    return element.getAttribute("aria-pressed") === "true" ||
      element.getAttribute("aria-checked") === "true";
  }

  function extractYouTubeInitialPlayerResponse(doc) {
    for (const script of getYouTubePageScriptElements(doc)) {
      const text = String(script?.textContent ?? "");

      if (!text || !text.includes("ytInitialPlayerResponse") || !text.includes("captionTracks")) {
        continue;
      }

      const jsonText = extractYouTubeInitialPlayerResponseJson(text);

      if (!jsonText) {
        continue;
      }

      try {
        const parsed = JSON.parse(jsonText);

        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  function getYouTubePageScriptElements(doc) {
    const queried = dedupeElements([
      ...querySelectorAllElements(doc, "script", YOUTUBE_CAPTION_TRACK_SCRIPT_SCAN_LIMIT),
      ...querySelectorAllElements(doc?.documentElement, "script", YOUTUBE_CAPTION_TRACK_SCRIPT_SCAN_LIMIT),
      ...querySelectorAllElements(doc?.body, "script", YOUTUBE_CAPTION_TRACK_SCRIPT_SCAN_LIMIT)
    ]);

    if (queried.length > 0) {
      return queried.slice(0, YOUTUBE_CAPTION_TRACK_SCRIPT_SCAN_LIMIT);
    }

    if (
      typeof doc?.querySelectorAll === "function" ||
      typeof doc?.documentElement?.querySelectorAll === "function" ||
      typeof doc?.body?.querySelectorAll === "function"
    ) {
      return [];
    }

    const scripts = [];
    const roots = dedupeElements([doc?.documentElement, doc?.body]);

    for (const rootNode of roots) {
      walkElementNodes(rootNode, (element) => {
        if (scripts.length >= YOUTUBE_CAPTION_TRACK_SCRIPT_SCAN_LIMIT) {
          return;
        }

        if (getElementTagName(element) === "SCRIPT") {
          scripts.push(element);
        }
      });
    }

    return scripts;
  }

  function extractYouTubeInitialPlayerResponseJson(scriptText) {
    const text = String(scriptText ?? "");
    let markerIndex = text.indexOf("ytInitialPlayerResponse");

    while (markerIndex >= 0) {
      const equalsIndex = text.indexOf("=", markerIndex);
      const braceIndex = equalsIndex >= 0 ? text.indexOf("{", equalsIndex) : -1;

      if (braceIndex >= 0) {
        const jsonText = extractBalancedJsonObject(text, braceIndex);

        if (jsonText) {
          return jsonText;
        }
      }

      markerIndex = text.indexOf("ytInitialPlayerResponse", markerIndex + 1);
    }

    return "";
  }

  function extractBalancedJsonObject(text, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;

        if (depth === 0) {
          return text.slice(startIndex, index + 1);
        }
      }
    }

    return "";
  }

  function isYouTubeCaptionTrackTimedTextUrl(url) {
    return Boolean(
      url &&
      url.protocol === "https:" &&
      /(^|\.)youtube\.com$/i.test(url.hostname) &&
      /\/(?:api\/)?timedtext$/i.test(url.pathname)
    );
  }

  function isYouTubeEnglishCaptionTrack(track) {
    const languageCode = String(track?.languageCode ?? "").toLowerCase();
    const label = getYouTubeCaptionTrackLabel(track).toLowerCase();

    return languageCode === "en" ||
      languageCode.startsWith("en-") ||
      /\benglish\b/.test(label);
  }

  function getYouTubeCaptionTrackScore(track) {
    let score = 0;
    const kind = String(track?.kind ?? "").toLowerCase();
    const languageCode = String(track?.languageCode ?? "").toLowerCase();
    const label = getYouTubeCaptionTrackLabel(track).toLowerCase();

    if (languageCode === "en") {
      score += 30;
    } else if (languageCode.startsWith("en-")) {
      score += 20;
    }

    if (kind !== "asr") {
      score += 15;
    }

    if (/\benglish\b/.test(label)) {
      score += 10;
    }

    return score;
  }

  function getYouTubeCaptionTrackLabel(track) {
    if (!track || typeof track !== "object") {
      return "";
    }

    const name = track.name;
    const runs = Array.isArray(name?.runs) ? name.runs : [];

    if (runs.length > 0) {
      return runs.map((run) => String(run?.text ?? "")).join(" ");
    }

    return String(name?.simpleText ?? track.languageName?.simpleText ?? "");
  }

  function getYouTubeTimelineCueId(source, startSeconds, sourceText) {
    const safeSource = String(source || "cue").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 24) || "cue";
    const startMs = Number.isFinite(Number(startSeconds)) ? Math.round(Number(startSeconds) * 1000) : 0;
    const hash = hashSessionTranslationSource(`${safeSource}|${startMs}|${normalizeComparableText(sourceText)}`);

    return `pbt-youtube-${safeSource}-${startMs}-${hash.replace(/[^a-z0-9:]+/gi, "")}`;
  }

  function handleYouTubeLocalAsrStatus({ requestId, error, active } = {}) {
    if (!isActiveYouTubeLocalAsrRequest(requestId)) {
      setYouTubeLocalAsrDiagnosticState("render-stale", {
        active: state.youtubeLocalAsrActive,
        error: "stale_youtube_local_asr_request",
        requestId
      });
      return { ok: false, stale: true, error: { code: "stale_youtube_local_asr_request" } };
    }

    const button = state.youtubeTranscriptButton;
    const shouldRemainActive = active === true;
    state.youtubeLocalAsrActive = shouldRemainActive;
    if (shouldRemainActive) {
      const numericRequestId = Number(requestId);
      if (Number.isInteger(numericRequestId)) {
        state.youtubeLocalAsrRequestId = numericRequestId;
      }
    } else {
      state.youtubeLocalAsrRequestId = 0;
    }
    setYouTubeLocalAsrDiagnosticFromError(error, {
      active: shouldRemainActive,
      requestId
    });

    if (!shouldRemainActive && state.youtubeCaptionTimeline.translationsById.size === 0) {
      state.youtubeTranscriptTranslated = false;
    }

    const hint = getYouTubeTranscriptUserHint(error);

    if (shouldRemainActive) {
      showYouTubeTranscriptHint(button, hint);
    } else {
      showYouTubeTranscriptActionError(button, error);
    }

    updateFloatingPanelControls();
    return { ok: true, status: "local_asr_status_reported" };
  }

  function setYouTubeLocalAsrDiagnosticFromError(error, options = {}) {
    return setYouTubeLocalAsrDiagnosticState(getYouTubeLocalAsrDiagnosticStateForError(error), {
      ...options,
      error: String(error?.code || "none")
    });
  }

  function isYouTubeLocalAsrDiagnosticError(error) {
    const code = String(error?.code || "");
    return code.startsWith("youtube_local_asr_") || code === "stale_youtube_local_asr_request";
  }

  function getYouTubeLocalAsrDiagnosticStateForError(error) {
    const code = String(error?.code || "");

    if (code === "youtube_local_asr_video_muted") {
      return "preflight-muted";
    }

    if (code === "youtube_local_asr_video_paused") {
      return "preflight-paused";
    }

    if (code === "youtube_local_asr_processing") {
      return "processing";
    }

    if (code === "youtube_local_asr_no_audio_chunk") {
      return "no-audio-chunk";
    }

    if (code === "youtube_local_asr_whisper_unavailable") {
      return "whisper-unavailable";
    }

    if (code === "youtube_local_asr_no_speech") {
      return "no-speech";
    }

    if (code === "youtube_local_asr_provider_failed" || code === "youtube_local_asr_no_translation") {
      return "provider-failed";
    }

    if (code === "youtube_local_asr_render_failed" || code === "youtube_local_asr_empty_text") {
      return "render-failed";
    }

    if (code === "stale_youtube_local_asr_request") {
      return "render-stale";
    }

    if (code === "youtube_local_asr_capture_denied" || code === "youtube_local_asr_active_tab_required") {
      return "capture-denied";
    }

    if (code === "youtube_local_asr_capture_failed") {
      return "capture-failed";
    }

    if (code === "youtube_local_asr_offscreen_unavailable") {
      return "recorder-unavailable";
    }

    if (code === "youtube_local_asr_unavailable") {
      return "local-asr-unavailable";
    }

    if (code === "youtube_local_asr_audio_invalid") {
      return "audio-invalid";
    }

    if (code === "youtube_local_asr_chunk_failed" || code === "youtube_local_asr_whisper_response_invalid") {
      return "chunk-failed";
    }

    return "runtime-message-failed";
  }

  function setYouTubeLocalAsrDiagnosticState(diagnosticState, options = {}) {
    const current = state.youtubeLocalAsrDiagnostics || {};
    const video = getYouTubeLocalAsrVideoDiagnosticSnapshot(root.document);
    const requestId = options.requestId ?? current.requestId ?? "none";

    state.youtubeLocalAsrDiagnostics = {
      state: sanitizeYouTubeLocalAsrDiagnosticValue(diagnosticState || "idle", "idle"),
      error: sanitizeYouTubeLocalAsrDiagnosticValue(options.error ?? current.error ?? "none", "none"),
      active: options.active === undefined ? current.active === true : options.active === true,
      requestId: sanitizeYouTubeLocalAsrDiagnosticValue(requestId, "none"),
      videoMuted: video.videoMuted,
      videoPaused: video.videoPaused
    };

    applyYouTubeLocalAsrDiagnostics(state.youtubeTranscriptButton);
    applyYouTubeLocalAsrDiagnostics(state.youtubeTranscriptHint);
    applyYouTubeLocalAsrDiagnostics(state.youtubeTranscriptOverlayNode);
  }

  function getYouTubeLocalAsrVideoDiagnosticSnapshot(doc) {
    const video = findYouTubeVideoElement(doc) || findKnownYouTubeVideoElement(doc);

    if (!video) {
      return { videoMuted: "unknown", videoPaused: "unknown" };
    }

    const volume = Number(video.volume);
    const muted = video.muted === true || (Number.isFinite(volume) && volume <= 0);

    return {
      videoMuted: muted ? "true" : "false",
      videoPaused: video.paused === true ? "true" : "false"
    };
  }

  function applyYouTubeLocalAsrDiagnostics(element) {
    if (!element || typeof element.setAttribute !== "function") {
      return;
    }

    const diagnostics = state.youtubeLocalAsrDiagnostics || {};
    element.setAttribute(
      "data-pbt-local-asr-state",
      sanitizeYouTubeLocalAsrDiagnosticValue(diagnostics.state, "idle")
    );
    element.setAttribute(
      "data-pbt-local-asr-error",
      sanitizeYouTubeLocalAsrDiagnosticValue(diagnostics.error, "none")
    );
    element.setAttribute("data-pbt-local-asr-active", diagnostics.active === true ? "true" : "false");
    element.setAttribute(
      "data-pbt-local-asr-request-id",
      sanitizeYouTubeLocalAsrDiagnosticValue(diagnostics.requestId, "none")
    );
    element.setAttribute(
      "data-pbt-local-asr-video-muted",
      sanitizeYouTubeLocalAsrDiagnosticValue(diagnostics.videoMuted, "unknown")
    );
    element.setAttribute(
      "data-pbt-local-asr-video-paused",
      sanitizeYouTubeLocalAsrDiagnosticValue(diagnostics.videoPaused, "unknown")
    );
  }

  function sanitizeYouTubeLocalAsrDiagnosticValue(value, fallback) {
    const sanitized = String(value ?? "")
      .replace(/[^a-z0-9_.:-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

    return sanitized || fallback;
  }

  function sanitizeYouTubeLocalAsrOverlayText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
  }

  function isStaleYouTubeTranscriptRenderRequest(requestId) {
    if (requestId === undefined || requestId === null) {
      return false;
    }

    const numericRequestId = Number(requestId);

    return !Number.isInteger(numericRequestId) ||
      numericRequestId !== state.youtubeTranscriptTranslateRequestId ||
      state.youtubeTranscriptTranslateInFlight !== true;
  }

  function isActiveYouTubeTranscriptRequest(requestId) {
    if (requestId === undefined || requestId === null) {
      return true;
    }

    const numericRequestId = Number(requestId);

    return Number.isInteger(numericRequestId) &&
      numericRequestId === state.youtubeTranscriptTranslateRequestId &&
      state.youtubeTranscriptTranslateInFlight === true;
  }

  function isActiveYouTubeLocalAsrRequest(requestId) {
    const numericRequestId = Number(requestId);

    if (!Number.isInteger(numericRequestId)) {
      return false;
    }

    if (Number.isInteger(state.youtubeLocalAsrRequestId) && state.youtubeLocalAsrRequestId > 0) {
      return numericRequestId === state.youtubeLocalAsrRequestId;
    }

    return state.youtubeLocalAsrActive === true &&
      numericRequestId === state.youtubeTranscriptTranslateRequestId;
  }

  function prepareTranslation({ displayMode }) {
    suspendSessionTranslationReuseUntilNextRender();
    invalidatePendingCollectedTranslations();
    cleanupStaleReplacedEntries();

    const restored = restoreOriginalText();
    const removed = removeBilingualTranslations();

    if (displayMode === DISPLAY_MODES.BILINGUAL || displayMode === DISPLAY_MODES.REPLACE) {
      return {
        ok: true,
        prepared: true,
        restoredCount: restored.restoredCount,
        removedCount: removed.removedCount
      };
    }

    return { ok: true, prepared: false };
  }

  function renderReplace(translations) {
    let renderedCount = 0;

    cleanupStaleReplacedEntries();

    for (const translation of translations) {
      const entry = getCollectedTextEntry(translation.id);
      const textNode = entry?.textNode ?? null;

      if (!isCollectedTextEntryRenderable(entry) || state.replacedTextNodes.has(textNode)) {
        deleteCollectedTextNode(translation.id);
        continue;
      }

      const originalText = String(textNode.nodeValue ?? "");
      const translatedText = String(translation.text ?? "");

      if (!isMeaningfulTranslation(originalText, translatedText)) {
        deleteCollectedTextNode(translation.id);
        continue;
      }

      state.replacedTextNodes.set(textNode, {
        originalText,
        translatedText,
        element: textNode.parentElement
      });
      textNode.nodeValue = translatedText;
      markReplaced(textNode.parentElement);
      rememberSessionTranslation(DISPLAY_MODES.REPLACE, originalText, translatedText);
      deleteCollectedTextNode(translation.id);
      renderedCount += 1;
    }

    return { ok: true, renderedCount };
  }

  function renderBilingual(translations) {
    let renderedCount = 0;

    for (const translation of translations) {
      const entry = getCollectedTextEntry(translation.id);
      const textNode = entry?.textNode ?? null;
      const parent = textNode ? textNode.parentElement : null;

      if (!isCollectedTextEntryRenderable(entry) || !parent || hasActiveBilingualTranslation(textNode)) {
        deleteCollectedTextNode(translation.id);
        continue;
      }

      const originalText = String(textNode.nodeValue ?? "");
      const translatedText = String(translation.text ?? "");

      if (!isMeaningfulTranslation(originalText, translatedText)) {
        deleteCollectedTextNode(translation.id);
        continue;
      }

      const marker = createTranslationNode(parent.ownerDocument, translation.id, translatedText);
      parent.insertBefore(marker, textNode.nextSibling);
      state.bilingualTranslatedTextNodes.set(textNode, {
        originalText,
        marker,
        translationId: translation.id
      });
      state.bilingualTranslationNodes.set(translation.id, marker);
      rememberSessionTranslation(DISPLAY_MODES.BILINGUAL, originalText, translatedText);
      deleteCollectedTextNode(translation.id);
      renderedCount += 1;
    }

    return { ok: true, renderedCount };
  }

  function cleanupCollectedTextNodes() {
    for (const id of Array.from(state.textNodesById.keys())) {
      const entry = getCollectedTextEntry(id);

      if (!isCollectedTextEntryCurrent(entry)) {
        deleteCollectedTextNode(id);
      }
    }
  }

  function clearCollectedTextNodes() {
    for (const id of Array.from(state.textNodesById.keys())) {
      deleteCollectedTextNode(id);
    }
  }

  function getCollectedTextEntry(id) {
    const entry = state.textNodesById.get(id);

    if (!entry) {
      return null;
    }

    if (entry.nodeType === TEXT_NODE) {
      return {
        textNode: entry,
        sourceText: normalizeText(entry.nodeValue)
      };
    }

    return {
      textNode: entry.textNode ?? null,
      sourceText: String(entry.sourceText ?? "")
    };
  }

  function hasCollectedTextNode(textNode, sourceText) {
    const entry = state.textNodeCollectionIds.get(textNode);

    return Boolean(
      entry &&
      state.textNodesById.has(entry.id) &&
      normalizeComparableText(entry.sourceText) === normalizeComparableText(sourceText)
    );
  }

  function deleteCollectedTextNode(id) {
    const entry = getCollectedTextEntry(id);
    state.textNodesById.delete(id);

    if (!entry?.textNode) {
      removePendingTranslationIndicator(id);
      return;
    }

    const activeEntry = state.textNodeCollectionIds.get(entry.textNode);

    if (activeEntry?.id === id) {
      state.textNodeCollectionIds.delete(entry.textNode);
    }

    removePendingTranslationIndicator(id);
  }

  function attachPendingTranslationIndicator(id, textNode) {
    const parent = textNode?.parentElement ?? null;

    if (!id || !parent || typeof parent.insertBefore !== "function") {
      return;
    }

    const doc = parent.ownerDocument;

    if (!doc || typeof doc.createElement !== "function") {
      return;
    }

    removePendingTranslationIndicator(id);
    ensurePendingTranslationIndicatorStyle(doc);

    const indicator = createPendingTranslationIndicator(doc, id);
    parent.insertBefore(indicator, textNode.nextSibling);
    state.pendingTranslationIndicators.set(id, indicator);
  }

  function removePendingTranslationIndicator(id) {
    const indicator = state.pendingTranslationIndicators.get(id);
    state.pendingTranslationIndicators.delete(id);

    if (indicator && typeof indicator.remove === "function") {
      indicator.remove();
    }
  }

  function clearPendingTranslationIndicators() {
    for (const id of Array.from(state.pendingTranslationIndicators.keys())) {
      removePendingTranslationIndicator(id);
    }
  }

  function ensurePendingTranslationIndicatorStyle(doc) {
    if (!doc || typeof doc.createElement !== "function") {
      return;
    }

    const rootElement = doc.head || doc.documentElement || doc.body;

    if (!rootElement || typeof rootElement.appendChild !== "function") {
      return;
    }

    if (typeof rootElement.querySelector === "function" && rootElement.querySelector('[data-pbt-control="pending-indicator-style"]')) {
      return;
    }

    const style = doc.createElement("style");
    style.setAttribute("data-pbt-control", "pending-indicator-style");
    style.textContent = "@keyframes pbt-spinner-rotate { to { transform: rotate(360deg); } }";
    rootElement.appendChild(style);
  }

  function createPendingTranslationIndicator(doc, segmentId) {
    const indicator = doc.createElement("span");
    indicator.setAttribute("data-pbt-control", "translation-pending");
    indicator.setAttribute("data-pbt-segment-id", segmentId);
    indicator.setAttribute("aria-hidden", "true");
    indicator.setAttribute("title", "正在翻译");
    setStyles(indicator, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      marginLeft: "6px",
      verticalAlign: "-3px",
      borderRadius: "999px",
      background: "rgba(255, 255, 255, 0.92)",
      boxShadow: "0 3px 9px rgba(15, 23, 42, 0.16)",
      pointerEvents: "none"
    });
    indicator.appendChild(createFloatingSpinner(doc, "translation-pending-spinner", "12px", "#ec4899"));
    return indicator;
  }

  function rememberSessionTranslation(displayMode, sourceText, translatedText) {
    const key = getSessionTranslationCacheKey(displayMode, sourceText);
    const normalizedTranslatedText = String(translatedText ?? "");

    if (!key || !normalizedTranslatedText) {
      return;
    }

    if (state.sessionTranslationCache.has(key)) {
      state.sessionTranslationCache.delete(key);
    }

    state.sessionTranslationCache.set(key, {
      translatedText: normalizedTranslatedText
    });

    while (state.sessionTranslationCache.size > SESSION_TRANSLATION_CACHE_LIMIT) {
      const oldestKey = state.sessionTranslationCache.keys().next().value;
      state.sessionTranslationCache.delete(oldestKey);
    }
  }

  function renderCachedSessionTranslationForTextNode(textNode, sourceText, displayMode = state.floatingDisplayMode) {
    if (!textNode || !isTextNodeAllowed(textNode)) {
      return false;
    }

    const cached = getSessionTranslation(displayMode, sourceText);

    if (!cached) {
      return false;
    }

    const originalText = String(textNode.nodeValue ?? "");
    const translatedText = cached.translatedText;

    if (!isMeaningfulTranslation(originalText, translatedText)) {
      return false;
    }

    if (displayMode === DISPLAY_MODES.REPLACE) {
      state.replacedTextNodes.set(textNode, {
        originalText,
        translatedText,
        element: textNode.parentElement
      });
      textNode.nodeValue = translatedText;
      markReplaced(textNode.parentElement);
      setFloatingTranslated(true);
      return true;
    }

    const parent = textNode.parentElement;

    if (!parent || hasActiveBilingualTranslation(textNode)) {
      return false;
    }

    const translationId = `pbt-session-cache-${state.nextSegmentId}`;
    state.nextSegmentId += 1;
    const marker = createTranslationNode(parent.ownerDocument, translationId, translatedText);
    parent.insertBefore(marker, textNode.nextSibling);
    state.bilingualTranslatedTextNodes.set(textNode, {
      originalText,
      marker,
      translationId
    });
    state.bilingualTranslationNodes.set(translationId, marker);
    setFloatingTranslated(true);
    return true;
  }

  function getSessionTranslation(displayMode, sourceText) {
    const key = getSessionTranslationCacheKey(displayMode, sourceText);
    return key ? state.sessionTranslationCache.get(key) ?? null : null;
  }

  function getSessionTranslationCacheKey(displayMode, sourceText) {
    const normalizedText = normalizeComparableText(sourceText);

    if (!normalizedText) {
      return "";
    }

    return [
      getFloatingTranslationSettingsSignature(),
      normalizeDisplayMode(displayMode),
      hashSessionTranslationSource(normalizedText)
    ].join("|");
  }

  function hashSessionTranslationSource(value) {
    const normalized = normalizeComparableText(value);
    let hash = 2166136261;

    for (let index = 0; index < normalized.length; index += 1) {
      hash ^= normalized.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    return `${normalized.length}:${hash.toString(36)}`;
  }

  function isCollectedTextEntryCurrent(entry) {
    if (!entry?.textNode || !isTextNodeAllowed(entry.textNode)) {
      return false;
    }

    return normalizeComparableText(entry.textNode.nodeValue) === normalizeComparableText(entry.sourceText);
  }

  function isCollectedTextEntryRenderable(entry) {
    return Boolean(entry?.sourceText) && isCollectedTextEntryCurrent(entry);
  }

  function restoreOriginalText() {
    let restoredCount = 0;
    let skippedCount = 0;
    let cleanedCount = 0;

    for (const entry of state.replacedTextNodes.entries()) {
      const textNode = entry[0];
      const replaceEntry = normalizeReplaceEntry(entry[1], textNode);

      state.replacedTextNodes.delete(textNode);

      if (!isTextNodeConnected(textNode)) {
        cleanedCount += 1;
        continue;
      }

      if (textNode.nodeValue === replaceEntry.translatedText) {
        textNode.nodeValue = replaceEntry.originalText;
        restoredCount += 1;
        continue;
      }

      skippedCount += 1;
    }

    cleanupReplaceMarkedElements();
    updateFloatingTranslatedFromPageState();

    return { ok: true, restoredCount, skippedCount, cleanedCount };
  }

  function cleanupStaleReplacedEntries() {
    let cleanedCount = 0;

    for (const entry of Array.from(state.replacedTextNodes.entries())) {
      const textNode = entry[0];
      const replaceEntry = normalizeReplaceEntry(entry[1], textNode);

      if (!isTextNodeConnected(textNode) || textNode.nodeValue !== replaceEntry.translatedText) {
        state.replacedTextNodes.delete(textNode);
        cleanedCount += 1;
      }
    }

    if (cleanedCount > 0) {
      cleanupReplaceMarkedElements();
      updateFloatingTranslatedFromPageState();
    }

    return cleanedCount;
  }

  function cleanupStaleBilingualEntries() {
    let cleanedCount = 0;

    for (const entry of Array.from(state.bilingualTranslatedTextNodes.entries())) {
      const textNode = entry[0];
      const bilingualEntry = normalizeBilingualEntry(entry[1]);

      if (isActiveBilingualEntry(textNode, bilingualEntry)) {
        continue;
      }

      removeBilingualEntry(textNode, bilingualEntry);
      cleanedCount += 1;
    }

    if (cleanedCount > 0) {
      updateFloatingTranslatedFromPageState();
    }

    return cleanedCount;
  }

  function hasActiveBilingualTranslation(textNode) {
    const entry = state.bilingualTranslatedTextNodes.get(textNode);

    if (!entry) {
      return false;
    }

    const bilingualEntry = normalizeBilingualEntry(entry);

    if (isActiveBilingualEntry(textNode, bilingualEntry)) {
      return true;
    }

    removeBilingualEntry(textNode, bilingualEntry);
    return false;
  }

  function isActiveBilingualEntry(textNode, entry) {
    return Boolean(
      textNode &&
      entry &&
      isNodeConnected(textNode) &&
      isNodeConnected(entry.marker) &&
      String(textNode.nodeValue ?? "") === entry.originalText
    );
  }

  function removeBilingualEntry(textNode, entry) {
    const marker = entry?.marker ?? null;

    if (marker && typeof marker.remove === "function") {
      marker.remove();
    }

    state.bilingualTranslatedTextNodes.delete(textNode);

    if (entry?.translationId) {
      state.bilingualTranslationNodes.delete(entry.translationId);
      return;
    }

    for (const translationEntry of Array.from(state.bilingualTranslationNodes.entries())) {
      if (translationEntry[1] === marker) {
        state.bilingualTranslationNodes.delete(translationEntry[0]);
      }
    }
  }

  function normalizeBilingualEntry(value) {
    if (value && typeof value === "object" && "marker" in value) {
      return {
        originalText: String(value.originalText ?? ""),
        marker: value.marker ?? null,
        translationId: value.translationId ?? ""
      };
    }

    return {
      originalText: "",
      marker: null,
      translationId: ""
    };
  }

  function cleanupReplaceMarkedElements() {
    for (const element of state.replaceMarkedElements) {
      if (element && typeof element.removeAttribute === "function" && !hasActiveReplaceEntryForElement(element)) {
        element.removeAttribute("data-pbt-replaced");
        state.replaceMarkedElements.delete(element);
      }
    }
  }

  function hasActiveReplaceEntryForElement(element) {
    for (const entry of state.replacedTextNodes.entries()) {
      const textNode = entry[0];
      const replaceEntry = normalizeReplaceEntry(entry[1], textNode);

      if (replaceEntry.element === element || textNode.parentElement === element) {
        return true;
      }
    }

    return false;
  }

  function normalizeReplaceEntry(value, textNode) {
    if (value && typeof value === "object") {
      return {
        originalText: String(value.originalText ?? ""),
        translatedText: String(value.translatedText ?? ""),
        element: value.element ?? textNode?.parentElement ?? null
      };
    }

    return {
      originalText: String(value ?? ""),
      translatedText: String(textNode?.nodeValue ?? ""),
      element: textNode?.parentElement ?? null
    };
  }

  function isTextNodeConnected(textNode) {
    return isNodeConnected(textNode);
  }

  function isNodeConnected(node) {
    if (!node) {
      return false;
    }

    if (typeof node.isConnected === "boolean") {
      return node.isConnected;
    }

    let current = node;
    const body = node.ownerDocument?.body ?? null;

    while (current) {
      if (current === body) {
        return true;
      }

      current = current.parentNode;
    }

    return false;
  }

  function restorePage() {
    suspendSessionTranslationReuseUntilNextRender();
    invalidatePendingCollectedTranslations();
    const restored = restoreOriginalText();
    const removed = removeBilingualTranslations();
    const orphanedReplaceMarkerCount = countOrphanedReplaceMarkers();
    const reloadRequired = orphanedReplaceMarkerCount > 0;

    if (reloadRequired) {
      reloadPageForOrphanedReplaceMarkers();
    }

    return {
      ok: true,
      restoredCount: restored.restoredCount,
      removedCount: removed.removedCount,
      reloadRequired,
      orphanedReplaceMarkerCount
    };
  }

  function invalidatePendingCollectedTranslations() {
    clearCollectedTextNodes();
    state.floatingAutoTranslatePending = false;
    state.floatingAutoTranslateForce = false;
    state.floatingAutoTranslateSettlePending = false;
    state.floatingAutoTranslateProgressIds.clear();

    if (state.floatingAutoTranslateTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.floatingAutoTranslateTimer);
    }

    if (state.floatingAutoTranslateSettleTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.floatingAutoTranslateSettleTimer);
    }

    state.floatingAutoTranslateTimer = null;
    state.floatingAutoTranslateSettleTimer = null;
    updatePendingTranslationIndicators();
  }

  function removeBilingualTranslations() {
    suspendSessionTranslationReuseUntilNextRender();
    let removedCount = 0;

    for (const node of state.bilingualTranslationNodes.values()) {
      if (node && typeof node.remove === "function") {
        node.remove();
        removedCount += 1;
      }
    }

    state.bilingualTranslationNodes.clear();
    state.bilingualTranslatedTextNodes.clear();
    updateFloatingTranslatedFromPageState();

    return { ok: true, removedCount };
  }

  function showFloatingTranslateButton(options = {}) {
    const doc = root.document;

    if (!doc || !doc.body) {
      return { ok: false, error: { code: "missing_document", message: "No document was found." } };
    }

    if (hasOwn(options, "qualityMode")) {
      state.floatingQualityMode = normalizeQualityMode(options.qualityMode);
    }

    if (hasOwn(options, "displayMode")) {
      state.floatingDisplayMode = normalizeDisplayMode(options.displayMode);
    }

    if (hasOwn(options, "captionSize")) {
      state.floatingCaptionSize = normalizeCaptionSize(options.captionSize);
    }

    if (hasOwn(options, "paidProvider")) {
      state.floatingPaidProvider = normalizePaidProvider(options.paidProvider);
    }

    if (hasOwn(options, "autoTranslate")) {
      state.floatingStoredAutoTranslate = options.autoTranslate === true;
    }

    if (hasOwn(options, "floatingControlsHidden")) {
      state.floatingHidden = options.floatingControlsHidden === true;
    }

    if (state.floatingPanel && state.floatingPanel.parentNode) {
      ensureYouTubeTranscriptButton(doc);
      syncFloatingTranslatedStateFromPage();
      updateFloatingPanelControls();
      maybeRunStoredAutoTranslate();
      return { ok: true, shown: false };
    }

    const panel = createFloatingPanel(doc);
    doc.body.appendChild(panel);
    state.floatingPanel = panel;
    ensureYouTubeTranscriptButton(doc);
    syncFloatingTranslatedStateFromPage();
    updateFloatingPanelControls();
    maybeRunStoredAutoTranslate();

    return { ok: true, shown: true };
  }

  function walkNode(node, onTextNode, options = {}) {
    if (!node) {
      return;
    }

    if (node.nodeType === TEXT_NODE) {
      if (isTextNodeAllowed(node, options)) {
        onTextNode(node);
      }
      return;
    }

    if (
      node.nodeType !== ELEMENT_NODE ||
      isElementExcluded(node) ||
      (options.skipAutoIncrementalSecondarySurfaces === true && isAutoIncrementalSecondarySurface(node))
    ) {
      return;
    }

    for (const child of Array.from(node.childNodes || [])) {
      walkNode(child, onTextNode, options);
    }
  }

  function isTextNodeAllowed(textNode, options = {}) {
    const parent = textNode.parentElement;

    if (!parent || state.replacedTextNodes.has(textNode) || hasActiveBilingualTranslation(textNode)) {
      return false;
    }

    if (hasExcludedElementInAncestry(parent)) {
      return false;
    }

    if (
      options.skipAutoIncrementalSecondarySurfaces === true &&
      hasAutoIncrementalSecondarySurfaceInAncestry(parent)
    ) {
      return false;
    }

    const text = normalizeText(textNode.nodeValue);

    if (!text || isIdentityTextNode(textNode, text)) {
      return false;
    }

    return true;
  }

  function isElementExcluded(element) {
    if (!element || element.nodeType !== ELEMENT_NODE) {
      return true;
    }

    if (EXCLUDED_TAGS.has(getElementTagName(element))) {
      return true;
    }

    if (isInteractiveTextControlElement(element)) {
      return true;
    }

    if (element.hasAttribute("data-pbt-translation") || element.hasAttribute("data-pbt-control")) {
      return true;
    }

    if (isTransientOverlayElement(element)) {
      return true;
    }

    if (isInsideClosedDetailsContent(element)) {
      return true;
    }

    if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
      return true;
    }

    if (element.isContentEditable || element.getAttribute("contenteditable") === "true") {
      return true;
    }

    const view = element.ownerDocument && element.ownerDocument.defaultView;
    const style = view && typeof view.getComputedStyle === "function"
      ? view.getComputedStyle(element)
      : null;

    return Boolean(style && (style.display === "none" || style.visibility === "hidden"));
  }

  function isInsideClosedDetailsContent(element) {
    let current = element;

    while (current && current.parentElement) {
      const parent = current.parentElement;

      if (getElementTagName(parent) === "DETAILS" && !parent.hasAttribute("open")) {
        return getElementTagName(current) !== "SUMMARY";
      }

      current = parent;
    }

    return false;
  }

  function normalizeText(value) {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    return normalized.length >= 2 &&
      !isNonLinguisticText(normalized) &&
      !isLikelyTargetLanguageText(normalized)
      ? normalized
      : "";
  }

  function isLikelyTargetLanguageText(value) {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    const cjkMatches = normalized.match(/[\u3400-\u9fff]/g) || [];

    if (cjkMatches.length === 0) {
      return false;
    }

    const latinWordMatches = normalized.match(/[A-Za-z][A-Za-z0-9._+-]*/g) || [];

    return latinWordMatches.length === 0 || (cjkMatches.length >= 2 && latinWordMatches.length <= 4);
  }

  function syncFloatingTargetLanguageAutoTranslatePause() {
    const shouldPause = isTargetLanguageAutoTranslatePage();
    const changed = state.floatingAutoTranslatePausedForTargetLanguage !== shouldPause;
    const wasTranslated = state.floatingTranslated;
    const hadScheduledAutoTranslate = Boolean(
      state.floatingAutoTranslatePending ||
      state.floatingAutoTranslateForce ||
      state.floatingAutoTranslateSettlePending ||
      state.floatingAutoTranslateTimer ||
      state.floatingAutoTranslateSettleTimer
    );
    state.floatingAutoTranslatePausedForTargetLanguage = shouldPause;

    if (shouldPause) {
      state.floatingInitialAutoTranslateRequested = true;

      if (changed || wasTranslated || hadScheduledAutoTranslate) {
        invalidatePendingCollectedTranslations();
      }

      if (wasTranslated) {
        state.floatingTranslated = false;
        state.floatingTranslatedSettingsSignature = "";
        updateFloatingPanelControls();
      } else if (changed) {
        updateFloatingPanelControls();
      }
    } else if (changed) {
      state.floatingInitialAutoTranslateRequested = false;
      updateFloatingPanelControls();
    }

    return { paused: shouldPause, changed };
  }

  function isTargetLanguageAutoTranslatePage() {
    const doc = root.document;

    if (!doc || !doc.body) {
      return false;
    }

    if (hasTargetLanguageDocumentSignal(doc) || hasTargetLanguageUrlSignal(root.location)) {
      return true;
    }

    if (hasActiveRenderedTranslations()) {
      return false;
    }

    return hasDominantTargetLanguageVisibleText(doc);
  }

  function hasTargetLanguageDocumentSignal(doc) {
    const documentElement = doc?.documentElement ?? null;
    const lang = String(
      documentElement?.getAttribute?.("lang") ??
      documentElement?.lang ??
      ""
    ).trim();

    return /^zh(?:[-_]|$)/i.test(lang);
  }

  function hasTargetLanguageUrlSignal(location) {
    try {
      const href = String(location?.href ?? "");

      if (!href) {
        return false;
      }

      const url = new URL(href);
      const pathSegments = url.pathname
        .split("/")
        .map((segment) => decodeURIComponent(segment).toLowerCase())
        .filter(Boolean);

      if (pathSegments.some((segment) => isTargetLanguageLocaleValue(segment))) {
        return true;
      }

      for (const key of ["lang", "locale", "language", "hl"]) {
        if (isTargetLanguageLocaleValue(url.searchParams.get(key))) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  function isTargetLanguageLocaleValue(value) {
    const normalized = String(value ?? "").trim().toLowerCase().replace(/_/g, "-");

    return normalized === "zh" ||
      normalized === "cn" ||
      normalized.startsWith("zh-");
  }

  function hasDominantTargetLanguageVisibleText(doc) {
    const stats = getVisibleTextLanguageStats(doc);
    const linguisticChars = stats.cjkChars + stats.latinChars;

    if (stats.cjkChars < TARGET_LANGUAGE_MIN_CJK_CHARS || linguisticChars === 0) {
      return false;
    }

    return stats.cjkChars / linguisticChars >= TARGET_LANGUAGE_MIN_CJK_RATIO;
  }

  function getVisibleTextLanguageStats(doc) {
    const stats = {
      sampledChars: 0,
      cjkChars: 0,
      latinChars: 0
    };

    collectVisibleTextLanguageStats(doc?.body ?? null, stats);
    return stats;
  }

  function collectVisibleTextLanguageStats(node, stats) {
    if (!node || stats.sampledChars >= TARGET_LANGUAGE_SAMPLE_LIMIT) {
      return;
    }

    if (node.nodeType === TEXT_NODE) {
      countLanguageChars(node.nodeValue, stats);
      return;
    }

    if (node.nodeType !== ELEMENT_NODE || isElementExcluded(node)) {
      return;
    }

    for (const child of Array.from(node.childNodes || [])) {
      collectVisibleTextLanguageStats(child, stats);

      if (stats.sampledChars >= TARGET_LANGUAGE_SAMPLE_LIMIT) {
        return;
      }
    }
  }

  function countLanguageChars(value, stats) {
    const text = String(value ?? "");

    for (const char of text) {
      if (stats.sampledChars >= TARGET_LANGUAGE_SAMPLE_LIMIT) {
        return;
      }

      if (/[\u3400-\u9fff]/.test(char)) {
        stats.cjkChars += 1;
        stats.sampledChars += 1;
        continue;
      }

      if (/[A-Za-z]/.test(char)) {
        stats.latinChars += 1;
        stats.sampledChars += 1;
      }
    }
  }

  function hasActiveRenderedTranslations() {
    return state.replacedTextNodes.size > 0 ||
      state.bilingualTranslationNodes.size > 0 ||
      hasOrphanedReplaceMarkers();
  }

  function hasOrphanedReplaceMarkers() {
    return countOrphanedReplaceMarkers() > 0;
  }

  function countOrphanedReplaceMarkers(node = root.document?.body ?? null) {
    if (!node) {
      return 0;
    }

    let count = 0;

    if (
      node.nodeType === ELEMENT_NODE &&
      typeof node.hasAttribute === "function" &&
      node.hasAttribute("data-pbt-replaced") &&
      !hasActiveReplaceEntryForElement(node)
    ) {
      count += 1;
    }

    for (const child of Array.from(node.childNodes || [])) {
      count += countOrphanedReplaceMarkers(child);
    }

    return count;
  }

  function reloadPageForOrphanedReplaceMarkers() {
    const reload = root.location?.reload;

    if (typeof reload === "function") {
      reload.call(root.location);
    }
  }

  function isMeaningfulTranslation(originalText, translatedText) {
    const normalizedOriginal = normalizeComparableText(originalText);
    const normalizedTranslated = normalizeComparableText(translatedText);

    return Boolean(
      normalizedOriginal &&
      normalizedTranslated &&
      !isNonLinguisticText(normalizedTranslated) &&
      normalizedOriginal !== normalizedTranslated
    );
  }

  function normalizeComparableText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function isIdentityTextNode(textNode, text) {
    if (isExplicitIdentityText(text)) {
      return true;
    }

    if (!isShortIdentityLabel(text)) {
      return false;
    }

    let current = textNode.parentElement;
    let depth = 0;

    while (current && depth < 5) {
      if (isIdentityContextElement(current) || isSocialProfileLinkElement(current)) {
        return true;
      }

      current = current.parentElement;
      depth += 1;
    }

    return false;
  }

  function isExplicitIdentityText(text) {
    return SOCIAL_HANDLE_PATTERN.test(text) || EXPLICIT_ID_PATTERN.test(text);
  }

  function isShortIdentityLabel(text) {
    if (text.length > 80 || /[.!?。！？]/.test(text) || /https?:\/\//i.test(text)) {
      return false;
    }

    const words = text.split(/\s+/).filter(Boolean);

    if (words.length > 6) {
      return false;
    }

    return /[A-Za-z0-9_\u3400-\u9fff]/.test(text);
  }

  function isIdentityContextElement(element) {
    if (!element || typeof element.getAttribute !== "function") {
      return false;
    }

    for (const name of IDENTITY_ATTRIBUTE_NAMES) {
      const value = element.getAttribute(name);

      if (!value) {
        continue;
      }

      if (name === "itemprop" && AUTHOR_ITEMPROP_PATTERN.test(value)) {
        return true;
      }

      if (IDENTITY_CONTEXT_PATTERN.test(value)) {
        return true;
      }
    }

    return false;
  }

  function isTransientOverlayElement(element) {
    if (!element || typeof element.getAttribute !== "function") {
      return false;
    }

    const role = normalizeAttributeValue(element.getAttribute("role")).toLowerCase();

    if (TRANSIENT_OVERLAY_ROLES.has(role)) {
      return true;
    }

    if (typeof element.hasAttribute === "function" && (
      element.hasAttribute("popover") ||
      element.hasAttribute("data-popper-placement") ||
      element.hasAttribute("data-tippy-root")
    )) {
      return true;
    }

    for (const name of TRANSIENT_OVERLAY_DATA_ATTRIBUTE_NAMES) {
      if (TRANSIENT_OVERLAY_DATA_PATTERN.test(normalizeAttributeValue(element.getAttribute(name)))) {
        return true;
      }
    }

    for (const name of TRANSIENT_OVERLAY_UI_ATTRIBUTE_NAMES) {
      if (TRANSIENT_OVERLAY_UI_PATTERN.test(normalizeAttributeValue(element.getAttribute(name)))) {
        return true;
      }
    }

    return false;
  }

  function hasAutoIncrementalSecondarySurfaceInAncestry(element) {
    let current = element;

    while (current && current.nodeType === ELEMENT_NODE) {
      if (isAutoIncrementalSecondarySurface(current)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function isAutoIncrementalSecondarySurface(element) {
    if (!element || element.nodeType !== ELEMENT_NODE || typeof element.getAttribute !== "function") {
      return false;
    }

    if (hasSecondaryRailSemanticSignal(element)) {
      return true;
    }

    if (!isKnownSocialHost(getCurrentHostname())) {
      return false;
    }

    const role = normalizeAttributeValue(element.getAttribute("role")).toLowerCase();
    return getElementTagName(element) === "ASIDE" || role === "complementary";
  }

  function hasSecondaryRailSemanticSignal(element) {
    for (const name of SECONDARY_RAIL_ATTRIBUTE_NAMES) {
      const value = normalizeSemanticAttributeValue(element.getAttribute(name));

      if (value && SECONDARY_RAIL_PATTERN.test(value)) {
        return true;
      }
    }

    return false;
  }

  function normalizeSemanticAttributeValue(value) {
    return String(value ?? "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/['’]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeAttributeValue(value) {
    return String(value ?? "").trim();
  }

  function isSocialProfileLinkElement(element) {
    if (!element || getElementTagName(element) !== "A" || typeof element.getAttribute !== "function") {
      return false;
    }

    const href = element.getAttribute("href");

    if (!href) {
      return false;
    }

    try {
      const baseHref = root.location && root.location.href ? root.location.href : "about:blank";
      const url = new URL(href, baseHref);

      if (!isKnownSocialHost(url.hostname) && !isKnownSocialHost(new URL(baseHref).hostname)) {
        return false;
      }

      const path = url.pathname.replace(/\/+$/g, "");
      const compactPath = path.startsWith("/") ? path.slice(1) : path;

      if (!compactPath || NON_PROFILE_SOCIAL_PATHS.has(compactPath.toLowerCase())) {
        return false;
      }

      if (/^@[A-Za-z0-9._-]{1,64}$/.test(compactPath)) {
        return true;
      }

      if (/^(user|users|u|in|profile)\/[A-Za-z0-9._-]{1,80}$/i.test(compactPath)) {
        return true;
      }

      return /^[A-Za-z0-9._-]{1,30}$/.test(compactPath);
    } catch {
      return false;
    }
  }

  function isKnownSocialHost(hostname) {
    return SOCIAL_HOST_PATTERN.test(String(hostname ?? ""));
  }

  function getCurrentHostname() {
    const hostname = root.location?.hostname;

    if (hostname) {
      return hostname;
    }

    try {
      return new URL(String(root.location?.href ?? "")).hostname;
    } catch {
      return "";
    }
  }

  function isNonLinguisticText(value) {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();

    if (!normalized) {
      return false;
    }

    if (isCompactMetricText(normalized) || isBareUrlLikeText(normalized)) {
      return true;
    }

    const stripped = normalized
      .replace(/\s+/g, "")
      .replace(/[$€£¥₩₹₽₺₫₴₪₦₱฿₡₲₵₭₮₸₼₾]/g, "")
      .replace(/[+\-−–—~≈=<>()[\]{}%‰,.'’:_/\\]/g, "");

    return /^\d+$/.test(stripped);
  }

  function isCompactMetricText(value) {
    const compact = String(value ?? "").replace(/\s+/g, "").replace(/,/g, "");
    return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)[KMBT]$/i.test(compact);
  }

  function isBareUrlLikeText(value) {
    const normalized = String(value ?? "").trim();
    return /^https?:\/\/\S+$/i.test(normalized) ||
      /^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/\S*)?$/i.test(normalized);
  }

  function isInteractiveTextControlElement(element) {
    if (!element || typeof element.getAttribute !== "function") {
      return false;
    }

    return INTERACTIVE_TEXT_EXCLUDED_ROLES.has(normalizeAttributeValue(element.getAttribute("role")).toLowerCase());
  }

  function hasExcludedElementInAncestry(element) {
    let current = element;

    while (current && current.nodeType === ELEMENT_NODE) {
      if (isElementExcluded(current)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function getElementTagName(element) {
    return String(element?.tagName ?? element?.nodeName ?? "").toUpperCase();
  }

  function createTranslationNode(doc, segmentId, text) {
    const node = doc.createElement("span");
    node.setAttribute("data-pbt-translation", "true");
    node.setAttribute("data-pbt-segment-id", segmentId);
    node.style.display = "block";
    node.style.marginTop = "0.25em";
    node.style.color = "#0f766e";
    node.textContent = String(text ?? "");
    return node;
  }

  function isClickableYouTubePageControl(element) {
    if (!element || typeof element.click !== "function") {
      return false;
    }

    const tagName = getElementTagName(element);
    const role = String(element.getAttribute?.("role") ?? "").toLowerCase();

    return tagName === "BUTTON" ||
      tagName === "A" ||
      role === "button" ||
      role === "menuitem";
  }

  function querySelectorAllElements(rootNode, selector, limit = Infinity) {
    const elements = [];

    if (!rootNode || typeof rootNode.querySelectorAll !== "function") {
      return elements;
    }

    try {
      for (const element of rootNode.querySelectorAll(selector)) {
        if (element && element.nodeType === ELEMENT_NODE) {
          elements.push(element);
        }

        if (elements.length >= limit) {
          break;
        }
      }
    } catch {
      return [];
    }

    return elements;
  }

  function clickYouTubePageControl(element) {
    if (!element || typeof element.click !== "function") {
      return false;
    }

    try {
      element.click();
      return true;
    } catch {
      return false;
    }
  }

  function getYouTubePageControlLabel(element) {
    const values = [
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      getBoundedElementText(element)
    ];

    return values.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function getBoundedElementText(element, maxChars = 160, maxNodes = 32) {
    if (!element) {
      return "";
    }

    let text = "";
    let visitedNodes = 0;

    const visit = (node) => {
      if (!node || text.length >= maxChars || visitedNodes >= maxNodes) {
        return;
      }

      visitedNodes += 1;

      if (node.nodeType === TEXT_NODE) {
        text += ` ${String(node.nodeValue ?? "")}`;
        return;
      }

      if (node.nodeType !== ELEMENT_NODE || isPluginOwnedMutationNode(node)) {
        return;
      }

      const tagName = getElementTagName(node);

      if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT") {
        return;
      }

      let children = [];

      try {
        children = node.childNodes || [];
      } catch {
        return;
      }

      for (let index = 0; index < children.length; index += 1) {
        if (text.length >= maxChars || visitedNodes >= maxNodes) {
          break;
        }

        visit(children[index]);
      }
    };

    visit(element);
    return text.slice(0, maxChars).replace(/\s+/g, " ").trim();
  }

  function walkElementNodes(node, onElement) {
    if (!node) {
      return;
    }

    if (node.nodeType === ELEMENT_NODE) {
      onElement(node);
    }

    for (const child of Array.from(node.childNodes || [])) {
      walkElementNodes(child, onElement);
    }
  }

  function isHiddenYouTubeTranscriptTextContainer(element) {
    if (!element || element.nodeType !== ELEMENT_NODE) {
      return false;
    }

    if (element.hasAttribute?.("hidden") || element.getAttribute?.("aria-hidden") === "true") {
      return true;
    }

    const inlineDisplay = String(element.style?.display ?? "");
    const inlineVisibility = String(element.style?.visibility ?? "");

    if (inlineDisplay === "none" || inlineVisibility === "hidden" || inlineVisibility === "collapse") {
      return true;
    }

    const view = element.ownerDocument && element.ownerDocument.defaultView;
    const style = view && typeof view.getComputedStyle === "function"
      ? view.getComputedStyle(element)
      : null;

    return Boolean(style && (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ));
  }

  function ensureYouTubeTranscriptOverlayNode(doc) {
    if (!doc || !doc.body) {
      return null;
    }

    if (state.youtubeTranscriptOverlayNode && state.youtubeTranscriptOverlayNode.parentNode) {
      return state.youtubeTranscriptOverlayNode;
    }

    const overlay = doc.createElement("div");
    overlay.setAttribute("data-pbt-control", "youtube-transcript-overlay");
    overlay.setAttribute("aria-live", "off");
    applyYouTubeLocalAsrDiagnostics(overlay);
    setStyles(overlay, {
      position: "absolute",
      left: "50%",
      bottom: "82px",
      transform: "translateX(-50%)",
      zIndex: YOUTUBE_CAPTION_OVERLAY_Z_INDEX,
      display: "none",
      maxWidth: "80%",
      padding: "0.25em 0.6em",
      borderRadius: "0.3em",
      boxSizing: "border-box",
      background: "rgba(0, 0, 0, 0.72)",
      color: "#ffffff",
      textAlign: "center",
      textShadow: "0 1px 2px rgba(0, 0, 0, 0.55)",
      font: "700 20px/1.38 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      letterSpacing: "0",
      whiteSpace: "normal",
      overflowWrap: "break-word",
      transition: "bottom 160ms ease",
      pointerEvents: "none"
    });

    (getYouTubeCaptionHost(doc) || doc.body).appendChild(overlay);
    state.youtubeTranscriptOverlayNode = overlay;
    return overlay;
  }

  function scheduleYouTubeTranscriptSilentTimeout(requestId) {
    clearYouTubeTranscriptTranslateTimer();

    if (typeof root.setTimeout !== "function") {
      return;
    }

    state.youtubeTranscriptTranslateTimer = root.setTimeout(() => {
      if (requestId !== state.youtubeTranscriptTranslateRequestId || !state.youtubeTranscriptTranslateInFlight) {
        return;
      }

      state.youtubeTranscriptTranslateInFlight = false;
      state.youtubeTranscriptTranslateRequestId += 1;
      clearYouTubeTranscriptTranslateTimer();
      state.youtubeTranscriptAutoUpdateLastFailedTime = Date.now();
    }, YOUTUBE_TRANSCRIPT_TRANSLATE_TIMEOUT_MS);
  }

  function clearYouTubeTranscriptSyncDiagnostics(element) {
    if (!element || typeof element.removeAttribute !== "function") {
      return;
    }

    for (const attribute of YOUTUBE_TRANSCRIPT_SYNC_DIAGNOSTIC_ATTRIBUTES) {
      element.removeAttribute(attribute);
    }
  }

  function isYouTubeWatchPage() {
    try {
      const url = new URL(String(root.location?.href ?? ""));
      return /(^|\.)youtube\.com$/i.test(url.hostname) && url.pathname === "/watch";
    } catch {
      return false;
    }
  }

  function getYouTubeWatchVideoId() {
    try {
      const url = new URL(String(root.location?.href ?? ""));

      if (!/(^|\.)youtube\.com$/i.test(url.hostname) || url.pathname !== "/watch") {
        return "";
      }

      return String(url.searchParams.get("v") ?? "");
    } catch {
      return "";
    }
  }

  function markReplaced(element) {
    if (!element || typeof element.setAttribute !== "function") {
      return;
    }

    element.setAttribute("data-pbt-replaced", "true");
    state.replaceMarkedElements.add(element);
  }

  function createFloatingPanel(doc) {
    const shell = doc.createElement("div");
    shell.setAttribute("data-pbt-control", "floating-panel");
    shell.setAttribute("data-pbt-hidden", "false");
    setStyles(shell, {
      position: "fixed",
      top: "50%",
      right: "14px",
      transform: "translateY(-50%)",
      zIndex: "2147483647",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      font: "13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#1f2937",
      transition: "transform 180ms ease, opacity 180ms ease"
    });

    bindFloatingOutsideClick(doc);
    bindFloatingContentObserver(doc);
    shell.appendChild(createFloatingLoadingStyle(doc));
    shell.appendChild(createSettingsPanel(doc));

    const rail = doc.createElement("div");
    rail.setAttribute("data-pbt-control", "floating-rail");
    setStyles(rail, {
      display: "grid",
      gap: "8px",
      justifyItems: "center",
      padding: "4px",
      borderRadius: "999px",
      background: "rgba(255, 255, 255, 0.18)"
    });
    rail.appendChild(createFloatingToggleButton(doc));
    rail.appendChild(createIconButton(doc, "设", "settings", "打开翻译设置", false));
    rail.appendChild(createIconButton(doc, "›", "hide", "隐藏翻译按钮", false));

    const handle = doc.createElement("button");
    handle.setAttribute("type", "button");
    handle.setAttribute("data-pbt-control", "show-handle");
    handle.setAttribute("aria-label", "显示翻译按钮");
    handle.setAttribute("title", "显示翻译按钮");
    handle.textContent = "‹";
    setStyles(handle, {
      width: "22px",
      height: "58px",
      border: "1px solid rgba(229, 231, 235, 0.92)",
      borderRight: "0",
      borderRadius: "14px 0 0 14px",
      background: "rgba(255, 255, 255, 0.96)",
      color: "#ec4899",
      boxShadow: "0 8px 22px rgba(15, 23, 42, 0.16)",
      cursor: "pointer",
      font: "700 18px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      touchAction: "manipulation",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      boxSizing: "border-box"
    });
    handle.addEventListener("click", () => {
      setFloatingHidden(false, { persist: true });
    });

    shell.appendChild(rail);
    shell.appendChild(handle);

    return shell;
  }

  function createSettingsPanel(doc) {
    const panel = doc.createElement("div");
    panel.setAttribute("data-pbt-control", "settings-panel");
    setStyles(panel, {
      display: "none",
      width: "304px",
      maxHeight: "78vh",
      overflow: "auto",
      padding: "14px",
      border: "1px solid rgba(229, 231, 235, 0.94)",
      borderRadius: "18px",
      background: "rgba(255, 255, 255, 0.98)",
      boxShadow: "0 18px 44px rgba(15, 23, 42, 0.18)",
      backdropFilter: "blur(10px)",
      boxSizing: "border-box"
    });

    const qualitySelect = createSettingsSelect(doc, "quality-mode", [
      ["free", "免费版"],
      ["natural", "自然版"],
      ["deep", "深度版"]
    ]);
    qualitySelect.addEventListener("change", () => {
      state.floatingQualityMode = normalizeQualityMode(qualitySelect.value);
      saveFloatingTranslationSettings(state.floatingTranslated);
      updateFloatingPanelControls();
    });

    const providerSelect = createSettingsSelect(doc, "paid-provider", [
      ["gemini", "Gemini API"],
      ["custom_openai", "自定义中转站"]
    ]);
    providerSelect.addEventListener("change", () => {
      state.floatingPaidProvider = normalizePaidProvider(providerSelect.value);
      saveFloatingTranslationSettings(state.floatingTranslated);
      updateFloatingPanelControls();
    });

    const modeSelect = createSettingsSelect(doc, "display-mode", [
      [DISPLAY_MODES.BILINGUAL, "双语翻译"],
      [DISPLAY_MODES.REPLACE, "直接翻译"]
    ]);

    modeSelect.addEventListener("change", () => {
      const previousDisplayMode = state.floatingDisplayMode;
      state.floatingDisplayMode = normalizeDisplayMode(modeSelect.value);
      saveFloatingTranslationSettings(state.floatingTranslated);
      updateFloatingPanelControls();

      if (previousDisplayMode !== state.floatingDisplayMode) {
        maybeApplyFloatingDisplayModeChange();
      }
    });

    const providerNote = doc.createElement("p");
    providerNote.setAttribute("data-pbt-control", "provider-note");
    setStyles(providerNote, {
      margin: "0",
      color: "#6b7280",
      font: "500 11px/1.35 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    });

    const keyNote = doc.createElement("p");
    keyNote.setAttribute("data-pbt-control", "provider-config-note");
    keyNote.textContent = "下方为扩展安全配置面板。";
    setStyles(keyNote, {
      margin: "2px 0 0",
      color: "#9ca3af",
      font: "500 11px/1.35 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    });

    const providerConfigFrame = doc.createElement("iframe");
    providerConfigFrame.setAttribute("data-pbt-control", "provider-config-frame");
    providerConfigFrame.setAttribute("title", "配置 Key / 中转站 / model");
    providerConfigFrame.setAttribute("referrerpolicy", "no-referrer");
    setStyles(providerConfigFrame, {
      width: "100%",
      height: "356px",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      background: "#ffffff",
      boxSizing: "border-box"
    });

    panel.appendChild(createSettingsField(doc, "翻译质量", qualitySelect));
    panel.appendChild(createSettingsField(doc, "付费供应商", providerSelect));
    panel.appendChild(providerNote);
    panel.appendChild(createSettingsField(doc, "显示模式", modeSelect));

    const captionSizeSelect = createSettingsSelect(doc, "caption-size", [
      ["small", "小"],
      ["standard", "标准"],
      ["large", "大"],
      ["xlarge", "特大"]
    ]);
    captionSizeSelect.addEventListener("change", () => {
      state.floatingCaptionSize = normalizeCaptionSize(captionSizeSelect.value);
      saveFloatingTranslationSettings(state.floatingTranslated);
      updateFloatingPanelControls();
    });
    const captionSizeField = createSettingsField(doc, "YouTube 字幕大小", captionSizeSelect);
    captionSizeField.setAttribute("data-pbt-control", "caption-size-field");
    panel.appendChild(captionSizeField);
    panel.appendChild(keyNote);
    panel.appendChild(providerConfigFrame);
    return panel;
  }

  function createSettingsField(doc, labelText, control) {
    const label = doc.createElement("label");
    setStyles(label, {
      display: "grid",
      gap: "6px",
      marginBottom: "10px",
      color: "#4b5563",
      font: "700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    });

    const text = doc.createElement("span");
    text.textContent = labelText;
    label.appendChild(text);
    label.appendChild(control);
    return label;
  }

  function createSettingsSelect(doc, control, options) {
    const select = doc.createElement("select");
    select.setAttribute("data-pbt-control", control);
    setStyles(select, {
      width: "100%",
      minHeight: "38px",
      padding: "0 10px",
      border: "1px solid #e5e7eb",
      borderRadius: "12px",
      background: "#f9fafb",
      color: "#111827",
      font: "600 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      outline: "none",
      boxSizing: "border-box"
    });

    for (const optionEntry of options) {
      const option = doc.createElement("option");
      option.setAttribute("value", optionEntry[0]);
      option.textContent = optionEntry[1];
      select.appendChild(option);
    }

    return select;
  }

  function createFloatingToggleButton(doc) {
    const button = createIconButton(doc, "译", "translate-toggle", "翻译当前网址", true);

    button.addEventListener("click", () => {
      runFloatingToggle(button);
    });

    return button;
  }

  function createYouTubeTranscriptButton(doc) {
    const button = createIconButton(doc, YOUTUBE_TRANSCRIPT_BUTTON_TEXT, "youtube-transcript-toggle", "显示 YouTube 中文字幕", false);
    markYouTubeTranscriptRuntimeVersion(button);
    setStyles(button, {
      position: "absolute",
      left: "auto",
      top: "auto",
      right: "18px",
      bottom: "72px",
      zIndex: YOUTUBE_CAPTION_BUTTON_Z_INDEX,
      display: "none"
    });

    button.addEventListener("click", (event) => {
      event?.stopPropagation?.();
      runYouTubeTranscriptToggle(button, {
        allowYouTubeLocalWhisperAsr: event?.altKey === true
      });
      button.blur?.();
    });

    for (const eventName of YOUTUBE_CAPTION_BUTTON_STOPPED_EVENTS) {
      button.addEventListener(eventName, (event) => {
        event?.stopPropagation?.();
      });
    }

    return button;
  }

  function ensureYouTubeTranscriptButton(doc) {
    if (!doc || !doc.body) {
      return null;
    }

    if (state.youtubeTranscriptButton && state.youtubeTranscriptButton.parentNode) {
      return state.youtubeTranscriptButton;
    }

    const button = createYouTubeTranscriptButton(doc);
    (getYouTubeCaptionHost(doc) || doc.body).appendChild(button);
    state.youtubeTranscriptButton = button;
    bindYouTubeTranscriptButtonPositionEvents(doc);
    return button;
  }

  function removeYouTubeTranscriptButton() {
    clearYouTubeTranscriptHint();

    if (state.youtubeTranscriptButton && typeof state.youtubeTranscriptButton.remove === "function") {
      state.youtubeTranscriptButton.remove();
    }

    state.youtubeTranscriptButton = null;
    state.youtubeTranscriptButtonPositionKey = "";
    disconnectYouTubeCaptionHostResizeObserver();
  }

  function bindYouTubeTranscriptButtonPositionEvents(doc) {
    if (state.youtubeTranscriptPositionEventsBound) {
      return;
    }

    const target = doc?.defaultView && typeof doc.defaultView.addEventListener === "function"
      ? doc.defaultView
      : root;

    if (!target || typeof target.addEventListener !== "function") {
      return;
    }

    state.youtubeTranscriptPositionEventsBound = true;
    const updatePosition = () => {
      scheduleYouTubeTranscriptButtonControlUpdate();
    };
    target.addEventListener("resize", updatePosition, { passive: true });
    target.addEventListener("scroll", updatePosition, { passive: true });
  }

  function scheduleYouTubeTranscriptButtonControlUpdate() {
    if (
      !state.youtubeTranscriptButton ||
      state.youtubeTranscriptControlsUpdateQueued ||
      !isYouTubeWatchPage()
    ) {
      return;
    }

    state.youtubeTranscriptControlsUpdateQueued = true;
    const run = () => {
      state.youtubeTranscriptControlsUpdateQueued = false;
      updateYouTubeTranscriptButtonControls();
    };

    if (typeof root.requestAnimationFrame === "function") {
      root.requestAnimationFrame(run);
      return;
    }

    if (typeof root.setTimeout === "function") {
      root.setTimeout(run, YOUTUBE_TRANSCRIPT_CONTROL_UPDATE_DELAY_MS);
      return;
    }

    run();
  }

  function updateYouTubeTranscriptButtonControls() {
    const button = state.youtubeTranscriptButton;

    if (!button) {
      return;
    }

    const host = getYouTubeCaptionHost(button.ownerDocument);

    if (host && button.parentNode !== host) {
      host.appendChild(button);
    }

    observeYouTubeCaptionHostResize(host);

    const shouldShow = isYouTubeWatchPage() && !state.floatingHidden;
    const placement = shouldShow ? getYouTubeTranscriptButtonPlacement(button.ownerDocument) : null;
    const visible = Boolean(placement);
    const display = visible ? "inline-flex" : "none";

    if (button.style.display !== display) {
      button.style.display = display;
    }

    if (visible) {
      const positionKey = `${placement.right}|${placement.bottom}`;

      if (state.youtubeTranscriptButtonPositionKey !== positionKey) {
        state.youtubeTranscriptButtonPositionKey = positionKey;
        button.style.right = `${placement.right}px`;
        button.style.bottom = `${placement.bottom}px`;
      }
    } else {
      state.youtubeTranscriptButtonPositionKey = "";
    }

    button.setAttribute("data-pbt-active", state.youtubeTranscriptTranslated ? "true" : "false");
    markYouTubeTranscriptRuntimeVersion(button);
    applyYouTubeLocalAsrDiagnostics(button);

    if (!button.hasAttribute("data-pbt-loading")) {
      button.setAttribute(
        "aria-label",
        state.youtubeTranscriptTranslated
          ? "移除 YouTube 视频字幕"
          : "显示 YouTube 中文字幕"
      );
      button.setAttribute(
        "title",
        state.youtubeTranscriptTranslated
          ? "移除 YouTube 视频字幕"
          : "显示 YouTube 中文字幕"
      );
    }

    button.style.border = state.youtubeTranscriptTranslated
      ? "1px solid #99f6e4"
      : "1px solid rgba(229, 231, 235, 0.96)";
    button.style.background = state.youtubeTranscriptTranslated
      ? "#0f766e"
      : "rgba(255, 255, 255, 0.98)";
    button.style.color = state.youtubeTranscriptTranslated
      ? "#ffffff"
      : "#ec4899";

    if (state.youtubeTranscriptOverlayNode && state.youtubeCaptionTimeline.sentences.length > 0) {
      updateYouTubeTranscriptOverlay();
    }
  }

  function getYouTubeTranscriptButtonPlacement(doc) {
    const rect = getUsableElementRect(getYouTubeCaptionHost(doc));

    if (!rect) {
      return null;
    }

    return { right: 18, bottom: rect.height >= 160 ? 72 : 14 };
  }

  function observeYouTubeCaptionHostResize(host) {
    if (!host || state.youtubeCaptionObservedHost === host || typeof root.ResizeObserver !== "function") {
      return;
    }

    disconnectYouTubeCaptionHostResizeObserver();

    try {
      const observer = new root.ResizeObserver(() => {
        scheduleYouTubeTranscriptButtonControlUpdate();
      });
      observer.observe(host);
      state.youtubeCaptionHostResizeObserver = observer;
      state.youtubeCaptionObservedHost = host;
    } catch {
      disconnectYouTubeCaptionHostResizeObserver();
    }
  }

  function disconnectYouTubeCaptionHostResizeObserver() {
    try {
      state.youtubeCaptionHostResizeObserver?.disconnect?.();
    } catch {}

    state.youtubeCaptionHostResizeObserver = null;
    state.youtubeCaptionObservedHost = null;
  }

  function findYouTubePlayerElement(doc) {
    if (!doc || !doc.body) {
      return null;
    }

    if (isNodeConnected(state.youtubeTranscriptPlayerElement)) {
      return state.youtubeTranscriptPlayerElement;
    }

    const byId = typeof doc.getElementById === "function" ? doc.getElementById("movie_player") : null;

    if (byId && byId.nodeType === ELEMENT_NODE) {
      state.youtubeTranscriptPlayerElement = byId;
      return byId;
    }

    const queried = querySelectorElement(doc, YOUTUBE_PLAYER_SELECTOR) ||
      querySelectorElement(doc.body, YOUTUBE_PLAYER_SELECTOR);

    if (queried) {
      state.youtubeTranscriptPlayerElement = queried;
      return queried;
    }

    let moviePlayer = null;
    let html5Player = null;
    let ytdPlayer = null;
    let video = null;

    walkElementNodes(doc.body, (element) => {
      const tagName = getElementTagName(element);
      const id = String(element.id ?? element.getAttribute?.("id") ?? "");
      const className = String(element.className ?? element.getAttribute?.("class") ?? "");

      if (!moviePlayer && id === "movie_player") {
        moviePlayer = element;
        return;
      }

      if (!html5Player && /(^|\s)html5-video-player(\s|$)/.test(className)) {
        html5Player = element;
        return;
      }

      if (!ytdPlayer && tagName === "YTD-PLAYER") {
        ytdPlayer = element;
        return;
      }

      if (!video && tagName === "VIDEO") {
        video = element;
      }
    });

    state.youtubeTranscriptPlayerElement = moviePlayer || html5Player || ytdPlayer || video;
    return state.youtubeTranscriptPlayerElement;
  }

  function findYouTubeVideoElement(doc) {
    if (!doc || !doc.body) {
      return null;
    }

    const player = findYouTubePlayerElement(doc);
    const selectedVideo = selectYouTubeVideoElement(doc, player);

    if (selectedVideo) {
      state.youtubeTranscriptVideoElement = selectedVideo;
      return selectedVideo;
    }

    if (isNodeConnected(state.youtubeTranscriptVideoElement)) {
      return state.youtubeTranscriptVideoElement;
    }

    return null;
  }

  function selectYouTubeVideoElement(doc, player) {
    const candidates = [];

    addYouTubeVideoCandidates(candidates, player);
    addYouTubeVideoCandidates(candidates, doc);
    addYouTubeVideoCandidates(candidates, doc?.body);

    if (candidates.length === 0) {
      const walkRoot = player || doc?.body;
      walkElementNodes(walkRoot, (element) => {
        if (getElementTagName(element) === "VIDEO") {
          candidates.push(element);
        }
      });
    }

    let bestVideo = null;
    let bestScore = -Infinity;

    for (const video of dedupeElements(candidates)) {
      const score = getYouTubeVideoElementScore(video, player);

      if (score > bestScore) {
        bestVideo = video;
        bestScore = score;
      }
    }

    return bestVideo;
  }

  function addYouTubeVideoCandidates(candidates, rootNode) {
    for (const element of querySelectorAllElements(rootNode, "video", 20)) {
      candidates.push(element);
    }
  }

  function dedupeElements(elements) {
    const seen = new Set();
    const deduped = [];

    for (const element of elements) {
      if (!element || seen.has(element)) {
        continue;
      }

      seen.add(element);
      deduped.push(element);
    }

    return deduped;
  }

  function getYouTubeVideoElementScore(video, player) {
    if (!video || getElementTagName(video) !== "VIDEO" || !isNodeConnected(video)) {
      return -Infinity;
    }

    let score = 0;
    const className = String(video.className ?? video.getAttribute?.("class") ?? "");
    const rect = getUsableElementRect(video);
    const currentTime = Number(video.currentTime);
    const duration = Number(video.duration);

    if (player && (video === player || (typeof player.contains === "function" && player.contains(video)))) {
      score += 50;
    }

    if (/(^|\s)html5-main-video(\s|$)/.test(className)) {
      score += 30;
    }

    if (rect) {
      score += Math.min(20, Math.round((rect.width * rect.height) / 10000));
    }

    if (Number.isFinite(currentTime) && currentTime >= 0) {
      score += 5;
    }

    if (Number.isFinite(duration) && duration > 0) {
      score += 5;
    }

    return score;
  }

  function findKnownYouTubeVideoElement(doc) {
    if (!doc || !doc.body) {
      return null;
    }

    if (isNodeConnected(state.youtubeTranscriptVideoElement)) {
      return state.youtubeTranscriptVideoElement;
    }

    const player = isNodeConnected(state.youtubeTranscriptPlayerElement)
      ? state.youtubeTranscriptPlayerElement
      : (
        (typeof doc.getElementById === "function" ? doc.getElementById("movie_player") : null) ||
        querySelectorElement(doc, YOUTUBE_PLAYER_SELECTOR) ||
        querySelectorElement(doc.body, YOUTUBE_PLAYER_SELECTOR)
      );
    const playerVideo = getElementTagName(player) === "VIDEO"
      ? player
      : querySelectorElement(player, "video");
    const video = playerVideo ||
      querySelectorElement(doc, "video") ||
      querySelectorElement(doc.body, "video");

    if (video) {
      state.youtubeTranscriptVideoElement = video;
    }

    return video || null;
  }

  function querySelectorElement(rootNode, selector) {
    if (!rootNode || typeof rootNode.querySelector !== "function") {
      return null;
    }

    try {
      const element = rootNode.querySelector(selector);
      return element && element.nodeType === ELEMENT_NODE ? element : null;
    } catch {
      return null;
    }
  }

  function getUsableElementRect(element) {
    if (!element || typeof element.getBoundingClientRect !== "function") {
      return null;
    }

    const rawRect = element.getBoundingClientRect();
    const left = Number(rawRect?.left);
    const top = Number(rawRect?.top);
    const right = Number(rawRect?.right);
    const bottom = Number(rawRect?.bottom);
    const width = Number(rawRect?.width ?? right - left);
    const height = Number(rawRect?.height ?? bottom - top);

    if (![left, top, right, bottom, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      return null;
    }

    return { left, top, right, bottom, width, height };
  }

  function createFloatingLoadingStyle(doc) {
    const style = doc.createElement("style");
    style.setAttribute("data-pbt-control", "floating-style");
    style.textContent = [
      "@keyframes pbt-spinner-rotate {",
      "to { transform: rotate(360deg); }",
      "}"
    ].join("\n");
    return style;
  }

  function createIconButton(doc, text, control, label, primary) {
    const button = doc.createElement("button");
    button.setAttribute("type", "button");
    button.setAttribute("data-pbt-control", control);
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.textContent = text;
    setStyles(button, {
      width: primary ? "48px" : "42px",
      height: primary ? "48px" : "42px",
      minWidth: primary ? "48px" : "42px",
      minHeight: primary ? "48px" : "42px",
      position: "relative",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      boxSizing: "border-box",
      textAlign: "center",
      border: primary ? "1px solid #f9a8d4" : "1px solid rgba(229, 231, 235, 0.96)",
      borderRadius: "999px",
      background: primary ? "#ec4899" : "rgba(255, 255, 255, 0.98)",
      color: primary ? "#ffffff" : "#ec4899",
      boxShadow: primary ? "0 12px 26px rgba(236, 72, 153, 0.28)" : "0 8px 20px rgba(15, 23, 42, 0.13)",
      font: `800 ${primary ? "18px" : "14px"}/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
      letterSpacing: "0",
      cursor: "pointer",
      touchAction: "manipulation",
      outline: "none",
      transition: "transform 120ms ease, box-shadow 160ms ease, background 160ms ease, color 160ms ease"
    });

    if (control === "settings") {
      button.addEventListener("click", () => {
        setFloatingSettingsOpen(!state.floatingSettingsOpen);
      });
    }

    if (control === "hide") {
      button.addEventListener("click", () => {
        setFloatingHidden(true, { persist: true });
      });
    }

    return button;
  }

  function updateFloatingPanelControls() {
    if (!state.floatingPanel || typeof state.floatingPanel.querySelector !== "function") {
      return;
    }

    const button = state.floatingPanel.querySelector('[data-pbt-control="translate-toggle"]');
    const settingsPanel = state.floatingPanel.querySelector('[data-pbt-control="settings-panel"]');
    const qualitySelect = state.floatingPanel.querySelector('[data-pbt-control="quality-mode"]');
    const providerSelect = state.floatingPanel.querySelector('[data-pbt-control="paid-provider"]');
    const modeSelect = state.floatingPanel.querySelector('[data-pbt-control="display-mode"]');
    const captionSizeSelect = state.floatingPanel.querySelector('[data-pbt-control="caption-size"]');
    const captionSizeField = state.floatingPanel.querySelector('[data-pbt-control="caption-size-field"]');
    const providerNote = state.floatingPanel.querySelector('[data-pbt-control="provider-note"]');
    const providerConfigNote = state.floatingPanel.querySelector('[data-pbt-control="provider-config-note"]');
    const providerConfigFrame = state.floatingPanel.querySelector('[data-pbt-control="provider-config-frame"]');
    const rail = state.floatingPanel.querySelector('[data-pbt-control="floating-rail"]');
    const handle = state.floatingPanel.querySelector('[data-pbt-control="show-handle"]');
    const paidConfigVisible = state.floatingQualityMode !== "free";

    if (qualitySelect) {
      qualitySelect.value = state.floatingQualityMode;
    }

    if (providerSelect) {
      providerSelect.value = state.floatingPaidProvider;
      providerSelect.disabled = state.floatingQualityMode === "free";
    }

    if (modeSelect) {
      modeSelect.value = state.floatingDisplayMode;
    }

    if (captionSizeSelect) {
      captionSizeSelect.value = normalizeCaptionSize(state.floatingCaptionSize);
    }

    if (captionSizeField) {
      captionSizeField.style.display = isYouTubeWatchPage() ? "grid" : "none";
    }

    if (providerNote) {
      providerNote.textContent = getFloatingProviderNote();
      providerNote.style.opacity = state.floatingQualityMode === "free" ? "0.58" : "1";
    }

    if (providerConfigNote) {
      providerConfigNote.style.display = paidConfigVisible ? "block" : "none";
    }

    if (providerConfigFrame) {
      providerConfigFrame.style.display = paidConfigVisible ? "block" : "none";
      const providerConfigUrl = getFloatingProviderConfigUrl();
      const shouldLoadProviderConfigFrame = paidConfigVisible && state.floatingSettingsOpen && !state.floatingHidden;

      if (shouldLoadProviderConfigFrame && providerConfigUrl && providerConfigFrame.getAttribute("src") !== providerConfigUrl) {
        providerConfigFrame.setAttribute("src", providerConfigUrl);
      }

      if (!shouldLoadProviderConfigFrame && providerConfigFrame.hasAttribute("src")) {
        providerConfigFrame.removeAttribute("src");
      }
    }

    if (settingsPanel) {
      settingsPanel.style.display = state.floatingSettingsOpen && !state.floatingHidden ? "block" : "none";
    }

    if (rail) {
      rail.style.display = state.floatingHidden ? "none" : "grid";
    }

    updateYouTubeTranscriptButtonControls();

    if (handle) {
      handle.style.display = state.floatingHidden ? "block" : "none";
    }

    state.floatingPanel.setAttribute("data-pbt-hidden", state.floatingHidden ? "true" : "false");
    state.floatingPanel.style.right = state.floatingHidden ? "0" : "14px";

    if (!button) {
      return;
    }

    const active = state.floatingTranslated;
    const buttonLabel = active
      ? "已翻译，点击还原并关闭本站默认翻译"
      : "翻译当前网址并开启本站默认翻译";

    renderFloatingTranslateButtonContent(button, active);
    button.setAttribute("data-pbt-active", active ? "true" : "false");
    button.setAttribute("aria-label", buttonLabel);
    button.setAttribute("title", buttonLabel);
    button.style.border = "1px solid #f9a8d4";
    button.style.background = "#ec4899";
    button.style.color = "#ffffff";
    button.style.boxShadow = active
      ? "0 12px 28px rgba(22, 163, 74, 0.26), 0 10px 24px rgba(236, 72, 153, 0.28)"
      : "0 12px 26px rgba(236, 72, 153, 0.28)";
  }

  function renderFloatingTranslateButtonContent(button, active) {
    if (!button || button.hasAttribute("data-pbt-loading")) {
      return;
    }

    button.textContent = "译";

    if (active) {
      button.appendChild(createFloatingCheckmark(button.ownerDocument));
    }
  }

  function createFloatingCheckmark(doc) {
    const checkmark = doc.createElement("span");
    checkmark.setAttribute("data-pbt-control", "translate-checkmark");
    checkmark.setAttribute("aria-hidden", "true");
    checkmark.textContent = "✓";
    setStyles(checkmark, {
      position: "absolute",
      left: "-3px",
      bottom: "-3px",
      width: "17px",
      height: "17px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "999px",
      border: "2px solid #ffffff",
      background: "#16a34a",
      color: "#ffffff",
      boxShadow: "0 5px 12px rgba(22, 163, 74, 0.36)",
      boxSizing: "border-box",
      font: "900 11px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      pointerEvents: "none"
    });
    return checkmark;
  }

  function runFloatingToggle(button) {
    const action = getFloatingToggleAction();
    runFloatingAction(button, action, { persistSiteSetting: true });
  }

  function maybeApplyFloatingDisplayModeChange() {
    if (!state.floatingTranslated || !state.floatingPanel || typeof state.floatingPanel.querySelector !== "function") {
      return;
    }

    const button = state.floatingPanel.querySelector('[data-pbt-control="translate-toggle"]');

    if (!button) {
      return;
    }

    runFloatingAction(button, "translate", { persistSiteSetting: true });
  }

  function runFloatingAction(button, action, options = {}) {
    const message = makeFloatingMessage(action);
    const prepareBeforeTranslate = action === "translate" &&
      state.floatingTranslated &&
      hasFloatingTranslationSettingsChanged() &&
      options.incremental !== true;

    if (!message || button.disabled) {
      return;
    }

    button.disabled = true;
    const originalText = button.textContent;
    setFloatingActionLoading(button, action);
    button.style.opacity = "0.72";

    const sendActionMessage = () => {
      if (button.isConnected === false) {
        return;
      }

      if (prepareBeforeTranslate) {
        prepareTranslation({ displayMode: state.floatingDisplayMode });
      }

      const sent = sendRuntimeMessage(message, (response) => {
        resetFloatingActionButton(button, originalText);

        if (!response || response.ok !== true) {
          showFloatingActionError(button, response?.error, originalText);
          return;
        }

        if (action === "translate" && response.status !== "no_text" && response.status !== "no_render") {
          setFloatingTranslated(true);

          if (options.persistSiteSetting) {
            saveFloatingTranslationSettings(true);
          }
        }

        if (action === "restore") {
          setFloatingTranslated(false);

          if (options.persistSiteSetting) {
            saveFloatingTranslationSettings(false);
          }
        }
      });

      if (!sent) {
        resetFloatingActionButton(button, originalText);
      }
    };

    if (action === "translate") {
      scheduleAfterFloatingPaint(sendActionMessage);
      return;
    }

    sendActionMessage();
  }

  function runYouTubeTranscriptToggle(button, options = {}) {
    if (!button) {
      return;
    }

    if (state.youtubeTranscriptTranslateInFlight && !button.hasAttribute?.("data-pbt-loading")) {
      state.youtubeTranscriptTranslateRequestId += 1;
      state.youtubeTranscriptTranslateInFlight = false;
      clearYouTubeTranscriptTranslateTimer();
    }

    if (state.youtubeTranscriptTranslateInFlight) {
      cancelYouTubeTranscriptTranslate(button);
      return;
    }

    if (button.disabled) {
      return;
    }

    if (state.youtubeLocalAsrActive) {
      clearYouTubeTranscriptTranslations();
      state.youtubeTranscriptCostConfirmationPending = false;
      state.youtubeLocalAsrRequestId = 0;
      setYouTubeLocalAsrDiagnosticState("stopped", {
        active: false,
        error: "none",
        requestId: state.youtubeTranscriptTranslateRequestId
      });
      clearYouTubeTranscriptHint();
      updateFloatingPanelControls();
      return;
    }

    if (state.youtubeTranscriptTranslated) {
      clearYouTubeTranscriptTranslations();
      state.youtubeTranscriptCostConfirmationPending = false;
      clearYouTubeTranscriptHint();
      updateFloatingPanelControls();
      return;
    }

    const requestId = state.youtubeTranscriptTranslateRequestId + 1;
    const allowYouTubeLocalWhisperAsr = options.allowYouTubeLocalWhisperAsr === true;
    state.youtubeLocalAsrRequestId = allowYouTubeLocalWhisperAsr ? requestId : 0;
    const message = {
      type: MESSAGE_TYPES.TRANSLATE_YOUTUBE_TRANSCRIPT,
      url: root.location ? root.location.href : "",
      qualityMode: state.floatingQualityMode,
      paidProvider: state.floatingPaidProvider,
      requestId,
      allowYouTubeCaptionTrack: true,
      allowYouTubePlayerCaptionToggle: true,
      confirmCost: state.youtubeTranscriptCostConfirmationPending === true
    };

    if (allowYouTubeLocalWhisperAsr) {
      message.allowYouTubeLocalWhisperAsr = true;
    }

    state.youtubeTranscriptTranslateRequestId = requestId;
    state.youtubeTranscriptTranslateInFlight = true;
    setYouTubeLocalAsrDiagnosticState(allowYouTubeLocalWhisperAsr ? "request-sent" : "idle", {
      active: false,
      error: "none",
      requestId: allowYouTubeLocalWhisperAsr ? requestId : "none"
    });
    clearYouTubeTranscriptHint();
    setYouTubeTranscriptButtonLoading(button);
    scheduleYouTubeTranscriptTranslateTimeout(requestId, button);

    const sent = sendRuntimeMessage(message, (response) => {
      if (requestId !== state.youtubeTranscriptTranslateRequestId) {
        return;
      }

      finishYouTubeTranscriptTranslateRequest(button);

      if (!response || response.ok !== true) {
        if (!state.youtubeTranscriptTranslated) {
          clearYouTubeTranscriptTranslations({ updateControls: false });
        }
        if (response?.error?.code === "youtube_transcript_cost_confirmation_required") {
          state.youtubeTranscriptCostConfirmationPending = true;
        } else {
          state.youtubeTranscriptCostConfirmationPending = false;
        }
        state.youtubeLocalAsrRequestId = 0;
        if (allowYouTubeLocalWhisperAsr && response?.error?.code && isYouTubeLocalAsrDiagnosticError(response.error)) {
          setYouTubeLocalAsrDiagnosticFromError(response.error, {
            active: false,
            requestId
          });
        } else {
          setYouTubeLocalAsrDiagnosticState("idle", {
            active: false,
            error: "none",
            requestId: "none"
          });
        }
        const visibleError = !allowYouTubeLocalWhisperAsr && response?.error?.code && isYouTubeLocalAsrDiagnosticError(response.error)
          ? { code: "youtube_transcript_unavailable", message: "YouTube captions are unavailable." }
          : response?.error;
        showYouTubeTranscriptActionError(button, visibleError);
        return;
      }

      state.youtubeTranscriptCostConfirmationPending = false;
      state.youtubeLocalAsrActive = allowYouTubeLocalWhisperAsr && response.status === "local_asr_started";
      state.youtubeLocalAsrRequestId = state.youtubeLocalAsrActive ? requestId : 0;
      state.youtubeTranscriptTranslated = response.status === "translated" || state.youtubeLocalAsrActive;
      clearYouTubeTranscriptHint();

      if (state.youtubeLocalAsrActive) {
        setYouTubeLocalAsrDiagnosticState("local-asr-started", {
          active: true,
          error: "none",
          requestId
        });
        showYouTubeTranscriptHint(
          button,
          "没有读到 YouTube 英文字幕，已开始使用本机 Whisper 识别当前标签页音频。再次点击“幕”可停止。"
        );
      } else {
        setYouTubeLocalAsrDiagnosticState("idle", {
          active: false,
          error: "none",
          requestId: "none"
        });
      }

      updateFloatingPanelControls();
    });

    if (!sent) {
      finishYouTubeTranscriptTranslateRequest(button);
      state.youtubeTranscriptCostConfirmationPending = false;
      state.youtubeLocalAsrRequestId = 0;
      setYouTubeLocalAsrDiagnosticState("runtime-message-failed", {
        active: false,
        error: "send_failed",
        requestId
      });
    }
  }

  function getYouTubeLocalAsrPlaybackPreflightError(doc) {
    const video = findYouTubeVideoElement(doc) || findKnownYouTubeVideoElement(doc);

    if (!video) {
      return null;
    }

    if (video.paused === true) {
      return {
        code: "youtube_local_asr_video_paused",
        message: "The YouTube video is paused."
      };
    }

    const volume = Number(video.volume);

    if (video.muted === true || (Number.isFinite(volume) && volume <= 0)) {
      return {
        code: "youtube_local_asr_video_muted",
        message: "The YouTube video is muted."
      };
    }

    return null;
  }

  function scheduleYouTubeTranscriptTranslateTimeout(requestId, button) {
    clearYouTubeTranscriptTranslateTimer();

    if (typeof root.setTimeout !== "function") {
      return;
    }

    state.youtubeTranscriptTranslateTimer = root.setTimeout(() => {
      if (requestId !== state.youtubeTranscriptTranslateRequestId || !state.youtubeTranscriptTranslateInFlight) {
        return;
      }

      state.youtubeTranscriptTranslateInFlight = false;
      state.youtubeTranscriptTranslateRequestId += 1;
      state.youtubeLocalAsrRequestId = 0;
      clearYouTubeTranscriptTranslateTimer();
      if (!state.youtubeTranscriptTranslated) {
        clearYouTubeTranscriptTranslations({ updateControls: false });
      }
      resetYouTubeTranscriptButton(button);
      setYouTubeLocalAsrDiagnosticState("runtime-message-failed", {
        active: false,
        error: "youtube_transcript_timeout",
        requestId
      });
      showYouTubeTranscriptActionError(button, {
        code: "youtube_transcript_timeout",
        message: "YouTube caption translation is taking too long."
      });
    }, YOUTUBE_TRANSCRIPT_TRANSLATE_TIMEOUT_MS);
  }

  function clearYouTubeTranscriptTranslateTimer() {
    if (state.youtubeTranscriptTranslateTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.youtubeTranscriptTranslateTimer);
    }

    state.youtubeTranscriptTranslateTimer = null;
  }

  function finishYouTubeTranscriptTranslateRequest(button) {
    state.youtubeTranscriptTranslateInFlight = false;
    clearYouTubeTranscriptTranslateTimer();
    resetYouTubeTranscriptButton(button);
  }

  function cancelYouTubeTranscriptTranslate(button) {
    state.youtubeTranscriptTranslateRequestId += 1;
    state.youtubeTranscriptTranslateInFlight = false;
    state.youtubeLocalAsrRequestId = 0;
    state.youtubeTranscriptCostConfirmationPending = false;
    clearYouTubeTranscriptTranslateTimer();
    clearYouTubeTranscriptHint();
    if (!state.youtubeTranscriptTranslated) {
      clearYouTubeTranscriptTranslations({ updateControls: false });
    }
    resetYouTubeTranscriptButton(button);
  }

  function showYouTubeTranscriptActionError(button, error) {
    const hint = getYouTubeTranscriptUserHint(error);
    showFloatingActionError(button, { ...error, message: hint }, YOUTUBE_TRANSCRIPT_BUTTON_TEXT);
    showYouTubeTranscriptHint(button, hint);
  }

  function getYouTubeTranscriptUserHint(error) {
    const code = String(error?.code ?? "");

    if (code === "youtube_transcript_unavailable") {
      return "没有读到 YouTube 字幕。";
    }

    if (code === "youtube_transcript_no_english") {
      return "这个视频没有英文字幕轨道。";
    }

    if (code === "youtube_caption_track_fetch_failed") {
      return "YouTube 字幕轨道读取失败，请刷新页面后再点“幕”。";
    }

    if (code === "youtube_caption_track_unavailable") {
      return "这个视频没有可用的 YouTube 英文字幕；可以按住 Alt/Option 再点“幕”尝试本机 Whisper。";
    }

    if (code === "youtube_caption_track_token_missing") {
      return "没有读到播放器的字幕请求；请打开播放器 CC 字幕或刷新 YouTube 页面后，再点“幕”。";
    }

    if (code === "youtube_caption_track_ad_showing") {
      return "广告播放中，请在广告结束后再点“幕”。";
    }

    if (code === "youtube_caption_track_not_allowed") {
      return "请点击视频右下角的“幕”开启字幕。";
    }

    if (code === "youtube_local_asr_unavailable") {
      return "本机 Whisper 语音识别不可用；请确认已重新加载扩展，并启动本机 127.0.0.1:8765 Whisper 服务。";
    }

    if (code === "youtube_local_asr_active_tab_required") {
      return "Chrome 没有允许捕获当前标签页音频；请保持当前 YouTube 标签页激活，并直接再点“幕”。";
    }

    if (code === "youtube_local_asr_capture_denied") {
      return "Chrome 没有允许捕获当前标签页音频；请保持当前 YouTube 标签页激活，并直接再点“幕”。";
    }

    if (code === "youtube_local_asr_offscreen_unavailable") {
      return "本机 Whisper 录音页面没有打开；请重新加载扩展后再试。";
    }

    if (code === "youtube_local_asr_capture_failed") {
      return "当前标签页音频捕获启动失败，请刷新 YouTube 页面后再点“幕”。";
    }

    if (code === "youtube_local_asr_whisper_unavailable") {
      return "本机 Whisper 服务没有响应；请确认 npm run local-whisper 正在 127.0.0.1:8765 运行，然后再点“幕”。";
    }

    if (code === "youtube_local_asr_whisper_response_invalid") {
      return "本机 Whisper 返回了无效结果；请重启本机 Whisper 服务后再点“幕”。";
    }

    if (code === "youtube_local_asr_audio_invalid") {
      return "当前标签页录到的音频块不可用；请确认视频正在播放且页面有声音。";
    }

    if (code === "youtube_local_asr_video_muted") {
      return "当前 YouTube 视频处于静音状态；请先取消静音，再点“幕”使用本机 Whisper。";
    }

    if (code === "youtube_local_asr_video_paused") {
      return "当前 YouTube 视频已暂停；请先播放视频，再点“幕”使用本机 Whisper。";
    }

    if (code === "youtube_local_asr_processing") {
      return "本机 Whisper 正在识别当前音频片段，首次结果通常需要等几秒。";
    }

    if (code === "youtube_local_asr_no_audio_chunk") {
      return "没有收到当前标签页音频块；请确认视频正在播放且没有静音，然后再点“幕”。";
    }

    if (code === "youtube_local_asr_no_speech") {
      return "本机 Whisper 暂时没有识别到清晰英文语音；视频有声音时会继续尝试。";
    }

    if (code === "youtube_local_asr_provider_failed") {
      return "本机 Whisper 已识别到语音，但翻译服务没有返回可显示的中文字幕。";
    }

    if (code === "youtube_local_asr_no_translation") {
      return "翻译服务没有返回可显示的本机 Whisper 中文字幕。";
    }

    if (code === "youtube_local_asr_render_failed") {
      return "本机 Whisper 中文字幕没有渲染成功，请刷新 YouTube 页面后再试。";
    }

    if (code === "youtube_local_asr_chunk_failed") {
      return "本机 Whisper 当前音频块处理失败，请稍后再试。";
    }

    if (code === "missing_api_key") {
      return "请先在设置里填写翻译服务的 Key（保存方式选“本次会话”或“本地保存”），或把翻译质量切回免费版。";
    }

    if (code === "missing_custom_provider_config") {
      return "请先在设置里填写自定义中转站的 Base URL 和 model，或把翻译质量切回免费版。";
    }

    if (code === "provider_http_error") {
      return getYouTubeCaptionProviderHttpErrorHint(error?.status);
    }

    if (code === "youtube_transcript_cost_confirmation_required") {
      return "这段字幕较长，再点一次“幕”确认翻译。";
    }

    if (code === "youtube_transcript_timeout") {
      return "翻译等待超过 30 秒，请稍后重试。";
    }

    if (code === "stale_youtube_transcript_request") {
      return "旧的字幕请求已取消。";
    }

    if (code === "youtube_transcript_no_usable_translations") {
      return "翻译服务没有返回可显示的中文字幕，请稍后重试或换一个翻译模式。";
    }

    if (code === "youtube_transcript_overlay_unavailable") {
      return "没有找到可显示字幕的视频区域，请刷新 YouTube 页面后重试。";
    }

    if (code === "no_rendered_translations") {
      return "没有生成可显示的中文字幕，请稍后重试。";
    }

    const message = normalizeFloatingErrorMessage(error).replace(/^翻译失败：/, "");
    return message || "字幕翻译失败。";
  }

  function getYouTubeCaptionProviderHttpErrorHint(status) {
    const statusCode = Number(status);
    const statusText = Number.isInteger(statusCode) && statusCode > 0 ? `（HTTP ${statusCode}）` : "";
    const fallbackText = normalizeQualityMode(state.floatingQualityMode) === "free" ? "" : "或切回免费版";

    if (statusCode === 401 || statusCode === 403) {
      return `翻译服务拒绝了请求${statusText}，请检查设置里的 Key 是否正确、是否有权限。`;
    }

    if (statusCode === 429) {
      return `翻译服务额度不足或请求过于频繁${statusText}，请稍后再试${fallbackText}。`;
    }

    return `翻译服务请求失败${statusText}，请稍后重试${fallbackText}。`;
  }

  function showYouTubeTranscriptHint(button, message) {
    const doc = button?.ownerDocument || root.document;

    if (!doc || !doc.body) {
      return;
    }

    clearYouTubeTranscriptHint();

    const hint = doc.createElement("div");
    hint.setAttribute("data-pbt-control", "youtube-transcript-hint");
    markYouTubeTranscriptRuntimeVersion(hint);
    applyYouTubeLocalAsrDiagnostics(hint);
    hint.setAttribute("role", "status");
    hint.textContent = String(message ?? "字幕翻译失败。").slice(0, 140);

    const host = getYouTubeCaptionHost(doc);
    const inPlayer = Boolean(host && button?.parentNode === host);
    const hostRect = inPlayer ? getUsableElementRect(host) : null;
    const rect = getUsableElementRect(button);
    const maxWidth = 260;
    const left = rect
      ? Math.max(8, Math.round(rect.right - (hostRect?.left ?? 0) - maxWidth))
      : 8;
    const top = rect
      ? Math.max(8, Math.round(rect.top - (hostRect?.top ?? 0) - 52))
      : 8;

    setStyles(hint, {
      position: inPlayer ? "absolute" : "fixed",
      left: `${left}px`,
      top: `${top}px`,
      zIndex: inPlayer ? YOUTUBE_CAPTION_HINT_Z_INDEX : "2147483647",
      maxWidth: `${maxWidth}px`,
      padding: "8px 10px",
      borderRadius: "8px",
      background: "rgba(17, 24, 39, 0.94)",
      color: "#ffffff",
      boxShadow: "0 8px 22px rgba(15, 23, 42, 0.22)",
      font: "500 12px/1.45 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      letterSpacing: "0",
      pointerEvents: "none",
      whiteSpace: "normal"
    });

    (inPlayer ? host : doc.body).appendChild(hint);
    state.youtubeTranscriptHint = hint;

    if (typeof root.setTimeout === "function") {
      state.youtubeTranscriptHintTimer = root.setTimeout(() => {
        if (state.youtubeTranscriptHint === hint) {
          clearYouTubeTranscriptHint();
        }
      }, 4200);
    }
  }

  function clearYouTubeTranscriptHint() {
    if (state.youtubeTranscriptHintTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.youtubeTranscriptHintTimer);
    }

    state.youtubeTranscriptHintTimer = null;

    if (state.youtubeTranscriptHint && typeof state.youtubeTranscriptHint.remove === "function") {
      state.youtubeTranscriptHint.remove();
    }

    state.youtubeTranscriptHint = null;
  }

  function setYouTubeTranscriptButtonLoading(button) {
    markYouTubeTranscriptRuntimeVersion(button);
    button.setAttribute("data-pbt-loading", "youtube-transcript");
    button.textContent = "";
    button.appendChild(createFloatingSpinner(button.ownerDocument, "youtube-transcript-loading", "16px", "#ec4899"));
    button.setAttribute("aria-label", "正在翻译 YouTube 字幕");
    button.setAttribute("title", "正在翻译 YouTube 字幕");
  }

  function resetYouTubeTranscriptButton(button, text = YOUTUBE_TRANSCRIPT_BUTTON_TEXT) {
    if (!button) {
      return;
    }

    markYouTubeTranscriptRuntimeVersion(button);
    applyYouTubeLocalAsrDiagnostics(button);
    button.disabled = false;
    button.removeAttribute("data-pbt-loading");
    button.textContent = text;
    updateFloatingPanelControls();
  }

  function markYouTubeTranscriptRuntimeVersion(node) {
    if (node?.setAttribute) {
      node.setAttribute("data-pbt-runtime-version", YOUTUBE_TRANSCRIPT_RUNTIME_VERSION);
    }
  }

  function resetFloatingActionButton(button, text) {
    if (!button) {
      return;
    }

    button.disabled = false;
    button.removeAttribute("data-pbt-loading");
    button.textContent = text;
    button.style.opacity = "1";
    setFloatingManualTranslateInFlight(false);
  }

  function setFloatingActionLoading(button, action) {
    button.setAttribute("data-pbt-loading", action);
    setFloatingManualTranslateInFlight(action === "translate");

    if (action !== "translate") {
      button.textContent = "·";
      return;
    }

    const doc = button.ownerDocument;
    button.textContent = "";
    button.appendChild(createFloatingSpinner(doc, "translate-loading", "18px", "#ffffff"));
    button.setAttribute("aria-label", "正在翻译当前网址");
    button.setAttribute("title", "正在翻译当前网址");
  }

  function createFloatingSpinner(doc, control = "", size = "16px", color = "#ec4899") {
    const spinner = doc.createElement("span");
    spinner.setAttribute("aria-hidden", "true");

    if (control) {
      spinner.setAttribute("data-pbt-control", control);
    }

    setStyles(spinner, {
      display: "inline-block",
      width: size,
      height: size,
      border: `2px solid ${color}`,
      borderTopColor: "transparent",
      borderRadius: "999px",
      boxSizing: "border-box",
      animation: "pbt-spinner-rotate 680ms linear infinite"
    });

    return spinner;
  }

  function setFloatingManualTranslateInFlight(inFlight) {
    state.floatingManualTranslateInFlight = inFlight === true;
    updatePendingTranslationIndicators();
  }

  function updatePendingTranslationIndicators() {
    clearPendingTranslationIndicatorsIfIdle();
  }

  function hasFloatingTranslationInFlight() {
    return state.floatingManualTranslateInFlight || state.floatingAutoTranslateProgressIds.size > 0;
  }

  function clearPendingTranslationIndicatorsIfIdle() {
    if (!hasFloatingTranslationInFlight()) {
      clearPendingTranslationIndicators();
    }
  }

  function scheduleAfterFloatingPaint(callback) {
    if (typeof root.requestAnimationFrame === "function") {
      root.requestAnimationFrame(() => callback());
      return;
    }

    if (typeof root.setTimeout === "function") {
      root.setTimeout(callback, 0);
      return;
    }

    callback();
  }

  function showFloatingActionError(button, error, originalText) {
    if (!button) {
      return;
    }

    const message = normalizeFloatingErrorMessage(error);
    setFloatingManualTranslateInFlight(false);
    button.disabled = false;
    button.textContent = "!";
    button.style.opacity = "1";
    button.setAttribute("aria-label", message);
    button.setAttribute("title", message);

    if (typeof root.setTimeout === "function") {
      root.setTimeout(() => {
        if (!state.floatingContextInvalidated && button.isConnected !== false) {
          button.textContent = originalText;
          updateFloatingPanelControls();
        }
      }, 1800);
    }
  }

  function normalizeFloatingErrorMessage(error) {
    const message = String(error?.message ?? "Translation failed.").replace(/\s+/g, " ").trim();
    return `翻译失败：${message.slice(0, 160)}`;
  }

  function maybeRunStoredAutoTranslate() {
    if (!state.floatingStoredAutoTranslate || state.floatingInitialAutoTranslateRequested || state.floatingTranslated) {
      return;
    }

    if (syncFloatingTargetLanguageAutoTranslatePause().paused) {
      return;
    }

    if (!state.floatingPanel || typeof state.floatingPanel.querySelector !== "function") {
      return;
    }

    const button = state.floatingPanel.querySelector('[data-pbt-control="translate-toggle"]');

    if (!button) {
      return;
    }

    state.floatingInitialAutoTranslateRequested = true;

    const run = () => {
      runFloatingAction(button, "translate", { persistSiteSetting: false });
    };

    if (typeof root.setTimeout === "function") {
      root.setTimeout(run, 0);
      return;
    }

    run();
  }

  function setStyles(element, styles) {
    for (const entry of Object.entries(styles)) {
      element.style[entry[0]] = entry[1];
    }
  }

  function bindFloatingOutsideClick(doc) {
    if (state.floatingOutsideClickBound || !doc || typeof doc.addEventListener !== "function") {
      return;
    }

    state.floatingOutsideClickBound = true;
    doc.addEventListener("click", (event) => {
      if (!state.floatingSettingsOpen || !state.floatingPanel) {
        return;
      }

      const target = event?.target ?? null;

      if (target && typeof state.floatingPanel.contains === "function" && state.floatingPanel.contains(target)) {
        return;
      }

      setFloatingSettingsOpen(false);
    });
  }

  function bindFloatingContentObserver(doc) {
    if (state.floatingObserver || !doc || !doc.body || typeof root.MutationObserver !== "function") {
      return;
    }

    state.floatingObserver = new root.MutationObserver((mutations) => {
      if (shouldScheduleYouTubeTranscriptButtonControlUpdateForMutations(mutations)) {
        scheduleYouTubeTranscriptButtonControlUpdate();
      }

      if (shouldDeferFloatingMutationWorkForYouTubeTranscript()) {
        return;
      }

      const wasTranslated = state.floatingTranslated;
      const staleReplaceCount = cleanupStaleReplacedEntries();
      const staleBilingualCount = cleanupStaleBilingualEntries();
      const targetLanguagePause = syncFloatingTargetLanguageAutoTranslatePause();

      if (targetLanguagePause.paused) {
        return;
      }

      if (targetLanguagePause.changed && state.floatingStoredAutoTranslate) {
        maybeRunStoredAutoTranslate();
      }

      if (shouldReuseSessionTranslationsForMutations(wasTranslated)) {
        renderCachedSessionTranslationsForMutations(mutations, { skipAutoIncrementalSecondarySurfaces: true });
      }
      const shouldRetranslateStaleReplace = wasTranslated && staleReplaceCount > 0;
      const shouldRetranslateStaleBilingual = wasTranslated && staleBilingualCount > 0;
      const hasNewText = hasPotentialNewTextMutation(mutations);
      const hasSettlingText = hasPotentialSettlingTextMutation(mutations);
      const shouldRetranslateStale = (shouldRetranslateStaleReplace || shouldRetranslateStaleBilingual) &&
        hasNewText;
      const shouldSettleScan = hasSettlingText || (!hasNewText && shouldRetranslateStale);
      const shouldForceTranslate = shouldRetranslateStale ||
        (wasTranslated && !state.floatingTranslated) ||
        (!hasNewText && hasSettlingText);

      if (!shouldRetranslateStale && !hasNewText && !hasSettlingText) {
        return;
      }

      if (!shouldRetranslateStale && !state.floatingTranslated && !wasTranslated) {
        return;
      }

      scheduleFloatingAutoTranslate({ force: shouldForceTranslate });

      if (shouldSettleScan) {
        scheduleFloatingAutoTranslateSettleScan();
      }
    });
    state.floatingObserver.observe(doc.body, {
      attributes: true,
      attributeOldValue: true,
      attributeFilter: REVEAL_ATTRIBUTE_NAMES,
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function shouldScheduleYouTubeTranscriptButtonControlUpdateForMutations(mutations) {
    for (const mutation of Array.from(mutations || [])) {
      if (!mutation || typeof mutation !== "object") {
        continue;
      }

      if (mutation.type === "childList") {
        if (
          hasExternalMutationNodes(mutation.addedNodes) ||
          hasExternalMutationNodes(mutation.removedNodes)
        ) {
          return true;
        }
        continue;
      }

      if (!isPluginOwnedMutationNode(mutation.target ?? null)) {
        return true;
      }
    }

    return false;
  }

  function hasExternalMutationNodes(nodes) {
    for (const node of Array.from(nodes || [])) {
      if (!isPluginOwnedMutationNode(node)) {
        return true;
      }
    }

    return false;
  }

  function isPluginOwnedMutationNode(node) {
    let current = node;

    while (current) {
      if (
        current.nodeType === ELEMENT_NODE &&
        typeof current.hasAttribute === "function" &&
        (
          current.hasAttribute("data-pbt-control") ||
          current.hasAttribute("data-pbt-translation")
        )
      ) {
        return true;
      }

      current = current.parentNode ?? null;
    }

    return false;
  }

  function shouldDeferFloatingMutationWorkForYouTubeTranscript() {
    return state.youtubeTranscriptTranslateInFlight === true && isYouTubeWatchPage();
  }

  function shouldReuseSessionTranslationsForMutations(wasTranslated) {
    return Boolean(
      !state.sessionTranslationReuseSuspended &&
      (wasTranslated || state.floatingTranslated || state.floatingStoredAutoTranslate)
    );
  }

  function suspendSessionTranslationReuseUntilNextRender() {
    state.sessionTranslationReuseSuspended = true;
  }

  function resumeSessionTranslationReuse() {
    state.sessionTranslationReuseSuspended = false;
  }

  function renderCachedSessionTranslationsForMutations(mutations, options = {}) {
    let renderedCount = 0;

    for (const mutation of Array.from(mutations || [])) {
      if (mutation?.type === "characterData") {
        renderedCount += renderCachedSessionTranslationsInNode(mutation.target, options);
        continue;
      }

      if (mutation?.type === "attributes" && isRevealAttributeMutation(mutation, options)) {
        renderedCount += renderCachedSessionTranslationsInNode(mutation.target, options);
        continue;
      }

      for (const node of Array.from(mutation?.addedNodes || [])) {
        renderedCount += renderCachedSessionTranslationsInNode(node, options);
      }

      if (mutation?.type === "childList" && hasRemovedRenderedTranslation(mutation)) {
        renderedCount += renderCachedSessionTranslationsInNode(mutation.target, options);
      }
    }

    return renderedCount;
  }

  function renderCachedSessionTranslationsInNode(node, options = {}) {
    if (!node) {
      return 0;
    }

    if (node.nodeType === TEXT_NODE) {
      const text = normalizeText(node.nodeValue);
      return text &&
        isTextNodeAllowed(node, options) &&
        renderCachedSessionTranslationForTextNode(node, text, state.floatingDisplayMode)
        ? 1
        : 0;
    }

    if (
      node.nodeType !== ELEMENT_NODE ||
      isElementExcluded(node) ||
      (options.skipAutoIncrementalSecondarySurfaces === true && isAutoIncrementalSecondarySurface(node))
    ) {
      return 0;
    }

    let renderedCount = 0;

    for (const child of Array.from(node.childNodes || [])) {
      renderedCount += renderCachedSessionTranslationsInNode(child, options);
    }

    return renderedCount;
  }

  function hasRemovedRenderedTranslation(mutation) {
    return Array.from(mutation?.removedNodes || []).some((node) => containsRenderedTranslationNode(node));
  }

  function containsRenderedTranslationNode(node) {
    if (!node) {
      return false;
    }

    if (node.nodeType === ELEMENT_NODE && typeof node.hasAttribute === "function" && node.hasAttribute("data-pbt-translation")) {
      return true;
    }

    return Array.from(node.childNodes || []).some((child) => containsRenderedTranslationNode(child));
  }

  function hasPotentialNewTextMutation(mutations) {
    const options = { skipAutoIncrementalSecondarySurfaces: true };

    for (const mutation of Array.from(mutations || [])) {
      if (mutation?.type === "characterData" && isTextNodeAllowed(mutation.target, options)) {
        return true;
      }

      if (mutation?.type === "attributes" && isRevealAttributeMutation(mutation, options)) {
        return true;
      }

      for (const node of Array.from(mutation?.addedNodes || [])) {
        if (hasAllowedText(node, options)) {
          return true;
        }
      }
    }

    return false;
  }

  function hasPotentialSettlingTextMutation(mutations) {
    const options = { skipAutoIncrementalSecondarySurfaces: true };

    for (const mutation of Array.from(mutations || [])) {
      if (mutation?.type !== "childList") {
        continue;
      }

      for (const node of Array.from(mutation.addedNodes || [])) {
        if (hasPotentialSettlingText(node, options)) {
          return true;
        }
      }
    }

    return false;
  }

  function hasPotentialSettlingText(node, options = {}) {
    if (!node) {
      return false;
    }

    if (node.nodeType === TEXT_NODE) {
      const parent = node.parentElement;

      if (parent && hasHardExcludedElementInAncestry(parent)) {
        return false;
      }

      if (
        parent &&
        options.skipAutoIncrementalSecondarySurfaces === true &&
        hasAutoIncrementalSecondarySurfaceInAncestry(parent)
      ) {
        return false;
      }

      return Boolean(normalizeText(node.nodeValue) && parent && hasSoftRevealExcludedElementInAncestry(parent));
    }

    if (
      node.nodeType !== ELEMENT_NODE ||
      hasHardExcludedElementInAncestry(node) ||
      (options.skipAutoIncrementalSecondarySurfaces === true && isAutoIncrementalSecondarySurface(node))
    ) {
      return false;
    }

    if (hasSoftRevealExcludedElementInAncestry(node) && normalizeText(node.textContent)) {
      return true;
    }

    return Array.from(node.childNodes || []).some((child) => hasPotentialSettlingText(child, options));
  }

  function hasHardExcludedElementInAncestry(element) {
    let current = element;

    while (current && current.nodeType === ELEMENT_NODE) {
      if (isHardExcludedElement(current)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function isHardExcludedElement(element) {
    if (!element || element.nodeType !== ELEMENT_NODE) {
      return true;
    }

    if (EXCLUDED_TAGS.has(getElementTagName(element))) {
      return true;
    }

    if (isInteractiveTextControlElement(element)) {
      return true;
    }

    if (element.hasAttribute("data-pbt-translation") || element.hasAttribute("data-pbt-control")) {
      return true;
    }

    if (isTransientOverlayElement(element)) {
      return true;
    }

    return element.isContentEditable || element.getAttribute("contenteditable") === "true";
  }

  function hasSoftRevealExcludedElementInAncestry(element) {
    let current = element;

    while (current && current.nodeType === ELEMENT_NODE) {
      if (isSoftRevealExcludedElement(current)) {
        return true;
      }

      current = current.parentElement;
    }

    return false;
  }

  function isSoftRevealExcludedElement(element) {
    if (!element || element.nodeType !== ELEMENT_NODE) {
      return false;
    }

    if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
      return true;
    }

    if (isInsideClosedDetailsContent(element)) {
      return true;
    }

    const view = element.ownerDocument && element.ownerDocument.defaultView;
    const style = view && typeof view.getComputedStyle === "function"
      ? view.getComputedStyle(element)
      : null;

    return Boolean(style && (style.display === "none" || style.visibility === "hidden"));
  }

  function isRevealAttributeMutation(mutation, options = {}) {
    const target = mutation.target;

    if (!target || target.nodeType !== ELEMENT_NODE || !REVEAL_ATTRIBUTE_NAMES.includes(mutation.attributeName)) {
      return false;
    }

    if (mutation.attributeName === "class" && !isClassRevealMutation(target, mutation.oldValue)) {
      return false;
    }

    if (mutation.attributeName === "style" && !isStyleRevealMutation(mutation.oldValue)) {
      return false;
    }

    if (mutation.attributeName === "hidden" && target.hasAttribute("hidden")) {
      return false;
    }

    if (mutation.attributeName === "aria-hidden" && target.getAttribute("aria-hidden") === "true") {
      return false;
    }

    if (mutation.attributeName === "open" && (target.tagName !== "DETAILS" || !target.hasAttribute("open"))) {
      return false;
    }

    if (mutation.attributeName === "aria-selected" && target.getAttribute("aria-selected") !== "true") {
      return false;
    }

    if (mutation.attributeName === "aria-expanded" && target.getAttribute("aria-expanded") !== "true") {
      return false;
    }

    if (mutation.attributeName === "aria-current" && !isActiveCurrentAttributeValue(target.getAttribute("aria-current"))) {
      return false;
    }

    if (isStateAttributeName(mutation.attributeName) && !isActiveStateAttributeValue(target.getAttribute(mutation.attributeName))) {
      return false;
    }

    return hasAllowedText(target, options);
  }

  function isClassRevealMutation(target, oldValue) {
    const previousClass = normalizeAttributeValue(oldValue).toLowerCase();
    const currentClass = normalizeAttributeValue(target.getAttribute("class")).toLowerCase();

    if (previousClass === currentClass) {
      return false;
    }

    return hasInactiveClassState(previousClass) ||
      (hasActiveClassState(currentClass) && !hasActiveClassState(previousClass));
  }

  function hasInactiveClassState(value) {
    return /\b(hidden|inactive|collapsed|closed)\b/i.test(value);
  }

  function hasActiveClassState(value) {
    return /\b(active|selected|current|open|visible|shown|expanded)\b/i.test(value);
  }

  function isStyleRevealMutation(oldValue) {
    return /(?:^|;)\s*display\s*:\s*none\b/i.test(String(oldValue ?? "")) ||
      /(?:^|;)\s*visibility\s*:\s*hidden\b/i.test(String(oldValue ?? ""));
  }

  function isStateAttributeName(name) {
    return name === "data-state" ||
      name === "data-active" ||
      name === "data-selected" ||
      name === "data-current" ||
      name === "data-expanded" ||
      name === "data-open" ||
      name === "data-headlessui-state";
  }

  function isActiveCurrentAttributeValue(value) {
    return Boolean(value && !/^(false|none|0)$/i.test(value));
  }

  function isActiveStateAttributeValue(value) {
    if (value === "") {
      return true;
    }

    if (!value || /^(false|inactive|closed|hidden|off|0)$/i.test(value)) {
      return false;
    }

    return /^(true|1)$/i.test(value) || /\b(active|selected|current|open|visible|shown|expanded|checked)\b/i.test(value);
  }

  function hasAllowedText(node, options = {}) {
    if (!node) {
      return false;
    }

    if (node.nodeType === TEXT_NODE) {
      return isTextNodeAllowed(node, options);
    }

    if (
      node.nodeType !== ELEMENT_NODE ||
      isElementExcluded(node) ||
      (options.skipAutoIncrementalSecondarySurfaces === true && isAutoIncrementalSecondarySurface(node))
    ) {
      return false;
    }

    return Array.from(node.childNodes || []).some((child) => hasAllowedText(child, options));
  }

  function scheduleFloatingAutoTranslate(options = {}) {
    if (syncFloatingTargetLanguageAutoTranslatePause().paused) {
      return;
    }

    if (options.force === true) {
      state.floatingAutoTranslateForce = true;
    }

    if (!hasFloatingAutoTranslateCapacity()) {
      state.floatingAutoTranslatePending = true;
      return;
    }

    if (state.floatingAutoTranslateTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.floatingAutoTranslateTimer);
    }

    const run = () => {
      const force = state.floatingAutoTranslateForce || options.force === true;
      state.floatingAutoTranslateTimer = null;
      state.floatingAutoTranslateForce = false;
      runFloatingAutoTranslate({ force });
    };
    const delayMs = Number.isFinite(options.delayMs)
      ? Math.max(0, Number(options.delayMs))
      : FLOATING_AUTO_TRANSLATE_DELAY_MS;

    state.floatingAutoTranslateTimer = typeof root.setTimeout === "function"
      ? root.setTimeout(run, delayMs)
      : null;

    if (!state.floatingAutoTranslateTimer) {
      run();
    }
  }

  function scheduleFloatingAutoTranslateSettleScan() {
    if (syncFloatingTargetLanguageAutoTranslatePause().paused) {
      return;
    }

    state.floatingAutoTranslateSettlePending = true;

    if (state.floatingAutoTranslateSettleTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.floatingAutoTranslateSettleTimer);
    }

    const run = () => {
      state.floatingAutoTranslateSettleTimer = null;

      if (!state.floatingAutoTranslateSettlePending) {
        return;
      }

      state.floatingAutoTranslateSettlePending = false;
      scheduleFloatingAutoTranslate({ force: true, delayMs: 0 });
    };

    state.floatingAutoTranslateSettleTimer = typeof root.setTimeout === "function"
      ? root.setTimeout(run, FLOATING_AUTO_TRANSLATE_SETTLE_DELAY_MS)
      : null;

    if (!state.floatingAutoTranslateSettleTimer) {
      run();
    }
  }

  function runFloatingAutoTranslate(options = {}) {
    if (syncFloatingTargetLanguageAutoTranslatePause().paused) {
      return;
    }

    if (!hasFloatingAutoTranslateCapacity()) {
      state.floatingAutoTranslatePending = true;
      return;
    }

    if (!state.floatingTranslated && options.force !== true) {
      return;
    }

    const message = makeFloatingMessage("translate", { incremental: true });

    if (!message) {
      return;
    }

    const autoTranslateRequestId = beginFloatingAutoTranslateRequest();
    const sent = sendRuntimeMessage(message, (response) => {
      finishFloatingAutoTranslateRequest(autoTranslateRequestId);

      if (response && response.ok && response.status !== "no_text" && response.status !== "no_render") {
        setFloatingTranslated(true);
      }

      flushPendingFloatingAutoTranslate();
    });

    if (!sent) {
      finishFloatingAutoTranslateRequest(autoTranslateRequestId);
      flushPendingFloatingAutoTranslate();
    }
  }

  function hasFloatingAutoTranslateCapacity() {
    return state.floatingAutoTranslateInFlightCount < FLOATING_AUTO_TRANSLATE_MAX_IN_FLIGHT;
  }

  function beginFloatingAutoTranslateRequest() {
    const requestId = state.floatingAutoTranslateNextRequestId;
    state.floatingAutoTranslateNextRequestId += 1;
    state.floatingAutoTranslateInFlightCount += 1;
    state.floatingAutoTranslateInFlight = state.floatingAutoTranslateInFlightCount > 0;
    state.floatingAutoTranslateProgressIds.add(requestId);
    updatePendingTranslationIndicators();
    return requestId;
  }

  function finishFloatingAutoTranslateRequest(requestId) {
    state.floatingAutoTranslateInFlightCount = Math.max(0, state.floatingAutoTranslateInFlightCount - 1);
    state.floatingAutoTranslateInFlight = state.floatingAutoTranslateInFlightCount > 0;

    if (requestId) {
      state.floatingAutoTranslateProgressIds.delete(requestId);
    }

    updatePendingTranslationIndicators();
  }

  function flushPendingFloatingAutoTranslate() {
    if (!state.floatingAutoTranslatePending && !state.floatingAutoTranslateForce) {
      return;
    }

    const force = state.floatingAutoTranslateForce;
    state.floatingAutoTranslatePending = false;
    scheduleFloatingAutoTranslate({ force });
  }

  function setFloatingSettingsOpen(open) {
    state.floatingSettingsOpen = Boolean(open);
    updateFloatingPanelControls();
  }

  function setFloatingHidden(hidden, options = {}) {
    state.floatingHidden = Boolean(hidden);

    if (state.floatingHidden) {
      state.floatingSettingsOpen = false;
    }

    updateFloatingPanelControls();

    if (options.persist === true) {
      saveFloatingControlsHidden(state.floatingHidden);
    }
  }

  function saveFloatingControlsHidden(hidden) {
    sendRuntimeMessage({
      type: MESSAGE_TYPES.SET_FLOATING_CONTROLS_HIDDEN,
      hidden: hidden === true
    }, (response) => {
      if (response && response.ok && typeof response.floatingControlsHidden === "boolean") {
        setFloatingHidden(response.floatingControlsHidden);
      }
    });
  }

  function saveFloatingTranslationSettings(autoTranslate) {
    sendRuntimeMessage({
      type: MESSAGE_TYPES.SET_SITE_TRANSLATION_SETTINGS,
      url: root.location ? root.location.href : "",
      displayMode: state.floatingDisplayMode,
      qualityMode: state.floatingQualityMode,
      paidProvider: state.floatingPaidProvider,
      captionSize: state.floatingCaptionSize,
      autoTranslate
    }, (response) => {
      if (response && response.ok) {
        state.floatingDisplayMode = normalizeDisplayMode(response.displayMode);
        state.floatingQualityMode = normalizeQualityMode(response.qualityMode);
        state.floatingPaidProvider = normalizePaidProvider(response.paidProvider);
        state.floatingCaptionSize = normalizeCaptionSize(response.captionSize);
        state.floatingStoredAutoTranslate = response.autoTranslate === true;
        updateFloatingPanelControls();
      }
    });
  }

  function requestAutoFloatingPanel() {
    if (root.__PBT_DISABLE_AUTO_PANEL__) {
      return;
    }

    if (root.__PBT_AUTO_PANEL_REQUESTED__) {
      return;
    }

    if (!root.location || !/^https?:/i.test(root.location.href)) {
      return;
    }

    if (!hasRuntimeMessageTransport()) {
      return;
    }

    root.__PBT_AUTO_PANEL_REQUESTED__ = true;

    sendRuntimeMessage({
      type: MESSAGE_TYPES.GET_PAGE_STATUS,
      url: root.location.href,
      qualityMode: state.floatingQualityMode,
      displayMode: state.floatingDisplayMode,
      paidProvider: state.floatingPaidProvider,
      captionSize: state.floatingCaptionSize
    }, (response) => {
      if (!response || !response.ok || response.policy?.blocked) {
        return;
      }

      showFloatingTranslateButton({
        qualityMode: response.qualityMode,
        displayMode: response.displayMode,
        paidProvider: response.paidProvider,
        captionSize: response.captionSize,
        autoTranslate: response.autoTranslate,
        floatingControlsHidden: response.floatingControlsHidden
      });
    });
  }

  function hasRuntimeMessageTransport() {
    return Boolean(getRuntimeSendMessage());
  }

  function sendRuntimeMessage(message, callback) {
    const sendMessage = getRuntimeSendMessage();

    if (!sendMessage) {
      return false;
    }

    try {
      sendMessage(message, (response) => {
        const runtimeError = getRuntimeLastError();

        if (runtimeError) {
          handleRuntimeMessageFailure(runtimeError);
          if (typeof callback === "function") {
            callback(makeRuntimeMessageFailureResponse());
          }
          return;
        }

        if (typeof callback === "function") {
          callback(response);
        }
      });
      return true;
    } catch (error) {
      handleRuntimeMessageFailure(error);
      return false;
    }
  }

  function getRuntimeSendMessage() {
    if (state.floatingContextInvalidated) {
      return null;
    }

    try {
      if (!root.chrome || !root.chrome.runtime || typeof root.chrome.runtime.sendMessage !== "function") {
        return null;
      }

      return root.chrome.runtime.sendMessage.bind(root.chrome.runtime);
    } catch (error) {
      handleRuntimeMessageFailure(error);
      return null;
    }
  }

  function connectFloatingControlsPort() {
    const connect = getRuntimeConnect();

    if (!connect || state.floatingControlsPort) {
      return;
    }

    try {
      const port = connect({ name: FLOATING_CONTROLS_PORT_NAME });
      state.floatingControlsPort = port;

      port.onMessage?.addListener?.((message) => {
        applyFloatingControlsMessage(message);
      });

      port.onDisconnect?.addListener?.(() => {
        state.floatingControlsPort = null;
      });
    } catch (error) {
      handleRuntimeMessageFailure(error);
    }
  }

  function getRuntimeConnect() {
    if (state.floatingContextInvalidated) {
      return null;
    }

    try {
      if (!root.chrome || !root.chrome.runtime || typeof root.chrome.runtime.connect !== "function") {
        return null;
      }

      return root.chrome.runtime.connect.bind(root.chrome.runtime);
    } catch (error) {
      handleRuntimeMessageFailure(error);
      return null;
    }
  }

  function applyFloatingControlsMessage(message) {
    if (!message || message.type !== MESSAGE_TYPES.APPLY_FLOATING_CONTROLS_HIDDEN) {
      return false;
    }

    setFloatingHidden(message.floatingControlsHidden === true);
    return true;
  }

  function getFloatingProviderConfigUrl() {
    const getUrl = getRuntimeGetUrl();

    if (!getUrl) {
      return "";
    }

    try {
      const url = new URL(getUrl("src/floating-settings/floating-settings.html"));
      url.searchParams.set("provider", normalizePaidProvider(state.floatingPaidProvider));
      return url.toString();
    } catch (error) {
      handleRuntimeMessageFailure(error);
      return "";
    }
  }

  function getRuntimeGetUrl() {
    try {
      if (!root.chrome || !root.chrome.runtime || typeof root.chrome.runtime.getURL !== "function") {
        return null;
      }

      return root.chrome.runtime.getURL.bind(root.chrome.runtime);
    } catch (error) {
      handleRuntimeMessageFailure(error);
      return null;
    }
  }

  function getRuntimeLastError() {
    try {
      return root.chrome?.runtime?.lastError ?? null;
    } catch (error) {
      return error;
    }
  }

  function makeRuntimeMessageFailureResponse() {
    return {
      ok: false,
      error: {
        code: "runtime_message_failed",
        message: "The extension message did not complete. Try again after the page settles."
      }
    };
  }

  function handleRuntimeMessageFailure(error) {
    if (isExtensionContextInvalidatedError(error)) {
      handleExtensionContextInvalidated();
    }
  }

  function isExtensionContextInvalidatedError(error) {
    const message = typeof error === "string" ? error : String(error?.message ?? error ?? "");
    return /Extension context invalidated/i.test(message);
  }

  function handleExtensionContextInvalidated() {
    if (state.floatingContextInvalidated) {
      return;
    }

    state.floatingContextInvalidated = true;

    restorePage();
    clearYouTubeTranscriptTranslations();
    clearYouTubeTranscriptTranslateTimer();
    removeYouTubeTranscriptButton();
    stopYouTubeTimedTextRequestObserver();
    state.floatingAutoTranslateInFlight = false;
    state.floatingAutoTranslateInFlightCount = 0;
    state.floatingAutoTranslatePending = false;
    state.floatingStoredAutoTranslate = false;
    state.floatingInitialAutoTranslateRequested = true;
    state.floatingManualTranslateInFlight = false;
    state.floatingAutoTranslateSettlePending = false;
    state.floatingAutoTranslateProgressIds.clear();

    if (state.floatingAutoTranslateTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.floatingAutoTranslateTimer);
    }

    if (state.floatingAutoTranslateSettleTimer && typeof root.clearTimeout === "function") {
      root.clearTimeout(state.floatingAutoTranslateSettleTimer);
    }

    state.floatingAutoTranslateTimer = null;
    state.floatingAutoTranslateSettleTimer = null;

    if (state.floatingObserver && typeof state.floatingObserver.disconnect === "function") {
      state.floatingObserver.disconnect();
    }

    state.floatingObserver = null;

    if (state.floatingPanel && typeof state.floatingPanel.remove === "function") {
      state.floatingPanel.remove();
    }

    state.floatingPanel = null;
  }

  function makeFloatingMessage(action, options = {}) {
    const base = {
      url: root.location ? root.location.href : ""
    };

    if (action === "translate") {
      return {
        ...base,
        type: MESSAGE_TYPES.TRANSLATE_PAGE,
        qualityMode: state.floatingQualityMode,
        displayMode: state.floatingDisplayMode,
        paidProvider: state.floatingPaidProvider,
        incremental: options.incremental === true
      };
    }

    if (action === "restore") {
      return {
        ...base,
        type: MESSAGE_TYPES.RESTORE_PAGE
      };
    }

    if (action === "remove") {
      return {
        ...base,
        type: MESSAGE_TYPES.REMOVE_TRANSLATIONS
      };
    }

    return null;
  }

  function normalizeQualityMode(value) {
    return value === "natural" || value === "deep" ? value : "free";
  }

  function normalizeCaptionSize(value) {
    return hasOwn(YOUTUBE_CAPTION_SIZE_SCALES, value) ? value : "standard";
  }

  function normalizeDisplayMode(value) {
    return value === DISPLAY_MODES.REPLACE ? DISPLAY_MODES.REPLACE : DISPLAY_MODES.BILINGUAL;
  }

  function normalizePaidProvider(value) {
    return value === "custom_openai" || value === "custom_gemini" ? "custom_openai" : "gemini";
  }

  function getFloatingProviderNote() {
    if (state.floatingPaidProvider === "custom_openai") {
      return "自定义中转站 · 在下方配置";
    }

    return "https://generativelanguage.googleapis.com · gemini-2.5-flash-lite";
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value ?? {}, key);
  }

  function setFloatingTranslated(value) {
    state.floatingTranslated = Boolean(value);

    if (state.floatingTranslated) {
      state.floatingTranslatedSettingsSignature = getFloatingTranslationSettingsSignature();
    } else {
      state.floatingTranslatedSettingsSignature = "";
    }

    updateFloatingPanelControls();
  }

  function updateFloatingTranslatedFromPageState() {
    syncFloatingTranslatedStateFromPage();
    updateFloatingPanelControls();
  }

  function syncFloatingTranslatedStateFromPage() {
    state.floatingTranslated = hasActiveRenderedTranslations();

    if (state.floatingTranslated) {
      state.floatingTranslatedSettingsSignature = getFloatingTranslationSettingsSignature();
    } else {
      state.floatingTranslatedSettingsSignature = "";
    }
  }

  function hasFloatingTranslationSettingsChanged() {
    return Boolean(
      state.floatingTranslated &&
      state.floatingTranslatedSettingsSignature &&
      state.floatingTranslatedSettingsSignature !== getFloatingTranslationSettingsSignature()
    );
  }

  function getFloatingToggleAction() {
    return state.floatingTranslated
      ? "restore"
      : "translate";
  }

  function getFloatingTranslationSettingsSignature() {
    const qualityMode = normalizeQualityMode(state.floatingQualityMode);
    const paidProvider = qualityMode === "free" ? "" : normalizePaidProvider(state.floatingPaidProvider);

    return [
      qualityMode,
      normalizeDisplayMode(state.floatingDisplayMode),
      paidProvider
    ].join("|");
  }

  const api = {
    __runtimeVersion: CONTENT_SCRIPT_RUNTIME_VERSION,
    collectSegments,
    collectYouTubeTranscriptSegmentsForTranslation,
    renderTranslations,
    renderYouTubeTranscriptTranslations,
    renderYouTubeLocalAsrTranslation,
    handleYouTubeLocalAsrStatus,
    clearYouTubeTranscriptTranslations,
    prepareTranslation,
    restorePage,
    restoreOriginalText,
    removeBilingualTranslations,
    showFloatingTranslateButton
  };

  root.PrivateBilingualTranslatorContent = api;

  if (root.chrome && root.chrome.runtime && root.chrome.runtime.onMessage && !root.__PBT_CONTENT_LISTENER_ATTACHED__) {
    root.__PBT_CONTENT_LISTENER_ATTACHED__ = true;
    root.chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || typeof message.type !== "string") {
        return false;
      }

      if (message.type === MESSAGE_TYPES.COLLECT_SEGMENTS) {
        sendResponse(api.collectSegments(null, {
          incremental: message.incremental === true,
          displayMode: message.displayMode,
          showPendingIndicators: message.showPendingIndicators === true
        }));
        return true;
      }

      if (message.type === MESSAGE_TYPES.PING_CONTENT_SCRIPT) {
        sendResponse({ ok: true });
        return true;
      }

      if (message.type === MESSAGE_TYPES.COLLECT_YOUTUBE_TRANSCRIPT) {
        api.collectYouTubeTranscriptSegmentsForTranslation({
          requestId: message.requestId,
          allowYouTubeCaptionTrack: message.allowYouTubeCaptionTrack === true,
          allowYouTubePlayerCaptionToggle: message.allowYouTubePlayerCaptionToggle === true,
          allowYouTubeLocalWhisperAsr: message.allowYouTubeLocalWhisperAsr === true
        })
          .then(sendResponse)
          .catch(() => {
            sendResponse({ ok: true, status: "caption_track_fetch_failed", segments: [] });
          });
        return true;
      }

      if (message.type === MESSAGE_TYPES.RENDER_TRANSLATIONS) {
        sendResponse(api.renderTranslations(message));
        return true;
      }

      if (message.type === MESSAGE_TYPES.RENDER_YOUTUBE_TRANSCRIPT) {
        sendResponse(api.renderYouTubeTranscriptTranslations(message));
        return true;
      }

      if (message.type === MESSAGE_TYPES.RENDER_YOUTUBE_LOCAL_ASR) {
        sendResponse(api.renderYouTubeLocalAsrTranslation(message));
        return true;
      }

      if (message.type === MESSAGE_TYPES.REPORT_YOUTUBE_LOCAL_ASR_STATUS) {
        sendResponse(api.handleYouTubeLocalAsrStatus(message));
        return true;
      }

      if (message.type === MESSAGE_TYPES.PREPARE_TRANSLATION) {
        sendResponse(api.prepareTranslation(message));
        return true;
      }

      if (message.type === MESSAGE_TYPES.RESTORE_PAGE) {
        sendResponse(api.restorePage());
        return true;
      }

      if (message.type === MESSAGE_TYPES.REMOVE_TRANSLATIONS) {
        sendResponse(api.removeBilingualTranslations());
        return true;
      }

      if (message.type === MESSAGE_TYPES.SHOW_FLOATING_TRANSLATE_BUTTON) {
        sendResponse(api.showFloatingTranslateButton(message));
        return true;
      }

      if (message.type === MESSAGE_TYPES.APPLY_FLOATING_CONTROLS_HIDDEN) {
        sendResponse({ ok: applyFloatingControlsMessage(message) });
        return true;
      }

      return false;
    });
  }

  function cleanupStaleContentRuntime(runtimeRoot) {
    try {
      const controls = runtimeRoot.document?.querySelectorAll
        ? Array.from(runtimeRoot.document.querySelectorAll("[data-pbt-control]"))
        : collectStaleControls(runtimeRoot.document?.body);

      if (controls.length > 0) {
        for (const control of controls) {
          control.remove?.();
        }
      }
    } catch {}

    try {
      runtimeRoot.__PBT_CONTENT_LISTENER_ATTACHED__ = false;
    } catch {}

    try {
      delete runtimeRoot.PrivateBilingualTranslatorContent;
    } catch {
      try {
        runtimeRoot.PrivateBilingualTranslatorContent = undefined;
      } catch {}
    }
  }

  function collectStaleControls(node, controls = []) {
    if (!node) {
      return controls;
    }

    if (node.nodeType === 1 && node.getAttribute?.("data-pbt-control")) {
      controls.push(node);
    }

    for (const child of Array.from(node.childNodes || [])) {
      collectStaleControls(child, controls);
    }

    return controls;
  }

  connectFloatingControlsPort();
  requestAutoFloatingPanel();
})(globalThis);
