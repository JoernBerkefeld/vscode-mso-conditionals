/**
 * Authoritative telemetry.json validation for vscode-mso-conditionals.
 *
 * Provenance (local only — no network lookups):
 *
 * 1. Field taxonomy (classification / purpose) is taken from the bundled VS Code
 *    docs at ../docs/vscode/docs/configure/telemetry.md
 *    ("Event classification" and "Event purpose"). CustomerContent is included
 *    because first-party VS Code GDPR fragments use it alongside those four
 *    documented classifications.
 *
 * 2. Catalog merge behaviour is taken from the locally installed Cursor CLI
 *    parser at
 *    %LOCALAPPDATA%/Programs/cursor/resources/app/out/vs/code/node/cliProcessMain.js
 *    (`async function w4(appRoot, extensionsPath)`). That function JSON.parses
 *    every extension-folder telemetry.json plus appRoot/telemetry-core.json and
 *    appRoot/telemetry-extensions.json, then dumps the merged object. It does
 *    not schema-validate entries — the taxonomy checks above cover that.
 *
 * 3. Packaging is checked with `@vscode/vsce ls` and a real VSIX. When Cursor
 *    is installed, the VSIX is installed into an isolated extensions dir and
 *    `cursor --telemetry` is run so this extension appears in the CLI dump.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const catalogPath = path.join(root, 'telemetry.json');
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

/** Documented in docs/vscode/docs/configure/telemetry.md plus CustomerContent. */
const CLASSIFICATIONS = new Set([
    'CallstackOrException',
    'CustomerContent',
    'EndUserPseudonymizedInformation',
    'PublicNonPersonalData',
    'SystemMetaData',
]);

/** Documented in docs/vscode/docs/configure/telemetry.md. */
const PURPOSES = new Set(['BusinessInsight', 'FeatureInsight', 'PerformanceAndHealth']);

const CURSOR_APP_ROOT = path.join(
    process.env.LOCALAPPDATA ?? '',
    'Programs',
    'cursor',
    'resources',
    'app',
);
const CURSOR_EXE = path.join(CURSOR_APP_ROOT, '..', '..', 'Cursor.exe');
const CURSOR_CLI_JS = path.join(CURSOR_APP_ROOT, 'out', 'cli.js');
const CURSOR_PARSER = path.join(CURSOR_APP_ROOT, 'out', 'vs', 'code', 'node', 'cliProcessMain.js');

/**
 * @param {object} field - GDPR field fragment.
 * @param {string} location - Dotted path for assertion messages.
 */
function validateField(field, location) {
    assert.equal(typeof field, 'object', `${location} must be an object`);
    assert.ok(field, `${location} must not be null`);
    assert.ok(
        CLASSIFICATIONS.has(field.classification),
        `${location} has an unsupported classification`,
    );
    assert.ok(PURPOSES.has(field.purpose), `${location} has an unsupported purpose`);
    assert.equal(typeof field.comment, 'string', `${location}.comment is required`);
    assert.ok(field.comment.trim().length > 0, `${location}.comment must not be empty`);
}

assert.deepEqual(Object.keys(catalog).toSorted(), ['commonProperties', 'events']);
assert.equal(typeof catalog.commonProperties, 'object');
assert.equal(typeof catalog.events, 'object');

for (const [name, field] of Object.entries(catalog.commonProperties)) {
    validateField(field, `commonProperties.${name}`);
}

assert.equal(
    catalog.commonProperties.distinct_id.classification,
    'EndUserPseudonymizedInformation',
);
assert.match(catalog.commonProperties.distinct_id.comment, /pseudonymous/i);
assert.equal(catalog.commonProperties.$process_person_profile.classification, 'SystemMetaData');
assert.equal(catalog.commonProperties.$process_person_profile.purpose, 'FeatureInsight');

for (const [eventName, event] of Object.entries(catalog.events)) {
    assert.equal(typeof event.owner, 'string', `${eventName}.owner is required`);
    assert.ok(event.owner.trim().length > 0, `${eventName}.owner must not be empty`);
    assert.equal(typeof event.comment, 'string', `${eventName}.comment is required`);
    assert.ok(event.comment.trim().length > 0, `${eventName}.comment must not be empty`);
    const properties = event.properties ?? {};
    const measures = event.measures ?? {};
    assert.equal(typeof properties, 'object', `${eventName}.properties must be an object`);
    assert.equal(typeof measures, 'object', `${eventName}.measures must be an object`);
    for (const [name, field] of Object.entries(properties)) {
        validateField(field, `${eventName}.properties.${name}`);
    }
    for (const [name, field] of Object.entries(measures)) {
        validateField(field, `${eventName}.measures.${name}`);
    }
}

/**
 * Cursor `w4(appRoot, extensionsPath)` replica. See file header for provenance.
 *
 * @param {string} appRoot - Editor resources/app path.
 * @param {string} extensionsPath - Isolated extensions directory.
 * @returns {Promise<Record<string, unknown>>} Merged catalog dump.
 */
async function mergeTelemetryCatalogs(appRoot, extensionsPath) {
    const { readdir, readFile, stat } = await import('node:fs/promises');
    const merged = Object.create(null);
    const ingest = (raw, key) => {
        merged[key] = JSON.parse(raw);
    };

    const names = await readdir(extensionsPath);
    for (const name of names) {
        const folder = path.join(extensionsPath, name);
        try {
            if (!(await stat(folder)).isDirectory()) {
                continue;
            }
        } catch {
            continue;
        }
        const entries = await readdir(folder);
        if (entries.filter((entry) => entry === 'telemetry.json').length !== 1) {
            continue;
        }
        ingest((await readFile(path.join(folder, 'telemetry.json'))).toString(), name);
    }

    ingest((await readFile(path.join(appRoot, 'telemetry-core.json'))).toString(), 'vscode-core');
    ingest(
        (await readFile(path.join(appRoot, 'telemetry-extensions.json'))).toString(),
        'vscode-extensions',
    );
    return merged;
}

if (existsSync(CURSOR_PARSER)) {
    const parserSource = readFileSync(CURSOR_PARSER, 'utf8');
    const start = parserSource.indexOf('async function w4(e,t){');
    const marker = 'JSON.stringify(i,null,4)}';
    const end = parserSource.indexOf(marker, start);
    assert.ok(start !== -1 && end > start, 'Cursor CLI telemetry merger w4() was not found');
    const merger = parserSource.slice(start, end + marker.length);
    assert.match(merger, /JSON\.parse\(n\)/);
    assert.match(merger, /h==="telemetry\.json"/);
    assert.match(merger, /telemetry-core\.json/);
    assert.match(merger, /telemetry-extensions\.json/);
    assert.match(merger, /JSON\.stringify\(i,null,4\)/);
}

/**
 * Extract a VSIX (zip) without relying on Git's GNU tar, which treats
 * Windows drive letters as remote hosts and cannot read zip archives.
 *
 * @param {string} archivePath - Path to the packaged VSIX.
 * @param {string} destDir - Destination directory.
 */
function extractVsix(archivePath, destDir) {
    if (process.platform === 'win32') {
        const tarBin = path.join(
            process.env.SystemRoot ?? String.raw`C:\Windows`,
            'System32',
            'tar.exe',
        );
        execFileSync(tarBin, ['-xf', archivePath, '-C', destDir], { stdio: 'pipe' });
        return;
    }
    try {
        execFileSync('unzip', ['-q', archivePath, '-d', destDir], { stdio: 'pipe' });
    } catch {
        execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'pipe' });
    }
}

/**
 * @param {string[]} args - Arguments forwarded to the vsce CLI.
 * @returns {string} Combined stdout.
 */
function runVsce(args) {
    const vsceArgs = ['@vscode/vsce', ...args];
    if (process.platform === 'win32') {
        return execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx', ...vsceArgs], {
            cwd: root,
            encoding: 'utf8',
            stdio: 'pipe',
        });
    }
    return execFileSync('npx', vsceArgs, {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
    });
}

/**
 * @param {string[]} args - Cursor CLI arguments.
 * @param {object} [options] - Extra execFileSync options.
 * @returns {string} Combined stdout.
 */
function runCursor(args, options = {}) {
    return execFileSync(CURSOR_EXE, [CURSOR_CLI_JS, ...args], {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 120000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_DEV: '' },
        ...options,
    });
}

const listing = runVsce(['ls', '--no-dependencies']);
assert.match(
    listing,
    /^telemetry\.json\s*$/m,
    'vsce ls --no-dependencies must list telemetry.json',
);

const tempRoot = mkdtempSync(path.join(tmpdir(), 'mso-conditionals-telemetry-'));
const extractDir = path.join(tempRoot, 'extract');
const fakeAppRoot = path.join(tempRoot, 'app-root');
const fakeExtensionsDir = path.join(tempRoot, 'extensions', 'joernberkefeld.mso-conditionals-test');
const vsixPath = path.join(tempRoot, `${packageJson.name}.vsix`);

try {
    mkdirSync(extractDir);
    mkdirSync(fakeAppRoot);
    mkdirSync(fakeExtensionsDir, { recursive: true });
    writeFileSync(path.join(fakeAppRoot, 'telemetry-core.json'), '{}\n');
    writeFileSync(path.join(fakeAppRoot, 'telemetry-extensions.json'), '{}\n');

    runVsce(['package', '--no-dependencies', '-o', vsixPath]);
    extractVsix(vsixPath, extractDir);
    const packagedCatalog = JSON.parse(
        readFileSync(path.join(extractDir, 'extension', 'telemetry.json'), 'utf8'),
    );
    assert.deepEqual(
        packagedCatalog,
        catalog,
        'Packaged telemetry.json must match the source catalogue',
    );

    writeFileSync(path.join(fakeExtensionsDir, 'telemetry.json'), JSON.stringify(catalog));
    const merged = await mergeTelemetryCatalogs(fakeAppRoot, path.dirname(fakeExtensionsDir));
    const mergedKey = Object.keys(merged).find((key) =>
        key.startsWith('joernberkefeld.mso-conditionals'),
    );
    assert.ok(mergedKey, 'Replica of Cursor w4() did not discover this extension catalogue');
    assert.deepEqual(merged[mergedKey], catalog);
    assert.deepEqual(merged['vscode-core'], {});
    assert.deepEqual(merged['vscode-extensions'], {});

    if (existsSync(CURSOR_EXE) && existsSync(CURSOR_CLI_JS)) {
        const cliExtensionsDir = path.join(tempRoot, 'cli-extensions');
        const cliUserDataDir = path.join(tempRoot, 'cli-user-data');
        mkdirSync(cliExtensionsDir);
        mkdirSync(cliUserDataDir);

        const corePath = path.join(CURSOR_APP_ROOT, 'telemetry-core.json');
        const extensionsCatalogPath = path.join(CURSOR_APP_ROOT, 'telemetry-extensions.json');
        const createdCore = [];
        for (const path of [corePath, extensionsCatalogPath]) {
            if (!existsSync(path)) {
                writeFileSync(path, '{}\n');
                createdCore.push(path);
            }
        }

        try {
            runCursor([
                '--extensions-dir',
                cliExtensionsDir,
                '--user-data-dir',
                cliUserDataDir,
                '--install-extension',
                vsixPath,
            ]);
            const output = runCursor(
                [
                    '--extensions-dir',
                    cliExtensionsDir,
                    '--user-data-dir',
                    cliUserDataDir,
                    '--telemetry',
                ],
                { maxBuffer: 32 * 1024 * 1024 },
            );
            const jsonStart = output.indexOf('{');
            assert.ok(jsonStart !== -1, 'cursor --telemetry produced no JSON');
            const discovered = JSON.parse(output.slice(jsonStart));
            const extensionKey = Object.keys(discovered).find((key) =>
                key
                    .toLowerCase()
                    .startsWith(`${packageJson.publisher}.${packageJson.name}`.toLowerCase()),
            );
            assert.ok(
                extensionKey,
                'Installed extension telemetry catalog was not discovered by cursor --telemetry',
            );
            assert.deepEqual(
                discovered[extensionKey],
                catalog,
                'cursor --telemetry did not return the packaged catalog unchanged',
            );
            // eslint-disable-next-line no-console -- report catalog validation outcome
            console.log(`Validated telemetry.json through Cursor --telemetry (${extensionKey}).`);
        } finally {
            for (const path of createdCore) {
                rmSync(path, { force: true });
            }
        }
    } else {
        // eslint-disable-next-line no-console -- report catalog validation fallback
        console.log(
            'Cursor CLI not present; validated against the local w4() replica and vsce package.',
        );
    }
} finally {
    rmSync(tempRoot, { recursive: true, force: true });
}
