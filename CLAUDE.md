# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla Tetris implementation: HTML5 Canvas + CSS + plain JavaScript (ES6+). No dependencies, no build process, no package.json, no bundler/transpiler.

## Running the game

No install/build step. Any of these work:

```bash
open index.html              # macOS, opens directly in browser
python3 -m http.server 8000  # or: npx serve .   /   php -S localhost:8000
```

There are no tests, linter, or CI configured in this repo.

## Architecture

Three files, each with a single responsibility:

- `index.html` — DOM structure: the `#board` canvas (300×600, i.e. `COLS×BLOCK` × `ROWS×BLOCK`), the `#next-canvas` preview, the HUD (score/lines/level), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade visual theme only.
- `game.js` — all game logic, single file, no modules. Everything is module-scoped top-level state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) — there is no encapsulation, so be careful about accidental global name collisions if adding code.

### Core model

- Board: `ROWS × COLS` matrix, each cell is `0` (empty) or a piece color index `1–7`.
- Pieces (`PIECES`): defined as fixed square matrices (I, O, T, S, Z, J, L); `COLORS[]` maps color index to hex.
- Rotation (`rotateCW`): transpose + reverse rows. `tryRotate` applies this and then attempts wall kicks at offsets `[0, -1, 1, -2, 2]` before giving up on the rotation.
- Collision (`collide`): bounds check + overlap check against locked board cells.
- Ghost piece (`ghostY`): projects the current piece straight down until it would collide, drawn at `globalAlpha = 0.2`.

### Game loop

`requestAnimationFrame`-driven `loop(ts)`: accumulates `dt` into `dropAccum`; once it exceeds `dropInterval`, the piece drops one row (or locks via `lockPiece` if it can't). `draw()` runs every frame regardless (grid → locked board → ghost → current piece, in that order).

`lockPiece()` → `merge()` (bakes piece into `board`) → `clearLines()` (scans bottom-up, splices completed rows, unshifts empty rows at top, updates score/level/`dropInterval`) → `spawn()` (promotes `next` to `current`, generates a new `next`; if the new piece immediately collides, calls `endGame()`).

### Scoring/leveling constants

- `LINE_SCORES = [0, 100, 300, 500, 800]`, multiplied by current `level`.
- Hard drop: +2 points per row dropped. Soft drop: +1 point per row.
- Level increases every 10 cleared lines; `dropInterval = max(100, 1000 - (level-1)*90)` ms.

### Input

All keyboard handling is a single `keydown` listener at the bottom of `game.js` (arrows move/rotate/soft-drop, Space hard-drops with `preventDefault`, `KeyX` also rotates, `P` toggles pause). Input is ignored while `paused` or `gameOver`.

## Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`. If `COLS`, `ROWS`, or `BLOCK` change, the `#board` canvas `width`/`height` in `index.html` must be updated to match (`COLS×BLOCK` and `ROWS×BLOCK`).
