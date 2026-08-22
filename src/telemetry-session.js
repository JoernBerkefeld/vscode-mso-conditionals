/** Event fired once per session when the extension activates. */
export const EVENT_ACTIVATED = 'extension.activated';

/** Event carrying aggregate diagnostics totals. */
export const EVENT_DIAGNOSTICS_RUN = 'diagnostics.run';

/** Full list of events emitted by this extension. */
export const EMITTED_EVENTS = [EVENT_ACTIVATED, EVENT_DIAGNOSTICS_RUN];

/** Runtime custom properties emitted for each event. */
export const EVENT_PROPERTIES = {
    [EVENT_ACTIVATED]: [
        'coInstalledAsDependency',
        'coInstalledInPack',
        'neighbor.sergey-agadzhanov.ampscript',
        'neighbor.FiB.ssjs-vsc',
        'neighbor.FiB.beautyAmp',
        'neighbor.sfmc-language',
        'neighbor.sfmc-devtools',
        'neighbor.sfmc-data',
        'neighbor.sfmc-extension-pack',
        'neighbor.sfmc-extension-pack-plus',
        'neighbor.markdown-preview-bitbucket-innersource',
    ],
    [EVENT_DIAGNOSTICS_RUN]: [],
};

/** Runtime numeric measures emitted for each event. */
export const EVENT_MEASURES = {
    [EVENT_ACTIVATED]: [],
    [EVENT_DIAGNOSTICS_RUN]: ['runs', 'totalDiagnostics'],
};

/**
 * Creates mutable aggregate diagnostics counters.
 *
 * @returns {{ record: (count: number) => void, snapshot: () => { runs: number, totalDiagnostics: number }, take: () => { runs: number, totalDiagnostics: number }, reset: () => void }} Counter API.
 */
export function createDiagnosticsSession() {
    let runs = 0;
    let totalDiagnostics = 0;

    return {
        /** @param {number} count - Diagnostics produced by one lint run. */
        record(count) {
            runs += 1;
            totalDiagnostics += count;
        },
        /** @returns {{ runs: number, totalDiagnostics: number }} Current totals. */
        snapshot() {
            return { runs, totalDiagnostics };
        },
        /**
         * Hands off current totals and starts a fresh aggregate.
         *
         * @returns {{ runs: number, totalDiagnostics: number }} Totals before reset.
         */
        take() {
            const totals = { runs, totalDiagnostics };
            runs = 0;
            totalDiagnostics = 0;
            return totals;
        },
        /** Discards all current totals. */
        reset() {
            runs = 0;
            totalDiagnostics = 0;
        },
    };
}
