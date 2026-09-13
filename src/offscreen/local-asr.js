(function initPrivateBilingualTranslatorLocalAsrOffscreen(root) {
  const MESSAGE_TYPES = {
    START_YOUTUBE_LOCAL_ASR: "PBT_START_YOUTUBE_LOCAL_ASR",
    STOP_YOUTUBE_LOCAL_ASR: "PBT_STOP_YOUTUBE_LOCAL_ASR",
    YOUTUBE_LOCAL_ASR_AUDIO_CHUNK: "PBT_YOUTUBE_LOCAL_ASR_AUDIO_CHUNK"
  };
  const DEFAULT_CHUNK_MS = 3000;
  const MAX_CHUNK_MS = 15000;
  const sessions = new Map();

  if (!root.chrome?.runtime?.onMessage) {
    return;
  }

  root.chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.target !== "pbt-local-asr-offscreen") {
      return false;
    }

    if (message.type === MESSAGE_TYPES.START_YOUTUBE_LOCAL_ASR) {
      startSession(message)
        .then(sendResponse)
        .catch(() => {
          sendResponse({ ok: false, error: { code: "local_asr_capture_failed" } });
        });
      return true;
    }

    if (message.type === MESSAGE_TYPES.STOP_YOUTUBE_LOCAL_ASR) {
      stopSession(Number(message.tabId));
      sendResponse({ ok: true });
      return true;
    }

    return false;
  });

  async function startSession(message) {
    const tabId = Number(message.tabId);
    const streamId = String(message.streamId || "");

    if (!Number.isInteger(tabId) || tabId < 0 || !streamId) {
      return { ok: false, error: { code: "local_asr_capture_invalid" } };
    }

    stopSession(tabId);

    const stream = await root.navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });
    const audioContext = new root.AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(audioContext.destination);

    const session = {
      tabId,
      requestId: Number(message.requestId),
      chunkMs: normalizeChunkMs(message.chunkMs),
      sequence: 0,
      stream,
      audioContext,
      active: true,
      recorder: null
    };

    sessions.set(tabId, session);
    recordNextChunk(session);

    return { ok: true };
  }

  function stopSession(tabId) {
    const session = sessions.get(tabId);

    if (!session) {
      return;
    }

    session.active = false;
    sessions.delete(tabId);

    try {
      if (session.recorder && session.recorder.state !== "inactive") {
        session.recorder.stop();
      }
    } catch {}

    try {
      for (const track of session.stream.getTracks()) {
        track.stop();
      }
    } catch {}

    try {
      session.audioContext.close();
    } catch {}
  }

  function recordNextChunk(session) {
    if (!session.active || !sessions.has(session.tabId)) {
      return;
    }

    const mimeType = getPreferredMimeType();
    const options = mimeType ? { mimeType } : {};
    const recorder = new root.MediaRecorder(session.stream, options);
    const chunks = [];

    session.recorder = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      if (!session.active || !sessions.has(session.tabId) || chunks.length === 0) {
        return;
      }

      const blob = new root.Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      const audioBase64 = await blobToBase64(blob);
      session.sequence += 1;

      root.chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.YOUTUBE_LOCAL_ASR_AUDIO_CHUNK,
        tabId: session.tabId,
        requestId: session.requestId,
        sequence: session.sequence,
        mimeType: blob.type || "audio/webm",
        audioBase64
      });

      root.setTimeout(() => recordNextChunk(session), 0);
    };

    recorder.start();
    root.setTimeout(() => {
      try {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {}
    }, session.chunkMs);
  }

  function getPreferredMimeType() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4"
    ];

    for (const candidate of candidates) {
      if (root.MediaRecorder?.isTypeSupported?.(candidate)) {
        return candidate;
      }
    }

    return "";
  }

  function normalizeChunkMs(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
      return DEFAULT_CHUNK_MS;
    }

    return Math.min(MAX_CHUNK_MS, Math.max(3000, Math.floor(number)));
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new root.FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        const commaIndex = result.indexOf(",");
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = () => reject(new Error("blob_read_failed"));
      reader.readAsDataURL(blob);
    });
  }
})(globalThis);
