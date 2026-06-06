/**
 * Pure-data module for MSO conditional completion snippets.
 * Extracted from completion.ts so tests can import it without a VS Code host.
 */

/**
 * Prefix patterns that trigger MSO completion suggestions.
 *
 * @type {RegExp}
 */
export const TRIGGER_PREFIX_RE = /<!--\[$|<!\[$/;

/**
 * Completion snippets for common MSO conditional comment patterns.
 * Each `body` starts with `[if …]` — the leading `<!--` is prepended at runtime.
 *
 * @type {Array<{label: string, body: string, description: string}>}
 */
export const MSO_SNIPPETS = [
    {
        label: 'if mso — any Outlook',
        body: '[if mso]>\n\t$0\n<![endif]-->',
        description: 'Visible only in all Outlook versions',
    },
    {
        label: 'if !mso — hide from Outlook',
        body: '[if !mso]><!-->\n\t$0\n<!--<![endif]-->',
        description: 'Hidden from Outlook, visible in other clients',
    },
    {
        label: 'if gte mso 16 — Outlook 2016+',
        body: '[if gte mso 16]>\n\t$0\n<![endif]-->',
        description: 'Visible in Outlook 2016, 2019, and 365',
    },
    {
        label: 'if (gte mso 9) & (lte mso 15) — Outlook 2000–2013',
        body: '[if (gte mso 9)&(lte mso 15)]>\n\t$0\n<![endif]-->',
        description: 'Visible in Outlook 2000 through 2013',
    },
    {
        label: 'if lt mso 16 — before Outlook 2016',
        body: '[if lt mso 16]>\n\t$0\n<![endif]-->',
        description: 'Visible in Outlook versions before 2016',
    },
    {
        label: 'if mso 12 — Outlook 2007 only',
        body: '[if mso 12]>\n\t$0\n<![endif]-->',
        description: 'Visible only in Outlook 2007',
    },
    {
        label: 'if gte mso 14 — Outlook 2010+',
        body: '[if gte mso 14]>\n\t$0\n<![endif]-->',
        description: 'Visible in Outlook 2010, 2013, 2016, 2019, and 365',
    },
];
