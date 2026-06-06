import * as vscode from 'vscode';
import { TRIGGER_PREFIX_RE, MSO_SNIPPETS } from './snippets.js';

const _snippets = MSO_SNIPPETS as Array<{ label: string; body: string; description: string }>;
const _triggerPrefixRe = TRIGGER_PREFIX_RE as RegExp;

/**
 * VS Code CompletionItemProvider for MSO conditional comment snippets.
 * Triggered by the `[` character after a recognized MSO comment prefix.
 */
export class MsoCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] | undefined {
        const linePrefix = document.lineAt(position.line).text.slice(0, position.character);

        if (!_triggerPrefixRe.test(linePrefix)) {
            return undefined;
        }

        return _snippets.map((snippet) => {
            const item = new vscode.CompletionItem(
                `<!--${snippet.label}`,
                vscode.CompletionItemKind.Snippet,
            );
            item.detail = snippet.description;
            item.documentation = new vscode.MarkdownString(
                `Insert a \`${snippet.label}\` block\n\n${snippet.description}`,
            );
            // Remove the `<!--` the user already typed and replace with the snippet body
            item.insertText = new vscode.SnippetString(`<!--${snippet.body}`);
            // Replace from the start of the `<!--[` prefix so the whole token is replaced
            const prefixMatch = _triggerPrefixRe.exec(linePrefix);
            if (prefixMatch) {
                const prefixStart = position.character - prefixMatch[0].length;
                item.range = new vscode.Range(
                    position.line,
                    prefixStart,
                    position.line,
                    position.character,
                );
            }

            return item;
        });
    }
}
