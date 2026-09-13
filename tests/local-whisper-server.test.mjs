import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWhisperArgs,
  detectWhisperEngine,
  extractWhisperText,
  getInputFileName,
  normalizeText,
  normalizeWhisperEngine
} from "../scripts/local-whisper-server.mjs";

test("local whisper helper detects whisper.cpp commands", () => {
  assert.equal(detectWhisperEngine("/opt/homebrew/bin/whisper-cli"), "whispercpp");
  assert.equal(detectWhisperEngine("whisper-command"), "whispercpp");
  assert.equal(detectWhisperEngine("whisper"), "openai");
  assert.equal(normalizeWhisperEngine("whisper-cpp"), "whispercpp");
});

test("local whisper helper builds whisper.cpp args", () => {
  assert.deepEqual(
    buildWhisperArgs({
      engine: "whispercpp",
      audioPath: "/tmp/pbt/chunk.wav",
      outputDir: "/tmp/pbt",
      model: "/models/ggml-base.en.bin",
      extraArgs: ["-ng"]
    }),
    [
      "-ng",
      "-m",
      "/models/ggml-base.en.bin",
      "-f",
      "/tmp/pbt/chunk.wav",
      "-l",
      "en",
      "-oj",
      "-of",
      "/tmp/pbt/chunk",
      "-np",
      "-nt"
    ]
  );
});

test("local whisper helper builds openai whisper args", () => {
  assert.deepEqual(
    buildWhisperArgs({
      engine: "openai",
      audioPath: "/tmp/pbt/chunk.webm",
      outputDir: "/tmp/pbt",
      model: "base"
    }),
    [
      "/tmp/pbt/chunk.webm",
      "--language",
      "en",
      "--task",
      "transcribe",
      "--model",
      "base",
      "--output_format",
      "json",
      "--output_dir",
      "/tmp/pbt",
      "--fp16",
      "False"
    ]
  );
});

test("local whisper helper normalizes input names and transcript text", () => {
  assert.equal(getInputFileName("audio/webm;codecs=opus"), "chunk.webm");
  assert.equal(getInputFileName("audio/ogg"), "chunk.ogg");
  assert.equal(getInputFileName("audio/wav"), "chunk.wav");
  assert.equal(getInputFileName("audio/mpeg"), "chunk.mp3");
  assert.equal(normalizeText("  hello\n\n world\t "), "hello world");
});

test("local whisper helper extracts openai and whisper.cpp transcript text", () => {
  assert.equal(extractWhisperText({ text: "hello" }), "hello");
  assert.equal(
    extractWhisperText({
      transcription: [
        { text: "first line" },
        { text: "second line" }
      ]
    }),
    "first line second line"
  );
  assert.equal(
    extractWhisperText({
      segments: [
        { text: "seg one" },
        { text: "seg two" }
      ]
    }),
    "seg one seg two"
  );
});
