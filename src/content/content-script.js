(function initPrivateBilingualTranslatorContent(root) {
  if (root.PrivateBilingualTranslatorContent) {
    return;
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
  const SESSION_TRANSLATION_CACHE_LIMIT = 600;
  const TARGET_LANGUAGE_SAMPLE_LIMIT = 2400;
  const TARGET_LANGUAGE_MIN_CJK_CHARS = 24;
  const TARGET_LANGUAGE_MIN_CJK_RATIO = 0.58;
  const MESSAGE_TYPES = {
    GET_PAGE_STATUS: "PBT_GET_PAGE_STATUS",
    COLLECT_SEGMENTS: "PBT_COLLECT_SEGMENTS",
    PING_CONTENT_SCRIPT: "PBT_PING_CONTENT_SCRIPT",
    RENDER_TRANSLATIONS: "PBT_RENDER_TRANSLATIONS",
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
    floatingContextInvalidated: false
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
      syncFloatingTranslatedStateFromPage();
      updateFloatingPanelControls();
      maybeRunStoredAutoTranslate();
      return { ok: true, shown: false };
    }

    const panel = createFloatingPanel(doc);
    doc.body.appendChild(panel);
    state.floatingPanel = panel;
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
      autoTranslate
    }, (response) => {
      if (response && response.ok) {
        state.floatingDisplayMode = normalizeDisplayMode(response.displayMode);
        state.floatingQualityMode = normalizeQualityMode(response.qualityMode);
        state.floatingPaidProvider = normalizePaidProvider(response.paidProvider);
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
      paidProvider: state.floatingPaidProvider
    }, (response) => {
      if (!response || !response.ok || response.policy?.blocked) {
        return;
      }

      showFloatingTranslateButton({
        qualityMode: response.qualityMode,
        displayMode: response.displayMode,
        paidProvider: response.paidProvider,
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
    } catch {
      return getUrl("src/floating-settings/floating-settings.html");
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

    restorePage();
    state.floatingContextInvalidated = true;
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
    collectSegments,
    renderTranslations,
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

      if (message.type === MESSAGE_TYPES.RENDER_TRANSLATIONS) {
        sendResponse(api.renderTranslations(message));
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

  connectFloatingControlsPort();
  requestAutoFloatingPanel();
})(globalThis);
