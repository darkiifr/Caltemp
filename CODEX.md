# CODEX.md

This file defines how Codex should work in the Caltemp repository.

## Role

Codex acts as a pragmatic engineering agent for Caltemp. Its job is to implement scoped changes, debug desktop runtime issues, update documentation, and verify behavior with the commands available in this repository.

## Scope

Codex may:

- edit React/Vite frontend code in `src/`;
- edit Tauri/Rust code in `src-tauri/`;
- update extension SDK code, manifests, examples, and docs;
- update project documentation and developer workflows;
- run lint, tests, builds, extension validation, and `cargo check`.

Codex must not:

- revert unrelated user changes;
- treat browser-only behavior as authoritative for desktop features;
- open external browsers for internal app flows;
- expose personal calendar details through Discord Rich Presence or extension APIs without an explicit product decision.

## Desktop-first rules

- Caltemp is a Tauri desktop app, not a website.
- Use `npm run tauri dev` for runtime validation when a change touches Tauri plugins, filesystem persistence, notifications, updater, autostart, titlebar/window behavior, extensions install/update/remove, marketplace, or Discord RPC.
- `npm run dev` is only a fast frontend check and can fail or differ when Tauri APIs are required.
- Internal app journeys must stay in the desktop application.
- External links are allowed only for explicit user actions such as opening GitHub source, changelog, documentation, Ko-fi, or provider configuration.

## Development workflow

Recommended verification sequence:

```bash
npm run lint
npm test
npm run extensions:validate
npm run build
cd src-tauri
cargo check
```

Use targeted commands during development, then run the full relevant set before reporting completion.

## UI conventions

- User-facing UI text is French.
- Prefer restrained desktop UI over web landing-page patterns.
- Keep modals and panels polished but compact.
- Use subtle motion that respects `prefers-reduced-motion`.
- Avoid native browser date/time controls; use custom components that render consistently in Tauri WebView.
- Keep the custom titlebar draggable with correct `data-tauri-drag-region` usage and working minimize/maximize/close buttons.

## Extensions conventions

- SDK runtime lives in `src/extensions/`.
- Public SDK version is `1.0.0`.
- Plugins are safe ESM bundles with `activate(ctx)` and optional `deactivate(ctx)`.
- Plugins must use the controlled SDK context; direct Tauri API access is not part of the v1 contract.
- Permissions must be declared in manifests and enforced before sensitive SDK calls.
- Themes are declarative and apply CSS variables.
- Validate examples with `npm run extensions:validate`.

## Discord Rich Presence

- Client/application ID: `1516083174931824720`.
- Presence must remain privacy-safe by default.
- Do not include event titles, descriptions, notes, exact dates, or personal user data.
- Discord RPC is first-party app integration, not a plugin API in v1.

## Documentation

- Keep `AGENTS.md` and `CODEX.md` current when workflows or architecture change.
- Extension developer documentation lives in `docs/extensions/`.
- Public manifest schema lives in `public/schemas/caltemp-extension-manifest.schema.json`.
- Marketplace registry contract lives in `extensions/registry.json`.
