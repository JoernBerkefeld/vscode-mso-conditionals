/** Five minutes. The diagnostics aggregate is handed off at most this often. */
export const DIAGNOSTICS_HANDOFF_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Portable interval handle: Node's `Timeout` (may expose `unref`) or a numeric
 * DOM/webworker timer id.
 */
export type IntervalHandle = NodeJS.Timeout | number;

/** Injected timer functions so tests can supply a fake without touching globals. */
export interface IntervalScheduler {
    setInterval(callback: () => void, ms: number): IntervalHandle;
    clearInterval(handle: IntervalHandle): void;
}

const defaultScheduler: IntervalScheduler = {
    setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
    clearInterval: (handle) => {
        globalThis.clearInterval(handle);
    },
};

/**
 * Starts a repeating interval and, where the runtime supports it, unreferences
 * the handle so the timer cannot keep a Node process or extension host alive.
 *
 * @param callback - Function invoked on each interval tick.
 * @param ms - Interval duration in milliseconds.
 * @param scheduler - Timer implementation; defaults to the platform timers.
 * @returns The created handle, already unreferenced when `unref` exists.
 */
export function startUnreferencedInterval(
    callback: () => void,
    ms: number = DIAGNOSTICS_HANDOFF_INTERVAL_MS,
    scheduler: IntervalScheduler = defaultScheduler,
): IntervalHandle {
    const handle = scheduler.setInterval(callback, ms);
    unrefIfSupported(handle);
    return handle;
}

/**
 * Calls `unref()` when the handle is a Node timeout; no-ops for numeric ids.
 *
 * @param handle - Timer returned by `setInterval`.
 */
export function unrefIfSupported(handle: IntervalHandle): void {
    if (typeof handle !== 'number' && typeof handle.unref === 'function') {
        handle.unref();
    }
}

/**
 * Clears an interval handle when one is present.
 *
 * @param handle - Handle from `startUnreferencedInterval`, or `undefined`.
 * @param scheduler - Timer implementation used to start the interval.
 */
export function clearDiagnosticsInterval(
    handle: IntervalHandle | undefined,
    scheduler: IntervalScheduler = defaultScheduler,
): void {
    if (handle !== undefined) {
        scheduler.clearInterval(handle);
    }
}
