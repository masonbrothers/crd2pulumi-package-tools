import assert from "node:assert/strict";
import test from "node:test";

import {
  extractMetadataName,
  isCustomResourceDefinition,
  sanitizeFileName,
  splitYamlDocuments,
} from "../generate.mjs";

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
