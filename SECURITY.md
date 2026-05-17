# Security Policy

## Supported Status

This project is currently a pre-release local Chrome extension. It is being prepared for open-source publication.

The fixed third-party gateway provider has been replaced with user-configured provider settings. Treat custom provider configuration as user-owned sensitive setup data, and do not publish private Base URLs, models, API Keys, request bodies, or response bodies in issues or logs.

## Security Goals

The extension is designed around these constraints:

1. Manual translation first.
2. No telemetry.
3. No analytics.
4. No remote configuration.
5. No developer-operated server.
6. No `chrome.storage.sync` for API keys.
7. No API Key access from content scripts.
8. No source text or translated text in logs.
9. No silent provider fallback.
10. Sensitive domains blocked before text collection.

## Reporting a Vulnerability

When this repository is public, report vulnerabilities through a GitHub issue or the maintainer's preferred private contact channel.

Do not include:

1. Real API Keys.
2. Access tokens.
3. Cookies.
4. Passwords.
5. Private webpage text.
6. Translated private text.
7. Screenshots containing secrets.
8. Provider raw request or response bodies containing private text.

A useful report should include:

1. A short description of the issue.
2. The browser and extension version.
3. Sanitized reproduction steps.
4. The expected behavior.
5. The actual behavior.
6. Any relevant console or network metadata with secrets removed.

## API Key Handling

API Keys must only flow through trusted extension contexts:

1. popup input.
2. background service worker.
3. secret manager.
4. provider request headers.

API Keys must not enter:

1. content scripts.
2. page DOM.
3. URL query strings.
4. logs.
5. error messages.
6. test snapshots.
7. documentation examples.

## Audit Commands

Run the static audit before sharing or releasing a build:

```bash
npm run audit
```

Run the full test suite:

```bash
npm test
```

Useful manual scans are listed in `docs/AUDIT_COMMANDS.md`.
