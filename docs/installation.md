# Installation and Updates

## Build a portable Dynamic Package

```bash
npm run build
```

The generated `dist/cordis-package.json` is a direct parameter object for `cordis_define`.

## First installation

Ask a Cordis-capable DSH Agent to:

1. inspect current Host and Client providers;
2. read `dist/cordis-package.json`;
3. call `cordis_define` with its `plugin`, `name`, `purpose`, and `code` fields;
4. call `cordis_run` with mode `run` and the returned IDs;
5. wait for final Client activation before declaring success.

Client activation may require UI approval according to the target DSH policy.

## Updating an installed instance

Do not create a second Plugin. Change the payload before calling `cordis_define`:

```json
{
  "plugin": {
    "kind": "existing",
    "pluginId": "the-target-runtime-plugin-id"
  }
}
```

Keep the remaining fields from the built artifact. Activate the returned Package with `cordis_run` mode `update`.

Runtime IDs are local to one DSH process. Never commit a user-specific `pluginId`, `packageId`, `pluginRunId`, grant, key path, or host address.

## Current packaging level

This repository intentionally packages the tested Dynamic Cordis function bodies. It is not yet a native npm-installed DSH Host/Client package. Dynamic packaging keeps the code portable across sessions that expose the inspected Dynamic Cordis interfaces, while avoiding edits to the shipped DSH composition.

A future native package should use standard `ctx.tools.register(defineTool(...))`, a separately bundled Client entry, and an explicit Host-to-Client remote contract. That conversion should be released as a compatibility-reviewed milestone rather than silently changing this artifact format.
