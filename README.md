# crd2pulumi-package-tools

Shared generator for the Pulumi CRD packages in this repository.

It reads `crd2pulumi.config.mjs` from the current package directory, downloads
the configured upstream YAML bundles, keeps only `CustomResourceDefinition`
documents, writes normalized files to `crds/`, runs `crd2pulumi`, and copies the
generated TypeScript package surface back into the package.

```sh
cd ../knative-pulumi
node ../crd2pulumi-package-tools/generate.mjs
```

The generator intentionally keeps CRD download pins in package-local config
files so each package can be updated and reviewed independently.
