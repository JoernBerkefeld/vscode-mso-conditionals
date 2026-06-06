import * as vscode from 'vscode';
import { MsoHoverProvider } from './hover';
import { MsoCompletionProvider } from './completion';
import { diagnoseDocument } from './diagnostics';

/** Languages for which the providers are registered. */
const TARGET_LANGUAGES = ['html', 'ampscript', 'sfmc', 'ssjs', 'handlebars'];

/** Shared DiagnosticCollection — populated on open/change, cleared on close. */
let diagnosticCollection: vscode.DiagnosticCollection;

/**
 * Returns true when the user has not disabled built-in diagnostics.
 *
 * @returns {boolean} True if diagnostics are enabled.
 */
function isDiagnosticsEnabled(): boolean {
    return vscode.workspace
        .getConfiguration('msoConditionals')
        .get<boolean>('diagnostics.enable', true);
}

/**
 * Runs diagnostics on a single document and updates the collection.
 * Clears existing diagnostics for the document when the feature is disabled.
 *
 * @param document - VS Code text document to analyse.
 */
function lintDocument(document: vscode.TextDocument): void {
    if (!TARGET_LANGUAGES.includes(document.languageId)) {
        return;
    }

    if (!isDiagnosticsEnabled()) {
        diagnosticCollection.delete(document.uri);
        return;
    }

    diagnosticCollection.set(document.uri, diagnoseDocument(document));
}

/**
 * Runs diagnostics on all currently open text documents.
 * Called at activation and whenever the `msoConditionals` configuration changes.
 */
function lintAllOpen(): void {
    for (const document of vscode.workspace.textDocuments) {
        lintDocument(document);
    }
}

/**
 * Extension activation entrypoint.
 * Registers the MSO hover, completion, and diagnostics providers for all target languages.
 *
 * @param context - VS Code extension context.
 */
export function activate(context: vscode.ExtensionContext): void {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('mso-conditionals');

    const hoverProvider = vscode.languages.registerHoverProvider(
        TARGET_LANGUAGES.map((lang) => ({ language: lang })),
        new MsoHoverProvider(),
    );

    const completionProvider = vscode.languages.registerCompletionItemProvider(
        TARGET_LANGUAGES.map((lang) => ({ language: lang })),
        new MsoCompletionProvider(),
        '[', // trigger character
    );

    // Lint documents that are already open when the extension activates.
    lintAllOpen();

    context.subscriptions.push(
        diagnosticCollection,
        hoverProvider,
        completionProvider,
        vscode.workspace.onDidOpenTextDocument(lintDocument),
        vscode.workspace.onDidChangeTextDocument((e) => lintDocument(e.document)),
        vscode.workspace.onDidCloseTextDocument((doc) => diagnosticCollection.delete(doc.uri)),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('msoConditionals')) {
                lintAllOpen();
            }
        }),
    );
}

/**
 * Extension deactivation entrypoint.
 */
export function deactivate(): void {
    // DiagnosticCollection is disposed via context.subscriptions.
}
