# fleet-presence-dispatch

A reusable GitHub Actions workflow. On every push to an app's trunk it tells that app's marketing and docs sites to
rebuild, all at the same time, and tells the company site when a feature has newly become ready.

- `.github/workflows/presence-dispatch.yml`: the workflow. Usage is in its header comment.
- `scripts/presence-diff.mjs`: works out which features a push touched or shipped, from `presence/features.json`.
- `schemas/features.schema.json`: the format of `presence/features.json`.

Public on purpose, so public app repos can call it. It holds no hostnames, tokens or other internal detail; keep it
that way.
