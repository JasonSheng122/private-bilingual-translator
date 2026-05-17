import assert from "node:assert/strict";
import test from "node:test";
import { evaluateDomainPolicy } from "../src/shared/domain-policy.mjs";

test("blocks default sensitive domains before DOM extraction", () => {
  const blockedUrls = [
    "https://mail.google.com/mail/u/0/",
    "https://docs.google.com/document/d/example/edit",
    "https://drive.google.com/drive/my-drive",
    "https://notion.so/private-page",
    "https://github.com/settings/tokens"
  ];

  for (const url of blockedUrls) {
    const policy = evaluateDomainPolicy(url);
    assert.equal(policy.blocked, true);
    assert.equal(policy.canManualTranslate, false);
    assert.equal(policy.canAutoTranslate, false);
  }
});

test("allows public pages for manual translation only by default", () => {
  const policy = evaluateDomainPolicy("https://github.com/openai/openai-node");

  assert.equal(policy.blocked, false);
  assert.equal(policy.canManualTranslate, true);
  assert.equal(policy.canAutoTranslate, false);
  assert.equal(policy.reason, "manual_only");
});

test("requires explicit allowlist for auto translation", () => {
  const policy = evaluateDomainPolicy("https://example.com/article", {
    autoAllowlist: ["example.com"]
  });

  assert.equal(policy.blocked, false);
  assert.equal(policy.canManualTranslate, true);
  assert.equal(policy.canAutoTranslate, true);
});

test("custom blocklist wins over auto allowlist", () => {
  const policy = evaluateDomainPolicy("https://example.com/article", {
    blocklist: [{ host: "example.com", reason: "user_blocked" }],
    autoAllowlist: ["example.com"]
  });

  assert.equal(policy.blocked, true);
  assert.equal(policy.canManualTranslate, false);
  assert.equal(policy.canAutoTranslate, false);
  assert.equal(policy.reason, "user_blocked");
});

test("rejects unsupported URL schemes", () => {
  const policy = evaluateDomainPolicy("chrome://extensions");

  assert.equal(policy.blocked, true);
  assert.equal(policy.reason, "unsupported_url");
});
