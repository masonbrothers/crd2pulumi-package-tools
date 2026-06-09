#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (isDirectRun()) {
  main();
}

export function main(root = process.cwd()) {
  const packageRoot = resolve(root);
  const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  const workspace = mkdtempSync(join(tmpdir(), "pulumi-package-smoke-"));

  try {
    const tarballPath = packPackage(packageRoot, workspace);
    const extractedPackage = join(workspace, "package");
    run("tar", ["-xzf", tarballPath, "-C", workspace]);

    const consumerRoot = join(workspace, "consumer");
    const nodeModules = join(consumerRoot, "node_modules");
    mkdirSync(nodeModules, { recursive: true });
    installPackage(packageJson.name, extractedPackage, nodeModules);
    symlinkPeerDependencies(packageRoot, packageJson, nodeModules);

    const smokeContext = {
      exports: packageJson.exports ?? { ".": { require: packageJson.main, import: packageJson.main } },
      packageName: packageJson.name,
    };

    writeFileSync(
      join(consumerRoot, "consumer.cjs"),
      `const assert = require("node:assert/strict");\n` +
        `const context = ${JSON.stringify(smokeContext, null, 2)};\n` +
        `for (const [subpath, target] of Object.entries(context.exports)) {\n` +
        `  if (!target || typeof target !== "object" || !target.require) continue;\n` +
        `  const specifier = subpath === "." ? context.packageName : context.packageName + subpath.slice(1);\n` +
        `  const loaded = require(specifier);\n` +
        `  assert.ok(loaded && typeof loaded === "object", specifier);\n` +
        `}\n`,
    );
    writeFileSync(
      join(consumerRoot, "consumer.mjs"),
      `import assert from "node:assert/strict";\n` +
        `const context = ${JSON.stringify(smokeContext, null, 2)};\n` +
        `for (const [subpath, target] of Object.entries(context.exports)) {\n` +
        `  if (!target || typeof target !== "object" || !target.import) continue;\n` +
        `  const specifier = subpath === "." ? context.packageName : context.packageName + subpath.slice(1);\n` +
        `  const loaded = await import(specifier);\n` +
        `  assert.ok(loaded && typeof loaded === "object", specifier);\n` +
        `}\n`,
    );

    run("node", ["consumer.cjs"], { cwd: consumerRoot });
    run("node", ["consumer.mjs"], { cwd: consumerRoot });
    console.log(`Packed package smoke test passed for ${packageJson.name}.`);
  } finally {
    if (!process.env.KEEP_PACK_SMOKE) {
      rmSync(workspace, { force: true, recursive: true });
    }
  }
}

function packPackage(packageRoot, destination) {
  const result = spawnSync("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: packageRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: join(destination, ".npm-cache"),
    },
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const packResult = JSON.parse(result.stdout)[0];
  const filename = packResult.filename;
  return isAbsolute(filename) ? filename : join(destination, basename(filename));
}

function installPackage(packageName, source, nodeModules) {
  const target = join(nodeModules, ...packageName.split("/"));
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}

function symlinkPeerDependencies(packageRoot, packageJson, nodeModules) {
  for (const peerName of Object.keys(packageJson.peerDependencies ?? {})) {
    const source = join(packageRoot, "node_modules", ...peerName.split("/"));
    const target = join(nodeModules, ...peerName.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(source, target, "dir");
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isDirectRun() {
  return (
    process.argv[1] &&
    realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))
  );
}
