import * as vscode from 'vscode';
import { scanDocument } from './diagnostics-core.js';

/**
 * Runs the pure-JS diagnostic scanner over a VS Code text document and
 * converts the results to a `vscode.Diagnostic[]` array.
 *
 * @param document - The VS Code text document to analyse.
 * @returns Array of VS Code diagnostics (may be empty).
 */
export function diagnoseDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
    }

    const raw: Array<{
        line: number;
        startChar: number;
        endChar: number;
        message: string;
        severity: 'error' | 'warning';
    }> = scanDocument(lines);

    return raw.map((d) => {
        const range = new vscode.Range(d.line, d.startChar, d.line, d.endChar);
        const severity =
            d.severity === 'error'
                ? vscode.DiagnosticSeverity.Error
                : vscode.DiagnosticSeverity.Warning;
        const diag = new vscode.Diagnostic(range, d.message, severity);
        diag.source = 'mso-conditionals';
        return diag;
    });
}
