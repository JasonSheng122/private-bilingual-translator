import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PBT_WHISPER_PORT || 8765);
const WHISPER_COMMAND = process.env.PBT_WHISPER_COMMAND || detectWhisperCommand();
const WHISPER_ENGINE = normalizeWhisperEngine(process.env.PBT_WHISPER_ENGINE || detectWhisperEngine(WHISPER_COMMAND));
const WHISPER_MODEL = process.env.PBT_WHISPER_MODEL || getDefaultWhisperModel(WHISPER_ENGINE);
const WHISPER_EXTRA_ARGS = getDefaultWhisperExtraArgs(WHISPER_ENGINE);
const FFMPEG_COMMAND = process.env.PBT_FFMPEG_COMMAND || "ffmpeg";
const WHISPER_TIMEOUT_MS = Number(process.env.PBT_WHISPER_TIMEOUT_MS || 90000);
const FFMPEG_TIMEOUT_MS = Number(process.env.PBT_FFMPEG_TIMEOUT_MS || 30000);
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

export function createLocalWhisperServer() {
  return createServer(async (request, response) => {
    setSecurityHeaders(response);

    if (request.method === "OPTIONS") {
      writeJson(response, 403, {
        ok: false,
        error: { code: "forbidden" }
      });
      return;
    }

    if (request.method !== "POST" || request.url !== "/transcribe") {
      writeJson(response, 404, {
        ok: false,
        error: { code: "not_found" }
      });
      return;
    }

    let payload;
    try {
      payload = JSON.parse(await readRequestBody(request));
    } catch {
      writeJson(response, 400, {
        ok: false,
        error: { code: "invalid_request" }
      });
      return;
    }

    const audioBase64 = String(payload.audioBase64 || "");
    if (!audioBase64 || audioBase64.length > MAX_REQUEST_BYTES) {
      writeJson(response, 400, {
        ok: false,
        error: { code: "invalid_audio" }
      });
      return;
    }

    const workDir = await mkdtemp(join(tmpdir(), "pbt-whisper-"));
    const audioPath = join(workDir, getInputFileName(payload.mimeType));

    try {
      await writeFile(audioPath, Buffer.from(audioBase64, "base64"));
      const result = await runWhisper(audioPath, workDir);
      const text = normalizeText(extractWhisperText(result));

      writeJson(response, 200, {
        ok: true,
        text,
        language: "en"
      });
    } catch {
      writeJson(response, 503, {
        ok: false,
        error: { code: "whisper_failed" }
      });
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
}

if (isMainModule()) {
  const server = createLocalWhisperServer();
  server.listen(PORT, HOST, () => {
    process.stderr.write(`Private Bilingual Translator local Whisper helper listening on http://${HOST}:${PORT}/transcribe\n`);
    process.stderr.write(`Using ${WHISPER_ENGINE} command: ${WHISPER_COMMAND}\n`);
    process.stderr.write(`Using Whisper model: ${WHISPER_MODEL}\n`);
  });
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error("request_too_large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function runWhisper(audioPath, outputDir) {
  const preparedAudioPath = await prepareAudioForWhisper(audioPath, outputDir, WHISPER_ENGINE);
  const args = buildWhisperArgs({
    engine: WHISPER_ENGINE,
    audioPath: preparedAudioPath,
    outputDir,
    model: WHISPER_MODEL,
    extraArgs: WHISPER_EXTRA_ARGS
  });

  await runProcess(WHISPER_COMMAND, args, WHISPER_TIMEOUT_MS);
  return JSON.parse(await readFile(join(outputDir, "chunk.json"), "utf8"));
}

async function prepareAudioForWhisper(audioPath, outputDir, engine) {
  if (engine !== "whispercpp") {
    return audioPath;
  }

  const wavPath = join(outputDir, "chunk-converted.wav");
  await runProcess(
    FFMPEG_COMMAND,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      audioPath,
      "-ar",
      "16000",
      "-ac",
      "1",
      wavPath
    ],
    FFMPEG_TIMEOUT_MS
  );
  return wavPath;
}

export function buildWhisperArgs({ engine, audioPath, outputDir, model, extraArgs = [] }) {
  if (engine === "whispercpp") {
    return [
      ...extraArgs,
      "-m",
      model,
      "-f",
      audioPath,
      "-l",
      "en",
      "-oj",
      "-of",
      join(outputDir, "chunk"),
      "-np",
      "-nt"
    ];
  }

  return [
    audioPath,
    "--language",
    "en",
    "--task",
    "transcribe",
    "--model",
    model,
    "--output_format",
    "json",
    "--output_dir",
    outputDir,
    "--fp16",
    "False"
  ];
}

export function getInputFileName(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();

  if (normalized.includes("ogg")) {
    return "chunk.ogg";
  }

  if (normalized.includes("wav")) {
    return "chunk.wav";
  }

  if (normalized.includes("mp4")) {
    return "chunk.mp4";
  }

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "chunk.mp3";
  }

  return "chunk.webm";
}

export function detectWhisperEngine(command) {
  const name = basename(String(command || "")).toLowerCase();
  if (name === "whisper-cli" || name === "whisper-command" || name.includes("whisper-cpp")) {
    return "whispercpp";
  }
  return "openai";
}

export function normalizeWhisperEngine(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "whispercpp" || normalized === "whisper-cpp" || normalized === "cpp") {
    return "whispercpp";
  }
  return "openai";
}

export function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

export function extractWhisperText(result) {
  if (typeof result === "string") {
    return result;
  }

  if (result?.text) {
    return result.text;
  }

  if (Array.isArray(result?.transcription)) {
    return result.transcription
      .map((segment) => segment?.text || "")
      .filter(Boolean)
      .join(" ");
  }

  if (Array.isArray(result?.segments)) {
    return result.segments
      .map((segment) => segment?.text || "")
      .filter(Boolean)
      .join(" ");
  }

  return "";
}

function detectWhisperCommand() {
  if (commandExists("whisper-cli")) {
    return "whisper-cli";
  }
  return "whisper";
}

function getDefaultWhisperModel(engine) {
  if (engine === "whispercpp") {
    return "models/ggml-base.en.bin";
  }
  return "base";
}

function getDefaultWhisperExtraArgs(engine) {
  const explicit = parseExtraArgs(process.env.PBT_WHISPER_EXTRA_ARGS);
  if (explicit.length > 0) {
    return explicit;
  }

  if (engine === "whispercpp" && process.env.PBT_WHISPER_CPP_USE_GPU !== "1") {
    return ["-ng"];
  }

  return [];
}

function parseExtraArgs(value) {
  return String(value || "")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function commandExists(command) {
  const result = spawnSync("/bin/sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore"
  });
  return result.status === 0;
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "ignore"]
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("process_timeout"));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error("process_exit_failed"));
    });
  });
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function writeJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
