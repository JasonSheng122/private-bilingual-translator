const DEFAULT_SENSITIVE_RULES = Object.freeze([
  { host: "mail.google.com", reason: "email" },
  { host: "outlook.live.com", reason: "email" },
  { host: "outlook.office.com", reason: "email" },
  { host: "docs.google.com", reason: "private_document" },
  { host: "drive.google.com", reason: "cloud_drive" },
  { host: "notion.so", reason: "private_document" },
  { host: "dropbox.com", reason: "cloud_drive" },
  { host: "onepassword.com", reason: "password_manager" },
  { host: "bitwarden.com", reason: "password_manager" },
  { host: "chrome.google.com", reason: "extension_store" },
  { host: "chromewebstore.google.com", reason: "extension_store" },
  { host: "github.com", pathPrefix: "/settings", reason: "developer_secret_page" }
]);

export function evaluateDomainPolicy(url, options = {}) {
  const parsed = parseHttpUrl(url);

  if (!parsed) {
    return {
      canManualTranslate: false,
      canAutoTranslate: false,
      blocked: true,
      reason: "unsupported_url",
      matchedRule: null,
      hostname: ""
    };
  }

  const customBlocklist = normalizeRuleList(options.blocklist ?? []);
  const autoAllowlist = normalizeRuleList(options.autoAllowlist ?? []);
  const allBlockRules = [...customBlocklist, ...DEFAULT_SENSITIVE_RULES];
  const matchedBlockRule = allBlockRules.find((rule) => matchesRule(parsed, rule));

  if (matchedBlockRule) {
    return {
      canManualTranslate: false,
      canAutoTranslate: false,
      blocked: true,
      reason: matchedBlockRule.reason ?? "sensitive_domain",
      matchedRule: describeRule(matchedBlockRule),
      hostname: parsed.hostname
    };
  }

  const autoAllowed = autoAllowlist.some((rule) => matchesRule(parsed, rule));

  return {
    canManualTranslate: true,
    canAutoTranslate: autoAllowed,
    blocked: false,
    reason: autoAllowed ? "allowed" : "manual_only",
    matchedRule: null,
    hostname: parsed.hostname
  };
}

export function getDefaultSensitiveRules() {
  return DEFAULT_SENSITIVE_RULES.map((rule) => ({ ...rule }));
}

function parseHttpUrl(value) {
  try {
    const parsed = new URL(value);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return {
      hostname: parsed.hostname.toLowerCase(),
      pathname: parsed.pathname || "/"
    };
  } catch {
    return null;
  }
}

function normalizeRuleList(rules) {
  return rules
    .map((rule) => {
      if (typeof rule === "string") {
        return { host: rule.toLowerCase() };
      }

      if (!rule || typeof rule.host !== "string") {
        return null;
      }

      return {
        host: rule.host.toLowerCase(),
        pathPrefix: typeof rule.pathPrefix === "string" ? rule.pathPrefix : undefined,
        reason: typeof rule.reason === "string" ? rule.reason : undefined
      };
    })
    .filter(Boolean);
}

function matchesRule(parsed, rule) {
  if (!matchesHost(parsed.hostname, rule.host)) {
    return false;
  }

  if (!rule.pathPrefix) {
    return true;
  }

  return parsed.pathname === rule.pathPrefix || parsed.pathname.startsWith(`${rule.pathPrefix}/`);
}

function matchesHost(hostname, ruleHost) {
  return hostname === ruleHost || hostname.endsWith(`.${ruleHost}`);
}

function describeRule(rule) {
  return rule.pathPrefix ? `${rule.host}${rule.pathPrefix}` : rule.host;
}
