import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const packageDirs = ['autk-core', 'autk-map', 'autk-db', 'autk-plot', 'autk-compute', 'autk'];

function fail(message) {
  throw new Error(message);
}

function collectTargets(exportsField, targets = new Set()) {
  if (typeof exportsField === 'string') {
    targets.add(exportsField);
    return targets;
  }
  if (!exportsField || typeof exportsField !== 'object') {
    return targets;
  }
  for (const value of Object.values(exportsField)) {
    collectTargets(value, targets);
  }
  return targets;
}

for (const dir of packageDirs) {
  const packageDir = path.join(rootDir, dir);
  const manifestPath = path.join(packageDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const exportTargets = [...collectTargets(manifest.exports)];
  const directTargets = [manifest.main, manifest.module, manifest.types].filter(Boolean);
  const expectedTargets = [...new Set([...exportTargets, ...directTargets])]
    .map((target) => target.replace(/^\.\//, ''));

  for (const relativeTarget of expectedTargets) {
    const absoluteTarget = path.join(packageDir, relativeTarget);
    if (!existsSync(absoluteTarget)) {
      fail(`${dir}: missing export target ${relativeTarget}`);
    }
  }

  const packJson = execFileSync('npm', ['pack', '--json', '--dry-run'], {
    cwd: packageDir,
    encoding: 'utf8',
  });
  const [packResult] = JSON.parse(packJson);
  const packedFiles = new Set(packResult.files.map((file) => file.path));

  if (![...packedFiles].some((file) => file.startsWith('dist/'))) {
    fail(`${dir}: npm pack does not include dist/ artifacts`);
  }

  for (const relativeTarget of expectedTargets) {
    if (!packedFiles.has(relativeTarget)) {
      fail(`${dir}: npm pack is missing ${relativeTarget}`);
    }
  }

  // Workspace aliases must not leak sibling source paths into published types.
  for (const packedFile of packedFiles) {
    if (!/\.d\.(?:ts|cts|mts)$/.test(packedFile)) continue;
    const declaration = readFileSync(path.join(packageDir, packedFile), 'utf8');
    const fileDir = path.dirname(path.join(packageDir, packedFile));
    for (const [, specifier] of declaration.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(fileDir, specifier);
      if (!resolved.startsWith(packageDir + path.sep)) {
        fail(`${dir}: ${packedFile} imports ${specifier}, which is outside the published package`);
      }
    }
  }

  if (dir === 'autk-db') {
    const browserBundlePath = path.join(packageDir, 'dist/browser.js');
    const browserBundle = readFileSync(browserBundlePath, 'utf8');
    for (const forbidden of ['node:path', 'node:worker_threads', 'node:module']) {
      if (browserBundle.includes(forbidden)) {
        fail(`autk-db: browser bundle leaks ${forbidden}`);
      }
    }

    for (const asset of [
      'dist/duckdb-mvp.wasm',
      'dist/duckdb-browser-mvp.worker.js',
      'dist/duckdb-eh.wasm',
      'dist/duckdb-browser-eh.worker.js',
    ]) {
      if (!packedFiles.has(asset)) {
        fail(`autk-db: npm pack is missing ${asset}`);
      }
    }
  }
}

console.log('Package validation passed.');
