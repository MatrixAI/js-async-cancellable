# AGENTS

- This repository uses the library-js profile selected in
  [`.matrixai/repo-profile.yml`](.matrixai/repo-profile.yml).
- Read the vendored standards' universal hotset, library-js profile, TypeScript
  hotset, and prose rules under `.matrixai/matrixai-standards/standards/`.
- Use Node.js 24 or newer, ES2022/NodeNext ESM, explicit type imports, relative
  source imports, and built-output package imports in tests.
- Golden commands are `npm run build`, `npm run typecheck`, `npm test`, and
  `npm run check:conformance`. Use Vitest compile-time tests alongside runtime
  tests rather than a separate package-consumer test.
- Use the build-first Vitest runner with explicit test imports as a project
  exception to the library profile, standard decorators, a 20-second default
  timeout, and evidence artifacts under `tmp/`.
- Repository override: documentation is handwritten Markdown. Do not regenerate
  TypeDoc output. Historical generated documentation is not the current API.
- Obtain MatrixAI lint from the selected package set, sharing one bundled
  toolchain across the development shell, formatter, and independent lint check.
  Use `matrixai-lint --fix` or `npm run lintfix` in development and
  `matrixai-lint --check` or `npm run lint` for verification. The previous lint
  pause has been lifted for final verification.
- Preserve canonical package manifests in prepared archives. The npm lock
  selects exact runtime producer commits; do not introduce a second flake pin
  graph.
- Keep cancellation requests, cancellable waiting, and represented execution
  completion distinct. Providers own linking and cleanup; applications choose
  scope nesting. Borrowing a signal does not grant ancestor abort authority.
- As a local architecture exception, the cancellation scope adapter and internal
  waiting helper reside in [src/utils.ts](src/utils.ts) despite their effects
  and failure behavior. The waiting helper is not a root public export.
- Use Git-backed flake refs, review source visibility, and stage exact new
  inputs without disturbing existing index state. Never activate credentials or
  change persistent shell options in shell hooks.
- Materialize profile-selected skills after standards updates with
  `nix run './.matrixai/matrixai-standards#skills-materializer' -- --standards-root ./.matrixai/matrixai-standards`.
- Preserve two-space LF editor settings and ASCII prose punctuation. Do not put
  line numbers inside repository path text or Markdown link destinations.
- Do not publish, tag, push, or upload private artifacts to public caches
  without explicit release authority. Preserve local plans and unrelated
  changes.
