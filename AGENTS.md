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

### 3b) ICS subscriptions (real-time sync)
- `src/utils/ics.js` parses feeds: TZID without VTIMEZONE is resolved with `Intl`, simple RRULEs stay native (`recurrence`), richer ones (COUNT/UNTIL/INTERVAL/EXDATE/RECURRENCE-ID) are expanded over a sliding window with `externalId = UID#RECURRENCE-ID`.
- `src/services/icsSync.js` splits a refresh into `fetchIcsSource` (network, conditional requests, content hash) and `applyIcsFetchResult` (merge). Edits to a subscribed event are recorded in `localOverrides` and survive syncs; deleted ones go to the source's `dismissedKeys`.
- `App.jsx` `runIcsSync` serialises every refresh, downloads in parallel, then merges into the *latest* `eventsRef`/`settingsRef`. All event writes go through `commitEvents` (coalesced disk writes). Scheduling lives in `src/domain/icsScheduler.js`.
- Sync status fields (`ICS_SYNC_STATE_FIELDS`) are owned by background syncs: merge them with `mergeIcsSyncState` instead of overwriting from a stale copy.

### 3b-bis) Import from other calendars
- `src/components/CalendarImportWizard.jsx` (opened from the sidebar, Settings › Données, the command palette, and the first-run prompt shown while there are no events) guides the user per provider (Google, Outlook, Apple, Proton, Thunderbird).
- `src/services/calendarImportFiles.js` reads picked/dropped files or pasted text: `.ics/.ical/.vcs`, `.csv` (Google/Outlook, FR/EN headers, UTF-8 or Windows-1252) and `.zip` (Google export, read by `src/utils/zip.js`).
- `src/domain/calendarImport.js` holds CSV parsing, provider detection, duplicate analysis (`new`/`update`/`duplicate`) and `mergeImportedEvents`, used by `App.jsx` `handleImportEvents` for one-shot imports. Updates keep the user's category/reminder/todos and never touch subscription-owned events.

### 3c) Reminders map
- `src/components/SlippyMap.jsx` is a dependency-free tile map (free OpenStreetMap raster tiles, see `src/domain/mapTiles.js`; dark theme = CSS filter). CARTO basemaps now require an API key: do not use them; pan/zoom only write CSS transforms, React re-renders when the tile set or zoom level changes. Geometry/clustering helpers are in `src/domain/geo.js`.
- `src/components/RemindersMap.jsx` is the `map` view of `CalendarView`; `src/domain/mapItems.js` turns events into map items.
- Positions come from `event.geo` (manual pin or ICS `GEO`), coordinates in `event.location`, then the Nominatim cache (`src/services/geocoding.js`, 1 req/s, `geocache.json`). Geocoding is opt-in (`settings.mapAutoGeocode`) or user-triggered; only the location text is sent.

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

### 6) AI assistant path (Dexter) — local model via llama.cpp
- Nothing is sent to an online AI service. Dexter runs a small GGUF model (default Qwen2.5 1.5B Instruct Q4_K_M) with llama.cpp's `llama-server`.
- Nothing ships in the installer: the user is offered the download (first-run card in `App.jsx`, Dexter's setup panel, Settings › IA via `src/components/LocalModelSetup.jsx`).
- Native side `src-tauri/src/local_ai.rs`: model catalog, pinned llama.cpp build (`LLAMA_CPP_BUILD`), downloads into `AppData/local-ai/` with SHA-256 checks (GitHub asset digest, Hugging Face `X-Linked-Etag`), server lifecycle. The server listens on 127.0.0.1 with a random API key, is started on demand (`local_ai_ensure_server`), stopped by an idle watchdog (`settings.localAi.idleTimeoutMinutes`) and on app exit.
- `src/services/localAi.js` wraps the commands; `src/services/ai.js` is the OpenAI-compatible streaming client (tool calls included).
- Agent loop: `src/services/dexterAgent.js`. Tools the model can call: `src/domain/dexterTools.js` (list/create/update/delete events, free slots, week summary, calendar view, panels, whitelisted settings, export, ICS sync, web search). App capabilities reach the tools through the `toolHost` built in `App.jsx`. Destructive tools return a `confirmation` the user approves in the chat; never let the model delete directly.
- Simple commands still go through the deterministic parser `src/domain/dexterLocal.js` first (no model load needed).
- To change the llama.cpp build, check the asset names on its release page and the `llama-server` flags used in `spawn_server`.

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
  - Dexter local model commands: `local_ai_*` (`src-tauri/src/local_ai.rs`)
  - tray icon/menu behavior
  - single-instance behavior
  - plugin registration (fs/http/notification/os/shell/updater/autostart/process/etc.)
- Tauri build/dev coupling is defined in `src-tauri/tauri.conf.json`:
  - `beforeDevCommand: npm run dev`
  - `beforeBuildCommand: npm run build`
  - `frontendDist: ../dist`

## Codebase-specific implementation notes
- UI language/content is predominantly French; keep new user-facing text consistent.
- Typography is **Vins Sans** (https://github.com/VinsStudio/VinsSans, OFL), bundled locally in `src/assets/fonts/vins-sans/` (WOFF2 + `OFL.txt`/`FONTLOG.txt`) and loaded from `src/main.jsx`. Use the `--caltemp-font-sans` / `--caltemp-font-mono` tokens (or Tailwind `font-sans` / `font-mono`) rather than hard-coding a family; never load fonts from a CDN. Vins Sans Pro has an `opsz` axis (`font-optical-sizing: auto`), so headings need no separate display font. To update, copy the new files from the font repo's `dist/`, then regenerate the Latin subset `VinsSansPro-Latin.woff2` with the commands in `FONTLOG.txt` (it is what the WebView loads for Latin text).
- Several features depend on Tauri plugins and won’t behave correctly in browser-only Vite mode (notifications, fs persistence, autostart, updater, window effects, extensions install flow, Discord RPC, Dexter's local model). Prefer `npm run tauri dev` when touching these areas.
- Do not open external browsers for internal app views or normal app flows. Caltemp is a Tauri desktop app; internal journeys must stay inside the app. External links are only acceptable when explicitly user-triggered and justified, such as opening a GitHub source/changelog.
- The custom titlebar must keep native desktop behavior: correct Tauri drag regions (`data-tauri-drag-region`), working minimize/maximize/close controls, and no browser-first assumptions.
- Desktop/WebView rendering is authoritative. If Vite browser mode and Tauri WebView disagree, investigate WebView theme, transparency, color-scheme, Tauri window effects, and CSS variables before changing behavior.
- Resource use matters: heavy surfaces (Settings, Dexter, import wizard, event editor, reminders list, export, ICS parsing) are lazy-loaded; keep framer-motion and similar libraries out of the startup chunk (`vite.config.js`), pause timers while the window is hidden, and avoid per-token or per-frame work (Dexter coalesces streamed renders and persists history once an answer is complete).
- `eslint.config.js` ignores `dist/**`, `node_modules/**`, `src-tauri/**`, and `scripts/**`; lint scope is primarily frontend JS/JSX.

## Agent instruction sources in this repo
- `AGENTS.md` and `CODEX.md` are the repository-local agent instruction sources.
