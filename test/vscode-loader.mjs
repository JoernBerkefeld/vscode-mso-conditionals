/**
 * Module-resolution hook that redirects the bare `vscode` specifier to the local
 * test stub, so telemetry.ts can be imported under `node --test` without a VS Code
 * host. Node's built-in TypeScript type-stripping handles the .ts source itself.
 */

/** Absolute URL of the vscode stub, resolved relative to this loader. */
const STUB_URL = new URL('vscode-stub.mjs', import.meta.url).href;

/**
 * Resolve hook: map `vscode` to the stub; delegate everything else.
 *
 * @param {string} specifier - The import specifier being resolved.
 * @param {object} context - Resolution context.
 * @param {(specifier: string, context: object) => unknown} nextResolve - Default resolver.
 * @returns {unknown} Resolution result.
 */
export function resolve(specifier, context, nextResolve) {
    if (specifier === 'vscode') {
        return { url: STUB_URL, shortCircuit: true };
    }
    if (specifier.startsWith('./') && !/\.[a-z]+$/i.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
}
