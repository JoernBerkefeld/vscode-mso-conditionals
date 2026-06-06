/**
 * diagnostics-core.js
 *
 * Pure-JS diagnostic scanner for MSO conditional comments.
 * No dependency on the `vscode` module — safe to import in Node.js test runners.
 *
 * Consumers (diagnostics.ts) map the returned plain objects to vscode.Diagnostic instances.
 */

import { parseMsoComment } from 'mso-conditional-parser';

/**
 * Regex matching all MSO conditional comment openers on a single line.
 * Handles both downlevel-hidden and downlevel-revealed patterns.
 */
const MSO_OPEN_RE = /<!--\[if\s[^\]]*\]>(?:<!--)?|<!\[if\s[^\]]*\]>/g;

/**
 * Regex matching all MSO conditional comment closers on a single line.
 */
const MSO_CLOSE_RE = /(?:<!--)?<!\[endif\]-->|<!\[endif\]>/g;

/**
 * A single diagnostic result returned by scanDocument.
 *
 * @typedef {object} MsoDiagnostic
 * @property {number} line - Zero-based line index.
 * @property {number} startChar - Zero-based start character (inclusive).
 * @property {number} endChar - Zero-based end character (exclusive).
 * @property {string} message - Human-readable diagnostic message.
 * @property {'error'|'warning'} severity - Diagnostic severity.
 */

/**
 * Scans an array of document lines for MSO conditional comment issues.
 *
 * Raises:
 * - **error** when an opener contains an invalid condition string.
 * - **warning** when a closer has no matching opener.
 * - **warning** for each opener that has no matching closer by end of document.
 *
 * @param {string[]} lines - Document lines (one element per line, no trailing newline required).
 * @returns {MsoDiagnostic[]} Array of diagnostic objects, may be empty.
 */
export function scanDocument(lines) {
    /** @type {MsoDiagnostic[]} */
    const diagnostics = [];

    /** @type {Array<{ line: number, startChar: number, endChar: number }>} */
    const openerStack = [];

    for (const [lineIdx, text] of lines.entries()) {
        // ── Openers ────────────────────────────────────────────────────────
        MSO_OPEN_RE.lastIndex = 0;
        let match;
        while ((match = MSO_OPEN_RE.exec(text)) !== null) {
            const startChar = match.index;
            const endChar = startChar + match[0].length;
            const parsed = parseMsoComment(match[0]);

            if (parsed) {
                if (parsed.isValid) {
                    openerStack.push({ line: lineIdx, startChar, endChar });
                } else {
                    diagnostics.push({
                        line: lineIdx,
                        startChar,
                        endChar,
                        message: parsed.error ?? 'Invalid MSO condition',
                        severity: 'error',
                    });
                    // Do not push invalid openers onto the stack — they are
                    // already reported as errors; adding an "unclosed" warning
                    // on top would be noisy and misleading.
                }
            }
        }

        // ── Closers ────────────────────────────────────────────────────────
        MSO_CLOSE_RE.lastIndex = 0;
        while ((match = MSO_CLOSE_RE.exec(text)) !== null) {
            const startChar = match.index;
            const endChar = startChar + match[0].length;

            if (openerStack.length === 0) {
                diagnostics.push({
                    line: lineIdx,
                    startChar,
                    endChar,
                    message: 'MSO endif without matching opener',
                    severity: 'warning',
                });
            } else {
                openerStack.pop();
            }
        }
    }

    // Any openers left on the stack have no closing endif.
    for (const opener of openerStack) {
        diagnostics.push({
            line: opener.line,
            startChar: opener.startChar,
            endChar: opener.endChar,
            message: 'MSO opener has no matching endif',
            severity: 'warning',
        });
    }

    return diagnostics;
}
