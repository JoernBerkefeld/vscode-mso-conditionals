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
                    return buildHover(parsed, match[0]);
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
 *
 * @param parsed - Parsed result from parseMsoComment.
 * @param raw - Raw MSO comment string.
 * @returns VS Code Hover instance.
 */
function buildHover(
    parsed: NonNullable<ReturnType<typeof parseMsoComment>>,
    raw: string,
): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    const typeLabel =
        parsed.type === 'downlevel-hidden'
            ? 'downlevel-hidden (shown only in Outlook)'
            : 'downlevel-revealed (hidden in Outlook)';

    md.appendMarkdown(`**MSO Conditional — ${typeLabel}**\n\n`);

    if (parsed.isValid) {
        md.appendMarkdown(`**Applies to:** ${parsed.translation}\n\n`);
    } else {
        md.appendMarkdown(`⚠️ **Invalid syntax:** ${parsed.error ?? 'unknown error'}\n\n`);
    }

    md.appendMarkdown(`**Condition:** \`${parsed.condition}\`\n\n`);
    md.appendMarkdown(`**Raw:** \`${raw}\``);

    return new vscode.Hover(md);
}
