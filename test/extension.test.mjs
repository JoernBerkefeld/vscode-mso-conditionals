/**
 * Unit tests for hover and completion logic that can run without a VS Code host.
 * These tests exercise the pure logic layer: parseMsoComment is called via
 * the parser package and the regex patterns used in hover/completion are verified.
 */

import { describe, it, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { parseMsoComment, parseMsoEndComment } from 'mso-conditional-parser';
import { MSO_SNIPPETS, TRIGGER_PREFIX_RE as SNIPPETS_TRIGGER_RE } from '../src/snippets.js';
import { scanDocument } from '../src/diagnostics-core.js';
import {
    createDiagnosticsSession,
    EMITTED_EVENTS,
    EVENT_ACTIVATED,
    EVENT_DIAGNOSTICS_RUN,
    EVENT_MEASURES,
    EVENT_PROPERTIES,
} from '../src/telemetry-session.js';
import { DIAGNOSTICS_HANDOFF_INTERVAL_MS, unrefIfSupported } from '../src/diagnostics-timer.ts';

// Redirect the bare `vscode` specifier to the local stub so telemetry.ts (which imports
// `vscode`) can be loaded host-free. Must run before the dynamic import of telemetry.ts below.
register('./vscode-loader.mjs', import.meta.url);

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
/**
 * Build a host-free text-document stub for the extension integration tests.
 *
 * @param {string[]} lines - Document lines.
 * @returns {{ languageId: string, uri: string, lineCount: number, lineAt: (index: number) => { text: string } }} Stub document.
 */
function document(lines) {
    return {
        languageId: 'html',
        uri: `test:${Math.random()}`,
        lineCount: lines.length,
        lineAt: (index) => ({ text: lines[index] }),
    };
}

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
 * Returns null when the parsed result is invalid (no hover shown for invalid openers).
 *
 * @param {object} parsed - Result from parseMsoComment.
 * @returns {string|null} Markdown content string, or null for invalid openers.
 */
function buildHoverContent(parsed) {
    if (!parsed.isValid) {
        return null;
    }

    return `**MSO Conditional** — **Visible to:** ${parsed.translation}`;
}

describe('hover — buildHover Markdown content', () => {
    it('valid opener includes "Visible to:"', () => {
        const parsed = parseMsoComment('<!--[if gte mso 16]>');
        const content = buildHoverContent(parsed);
        assert.ok(content.includes('**Visible to:**'));
    });

    it('valid opener includes the translation', () => {
        const parsed = parseMsoComment('<!--[if gte mso 16]>');
        const content = buildHoverContent(parsed);
        assert.ok(content.includes('2016'));
    });

    it('valid opener heading is "**MSO Conditional**"', () => {
        const parsed = parseMsoComment('<!--[if mso]>');
        const content = buildHoverContent(parsed);
        assert.ok(content.includes('**MSO Conditional**'));
    });

    it('valid opener does not include type label', () => {
        const parsed = parseMsoComment('<!--[if mso]>');
        const content = buildHoverContent(parsed);
        assert.equal(content.includes('downlevel'), false);
    });

    it('valid opener does not include "Raw:"', () => {
        const parsed = parseMsoComment('<!--[if mso]>');
        const content = buildHoverContent(parsed);
        assert.equal(content.includes('**Raw:**'), false);
    });

    it('invalid opener returns null (no hover)', () => {
        const parsed = parseMsoComment('<!--[if mos]>');
        const content = buildHoverContent(parsed);
        assert.equal(content, null);
    });

    it('revealed opener includes correct translation', () => {
        const parsed = parseMsoComment('<!--[if !mso]><!--');
        const content = buildHoverContent(parsed);
        assert.ok(content.includes('non-Outlook'));
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
        assert.ok(result[0].message.includes("Typo detected: 'mos' should be 'mso'"));
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

// ── Telemetry — diagnostics session aggregation ───────────────────────────────

describe('telemetry-session — createDiagnosticsSession', () => {
    it('starts at zero', () => {
        const session = createDiagnosticsSession();
        assert.deepEqual(session.snapshot(), { runs: 0, totalDiagnostics: 0 });
    });

    it('aggregates multiple runs into a single summed snapshot', () => {
        const session = createDiagnosticsSession();
        session.record(3);
        session.record(0);
        session.record(2);
        // Three lint runs collapse to ONE session total, not three events.
        assert.deepEqual(session.snapshot(), { runs: 3, totalDiagnostics: 5 });
    });

    it('snapshot is a stable copy, not a live reference', () => {
        const session = createDiagnosticsSession();
        session.record(1);
        const first = session.snapshot();
        session.record(4);
        assert.deepEqual(first, { runs: 1, totalDiagnostics: 1 });
        assert.deepEqual(session.snapshot(), { runs: 2, totalDiagnostics: 5 });
    });

    it('take hands off one aggregate and resets counters', () => {
        const session = createDiagnosticsSession();
        session.record(2);
        session.record(1);
        assert.deepEqual(session.take(), { runs: 2, totalDiagnostics: 3 });
        assert.deepEqual(session.snapshot(), { runs: 0, totalDiagnostics: 0 });
    });
});

// ── Telemetry — event catalogue matches telemetry.json ────────────────────────

describe('telemetry — event names match telemetry.json catalogue', () => {
    const catalogue = JSON.parse(
        readFileSync(new URL('../telemetry.json', import.meta.url), 'utf8'),
    );
    const commonProperties = [
        'extension',
        'extensionVersion',
        'os',
        'vscodeVersion',
        'distinct_id',
        '$process_person_profile',
    ];

    it('uses the recognized top-level commonProperties/events structure', () => {
        assert.deepEqual(Object.keys(catalogue).toSorted(), ['commonProperties', 'events']);
        assert.deepEqual(
            Object.keys(catalogue.commonProperties).toSorted(),
            commonProperties.toSorted(),
        );
    });

    it('catalogues every runtime event and no unused event', () => {
        assert.deepEqual(Object.keys(catalogue.events).toSorted(), EMITTED_EVENTS.toSorted());
    });

    it('matches runtime event properties and measures bidirectionally', () => {
        for (const eventName of EMITTED_EVENTS) {
            assert.deepEqual(
                Object.keys(catalogue.events[eventName].properties ?? {}).toSorted(),
                EVENT_PROPERTIES[eventName].toSorted(),
            );
            assert.deepEqual(
                Object.keys(catalogue.events[eventName].measures ?? {}).toSorted(),
                EVENT_MEASURES[eventName].toSorted(),
            );
        }
    });

    it('classifies distinct_id as EndUserPseudonymizedInformation', () => {
        const field = catalogue.commonProperties.distinct_id;
        assert.equal(field.classification, 'EndUserPseudonymizedInformation');
        assert.match(
            field.comment,
            /pseudonymous/i,
            'comment must explain that distinct_id is a pseudonymous identifier',
        );
        assert.match(
            field.comment,
            /without identifying who the user is/i,
            'comment must explain that the identifier cannot identify the person',
        );
    });
});

/**
 * Builds an installed but inactive extension fixture.
 *
 * @param {string} id - Exact extension identifier.
 * @param {object} packageJSON - Optional dependency and pack declarations.
 * @returns {object} Registry entry.
 */
function installed(id, packageJSON = {}) {
    return { id, isActive: false, packageJSON };
}

describe('telemetry — real ecosystem detector', () => {
    const selfId = 'joernberkefeld.mso-conditionals';
    const requestedNeighbors = {
        'neighbor.xnerd.ampscript-language': 'xnerd.ampscript-language',
        'neighbor.esbenp.prettier-vscode': 'esbenp.prettier-vscode',
        'neighbor.dbaeumer.vscode-eslint': 'dbaeumer.vscode-eslint',
        'neighbor.MarketingThibs.ampscriptsnippets': 'MarketingThibs.ampscriptsnippets',
        'neighbor.markdown-preview-bitbucket-innersource':
            'joernberkefeld.markdown-preview-bitbucket-innersource',
    };
    let detectEcosystem;
    let stub;
    let originalAll;
    let originalGetExtension;

    before(async () => {
        ({ detectEcosystem } = await import('../src/telemetry.ts'));
        stub = await import('./vscode-stub.mjs');
    });

    beforeEach(() => {
        originalAll = stub.extensions.all;
        originalGetExtension = stub.extensions.getExtension;
        stub.extensions.all = [];
    });

    afterEach(() => {
        stub.extensions.all = originalAll;
        stub.extensions.getExtension = originalGetExtension;
    });

    for (const presentIds of [
        [],
        Object.values(requestedNeighbors),
        ...Object.values(requestedNeighbors).map((id) => [id]),
    ]) {
        it(`maps installed inactive neighbors exactly: ${presentIds.join(', ') || 'none'}`, () => {
            stub.extensions.all = presentIds.map((id) => installed(id));
            const result = detectEcosystem(selfId);
            for (const [key, id] of Object.entries(requestedNeighbors)) {
                assert.equal(result[key], presentIds.includes(id), key);
            }
            assert.deepEqual(
                Object.keys(result).toSorted(),
                EVENT_PROPERTIES[EVENT_ACTIVATED].toSorted(),
            );
            assert.ok(Object.values(result).every((value) => typeof value === 'boolean'));
            assert.equal(result.coInstalledAsDependency, false);
            assert.equal(result.coInstalledInPack, false);
        });
    }

    it('looks up exact allowlisted IDs without leaking unknown extensions', () => {
        const lookups = [];
        stub.extensions.all = [installed('unknown.private-extension')];
        stub.extensions.getExtension = (id) => {
            lookups.push(id);
            return originalGetExtension(id);
        };
        const result = detectEcosystem(selfId);
        for (const id of Object.values(requestedNeighbors)) {
            assert.ok(lookups.includes(id), id);
        }
        assert.ok(!lookups.includes(selfId));
        assert.ok(!lookups.includes('unknown.private-extension'));
        assert.ok(!JSON.stringify(result).includes('unknown.private-extension'));
        assert.ok(Object.values(result).every((value) => value === false));
    });

    it('excludes self from neighbor, dependency, and pack signals', () => {
        stub.extensions.all = [
            installed(selfId, { extensionDependencies: [selfId], extensionPack: [selfId] }),
        ];
        const result = detectEcosystem(selfId);
        assert.equal(Object.hasOwn(result, 'neighbor.mso-conditionals'), false);
        assert.equal(result.coInstalledAsDependency, false);
        assert.equal(result.coInstalledInPack, false);
    });

    it('preserves existing neighbor and independent dependency/pack detection', () => {
        for (const packageJSON of [
            { extensionDependencies: [selfId] },
            { extensionPack: [selfId] },
            { extensionDependencies: [selfId], extensionPack: [selfId] },
        ]) {
            stub.extensions.all = [
                installed('joernberkefeld.sfmc-extension-pack', packageJSON),
                installed('sergey-agadzhanov.ampscript'),
            ];
            const result = detectEcosystem(selfId);
            assert.equal(result['neighbor.sfmc-extension-pack'], true);
            assert.equal(result['neighbor.sergey-agadzhanov.ampscript'], true);
            assert.equal(
                result.coInstalledAsDependency,
                Boolean(packageJSON.extensionDependencies),
            );
            assert.equal(result.coInstalledInPack, Boolean(packageJSON.extensionPack));
        }
    });

    it('classifies every requested presence property as system metadata for feature insight', () => {
        const catalogue = JSON.parse(
            readFileSync(new URL('../telemetry.json', import.meta.url), 'utf8'),
        );
        for (const key of Object.keys(requestedNeighbors)) {
            const field = catalogue.events[EVENT_ACTIVATED].properties[key];
            assert.equal(field.classification, 'SystemMetaData');
            assert.equal(field.purpose, 'FeatureInsight');
        }
    });
});

// ── Telemetry — reporter respects VS Code telemetry setting ───────────────────

describe('telemetry — TelemetryReporter consent gate', () => {
    let TelemetryReporter;
    let stub;
    let sentBatches;
    let originalFetch;

    before(async () => {
        // Loaded via the registered vscode loader; telemetry.ts imports the stub.
        ({ TelemetryReporter } = await import('../src/telemetry.ts'));
        stub = await import('./vscode-stub.mjs');
    });

    beforeEach(() => {
        // Reset consent to enabled and capture outgoing POSTs instead of hitting the network.
        stub.__setTelemetryEnabled(true);
        sentBatches = [];
        originalFetch = globalThis.fetch;
        globalThis.fetch = (_url, options) => {
            sentBatches.push(JSON.parse(options.body).batch);
            return Promise.resolve({ ok: true });
        };
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    /**
     * Builds a reporter with the fixed test identity.
     *
     * @returns {object} A fresh TelemetryReporter instance.
     */
    function makeReporter() {
        return new TelemetryReporter({
            extensionName: 'mso-conditionals',
            extensionVersion: '9.9.9',
        });
    }

    it('sends a batch when telemetry is enabled', async () => {
        const reporter = makeReporter();
        reporter.track(EVENT_ACTIVATED, { coInstalledInPack: false });
        await reporter.disposeAsync();
        assert.equal(sentBatches.length, 1);
        assert.equal(sentBatches[0][0].event, EVENT_ACTIVATED);
    });

    it('no-ops (never POSTs) when telemetry is disabled at construction', () => {
        stub.__setTelemetryEnabled(false);
        const reporter = makeReporter();
        reporter.track(EVENT_ACTIVATED);
        reporter.track(EVENT_DIAGNOSTICS_RUN, { runs: 1, totalDiagnostics: 2 });
        reporter.flush();
        reporter.dispose();
        assert.equal(sentBatches.length, 0);
    });

    it('re-checks on onDidChangeTelemetryEnabled: drops queued events when turned off', () => {
        const reporter = makeReporter();
        // Enqueue while enabled, then turn telemetry OFF before the flush fires.
        reporter.track(EVENT_ACTIVATED);
        stub.__setTelemetryEnabled(false);
        reporter.flush();
        reporter.dispose();
        assert.equal(sentBatches.length, 0, 'queued events must be dropped when telemetry is off');
    });

    it('re-checks on onDidChangeTelemetryEnabled: resumes sending when turned back on', () => {
        const reporter = makeReporter();
        stub.__setTelemetryEnabled(false);
        reporter.track(EVENT_ACTIVATED); // dropped
        stub.__setTelemetryEnabled(true);
        reporter.track(EVENT_DIAGNOSTICS_RUN, { runs: 2, totalDiagnostics: 3 });
        reporter.flush();
        reporter.dispose();
        assert.equal(sentBatches.length, 1);
        assert.equal(sentBatches[0][0].event, EVENT_DIAGNOSTICS_RUN);
    });

    it('sends events anonymously (machineId + $process_person_profile:false)', () => {
        const reporter = makeReporter();
        reporter.track(EVENT_ACTIVATED);
        reporter.flush();
        reporter.dispose();
        const props = sentBatches[0][0].properties;
        assert.equal(props.$process_person_profile, false);
        assert.equal(props.distinct_id, 'test-machine-id');
        assert.equal(props.extension, 'mso-conditionals');
    });

    it('aborts a held in-flight request when telemetry is disabled', async () => {
        const reporter = makeReporter();
        let observedSignal;
        globalThis.fetch = (_url, options) => {
            observedSignal = options.signal;
            return new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('aborted')));
            });
        };
        reporter.track(EVENT_ACTIVATED);
        reporter.flush();
        assert.equal(observedSignal.aborted, false);
        stub.__setTelemetryEnabled(false);
        assert.equal(observedSignal.aborted, true);
        reporter.dispose();
    });

    it('awaits the final fetch before disposeAsync resolves', async () => {
        const reporter = makeReporter();
        let release;
        let resolved = false;
        globalThis.fetch = () =>
            new Promise((resolve) => {
                release = () => resolve({ ok: true });
            });
        reporter.track(EVENT_ACTIVATED);
        const disposal = reporter.disposeAsync(1000).then(() => {
            resolved = true;
        });
        await Promise.resolve();
        assert.equal(resolved, false);
        release();
        await disposal;
        assert.equal(resolved, true);
    });

    it('can be disposed twice without sending twice', async () => {
        const reporter = makeReporter();
        reporter.track(EVENT_ACTIVATED);
        await reporter.disposeAsync();
        await reporter.disposeAsync();
        reporter.dispose();
        assert.equal(sentBatches.length, 1);
    });
});

// ── Telemetry — real extension lifecycle and diagnostics aggregation ──────────

describe('telemetry — extension integration', () => {
    let stub;
    let extension;
    let sentBatches;
    let originalFetch;
    let context;

    before(async () => {
        stub = await import('./vscode-stub.mjs');
        extension = await import('../src/extension.ts');
    });

    beforeEach(() => {
        stub.__reset();
        sentBatches = [];
        originalFetch = globalThis.fetch;
        globalThis.fetch = (_url, options) => {
            sentBatches.push(JSON.parse(options.body).batch);
            return Promise.resolve({ ok: true });
        };
        context = {
            extension: { id: 'joernberkefeld.mso-conditionals', packageJSON: { version: '9.9.9' } },
            subscriptions: [],
        };
    });

    afterEach(async () => {
        await extension.deactivate();
        for (const disposable of context.subscriptions) {
            disposable.dispose();
        }
        globalThis.fetch = originalFetch;
    });

    it('activates, lints through the real path, and awaits one final aggregate fetch', async () => {
        stub.__setTextDocuments([document(['<!--[if mso 99]>'])]);
        extension.activate(context);
        await extension.deactivate();
        const events = sentBatches.flat();
        const activation = events.find((event) => event.event === EVENT_ACTIVATED);
        const catalogue = JSON.parse(
            readFileSync(new URL('../telemetry.json', import.meta.url), 'utf8'),
        );
        assert.deepEqual(
            Object.keys(activation.properties).toSorted(),
            [
                'distinct_id',
                '$process_person_profile',
                'extension',
                'extensionVersion',
                'os',
                'vscodeVersion',
                ...EVENT_PROPERTIES[EVENT_ACTIVATED],
            ].toSorted(),
        );
        for (const key of Object.keys(catalogue.events[EVENT_ACTIVATED].properties)) {
            assert.equal(typeof activation.properties[key], 'boolean', key);
        }
        assert.equal(events.filter((event) => event.event === EVENT_DIAGNOSTICS_RUN).length, 1);
        const diagnosticEvent = events.find((event) => event.event === EVENT_DIAGNOSTICS_RUN);
        assert.equal(diagnosticEvent.properties.runs, 1);
        assert.equal(diagnosticEvent.properties.totalDiagnostics, 1);
    });

    it('excludes and resets aggregates across enabled-disabled-enabled transitions', async () => {
        const badDocument = document(['<!--[if mso 99]>']);
        extension.activate(context);
        stub.__fireChangeDocument(badDocument);
        stub.__setTelemetryEnabled(false);
        stub.__fireChangeDocument(badDocument);
        stub.__setTelemetryEnabled(true);
        stub.__fireChangeDocument(badDocument);
        await extension.deactivate();
        const diagnosticEvents = sentBatches
            .flat()
            .filter((event) => event.event === EVENT_DIAGNOSTICS_RUN);
        assert.equal(diagnosticEvents.length, 1);
        assert.equal(diagnosticEvents[0].properties.runs, 1);
        assert.equal(diagnosticEvents[0].properties.totalDiagnostics, 1);
    });

    it('periodically hands off one aggregate and resets before final deactivate', async () => {
        const badDocument = document(['<!--[if mso 99]>']);
        extension.activate(context);
        stub.__fireChangeDocument(badDocument);
        stub.__fireChangeDocument(badDocument);
        extension.flushDiagnosticsAggregate();
        stub.__fireChangeDocument(badDocument);
        await extension.deactivate();
        const diagnosticEvents = sentBatches
            .flat()
            .filter((event) => event.event === EVENT_DIAGNOSTICS_RUN);
        assert.equal(diagnosticEvents.length, 2);
        assert.deepEqual(
            diagnosticEvents.map((event) => [
                event.properties.runs,
                event.properties.totalDiagnostics,
            ]),
            [
                [2, 2],
                [1, 1],
            ],
        );
    });

    it('starts one 300000ms unreferenced interval and clears it once on deactivate', async () => {
        const created = [];
        const handle = {
            unrefCount: 0,
            unref() {
                this.unrefCount += 1;
            },
        };
        let clearCount = 0;
        extension.activate(context, {
            setInterval(callback, ms) {
                created.push({ callback, ms });
                return handle;
            },
            clearInterval(timer) {
                assert.equal(timer, handle);
                clearCount += 1;
            },
        });
        assert.equal(created.length, 1, 'interval must be created once');
        assert.equal(created[0].ms, 300000);
        assert.equal(created[0].ms, DIAGNOSTICS_HANDOFF_INTERVAL_MS);
        assert.equal(handle.unrefCount, 1, 'unref must be called once where available');
        await extension.deactivate();
        assert.equal(clearCount, 1, 'interval must be cleared exactly once at deactivate');
        for (const disposable of context.subscriptions) {
            disposable.dispose();
        }
        assert.equal(
            clearCount,
            1,
            'disposing subscriptions must not clear the interval a second time',
        );
    });

    it('accepts a numeric timer id with no unref and still clears once', async () => {
        const created = [];
        let clearCount = 0;
        const numericHandle = 42;
        extension.activate(context, {
            setInterval(callback, ms) {
                created.push({ callback, ms });
                return numericHandle;
            },
            clearInterval(timer) {
                assert.equal(timer, numericHandle);
                clearCount += 1;
            },
        });
        assert.equal(created.length, 1);
        assert.equal(created[0].ms, 300000);
        await extension.deactivate();
        assert.equal(clearCount, 1);
    });
});

describe('diagnostics-timer — unref portability', () => {
    it('calls unref once on a Node-style timeout handle', () => {
        let unrefCount = 0;
        unrefIfSupported({
            unref() {
                unrefCount += 1;
            },
        });
        assert.equal(unrefCount, 1);
    });

    it('no-ops for a numeric DOM-style timer id', () => {
        unrefIfSupported(123);
    });
});
