# Changelog

## [1.0.0] — 2026-06-07

### Added

- Hover translations for MSO conditional comment openers — plain-English description of which Outlook versions the condition targets
- Inline diagnostics: errors for invalid condition syntax (bad keyword, unknown operator, non-existent version) and warnings for unmatched opener/closer pairs
- Setting `msoConditionals.diagnostics.enable` (default: `true`) — disable extension diagnostics when using [`eslint-plugin-mso`](https://www.npmjs.com/package/eslint-plugin-mso) instead
- Snippet completions for common MSO patterns (`mso-all`, `mso-gte`, `mso-not`, downlevel-hidden start/end)
- Support for HTML, AMP, SSJS, AMPscript, and Handlebars file types
