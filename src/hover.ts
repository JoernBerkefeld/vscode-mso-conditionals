import * as vscode from 'vscode';
import { parseMsoComment, parseMsoEndComment } from 'mso-conditional-parser';

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
 * VS Code HoverProvider that translates MSO conditional comments into
 * human-readable English when the cursor hovers over them.
 */
export class MsoHoverProvider implements vscode.HoverProvider {
    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
        const line = document.lineAt(position.line).text;

        // Check openers
        MSO_OPEN_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = MSO_OPEN_RE.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                const parsed = parseMsoComment(match[0]);
                if (parsed) {
                    return buildHover(parsed);
                }
            }
        }

        // Check closers
        MSO_CLOSE_RE.lastIndex = 0;
        while ((match = MSO_CLOSE_RE.exec(line)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                const parsed = parseMsoEndComment(match[0]);
                if (parsed) {
                    const md = new vscode.MarkdownString();
                    md.isTrusted = true;
                    md.appendMarkdown(`**MSO Conditional — closer**\n\n`);
                    md.appendMarkdown(`Closes the nearest open \`[if …]\` block above.`);
                    return new vscode.Hover(md);
                }
            }
        }

        return undefined;
    }
}

/**
 * Builds a hover MarkdownString from a parsed MSO opener result.
 * Returns undefined for invalid openers so the diagnostic squiggle
 * message is the only hover shown.
 *
 * @param parsed - Parsed result from parseMsoComment.
 * @returns VS Code Hover instance, or undefined when the condition is invalid.
 */
function buildHover(
    parsed: NonNullable<ReturnType<typeof parseMsoComment>>,
): vscode.Hover | undefined {
    if (!parsed.isValid) {
        return undefined;
    }

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`**MSO Conditional** — **Visible to:** ${parsed.translation}`);

    return new vscode.Hover(md);
}
