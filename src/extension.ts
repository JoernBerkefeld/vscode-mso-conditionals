import * as vscode from 'vscode';
import { MsoHoverProvider } from './hover';
import { MsoCompletionProvider } from './completion';
import { diagnoseDocument } from './diagnostics';
import { TelemetryReporter, detectEcosystem } from './telemetry';
import {
    createDiagnosticsSession,
    EVENT_ACTIVATED,
    EVENT_DIAGNOSTICS_RUN,
} from './telemetry-session.js';
import {
    DIAGNOSTICS_HANDOFF_INTERVAL_MS,
    clearDiagnosticsInterval,
    startUnreferencedInterval,
    type IntervalHandle,
    type IntervalScheduler,
} from './diagnostics-timer';

const TARGET_LANGUAGES = ['html', 'ampscript', 'sfmc', 'ssjs', 'handlebars'];

let diagnosticCollection: vscode.DiagnosticCollection;
let reporter: TelemetryReporter | undefined;
let diagnosticsSession = createDiagnosticsSession();
let diagnosticsTimer: IntervalHandle | undefined;
let diagnosticsTimerScheduler: IntervalScheduler | undefined;
let telemetryConsentSubscription: vscode.Disposable | undefined;

/** @returns True if built-in diagnostics are enabled. */
function isDiagnosticsEnabled(): boolean {
    return vscode.workspace
        .getConfiguration('msoConditionals')
        .get<boolean>('diagnostics.enable', true);
}

/** @param document - VS Code text document to analyse. */
function lintDocument(document: vscode.TextDocument): void {
    if (!TARGET_LANGUAGES.includes(document.languageId)) {
        return;
    }
    if (!isDiagnosticsEnabled()) {
        diagnosticCollection.delete(document.uri);
        return;
    }

    const diagnostics = diagnoseDocument(document);
    diagnosticCollection.set(document.uri, diagnostics);
    if (reporter?.isEnabled()) {
        diagnosticsSession.record(diagnostics.length);
    }
}

/** Lints all currently open documents. */
function lintAllOpen(): void {
    for (const document of vscode.workspace.textDocuments) {
        lintDocument(document);
    }
}

/** Hands a meaningful aggregate to the reporter and resets counters after handoff. */
export function flushDiagnosticsAggregate(): void {
    if (!reporter?.isEnabled()) {
        return;
    }
    const totals = diagnosticsSession.snapshot();
    if (totals.runs === 0) {
        return;
    }
    reporter.track(EVENT_DIAGNOSTICS_RUN, diagnosticsSession.take());
}

/**
 * Stops the diagnostics handoff interval exactly once.
 */
function stopDiagnosticsTimer(): void {
    if (diagnosticsTimer === undefined) {
        return;
    }
    clearDiagnosticsInterval(diagnosticsTimer, diagnosticsTimerScheduler);
    diagnosticsTimer = undefined;
    diagnosticsTimerScheduler = undefined;
}

/**
 * Extension activation entrypoint.
 *
 * @param context - VS Code extension context.
 * @param timers - Optional timer seam for tests; production uses platform timers.
 */
export function activate(context: vscode.ExtensionContext, timers?: IntervalScheduler): void {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('mso-conditionals');
    diagnosticsSession = createDiagnosticsSession();
    reporter = new TelemetryReporter({
        extensionName: 'mso-conditionals',
        extensionVersion: context.extension.packageJSON.version,
    });
    telemetryConsentSubscription = reporter.onDidChangeEnabled((enabled) => {
        if (!enabled) {
            diagnosticsSession.reset();
        }
    });
    context.subscriptions.push(reporter, telemetryConsentSubscription);
    reporter.track(EVENT_ACTIVATED, detectEcosystem(context.extension.id));

    const hoverProvider = vscode.languages.registerHoverProvider(
        TARGET_LANGUAGES.map((language) => ({ language })),
        new MsoHoverProvider(),
    );
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        TARGET_LANGUAGES.map((language) => ({ language })),
        new MsoCompletionProvider(),
        '[',
    );

    lintAllOpen();
    diagnosticsTimerScheduler = timers;
    diagnosticsTimer = startUnreferencedInterval(
        flushDiagnosticsAggregate,
        DIAGNOSTICS_HANDOFF_INTERVAL_MS,
        timers,
    );

    context.subscriptions.push(
        diagnosticCollection,
        hoverProvider,
        completionProvider,
        vscode.workspace.onDidOpenTextDocument(lintDocument),
        vscode.workspace.onDidChangeTextDocument((event) => lintDocument(event.document)),
        vscode.workspace.onDidCloseTextDocument((document) =>
            diagnosticCollection.delete(document.uri),
        ),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('msoConditionals')) {
                lintAllOpen();
            }
        }),
        new vscode.Disposable(() => {
            stopDiagnosticsTimer();
        }),
    );
}

/** Performs a final aggregate handoff and bounded transport drain. */
export async function deactivate(): Promise<void> {
    stopDiagnosticsTimer();
    if (!reporter) {
        return;
    }
    flushDiagnosticsAggregate();
    const currentReporter = reporter;
    reporter = undefined;
    telemetryConsentSubscription?.dispose();
    telemetryConsentSubscription = undefined;
    await currentReporter.disposeAsync();
}
