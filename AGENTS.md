# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project snapshot
- Desktop calendar app built with **React + Vite** frontend and **Tauri v2** native shell.
- Frontend source is in `src/`; native Tauri/Rust code is in `src-tauri/`.
- Current README is minimal (app description + privacy note); use code and config files as the primary source of development workflow.

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

- Rust-only check loop (from `src-tauri/`):
  - `cargo check`

## Tests
- There is currently **no automated test command configured** in `package.json` and no test suite committed.
- “Run a single test” is therefore not available in the current codebase.

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
  - wires all major feature panels (calendar, settings, reminders list, AI assistant)

### 2) Persistence model
- `src/services/fileManager.js` persists app data via `@tauri-apps/plugin-fs` in `BaseDirectory.AppData`:
  - `events.json`
  - `settings.json`
- Most UI features read/write through this service rather than direct plugin calls, so changes to data shape should be coordinated here and in `App.jsx`.

### 3) Calendar/event domain logic
- Recurrence and occurrence math lives in `src/utils/eventUtils.js`:
  - `getOccurrencesOnDate(events, date)` drives what is rendered per day/week/month
  - `getNextOccurrence(event, now)` drives reminder scheduling behavior
- Main calendar UI is in `src/components/CalendarView.jsx` with multi-view modes (year/month/week/day).
- Day-specific event details are shown via `src/components/DayDetails.jsx`.
- Event create/edit UX is `src/components/EventModal.jsx`.
- List-style event management is `src/components/RemindersModal.jsx`.

### 4) Settings, import/export, and updater
- `src/components/SettingsModal.jsx` is a high-integration component combining:
  - app settings editing
  - auto-start toggle
  - update checks/install flow
  - ICS import/export using `src/utils/ics.js`
  - sound customization (stored in settings and used by `src/utils/sound.js`)

### 5) AI assistant path (Dexter)
- `src/components/Dexter.jsx` provides:
  - local natural-language command parsing for quick event creation
  - fallback to OpenRouter chat completion through `src/services/ai.js`
- API key/model are read from saved settings configured in Settings modal.

### 6) Native/Tauri layer responsibilities
- Rust entry is `src-tauri/src/main.rs` -> `src-tauri/src/lib.rs`.
- Native layer responsibilities include:
  - window visual effects command exposed to JS: `set_window_effect`
  - tray icon/menu behavior
  - single-instance behavior
  - plugin registration (fs/http/notification/os/shell/updater/autostart/process/etc.)
- Tauri build/dev coupling is defined in `src-tauri/tauri.conf.json`:
  - `beforeDevCommand: npm run dev`
  - `beforeBuildCommand: npm run build`
  - `frontendDist: ../dist`

## Codebase-specific implementation notes
- UI language/content is predominantly French; keep new user-facing text consistent.
- Several features depend on Tauri plugins and won’t behave correctly in browser-only Vite mode (notifications, fs persistence, autostart, updater, window effects). Prefer `npm run tauri dev` when touching these areas.
- `eslint.config.js` ignores `dist/**`, `node_modules/**`, `src-tauri/**`, and `scripts/**`; lint scope is primarily frontend JS/JSX.

## Agent instruction sources in this repo
- No repository-local Claude/Cursor/Copilot rule files were found (`CLAUDE.md`, `.cursorrules`, `.cursor/rules/`, `.github/copilot-instructions.md` absent at time of writing).
