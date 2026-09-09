# Changelog

## [1.2.0] — 2026-09-09

### Changed

- Extend activation telemetry's fixed presence-only allowlist with xnerd AMPscript Language, AMPscript Snippets, Prettier, and ESLint, preserving the existing Markdown Preview signal. Installed but inactive extensions count as present; no neighboring extension versions or full inventory are collected.

## [1.1.0] — 2026-08-22

### Added

- Anonymous, opt-in-respecting usage telemetry (PostHog EU). Emits `extension.activated` (with ecosystem co-installation booleans) and a low-frequency aggregated `diagnostics.run` event (run count + total diagnostics — counts only, no file contents or identifiers) at most every five minutes and on shutdown when a non-empty aggregate remains. Gated entirely by VS Code's `telemetry.telemetryLevel`; see the new **Telemetry** section in the README and the root `telemetry.json` catalogue.

## [1.0.0] — 2026-06-07

### Added

- Hover translations for MSO conditional comment openers — plain-English description of which Outlook versions the condition targets
- Inline diagnostics: errors for invalid condition syntax (bad keyword, unknown operator, non-existent version) and warnings for unmatched opener/closer pairs
- Setting `msoConditionals.diagnostics.enable` (default: `true`) — disable extension diagnostics when using [`eslint-plugin-mso-email`](https://www.npmjs.com/package/eslint-plugin-mso-email) instead
- Snippet completions for common MSO patterns (`mso-all`, `mso-gte`, `mso-not`, downlevel-hidden start/end)
- Support for HTML, AMP, SSJS, AMPscript, and Handlebars file types
