---
name: verify
description: Build, launch, and drive player-studio to verify changes end-to-end in a real browser.
---

# Verifying player-studio

Vite + TypeScript, no framework. The whole app is one page: palette (left),
region-mode player canvas (center), live player.json (right).

## Build / launch

```bash
npm run build                          # tsc && vite build — catches type errors (noUnusedLocals + erasableSyntaxOnly are ON)
npm run dev -- --port 5199 --strictPort   # dev server; a non-default port isolates localStorage from the user's real session
```

## Drive (headless Chrome via playwright-core)

No browser automation is installed in the repo. `npm i playwright-core` in a
scratch dir and `chromium.launch({ channel: "chrome" })` uses the installed
Google Chrome — no browser download.

Gotchas that cost time:

- **Fresh state**: `page.evaluate(() => localStorage.clear())` then reload.
  Registry + layout persist under `player-studio:registry` / region-layout keys.
- **Drag & drop is native HTML5** — Playwright's `mouse` dragTo does NOT fire it.
  Dispatch synthetic events with a shared DataTransfer handle: `dragstart` on the
  source (`.chip[data-id=...]` or a placed control), then `dragover` + `drop` on
  the lane (`.lane[data-region=][data-row=][data-lane=]`) with a real `clientX`
  (it determines the insert index). Clear `body.dnd-active` afterwards.
- **Resize handles / sliders**: plain `page.mouse` down/move/up works. Range
  inputs: focus + ArrowRight fire real input/change; `fill()` doesn't work on ranges.
- **Exported spec**: `JSON.parse(await page.locator(".code-block code").textContent())`.
- **Editing a source file restarts Vite HMR and reloads the page** — a driver run
  in flight crashes with "Execution context was destroyed ... navigation". Just
  re-run once the server settles.
- Default layout controls: `PlayNPause` etc. live in
  `.lane[data-region="bottom"][data-row="1"][data-lane="start"]`. `Captions` is
  NOT in the default layout.

## Flows worth driving

- Click a placed icon → `.popover` size slider; check svg width attr + spec decl.
- Palette "+ Add spacer" → drag to a lane → click it → Width slider popover (like
  icon size); also has a right-edge `.resize-handle`.
- Palette "+ Add background" → drop into a lane. It SNAPS to that lane's controls
  (no width, no handle): `.control-bg` width ≈ lane width + 2·paddingX; adding a
  control to the lane re-snaps it wider. Click its exposed padding strip (its
  centre sits under the lane's controls, z-index) → Padding X / Padding Y / Radius
  popover. Color+opacity are NOT here.
- Shared background color/opacity live in the toolbar (3rd `input[type=color]`
  + `.bg-opacity`); they drive ALL `.control-bg` layers and export as
  `theme.backgroundColor` / `theme.backgroundOpacity`.
- Undo/Redo: toolbar `[aria-label="Undo"]`/`"Redo"` + Cmd/Ctrl+Z / Shift. One
  undo step per discrete commit (a drop, a slider release). History snapshots
  registry+state together (history.ts) — test with a discrete action (place a
  control → undo removes it → redo restores).
- Drag anything → all lanes grow + show dashed frames (`body.dnd-active .lane`),
  hovered target gets a solid accent fill. The drop handler clears `dnd-active`
  BEFORE re-rendering so a dropped background snaps to the settled (not inflated)
  lane.
- Reload → sizes/widths/colors/paddings persist (regression canary: a
  `registry.load()` whitelist miss silently reverts custom kinds to "icon").
- Collapse bin must refuse non-icon kinds; volume flyout hover+slide still works.
