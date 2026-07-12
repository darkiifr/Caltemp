# ICS Subscriptions Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Settings > Abonnements/Sources ICS section behave like a real calendar subscription manager with validation, immediate sync, refresh, enable/disable, and unsubscribe actions.

**Architecture:** Keep the existing React/Tauri flow, but centralize subscription commands in `App.jsx` and durable URL/source logic in domain/services modules. The assistant popup should not persist a source until a remote ICS feed has been validated and synced successfully.

**Tech Stack:** React 19, Vite, Tauri v2, Vitest, ical.js, existing `@tauri-apps/plugin-http` fetch path.

## Global Constraints

- Scope is only `Abonnements/Sources ICS` in Settings.
- UI text stays French.
- Imported URL events use `source: 'ics-url'`, `importSourceId`, `externalId`, and must not touch local events.
- HTTPS only; block credentials, localhost, private/reserved literal IP hosts, oversized feeds, and malformed ICS.
- Duplicate URL subscriptions are prevented by normalized URL fingerprint.
- Unsubscribe removes associated imported events by default, with a confirmation option to preserve them as local events.
- Use TDD: tests fail before implementation.

---

### Task 1: URL and Source Domain Safety

**Files:**
- Modify: `src/domain/icsImport.js`
- Modify: `src/domain/icsImport.test.js`
- Modify: `src/domain/icsSources.js`
- Test: `src/domain/icsImport.test.js`

**Interfaces:**
- Produces: `validateIcsUrl(value)`, `getIcsUrlFingerprint(value)`, `findIcsSourceByUrl(sources, url)`.

- [ ] Write failing tests covering the Coupe du Monde URL with query params, duplicate normalization, credential rejection, localhost rejection, and private literal IP rejection.
- [ ] Run `npm test -- src/domain/icsImport.test.js` and confirm the new tests fail because the helpers do not exist or reject incorrectly.
- [ ] Implement minimal helpers in `icsImport.js` and source lookup in `icsSources.js`.
- [ ] Run the test again and confirm pass.

### Task 2: Sync Service Hardening

**Files:**
- Modify: `src/services/icsSync.js`
- Modify: `src/services/icsSync.test.js`

**Interfaces:**
- Consumes: `validateIcsUrl(value)`.
- Produces: `syncIcsSource({ source, events, settings, fetchText })` returning visible `stats`, `error`, and updated `source`.

- [ ] Write failing tests for timeout/oversized response/invalid ICS errors and no tight retry loop metadata after errors.
- [ ] Run `npm test -- src/services/icsSync.test.js` and confirm failure.
- [ ] Implement bounded fetch/read validation, timeout support, and clearer messages.
- [ ] Run the test again and confirm pass.

### Task 3: App Subscription Commands

**Files:**
- Modify: `src/App.jsx`
- Modify: existing relevant App/domain tests if present.

**Interfaces:**
- Produces props for SettingsModal: `onAddAndSyncIcsSource`, `onRemoveIcsSource`, `onToggleIcsSource`, keeps `onSyncIcsSource`.

- [ ] Add tests where existing harness allows command-level behavior; otherwise cover behavior through component tests in Task 4.
- [ ] Implement add-and-sync as provisional source, persist only on successful sync, prevent duplicate URL, and return duplicate result for existing source.
- [ ] Implement remove source with `preserveEvents` option and disable/enable sync flow.

### Task 4: Settings ICS UI Wiring

**Files:**
- Modify: `src/components/SettingsModal.jsx`
- Modify: `src/components/IcsAssistantPanel.jsx`
- Modify: `src/components/IcsAssistantPanel.test.jsx`
- Add/modify SettingsModal component tests if existing patterns allow.

**Interfaces:**
- Consumes App props from Task 3.
- Produces working buttons: add/sync, refresh, enable toggle, copy import, delete/unsubscribe confirmation.

- [ ] Write failing tests proving “Ajouter et actualiser” returns sync result, duplicate URL shows existing source message, refresh calls sync, toggle re-enable calls toggle handler, delete asks confirmation and calls remove.
- [ ] Run component tests and confirm failure.
- [ ] Wire the buttons to the new App props and return promises correctly.
- [ ] Run component tests and confirm pass.

### Task 5: Verification

**Files:**
- No new code unless verification exposes defects.

- [ ] Run targeted tests changed in Tasks 1-4.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Report any Tauri runtime validation not executed.
