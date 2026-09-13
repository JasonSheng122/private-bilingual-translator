export const LOCAL_WHISPER_TRANSCRIBE_URL = "http://127.0.0.1:8765/transcribe";

const MAX_LOCAL_WHISPER_AUDIO_BASE64_LENGTH = 6 * 1024 * 1024;

export async function transcribeLocalWhisperAudio({
  audioBase64,
  mimeType,
  endpoint = LOCAL_WHISPER_TRANSCRIBE_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  const sanitizedAudio = String(audioBase64 || "");

  if (!sanitizedAudio || sanitizedAudio.length > MAX_LOCAL_WHISPER_AUDIO_BASE64_LENGTH) {
    return makeLocalWhisperError("local_whisper_audio_invalid", "The captured audio chunk was not usable.");
  }

  if (typeof fetchImpl !== "function") {
    return makeLocalWhisperError("local_whisper_unavailable", "Local Whisper request support is unavailable.");
  }

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        audioBase64: sanitizedAudio,
        mimeType: sanitizeMimeType(mimeType),
        language: "en"
      })
    });
  } catch {
    return makeLocalWhisperError("local_whisper_unavailable", "Local Whisper is not reachable.");
  }

  if (!response || response.ok !== true || typeof response.json !== "function") {
    return makeLocalWhisperError("local_whisper_unavailable", "Local Whisper returned an unavailable response.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return makeLocalWhisperError("local_whisper_response_invalid", "Local Whisper returned an invalid response.");
  }

  if (payload?.ok === false) {
    return makeLocalWhisperError("local_whisper_response_invalid", "Local Whisper could not transcribe this audio.");
  }

  const text = normalizeTranscriptText(payload?.text);

  if (!text) {
    return makeLocalWhisperError("local_whisper_no_speech", "Local Whisper did not return readable speech.");
  }

  return {
    ok: true,
    text,
    language: sanitizeLanguage(payload?.language) || "en"
  };
}

function normalizeTranscriptText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

function sanitizeMimeType(value) {
  const mimeType = String(value || "audio/webm").trim();

  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;\s*codecs=[a-z0-9.,+-]+)?$/i.test(mimeType)
    ? mimeType
    : "audio/webm";
}

function sanitizeLanguage(value) {
  const language = String(value || "").trim();

  return /^[a-z]{2,8}(?:-[a-z0-9]{2,8})?$/i.test(language) ? language : "";
}

function makeLocalWhisperError(code, message) {
  return {
    ok: false,
    error: { code, message }
  };
}
