#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractMetadataName,
  isCustomResourceDefinition,
  splitYamlDocuments,
} from "./generate.mjs";

if (isDirectRun()) {
  main();
}

export function main(root = process.cwd()) {
  const packageRoot = resolve(root);
  const crdsDir = join(packageRoot, process.env.CRD2PULUMI_CRDS_DIR ?? "crds");
  const samplesDir = join(packageRoot, "test", "kind");

  if (!existsSync(crdsDir) || !statSync(crdsDir).isDirectory()) {
    throw new Error(`Expected CRDs directory at ${crdsDir}`);
  }

  const crdNames = collectCustomResourceDefinitionNames(crdsDir);
  if (crdNames.length === 0) {
    throw new Error(`No CRDs found in ${crdsDir}`);
  }

  runKubectl(["apply", "--server-side", "-f", crdsDir]);

  for (const crdName of crdNames) {
    runKubectl([
      "wait",
      "--for=condition=Established",
      "--timeout=120s",
      `crd/${crdName}`,
    ]);
  }

  if (existsSync(samplesDir) && statSync(samplesDir).isDirectory()) {
    runKubectl(["apply", "--dry-run=server", "-f", samplesDir]);
  }

  console.log(`Kubernetes smoke test passed for ${crdNames.length} CRDs.`);
}

export function collectCustomResourceDefinitionNames(dir) {
  return yamlFiles(dir)
    .flatMap((filePath) => splitYamlDocumentsFromFile(filePath))
    .filter(isCustomResourceDefinition)
    .map(extractMetadataName)
    .filter(Boolean)
    .sort();
}

function splitYamlDocumentsFromFile(filePath) {
  return splitYamlDocuments(readFileSync(filePath, "utf8"));
}

function yamlFiles(dir) {
  return readdirSync(dir)
    .filter((fileName) => fileName.endsWith(".yaml") || fileName.endsWith(".yml"))
    .sort()
    .map((fileName) => join(dir, fileName));
}

function runKubectl(args) {
  const result = spawnSync("kubectl", args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function isDirectRun() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}
