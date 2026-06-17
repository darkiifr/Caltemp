# AGENTS.md

This file provides guidance to agents working with code in this repository.

## Project snapshot
- Desktop calendar app built with **React + Vite** frontend and **Tauri v2** native shell.
- Frontend source is in `src/`; native Tauri/Rust code is in `src-tauri/`.
- The project now includes an extensions SDK, a GitHub-backed marketplace, and Discord Rich Presence integration.
- Treat Caltemp as a **desktop application first**, not as a website. Browser-only Vite mode is useful for quick build checks, but it is not authoritative for runtime behavior.

## Setup and common commands
Run from repository root unless noted.

- Install JS dependencies:
  - `npm install`

- Frontend-only development (Vite on port 1420):
  - `npm run dev`

- Full Tauri desktop development (recommended for feature work touching plugins/window behavior):
  - `npm run tauri dev`

- Frontend production build:
  - `npm run build`

- Preview built frontend:
  - `npm run preview`

- Desktop production build (bundles installers via Tauri):
  - `npm run tauri build`

- Lint JS/JSX:
  - `npm run lint`

- Run JS unit tests:
  - `npm test`

- Validate bundled extension examples:
  - `npm run extensions:validate`

- Rust-only check loop (from `src-tauri/`):
  - `cargo check`

## Tests
- Unit tests use **Vitest**.
- Run all tests with `npm test`.
- Run a single test file with `npm test -- path/to/file.test.js`.
- Extension manifest examples are validated with `npm run extensions:validate`.

## Release/versioning workflow
- Version updates are coordinated across:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `public/version.json`
- Use:
  - `node scripts/bump-version.mjs --type=patch|minor|major`
- CI release automation is in `.github/workflows/release.yml` and builds multi-platform Tauri artifacts plus updater metadata (`latest.json`).

## Architecture: big-picture runtime flow
### 1) App shell and state orchestration
- `src/main.jsx` mounts `App`.
- `src/App.jsx` is the central orchestrator:
  - owns global state for events/settings/UI modals
  - loads persisted data at startup
  - applies platform-specific defaults (titlebar style/window effect)
  - handles reminder polling and notification dispatch
  - wires all major feature panels (calendar, settings, reminders list, AI assistant, extensions marketplace)
  - initializes the safe extension manager and emits extension lifecycle/calendar/settings events

### 2) Persistence model
- `src/services/fileManager.js` persists app data via `@tauri-apps/plugin-fs` in `BaseDirectory.AppData`:
  - `events.json`
  - `settings.json`
- `src/extensions/extensionStore.js` persists installed extensions in AppData under:
  - `extensions/extensions.json`
  - `extensions/<extension-id>/manifest.json`
  - plugin entry bundles where applicable
- Most UI features read/write through this service rather than direct plugin calls, so changes to data shape should be coordinated here and in `App.jsx`.

### 3) Calendar/event domain logic
- Recurrence and occurrence math lives in `src/utils/eventUtils.js`:
  - `getOccurrencesOnDate(events, date)` drives what is rendered per day/week/month
  - `getNextOccurrence(event, now)` drives reminder scheduling behavior
- Main calendar UI is in `src/components/CalendarView.jsx` with multi-view modes (year/month/week/day).
- Day-specific event details are shown via `src/components/DayDetails.jsx`.
- Event create/edit UX is `src/components/EventModal.jsx`.
- Date/time picker UI is custom (`CustomDatePicker.jsx`, `CustomTimePicker.jsx`) and must remain desktop-safe. Avoid native browser date pickers.
- List-style event management is `src/components/RemindersModal.jsx`.

### 4) Settings, import/export, and updater
- `src/components/SettingsModal.jsx` is a high-integration component combining:
  - app settings editing
  - auto-start toggle
  - update checks/install flow
  - extensions marketplace
  - ICS import/export using `src/utils/ics.js`
  - sound customization (stored in settings and used by `src/utils/sound.js`)

### 5) Extensions SDK and marketplace
- SDK/runtime lives in `src/extensions/`.
- Public SDK version is `1.0.0`.
- Plugins are safe single-file ESM modules exposing `activate(ctx)` and optional `deactivate(ctx)`.
- Plugins must not call Tauri APIs directly. Use the controlled SDK context and declared permissions.
- Themes are declarative manifests applying CSS variables.
- Marketplace UI is `src/components/MarketplacePanel.jsx`.
- Official registry contract is `extensions/registry.json`.
- Developer docs are under `docs/extensions/`.
- Manifest schema is `public/schemas/caltemp-extension-manifest.schema.json`.

### 6) AI assistant path (Dexter)
- `src/components/Dexter.jsx` provides:
  - local natural-language command parsing for quick event creation
  - fallback to OpenRouter chat completion through `src/services/ai.js`
- API key/model are read from saved settings configured in Settings modal.

### 7) Discord Rich Presence
- `src/services/discordRpc.js` builds privacy-safe presence payloads.
- Native IPC commands live in `src-tauri/src/lib.rs`.
- Discord client/application ID is `1516083174931824720`.
- Rich Presence must not expose event titles, descriptions, dates, notes, or other personal calendar details.

### 8) Native/Tauri layer responsibilities
- Rust entry is `src-tauri/src/main.rs` -> `src-tauri/src/lib.rs`.
- Native layer responsibilities include:
  - window visual effects command exposed to JS: `set_window_effect`
  - Discord RPC commands: `discord_rpc_update`, `discord_rpc_clear`
  - tray icon/menu behavior
  - single-instance behavior
  - plugin registration (fs/http/notification/os/shell/updater/autostart/process/etc.)
- Tauri build/dev coupling is defined in `src-tauri/tauri.conf.json`:
  - `beforeDevCommand: npm run dev`
  - `beforeBuildCommand: npm run build`
  - `frontendDist: ../dist`

## Codebase-specific implementation notes
- UI language/content is predominantly French; keep new user-facing text consistent.
- Several features depend on Tauri plugins and won’t behave correctly in browser-only Vite mode (notifications, fs persistence, autostart, updater, window effects, extensions install flow, Discord RPC). Prefer `npm run tauri dev` when touching these areas.
- Do not open external browsers for internal app views or normal app flows. Caltemp is a Tauri desktop app; internal journeys must stay inside the app. External links are only acceptable when explicitly user-triggered and justified, such as opening a GitHub source/changelog.
- The custom titlebar must keep native desktop behavior: correct Tauri drag regions (`data-tauri-drag-region`), working minimize/maximize/close controls, and no browser-first assumptions.
- Desktop/WebView rendering is authoritative. If Vite browser mode and Tauri WebView disagree, investigate WebView theme, transparency, color-scheme, Tauri window effects, and CSS variables before changing behavior.
- `eslint.config.js` ignores `dist/**`, `node_modules/**`, `src-tauri/**`, and `scripts/**`; lint scope is primarily frontend JS/JSX.

## Agent instruction sources in this repo
- `AGENTS.md` and `CODEX.md` are the repository-local agent instruction sources.
