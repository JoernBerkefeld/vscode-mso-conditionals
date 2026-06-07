# MSO Conditional Comments — VS Code Extension

IntelliSense for **MSO (Outlook) conditional comments** in HTML email — hover translations, completions, and inline diagnostics.

## Features

### Hover translations

Hover over any MSO conditional comment to see a plain-English translation of its condition.

```html
<!--[if gte mso 14]>
```

Hovering shows: **MSO Conditional — Visible to:** Outlook 2010 and later (MSO ≥ 14)

### Inline diagnostics

Errors and warnings appear directly in the editor without requiring an ESLint setup:

| Diagnostic | Severity | Example |
|---|---|---|
| Invalid condition syntax | Error | `<!--[if mos 16]>` — typo in keyword |
| Unknown operator | Error | `<!--[if newer mso 16]>` — `newer` is not valid |
| Unknown version | Error | `<!--[if gte mso 13]>` — version 13 does not exist |
| Opener without closer | Warning | `<!--[if mso]>` with no matching `<![endif]-->` |
| Closer without opener | Warning | `<![endif]-->` with no preceding opener |

### Completions

Type `<!--[if` or `<![if` to trigger snippet completions for the most common MSO conditional patterns:

| Trigger | Description |
|---|---|
| `mso-all` | Target all Outlook versions |
| `mso-gte` | Target Outlook greater than or equal to a version |
| `mso-not` | Hide from all Outlook versions |
| `mso-hidden-start` | Downlevel-hidden block — hidden from Outlook |
| `mso-hidden-end` | Close a downlevel-hidden block |

## Supported file types

HTML, AMP, SSJS, AMPscript, and Handlebars files (any file VS Code identifies as `html`, `ampscript`, `sfmc`, `ssjs`, or `handlebars`).

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `msoConditionals.diagnostics.enable` | boolean | `true` | Show inline errors and warnings. Disable if you prefer diagnostics from [`eslint-plugin-mso-conditionals`](https://www.npmjs.com/package/eslint-plugin-mso-conditionals) instead. |

## Valid Outlook versions

| MSO version | Outlook product |
|---|---|
| 9 | Outlook 2000 |
| 10 | Outlook 2002 |
| 11 | Outlook 2003 |
| 12 | Outlook 2007 |
| 14 | Outlook 2010 |
| 15 | Outlook 2013 |
| 16 | Outlook 2016, 2019, and 365 |

## Valid operators

| Operator | Meaning |
|---|---|
| `gte` | greater than or equal |
| `gt` | greater than |
| `lte` | less than or equal |
| `lt` | less than |
| `eq` | equal |

## Companion tools

- **[eslint-plugin-mso-conditionals](https://www.npmjs.com/package/eslint-plugin-mso-conditionals)** — get the same validation in CI or in editors without this extension.
- **[mso-conditional-parser](https://www.npmjs.com/package/mso-conditional-parser)** — the underlying parser, usable as a standalone npm package.

## License

MIT
