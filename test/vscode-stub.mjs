const telemetryListeners = new Set();
const openListeners = new Set();
const changeDocumentListeners = new Set();
const closeListeners = new Set();
const configurationListeners = new Set();

export const env = {
    machineId: 'test-machine-id',
    isTelemetryEnabled: true,
    onDidChangeTelemetryEnabled(listener) {
        telemetryListeners.add(listener);
        return new Disposable(() => telemetryListeners.delete(listener));
    },
};

export const version = '1.101.0-test';

export class Disposable {
    constructor(callOnDispose) {
        this.callOnDispose = callOnDispose;
        this.disposed = false;
    }
    dispose() {
        if (!this.disposed) {
            this.disposed = true;
            this.callOnDispose?.();
        }
    }
}

export class Range {
    constructor(startLine, startCharacter, endLine, endCharacter) {
        Object.assign(this, { startLine, startCharacter, endLine, endCharacter });
    }
}

export const DiagnosticSeverity = { Error: 0, Warning: 1 };

export class Diagnostic {
    constructor(range, message, severity) {
        Object.assign(this, { range, message, severity });
    }
}

export const extensions = {
    all: [],
    getExtension() {
        return undefined;
    },
};

export const workspace = {
    textDocuments: [],
    getConfiguration() {
        return { get: (_key, fallback) => fallback };
    },
    onDidOpenTextDocument(listener) {
        openListeners.add(listener);
        return new Disposable(() => openListeners.delete(listener));
    },
    onDidChangeTextDocument(listener) {
        changeDocumentListeners.add(listener);
        return new Disposable(() => changeDocumentListeners.delete(listener));
    },
    onDidCloseTextDocument(listener) {
        closeListeners.add(listener);
        return new Disposable(() => closeListeners.delete(listener));
    },
    onDidChangeConfiguration(listener) {
        configurationListeners.add(listener);
        return new Disposable(() => configurationListeners.delete(listener));
    },
};

export const languages = {
    createDiagnosticCollection() {
        const values = new Map();
        return {
            values,
            set: (uri, diagnostics) => values.set(uri, diagnostics),
            delete: (uri) => values.delete(uri),
            dispose: () => values.clear(),
        };
    },
    registerHoverProvider() {
        return new Disposable();
    },
    registerCompletionItemProvider() {
        return new Disposable();
    },
};

export class Hover {}
export class MarkdownString {}
export class CompletionItem {}
export const CompletionItemKind = {};
export class SnippetString {}

export function __setTelemetryEnabled(enabled) {
    env.isTelemetryEnabled = enabled;
    for (const listener of telemetryListeners) {
        listener(enabled);
    }
}

export function __setTextDocuments(documents) {
    workspace.textDocuments = documents;
}

export function __fireChangeDocument(document) {
    for (const listener of changeDocumentListeners) {
        listener({ document });
    }
}

export function __reset() {
    env.isTelemetryEnabled = true;
    workspace.textDocuments = [];
    extensions.all = [];
    openListeners.clear();
    changeDocumentListeners.clear();
    closeListeners.clear();
    configurationListeners.clear();
}
