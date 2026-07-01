# AGENTS

This file holds the team-shared rules for AI coding agents working in this repository. It is the single source of truth — `CLAUDE.md` is a one-line bridge (`@AGENTS.md`) so Claude Code reads the same content.

## Personal Local Rules

If a file `AGENTS.local.md` exists in this repository root, read it once at the start of the session and treat its contents as additional personal rules that extend (but never override) the team rules in this file.

## Project Structure

- New plugins live under `packages/plugins/@nocobase/plugin-<name>/`. Reuse the existing plugin scaffold; do not invent a new layout.
- This repo has two client runtimes: legacy v1 (`src/client/`, `@nocobase/client`, `SchemaComponent`) and v2 (`src/client-v2/`, `@nocobase/client-v2`, `FlowEngine` / `FlowModel`). Confirm which runtime the file under edit belongs to before writing code. Import direction is one-way: v1 client may import from v2 (`@nocobase/client-v2`), but v2 client must never import from v1 (`@nocobase/client`).
- Pro (not open source) plugins live in individual repositories under `packages/plugins` or `packages/pro-plugins` (for example, `@nocobase/plugin-workflow-approval`), but used not as submodules. When working on a pro plugin, clone its repo separately under `packages/plugins/` or `packages/pro-plugins/` and treat it as a standalone project with git.

## Code Style Rules

- Do not use `void someAsyncCall()` style fire-and-forget invocation. Prefer direct invocation such as `someAsyncCall()` and structure surrounding code accordingly.
- Avoid `any` in TypeScript. Reach for a specific type, a generic, or `unknown` with a narrowing guard instead. Replace `as any` with a named type or a type guard. When touching existing code that uses `any`, narrow it to a concrete type whenever feasible.
- For frontend components and pages, prefer Ant Design v5 components and follow its conventions. Reference https://ant.design/llms.txt for antd's LLM-friendly documentation when needed.
- For frontend components and pages, follow accessibility (a11y) best practices — add appropriate ARIA attributes, use semantic HTML, and ensure keyboard navigation works.
- Do not use async IIFE patterns in event handlers (for example: `runAsyncTask((async () => { ... })())`). Extract the async logic into a named async function or call it directly.
- Do not introduce new abstractions, error-handling layers, or feature flags beyond what the task requires. Three similar lines is better than a premature abstraction.
- Do not hard-wrap `//` comments at a narrow width. Let each comment line run to the project's `printWidth` (120) before wrapping, so prose fills the line instead of breaking into many short, truncated-looking lines. Verbatim content stays as-is: ASCII diagrams, bullet/numbered lists, blank-line paragraph breaks, and directive lines (`eslint-disable*`, `@ts-*`, `prettier-ignore`) keep their own line breaks.

## Database & Migrations

- Any change to database tables, columns, or indexes must ship with a migration under the plugin's `src/server/migrations/`. Import column types from `DataTypes`; do not reuse type names from neighboring migrations without verifying they still apply.
- New collections (tables), columns, indexes will be automatically synced to database when running the command `yarn nocobase upgrade` (will also run in docker container when start). So no need to create migration files in these cases.

## Testing Rules

- Run single test file: `yarn test <path-to-test-file>`
  - Client example: `yarn test packages/core/flow-engine/src/__tests__/flow-engine.test.ts --run --reporter=verbose`
  - Server example: `yarn test packages/core/server/src/__tests__/Application.test.ts`
- Always run related test files after modifying source code to ensure no regressions.
- Co-locate unit and integration tests in `__tests__` directories, naming files `*.test.ts` or `*.spec.ts`.
- Do NOT run server tests parallelly; they may interfere with each other. Use `yarn test` to run them sequentially.

## Internationalization (i18n)

- User-facing strings (UI labels, messages, errors shown to end users) must go through the project's i18n layer (`t()` / `useTranslation()`); do not hardcode them. Add keys for both `en-US` and `zh-CN` when introducing new strings.

## AI Employees, Tools & jsBlock Conversational Editing

This section documents how `plugin-ai` AI employees, their tools, and the reusable "converse with an
AI employee to edit a block, then submit to persist" capability work in this repo. Follow it whenever
you add an AI tool, wire an AI employee into a page, or build conversational editing on a custom block.
The canonical implementation lives in `@crossborder/plugin-ai-listing`
(`src/ai/tools/jsBlockApplyPatch.ts`, `src/client-v2/ai/jsblock-ai.ts`,
`src/client-v2/components/assistant-bridge.ts`); the native reference is `plugin-ai`.

### 1. Defining an AI tool

- **Location & auto-loading.** Every plugin auto-loads AI tool definitions from `<plugin>/src/ai/tools/**`.
  The base `Plugin.loadAI()` (`packages/core/server/src/plugin.ts`) scans that directory on server start; in
  dev the plugin root resolves to `src` through `tsconfig.paths.json`, so put tool files under `src/ai/tools/`.
  You do **not** register these tools by hand — creating the file is enough.
- **Definition shape.** A tool file default-exports `defineTools({ ... })` from `@nocobase/ai` (`defineTools` is
  an identity helper — it only exists for typing):

  ```ts
  import { defineTools } from '@nocobase/ai';

  export default defineTools({
    scope: 'GENERAL', // 'GENERAL' = available to every employee; 'SPECIFIED' = only when listed in an employee's skillSettings.tools
    defaultPermission: 'ALLOW', // 'ALLOW' = auto-run; 'ASK' = require user confirmation in the drawer
    execution: 'frontend', // 'frontend' = the real work runs client-side; 'backend' = the server invoke does the work
    introduction: { title: '...', about: '...' },
    definition: {
      name: 'jsBlockApplyPatch', // overridden by the loader with the FILE NAME — keep them identical to avoid confusion
      description: 'Explain to the LLM exactly when and how to call this tool.',
      schema: {
        /* JSON Schema — see the schema rule below */
      },
    },
    invoke: async () => ({ status: 'success', content: 'placeholder; real work happens client-side' }),
  });
  ```

- **Registration timing.** The tool directory is scanned only at server start. A brand-new tool file is a
  *dynamically imported* module, so `tsx watch` will not restart for it — touch an already-imported server file
  (e.g. the plugin's `src/server/index.ts`) to force a restart, then confirm the tool appears in the `aiTools`
  resource before testing.

### 2. Tool schemas — prefer JSON Schema; malformed zod crashes every conversation

Tool `definition.schema` is bound to the LLM through LangChain (`plugin-ai/src/server/utils.ts` `buildTool` →
LangChain `tool()`), which converts it to the provider's function-calling format.

- **Prefer a plain JSON Schema.** `{ type: 'object', properties: {...}, required: [...] }` is validated by
  `@cfworker/json-schema` and completely bypasses the zod interop. This is the most robust choice and matches the
  built-in data-source tools (`dataQuery`, etc.).
- **If you use zod, it must be valid zod v4.** The repo is on zod v4. The most common mistake is `z.record()`:
  in v4 it takes **two** arguments — `z.record(z.string(), z.any())`. The single-arg form `z.record(z.any())`
  leaves the value schema `undefined`, and when LangChain walks the schema at **bind time** it throws
  `TypeError: Cannot read properties of undefined (reading '_zod')`.
- **Blast radius.** This error fires when the tool is bound to the model, i.e. **before** the LLM even runs, and it
  aborts the whole turn. A malformed `GENERAL`-scope tool therefore breaks **every** conversation of **every**
  employee (including the global floating assistant), not just the feature you were building.
- **Debugging `_zod` errors.** A `reading '_zod'` `TypeError` (surfaced in `storage/logs/main/system_error_*.log`
  under module `aiConversations`) means *some* bound tool has a malformed zod schema — not necessarily the one you
  just changed. Binary-search it: iterate every registered tool and run `z.toJSONSchema(tool.definition.schema)`
  (or `@langchain/core`'s converter) over each; the one that throws is the culprit.

### 3. Frontend tools (client-side execution)

`execution: 'frontend'` tools run in the browser. The server `invoke` returns only a placeholder; the real
handler is registered client-side and mirrors the native `formFiller`
(`plugin-ai/src/client/ai-employees/form-filler/tools/index.ts`):

```ts
app.aiManager.toolsManager.registerTools('jsBlockApplyPatch', {
  invoke: async (app, params) => {
    /* ... */
    return { status: 'success' | 'error', content: '...' }; // this return is sent back to the LLM as the tool result
  },
});
```

Register it during the plugin's client `load()`. Because the frontend tool's `invoke` return is the tool result the
model sees, keep it a concise, accurate `{ status, content }` object.

### 4. Which client runtime the running app loads (v1 vs v2)

The repo has two client runtimes (see **Project Structure**). Critically, the running `/admin` desktop app currently
loads each plugin's **v1** entry (`src/client/index.tsx`), *not* `src/client-v2/`. Anything that must run at app load
— `window` globals, `app.aiManager.toolsManager.registerTools`, providers — must be reached from the entry the app
actually loads.

- **Verify before wiring:** inspect the plugin chunk the browser fetched (its re-export path tells you whether it
  points at `src/client` or `src/client-v2`), or check which entry the app bundle pulls in.
- Import direction still holds: v1 may import v2. So a v1 `src/client/plugin.tsx` `load()` may legitimately call setup
  functions that live under `src/client-v2/` (guard with `try/catch` so a failure never blocks plugin load). This is
  how `plugin-ai-listing` installs the jsBlock kit today.

### 5. Reusable capability: "native AI drawer edits a jsBlock, Submit persists"

This is the jsBlock analogue of native forms' `formFiller`. The rule (mirrors native form behavior exactly): **the
AI only edits staged, in-memory data; only the block's own Submit button writes to the database**, through a
controlled server action that also writes an audit row (`actorType='user'`, because the user, not the AI, triggered
the persist). Reuse this kit — do not rebuild a bespoke drawer.

- **Register the block** (in the jsBlock, on every render so `getData` and the closures stay fresh; unregister on
  unmount):

  ```js
  window.__aiListingBlockKit.register(key, {
    title, // shown to the AI as context
    getData: () => stagedRef.current, // current staged values (read from a ref to avoid stale closures)
    getSchema: () => FIELDS, // [{ name, label, type, hint }] — the editable fields, also used as the write whitelist
    applyPatch: (patch) => setStaged((s) => ({ ...s, ...patch })), // AI writes staged React state only
  });
  ```

- **Open the native drawer** from an avatar: `window.__aiListingBlockKit.openAI(key, { username, prompt })`. This
  opens the real `plugin-ai` drawer (model picker, streaming, sessions) and injects the block's current data +
  editable-field schema as the system context, instructing the employee to call `jsBlockApplyPatch({ block, patch })`.
- **The frontend tool** `jsBlockApplyPatch` only mutates the target block's staged React state, filtered to the
  fields declared in `getSchema()` (unknown keys are ignored so the AI cannot write outside the contract). It never
  touches the database.
- **Submit** is a normal button that calls a controlled server action (e.g. `aiListingReview:saveFinal`) which
  performs the write, enforces locks/permissions, and records the audit trail. Nothing else persists.

### 6. Native AI-employee avatar (look + hover animation)

When you place an AI-employee avatar on a block, match the native look and behavior — do not hand-roll a colored
circle or invent your own animation.

- **Use the real avatar.** Resolve it with `avatars(emp.avatar, options)` (exported from
  `@nocobase/plugin-ai/client-v2`), which returns a dicebear data-URI. The kit exposes
  `__aiListingBlockKit.getAvatar(username, options)` for this.
- **Replicate the native hover "head-turn."** The native `AIEmployeeShortcut`
  (`plugin-ai/src/client-v2/ai-employees/AIEmployeeShortcut.tsx`) does not use a CSS animation — it swaps between two
  rendered variants on hover. Pre-resolve both and toggle `src` on `onMouseEnter` / `onMouseLeave`:
  - resting: `avatars(seed, { mouth: undefined, mask: undefined })` — bright. **Do not** apply `mask: ['dark']`; in a
    normal (table/card) context it renders the avatar too dark.
  - hover: `avatars(seed, { mask: undefined, flip: true })` — `flip` mirrors the head, producing the turn.

## Pre-Commit Workflow

- Run `yarn eslint --fix` on touched files before reporting work as done. Resolve type errors and lint warnings rather than disabling them.

## Commit Conventions

- Commit messages follow Conventional Commits, prefixed with the affected scope: `fix(plugin-workflow): ...`, `feat(client): ...`, `chore: ...`, `docs: ...`.
