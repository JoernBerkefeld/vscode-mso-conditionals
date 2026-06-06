declare module 'mso-conditional-parser' {
    export interface MsoOpenerResult {
        type: 'downlevel-hidden' | 'downlevel-revealed';
        condition: string;
        translation: string;
        isValid: boolean;
        error?: string;
    }

    export interface MsoCloserResult {
        type: 'downlevel-hidden-end' | 'downlevel-revealed-end';
        isClosing: true;
    }

    /**
     * Parses an MSO conditional comment opener.
     * Returns null if the input is not a recognizable MSO opener.
     *
     * @param str
     */
    export function parseMsoComment(str: string): MsoOpenerResult | null;

    /**
     * Parses an MSO conditional comment closer.
     * Returns null if the input is not a recognizable MSO closer.
     *
     * @param str
     */
    export function parseMsoEndComment(str: string): MsoCloserResult | null;

    /**
     * Returns true if the string is any MSO comment — opener or closer.
     *
     * @param str
     */
    export function isMsoComment(str: string): boolean;

    /**
     * Translates a raw MSO condition string into human-readable English.
     *
     * @param condition
     */
    export function translateCondition(condition: string): string;
}
