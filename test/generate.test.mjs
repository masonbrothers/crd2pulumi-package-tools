import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  extractMetadataName,
  isGeneratedMetadataEntry,
  isCustomResourceDefinition,
  patchGeneratedProviderTokens,
  sanitizeFileName,
  sha256Hex,
  splitYamlDocuments,
  stripTrailingWhitespace,
  verifySourceSha256,
} from "../generate.mjs";
import { collectCustomResourceDefinitionNames } from "../kubernetes-smoke.mjs";

test("splits multi-document YAML while ignoring empty separators", () => {
  assert.deepEqual(
    splitYamlDocuments(`
---
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
---

---
apiVersion: v1
kind: Service
`),
    [
      "apiVersion: apiextensions.k8s.io/v1\nkind: CustomResourceDefinition",
      "apiVersion: v1\nkind: Service",
    ],
  );
});

test("identifies CRD documents without matching other Kubernetes kinds", () => {
  assert.equal(
    isCustomResourceDefinition("apiVersion: apiextensions.k8s.io/v1\nkind: CustomResourceDefinition"),
    true,
  );
  assert.equal(isCustomResourceDefinition("apiVersion: v1\nkind: ConfigMap"), false);
});

test("extracts metadata.name only from the metadata block", () => {
  assert.equal(
    extractMetadataName(`
kind: CustomResourceDefinition
metadata:
  labels:
    app.kubernetes.io/name: test
  name: widgets.example.com
spec:
  group: example.com
`),
    "widgets.example.com",
  );
  assert.equal(
    extractMetadataName(`
kind: CustomResourceDefinition
spec:
  names:
    kind: Widget
metadata: {}
`),
    undefined,
  );
});

test("normalizes CRD names into deterministic filenames", () => {
  assert.equal(sanitizeFileName("Widgets.Example.COM"), "widgets.example.com");
  assert.equal(sanitizeFileName("Widget API/Preview"), "widget-api-preview");
  assert.match(sanitizeFileName("***"), /^[a-f0-9]{16}$/);
});

test("keeps generated metadata out of package source copies", () => {
  assert.equal(isGeneratedMetadataEntry(".gitattributes"), true);
  assert.equal(isGeneratedMetadataEntry(".gitignore"), true);
  assert.equal(isGeneratedMetadataEntry("package.json"), true);
  assert.equal(isGeneratedMetadataEntry("scripts"), true);
  assert.equal(isGeneratedMetadataEntry("index.ts"), false);
});

test("patches provider tokens emitted by supported crd2pulumi versions", () => {
  assert.equal(
    patchGeneratedProviderTokens(
      [
        'type !== "pulumi:providers:crds"',
        'type !== "pulumi:providers:kubernetes"',
      ].join("\n"),
      "karpenter-pulumi",
    ),
    [
      'type !== "pulumi:providers:karpenter-pulumi"',
      'type !== "pulumi:providers:karpenter-pulumi"',
    ].join("\n"),
  );
});

test("strips trailing whitespace from generated TypeScript", () => {
  assert.equal(stripTrailingWhitespace("const x = 1;  \n\t\n"), "const x = 1;\n\n");
});

test("verifies configured source sha256 checksums", () => {
  const contents = "apiVersion: apiextensions.k8s.io/v1\nkind: CustomResourceDefinition\n";
  const checksum = sha256Hex(contents);

  assert.doesNotThrow(() => verifySourceSha256("source", contents, checksum));
  assert.throws(
    () => verifySourceSha256("source", contents, "0".repeat(64)),
    /SHA-256 mismatch for source/,
  );
});

test("collects CRD names for Kubernetes establishment waits", () => {
  const dir = fileURLToPath(new URL("fixtures/crds/", import.meta.url));

  assert.deepEqual(
    collectCustomResourceDefinitionNames(dir),
    ["widgets.example.com"],
  );
});
