import * as vscode from 'vscode';

const PROJECT_API_KEY = 'phc_AY9WHA5c6M9QqkaapgPqSTZ2NNZK3L3FxwkbdASsS7Ex';
const POSTHOG_HOST = 'https://eu.i.posthog.com';
const FLUSH_DEBOUNCE_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 1500;

type TelemetryValue = string | number | boolean;

interface TelemetryReporterOptions {
    extensionName: string;
    extensionVersion: string;
}

interface QueuedEvent {
    event: string;
    properties: Record<string, TelemetryValue>;
    timestamp: string;
}

/** Batches anonymous events while respecting VS Code's global telemetry consent. */
export class TelemetryReporter implements vscode.Disposable {
    private readonly commonProps: Record<string, TelemetryValue>;
    private readonly distinctId: string;
    private queue: QueuedEvent[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | undefined;
    private enabled: boolean;
    private disposed = false;
    private readonly changeSubscription: vscode.Disposable;
    private readonly activeRequests = new Map<AbortController, Promise<void>>();
    private readonly enabledListeners = new Set<(enabled: boolean) => void>();

    /** @param options - Emitting extension identity. */
    constructor(options: TelemetryReporterOptions) {
        this.distinctId = vscode.env.machineId;
        this.enabled = vscode.env.isTelemetryEnabled;
        this.commonProps = {
            extension: options.extensionName,
            extensionVersion: options.extensionVersion,
            os: process.platform,
            vscodeVersion: vscode.version,
        };
        this.changeSubscription = vscode.env.onDidChangeTelemetryEnabled((isEnabled) => {
            this.enabled = isEnabled;
            if (!isEnabled) {
                this.clearQueueAndTimer();
                this.abortActiveRequests();
            }
            for (const listener of this.enabledListeners) {
                listener(isEnabled);
            }
        });
    }

    /** @returns Whether telemetry is currently allowed. */
    isEnabled(): boolean {
        return !this.disposed && this.enabled && vscode.env.isTelemetryEnabled;
    }

    /**
     * Subscribes to telemetry-consent transitions.
     *
     * @param listener - Transition listener.
     * @returns Disposable subscription.
     */
    onDidChangeEnabled(listener: (enabled: boolean) => void): vscode.Disposable {
        this.enabledListeners.add(listener);
        return new vscode.Disposable(() => this.enabledListeners.delete(listener));
    }

    /**
     * Enqueues an event for a normal fire-and-forget send.
     *
     * @param event - Catalogued event name.
     * @param props - Flat custom properties or measures.
     */
    track(event: string, props?: Record<string, TelemetryValue>): void {
        if (!this.isEnabled()) {
            return;
        }
        this.queue.push({
            event,
            properties: {
                distinct_id: this.distinctId,
                $process_person_profile: false,
                ...this.commonProps,
                ...props,
            },
            timestamp: new Date().toISOString(),
        });
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => this.flush(), FLUSH_DEBOUNCE_MS);
        }
    }

    /** Starts a fire-and-forget POST for queued events. */
    flush(): void {
        void this.startFlush();
    }

    /**
     * Performs the final bounded drain and then tears down the reporter.
     *
     * @param timeoutMs - Maximum time to await transport completion.
     */
    async disposeAsync(timeoutMs = SHUTDOWN_TIMEOUT_MS): Promise<void> {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.clearFlushTimer();
        const finalRequest = this.startFlush(true);
        await this.withTimeout(
            Promise.allSettled([...this.activeRequests.values(), finalRequest]),
            timeoutMs,
        );
        this.abortActiveRequests();
        this.finishDisposal();
    }

    /** Synchronous VS Code Disposable teardown. */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.clearQueueAndTimer();
        this.abortActiveRequests();
        this.finishDisposal();
    }

    /**
     * @param allowDisposed - Permit the one final shutdown request.
     * @returns Promise settled when this request settles.
     */
    private startFlush(allowDisposed = false): Promise<void> {
        this.clearFlushTimer();
        if ((!allowDisposed && this.disposed) || !this.enabled || !vscode.env.isTelemetryEnabled) {
            this.queue = [];
            return Promise.resolve();
        }
        if (this.queue.length === 0 || typeof fetch !== 'function') {
            this.queue = [];
            return Promise.resolve();
        }

        const batch = this.queue;
        const controller = new AbortController();
        const body = JSON.stringify({ api_key: PROJECT_API_KEY, batch });
        let request: Promise<void>;
        try {
            request = Promise.resolve(
                fetch(`${POSTHOG_HOST}/batch/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                    signal: controller.signal,
                }),
            )
                .then(() => undefined)
                .catch(() => undefined)
                .finally(() => this.activeRequests.delete(controller));
        } catch {
            this.queue = [];
            return Promise.resolve();
        }
        this.queue = [];
        this.activeRequests.set(controller, request);
        return request;
    }

    private clearFlushTimer(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
    }

    private clearQueueAndTimer(): void {
        this.clearFlushTimer();
        this.queue = [];
    }

    private abortActiveRequests(): void {
        for (const controller of this.activeRequests.keys()) {
            controller.abort();
        }
    }

    private finishDisposal(): void {
        this.changeSubscription.dispose();
        this.enabledListeners.clear();
    }

    /**
     * @param operation - Drain operation.
     * @param timeoutMs - Maximum wait duration.
     */
    private async withTimeout(operation: Promise<unknown>, timeoutMs: number): Promise<void> {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const elapsed = new Promise<void>((resolve) => {
            timeout = setTimeout(resolve, timeoutMs);
        });
        await Promise.race([operation.then(() => undefined), elapsed]);
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

const NEIGHBOR_ALLOWLIST: Record<string, string> = {
    'neighbor.sergey-agadzhanov.ampscript': 'sergey-agadzhanov.ampscript',
    'neighbor.FiB.ssjs-vsc': 'FiB.ssjs-vsc',
    'neighbor.FiB.beautyAmp': 'FiB.beautyAmp',
    'neighbor.sfmc-language': 'joernberkefeld.sfmc-language',
    'neighbor.sfmc-devtools': 'Accenture-oss.sfmc-devtools-vscode',
    'neighbor.sfmc-data': 'joernberkefeld.sfmc-data',
    'neighbor.mso-conditionals': 'joernberkefeld.mso-conditionals',
    'neighbor.sfmc-extension-pack': 'joernberkefeld.sfmc-extension-pack',
    'neighbor.sfmc-extension-pack-plus': 'joernberkefeld.sfmc-extension-pack-expanded',
    'neighbor.markdown-preview-bitbucket-innersource':
        'joernberkefeld.markdown-preview-bitbucket-innersource',
};

/**
 * Computes passive ecosystem/co-installation booleans.
 *
 * @param selfId - Calling extension's full identifier.
 * @returns Flat ecosystem property map.
 */
export function detectEcosystem(selfId: string): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    let coInstalledAsDependency = false;
    let coInstalledInPack = false;
    for (const ext of vscode.extensions.all) {
        if (ext.id === selfId) {
            continue;
        }
        const pkg = ext.packageJSON as {
            extensionDependencies?: string[];
            extensionPack?: string[];
        };
        if (pkg.extensionDependencies?.includes(selfId)) {
            coInstalledAsDependency = true;
        }
        if (pkg.extensionPack?.includes(selfId)) {
            coInstalledInPack = true;
        }
    }
    result.coInstalledAsDependency = coInstalledAsDependency;
    result.coInstalledInPack = coInstalledInPack;

    for (const label of Object.keys(NEIGHBOR_ALLOWLIST)) {
        const fullId = NEIGHBOR_ALLOWLIST[label];
        if (fullId !== selfId) {
            result[label] = vscode.extensions.getExtension(fullId) !== undefined;
        }
    }
    return result;
}
