# AGENTS

- This repository uses the library-js profile selected in
  [`.matrixai/repo-profile.yml`](.matrixai/repo-profile.yml).
- Read the vendored standards' universal hotset, library-js profile, TypeScript
  hotset, and prose rules under `.matrixai/matrixai-standards/standards/`.
- Use Node.js 24 or newer, ES2022/NodeNext ESM, explicit type imports, relative
  source imports, and built-output package imports in tests.
- Golden commands are `npm run build`, `npm run typecheck`,
  `npm test -- --runInBand`, `npm run check:package`,
  `npm run check:portable`, and `npm run check:conformance`.
- Keep the build-first Jest/SWC runner, standard decorators, 20-second default
  timeout, and evidence artifacts under `tmp/`.
- Repository override: documentation is handwritten Markdown. Do not regenerate
  TypeDoc output. Historical generated documentation is not the current API.
- Obtain MatrixAI lint from the selected package set, sharing one bundled
  toolchain across the development shell, formatter, and independent lint check.
  Use `npm run lintfix` in development and `npm run lint` for verification.
  Lint execution is paused for the current owner-authorized implementation batch.
- Preserve canonical package manifests in prepared archives. The npm lock selects
  exact runtime producer commits; do not introduce a second flake pin graph.
- Keep cancellation requests, cancellable waiting, and represented execution
  completion distinct. Providers own linking and cleanup; applications choose
  scope nesting. Borrowing a signal does not grant ancestor abort authority.
- Use Git-backed flake refs, review source visibility, and stage exact new inputs
  without disturbing existing index state. Never activate credentials or change
  persistent shell options in shell hooks.
- Materialize profile-selected skills after standards updates with
  `nix run './.matrixai/matrixai-standards#skills-materializer' -- --standards-root ./.matrixai/matrixai-standards`.
- Preserve two-space LF editor settings and ASCII prose punctuation. Do not put
  line numbers inside repository path text or Markdown link destinations.
- Do not publish, tag, push, or upload private artifacts to public caches without
  explicit release authority. Preserve local plans and unrelated changes.
