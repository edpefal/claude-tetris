'use strict';

// Visual skins/themes for the Tetris board. Plain script (no modules), loaded
// before game.js so `currentSkin` and `applySkin` are available as soon as
// game.js starts drawing.

// ---- Color helpers ----

// Shifts a "#rrggbb" color toward black (negative amount) or white (positive
// amount). amount is clamped to [-1, 1].
function shadeHexColor(hex, amount) {
  const num = parseInt(hex.slice(1), 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const target = amount < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amount));
  r = Math.round((target - r) * p) + r;
  g = Math.round((target - g) * p) + g;
  b = Math.round((target - b) * p) + b;
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
}

function darken(hex, amount) {
  return shadeHexColor(hex, -amount);
}

function lighten(hex, amount) {
  return shadeHexColor(hex, amount);
}

// ---- Skins ----
// Each skin supplies a 1-7 color palette (index 0 unused, matches the piece
// color indices), a board background color, a grid line color, and its own
// drawBlock(context, x, y, colorIndex, size, alpha) function. drawBlock must
// work for both the board canvas and the next-piece preview canvas, and must
// respect `alpha` (used for the ghost piece) and never leak canvas state
// (globalAlpha, shadowBlur, ...) into whatever is drawn next — every skin
// below wraps its drawing in save()/restore() to guarantee that.

const SKINS = {
  retro: {
    label: 'Retro',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#7986cb', '#ffb74d'],
    boardBg: '#1a1a25',
    gridColor: '#22222e',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight band across the top of the block
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.restore();
    },
  },

  neon: {
    label: 'Neón',
    colors: [null, '#00e5ff', '#ffea00', '#e040fb', '#00e676', '#ff1744', '#536dfe', '#ff9100'],
    boardBg: '#000000',
    gridColor: '#0d0d16',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.shadowBlur = 12;
      context.shadowColor = color;
      context.fillStyle = darken(color, 0.55);
      context.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.strokeRect(x * size + 2, y * size + 2, size - 4, size - 4);
      // restore() below resets shadowBlur/shadowColor/globalAlpha so the
      // glow never bleeds into grid lines or the next block drawn.
      context.restore();
    },
  },

  pastel: {
    label: 'Pastel',
    colors: [null, '#a8dadc', '#ffe8a3', '#d8b4e2', '#b8e0c2', '#f4b8b8', '#b8c4e8', '#f5cba7'],
    boardBg: '#23242f',
    gridColor: '#333544',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      context.save();
      context.globalAlpha = alpha ?? 1;
      context.fillStyle = color;
      const px = x * size + 2;
      const py = y * size + 2;
      const s = size - 4;
      const radius = Math.min(6, s / 2);
      if (typeof context.roundRect === 'function') {
        context.beginPath();
        context.roundRect(px, py, s, s, radius);
        context.fill();
      } else {
        // Fallback for canvas contexts without roundRect support.
        context.fillRect(px, py, s, s);
      }
      context.restore();
    },
  },

  pixel: {
    label: 'Pixel Art',
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#7986cb', '#ffb74d'],
    boardBg: '#141419',
    gridColor: '#2a2a30',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      if (!colorIndex) return;
      const color = this.colors[colorIndex];
      const a = alpha ?? 1;
      context.save();
      context.globalAlpha = a;
      context.fillStyle = color;
      const startX = x * size + 1;
      const startY = y * size + 1;
      const s = size - 2;
      context.fillRect(startX, startY, s, s);

      // Checkerboard dither texture on top to fake pixel-art shading.
      const cell = Math.max(2, Math.floor(size / 6));
      const light = lighten(color, 0.18);
      const dark = darken(color, 0.18);
      for (let gy = 0; gy * cell < s; gy++) {
        for (let gx = 0; gx * cell < s; gx++) {
          const w = Math.min(cell, s - gx * cell);
          const h = Math.min(cell, s - gy * cell);
          context.fillStyle = (gx + gy) % 2 === 0 ? light : dark;
          context.globalAlpha = a * 0.18;
          context.fillRect(startX + gx * cell, startY + gy * cell, w, h);
        }
      }
      context.restore();
    },
  },
};

const SKIN_STORAGE_KEY = 'tetris.skin';

let currentSkin = SKINS.retro;

function loadSavedSkinKey() {
  try {
    const saved = localStorage.getItem(SKIN_STORAGE_KEY);
    if (saved && SKINS[saved]) return saved;
  } catch (e) {
    // localStorage unavailable (private browsing, disabled storage, ...) —
    // fall back to the default skin silently.
  }
  return 'retro';
}

// Sets the active skin, persists it, reflects it on <html data-skin="...">
// for CSS hooks, and redraws immediately (no page reload). Safe to call
// before game.js has loaded (e.g. on initial page load) or before the game
// has been initialized — the redraw is simply skipped in that case, since
// game.js's own first draw() call will already pick up `currentSkin`.
function applySkin(key) {
  const resolvedKey = SKINS[key] ? key : 'retro';
  currentSkin = SKINS[resolvedKey];

  try {
    document.documentElement.dataset.skin = resolvedKey;
  } catch (e) {
    // ignore (should not throw in practice, but keep this defensive)
  }

  try {
    localStorage.setItem(SKIN_STORAGE_KEY, resolvedKey);
  } catch (e) {
    // ignore (private browsing, disabled storage, ...)
  }

  const select = document.getElementById('skin-select');
  if (select && select.value !== resolvedKey) select.value = resolvedKey;

  if (typeof draw === 'function' && typeof current !== 'undefined' && current) {
    draw();
  }
}

// Apply the persisted (or default) skin right away, before game.js's first
// draw() ever runs.
applySkin(loadSavedSkinKey());

const skinSelectEl = document.getElementById('skin-select');
if (skinSelectEl) {
  skinSelectEl.addEventListener('change', function () {
    applySkin(this.value);
  });
}
