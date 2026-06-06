/**
 * Unit tests for hover and completion logic that can run without a VS Code host.
 * These tests exercise the pure logic layer: parseMsoComment is called via
 * the parser package and the regex patterns used in hover/completion are verified.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMsoComment, parseMsoEndComment } from 'mso-conditional-parser';
import { MSO_SNIPPETS, TRIGGER_PREFIX_RE as SNIPPETS_TRIGGER_RE } from '../src/snippets.js';
import { scanDocument } from '../src/diagnostics-core.js';

// ── Hover logic — MSO_OPEN_RE ─────────────────────────────────────────────

const MSO_OPEN_RE = /<!--\[if\s[^\]]*\]>(?:<!--)?|<!\[if\s[^\]]*\]>/g;
const MSO_CLOSE_RE = /(?:<!--)?<!\[endif\]-->|<!\[endif\]>/g;

/**
 * Simulates the hover provider: finds matches on a line and checks if a
 * given column falls within any match.
 *
 * @param {string} line - Source line text.
 * @param {number} col - Cursor column.
 * @returns {{ raw: string } | null} Match object or null.
 */
function findHoverMatch(line, col) {
    MSO_OPEN_RE.lastIndex = 0;
    let match;
    while ((match = MSO_OPEN_RE.exec(line)) !== null) {
        if (col >= match.index && col <= match.index + match[0].length) {
            return { raw: match[0] };
        }
    }

    MSO_CLOSE_RE.lastIndex = 0;
    while ((match = MSO_CLOSE_RE.exec(line)) !== null) {
        if (col >= match.index && col <= match.index + match[0].length) {
            return { raw: match[0] };
        }
    }

    return null;
}

describe('hover — regex detection', () => {
    it('finds opener on a plain line', () => {
        const result = findHoverMatch('<!--[if mso]>', 4);
        assert.ok(result);
        assert.equal(result.raw, '<!--[if mso]>');
    });

    it('finds opener mid-line', () => {
        const result = findHoverMatch('<td><!--[if gte mso 16]></td>', 10);
        assert.ok(result);
        assert.ok(result.raw.includes('gte mso 16'));
    });

    it('finds closer', () => {
        const result = findHoverMatch('<![endif]-->', 4);
        assert.ok(result);
        assert.ok(result.raw.includes('endif'));
    });

    it('returns null when cursor is outside any comment', () => {
        const result = findHoverMatch('<td>Hello</td>', 5);
        assert.equal(result, null);
    });

    it('finds revealed closer <!--<![endif]-->', () => {
        const result = findHoverMatch('<!--<![endif]-->', 4);
        assert.ok(result);
    });
});

// ── Hover — parseMsoComment integration ─────────────────────────────────────

describe('hover — parseMsoComment integration', () => {
    it('returns a translation for a valid opener', () => {
        const match = findHoverMatch('<!--[if gte mso 16]>', 5);
        assert.ok(match);
        const parsed = parseMsoComment(match.raw);
        assert.ok(parsed);
        assert.ok(parsed.translation.includes('2016'));
    });

    it('returns isValid:false for a typo', () => {
        const match = findHoverMatch('<!--[if mos]>', 5);
        assert.ok(match);
        const parsed = parseMsoComment(match.raw);
        assert.ok(parsed);
        assert.equal(parsed.isValid, false);
    });

    it('returns parsed closer via parseMsoEndComment', () => {
        const match = findHoverMatch('<![endif]-->', 4);
        assert.ok(match);
        const parsed = parseMsoEndComment(match.raw);
        assert.ok(parsed);
        assert.equal(parsed.isClosing, true);
    });
});

// ── Completion — trigger prefix regex ────────────────────────────────────────

const TRIGGER_PREFIX_RE = /<!--\[$|<!\[$/;

describe('completion — trigger prefix regex', () => {
    it('matches <!--[ prefix', () => {
        assert.ok(TRIGGER_PREFIX_RE.test('<!--['));
    });

    it('matches <![ prefix', () => {
        assert.ok(TRIGGER_PREFIX_RE.test('<!['));
    });

    it('does not match unrelated prefix', () => {
        assert.equal(TRIGGER_PREFIX_RE.test('<div'), false);
    });

    it('does not match complete comment', () => {
        assert.equal(TRIGGER_PREFIX_RE.test('<!--[if mso]>'), false);
    });
});

// ── Hover — additional regex coverage ────────────────────────────────────────

describe('hover — additional regex detection', () => {
    it('MSO_CLOSE_RE matches non-standard revealed closer <![endif]>', () => {
        const line = '<![endif]>';
        MSO_CLOSE_RE.lastIndex = 0;
        const match = MSO_CLOSE_RE.exec(line);
        assert.ok(match, '<![endif]> should be matched by MSO_CLOSE_RE');
        assert.equal(match[0], '<![endif]>');
    });

    it('finds opener when cursor is at column 0 (start boundary)', () => {
        const line = '<!--[if mso]>';
        const result = findHoverMatch(line, 0);
        assert.ok(result, 'cursor at col 0 should detect the opener');
    });

    it('finds opener when cursor is at the last character (end boundary, inclusive)', () => {
        const line = '<!--[if mso]>';
        const end = line.length;
        const result = findHoverMatch(line, end);
        assert.ok(result, 'cursor at end boundary should detect the opener');
    });

    it('does not find opener when cursor is one past the end (exclusive)', () => {
        const line = '<!--[if mso]>';
        const result = findHoverMatch(line, line.length + 1);
        assert.equal(result, null, 'cursor beyond end should return null');
    });
});

// ── Hover — buildHover Markdown content ──────────────────────────────────────

/**
 * Pure-JS mirror of the hover.ts buildHover function.
 * Uses a plain string accumulator to verify Markdown output shape.
 *
 * @param {object} parsed - Result from parseMsoComment.
 * @param {string} raw - Raw MSO comment string.
 * @returns {string} Markdown content string.
 */
function buildHoverContent(parsed, raw) {
    const typeLabel =
        parsed.type === 'downlevel-hidden'
            ? 'downlevel-hidden (shown only in Outlook)'
            : 'downlevel-revealed (hidden in Outlook)';

    let md = `**MSO Conditional — ${typeLabel}**\n\n`;

    md += parsed.isValid
        ? `**Applies to:** ${parsed.translation}\n\n`
        : `⚠️ **Invalid syntax:** ${parsed.error ?? 'unknown error'}\n\n`;

    md += `**Condition:** \`${parsed.condition}\`\n\n`;
    md += `**Raw:** \`${raw}\``;
    return md;
}

describe('hover — buildHover Markdown content', () => {
    it('valid downlevel-hidden opener includes "Applies to:"', () => {
        const raw = '<!--[if gte mso 16]>';
        const parsed = parseMsoComment(raw);
        const content = buildHoverContent(parsed, raw);
        assert.ok(content.includes('**Applies to:**'));
    });

    it('valid downlevel-hidden opener includes type label', () => {
        const raw = '<!--[if mso]>';
        const parsed = parseMsoComment(raw);
        const content = buildHoverContent(parsed, raw);
        assert.ok(content.includes('downlevel-hidden (shown only in Outlook)'));
    });

    it('revealed opener <!--[if !mso]><!-- includes downlevel-revealed type label', () => {
        const raw = '<!--[if !mso]><!--';
        const parsed = parseMsoComment(raw);
        const content = buildHoverContent(parsed, raw);
        assert.ok(content.includes('downlevel-revealed (hidden in Outlook)'));
    });

    it('invalid opener includes "⚠️ **Invalid syntax:**"', () => {
        const raw = '<!--[if mos]>';
        const parsed = parseMsoComment(raw);
        const content = buildHoverContent(parsed, raw);
        assert.ok(content.includes('⚠️ **Invalid syntax:**'));
    });

    it('all cases include "**Raw:**"', () => {
        for (const raw of ['<!--[if mso]>', '<!--[if !mso]><!--', '<!--[if mos]>']) {
            const parsed = parseMsoComment(raw);
            const content = buildHoverContent(parsed, raw);
            assert.ok(content.includes('**Raw:**'), `"**Raw:**" missing for ${raw}`);
        }
    });
});

// ── Diagnostics — scanDocument ────────────────────────────────────────────────

describe('diagnostics-core — scanDocument', () => {
    it('returns no diagnostics for a valid matched pair', () => {
        const lines = ['<!--[if gte mso 16]>', '<p>Hello</p>', '<![endif]-->'];
        const result = scanDocument(lines);
        assert.equal(result.length, 0);
    });

    it('returns an error for an invalid condition', () => {
        const lines = ['<!--[if mso 99]>'];
        const result = scanDocument(lines);
        assert.equal(result.length, 1);
        assert.equal(result[0].severity, 'error');
        assert.ok(result[0].message.includes('99'), 'error message should mention the bad version');
    });

    it('reports error at the correct line and character range', () => {
        const lines = ['  <!--[if mso 99]>'];
        const result = scanDocument(lines);
        assert.equal(result.length, 1);
        assert.equal(result[0].line, 0);
        assert.equal(result[0].startChar, 2);
        assert.equal(result[0].endChar, 2 + '<!--[if mso 99]>'.length);
    });

    it('returns an error for a typo (mos instead of mso)', () => {
        const lines = ['<!--[if mos]>'];
        const result = scanDocument(lines);
        assert.equal(result.length, 1);
        assert.equal(result[0].severity, 'error');
        assert.ok(result[0].message.toLowerCase().includes('typo'));
    });

    it('returns a warning for an unclosed opener', () => {
        const lines = ['<!--[if mso]>', '<p>Hello</p>'];
        const result = scanDocument(lines);
        assert.equal(result.length, 1);
        assert.equal(result[0].severity, 'warning');
        assert.ok(result[0].message.includes('no matching endif'));
        assert.equal(result[0].line, 0);
    });

    it('returns a warning for a closer without matching opener', () => {
        const lines = ['<p>Hello</p>', '<![endif]-->'];
        const result = scanDocument(lines);
        assert.equal(result.length, 1);
        assert.equal(result[0].severity, 'warning');
        assert.ok(result[0].message.includes('without matching opener'));
        assert.equal(result[0].line, 1);
    });

    it('returns no diagnostics for nested valid pairs', () => {
        const lines = [
            '<!--[if gte mso 14]>',
            '<!--[if lte mso 15]>',
            '<p>2010–2013</p>',
            '<![endif]-->',
            '<![endif]-->',
        ];
        const result = scanDocument(lines);
        assert.equal(result.length, 0);
    });

    it('returns two warnings for two unclosed openers', () => {
        const lines = ['<!--[if mso]>', '<!--[if gte mso 14]>'];
        const result = scanDocument(lines);
        assert.equal(result.length, 2);
        assert.ok(result.every((d) => d.severity === 'warning'));
    });

    it('handles an empty document', () => {
        const result = scanDocument([]);
        assert.equal(result.length, 0);
    });

    it('handles a document with no MSO comments', () => {
        const lines = ['<p>Hello</p>', '<div class="foo">bar</div>'];
        const result = scanDocument(lines);
        assert.equal(result.length, 0);
    });
});

// ── Completion — snippet data ─────────────────────────────────────────────────

describe('completion — MSO_SNIPPETS shape', () => {
    it('contains exactly 7 snippets', () => {
        assert.equal(MSO_SNIPPETS.length, 7);
    });

    it('all snippet labels are unique', () => {
        const labels = MSO_SNIPPETS.map((s) => s.label);
        const unique = new Set(labels);
        assert.equal(unique.size, labels.length);
    });

    it('all snippet body values start with [if ', () => {
        for (const snippet of MSO_SNIPPETS) {
            assert.ok(
                snippet.body.startsWith('[if '),
                `snippet "${snippet.label}" body should start with "[if "`,
            );
        }
    });

    it('TRIGGER_PREFIX_RE from snippets.js matches <!--[ and <![ prefixes', () => {
        assert.ok(SNIPPETS_TRIGGER_RE.test('<!--['));
        assert.ok(SNIPPETS_TRIGGER_RE.test('<!['));
        assert.equal(SNIPPETS_TRIGGER_RE.test('<div'), false);
    });
});
