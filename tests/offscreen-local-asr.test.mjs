import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const LOCAL_ASR_SCRIPT_URL = new URL("../src/offscreen/local-asr.js", import.meta.url);

test("offscreen local ASR normalizes short and invalid chunk durations to 3000ms", async () => {
  assert.equal(await getScheduledChunkDelay({ chunkMs: 250 }), 3000);
  assert.equal(await getScheduledChunkDelay({ chunkMs: "invalid" }), 3000);
  assert.equal(await getScheduledChunkDelay({ chunkMs: 3200 }), 3200);
  assert.equal(await getScheduledChunkDelay({ chunkMs: 20000 }), 15000);
});

async function getScheduledChunkDelay(messageOverrides = {}) {
  const source = await readFile(LOCAL_ASR_SCRIPT_URL, "utf8");
  let messageListener = null;
  const timers = [];

  class FakeMediaRecorder {
    constructor(_stream, options = {}) {
      this.mimeType = options.mimeType || "audio/webm";
      this.state = "inactive";
    }

    start() {
      this.state = "recording";
    }

    stop() {
      this.state = "inactive";
    }

    static isTypeSupported(value) {
      return value === "audio/webm";
    }
  }

  const context = {
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          }
        },
        sendMessage() {}
      }
    },
    navigator: {
      mediaDevices: {
        async getUserMedia() {
          return {
            getTracks() {
              return [{ stop() {} }];
            }
          };
        }
      }
    },
    AudioContext: class FakeAudioContext {
      constructor() {
        this.destination = {};
      }

      createMediaStreamSource() {
        return { connect() {} };
      }

      close() {}
    },
    MediaRecorder: FakeMediaRecorder,
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return { delay };
    },
    clearTimeout() {}
  };
  context.globalThis = context;

  vm.runInNewContext(source, context, { filename: "src/offscreen/local-asr.js" });

  assert.equal(typeof messageListener, "function");
  const response = await new Promise((resolve) => {
    messageListener({
      type: "PBT_START_YOUTUBE_LOCAL_ASR",
      target: "pbt-local-asr-offscreen",
      tabId: 12,
      requestId: 34,
      streamId: "stream-12",
      ...messageOverrides
    }, {}, resolve);
  });

  assert.equal(response?.ok, true);
  assert.equal(timers.length, 1);
  return timers[0].delay;
}
