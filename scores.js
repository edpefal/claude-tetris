'use strict';

// Local high-score table + start/game-over screen glue.
// Single gateway to localStorage. No imports/exports (plain script, same
// style as game.js): everything here is module-scoped top-level state.

const RECORDS_KEY = 'tetris.records';
const MAX_TOP_SCORES = 5;
const RESET_CONFIRM_MS = 4000;

let pendingGameStats = null; // stats waiting on a name-entry submission

function defaultRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function isValidRecordEntry(entry) {
  return !!entry && typeof entry === 'object'
    && typeof entry.name === 'string'
    && typeof entry.score === 'number' && Number.isFinite(entry.score)
    && typeof entry.lines === 'number' && Number.isFinite(entry.lines)
    && typeof entry.level === 'number' && Number.isFinite(entry.level)
    && typeof entry.date === 'string';
}

function isValidRecords(data) {
  return !!data && typeof data === 'object'
    && Array.isArray(data.top) && data.top.every(isValidRecordEntry)
    && typeof data.bestCombo === 'number' && Number.isFinite(data.bestCombo)
    && typeof data.maxLines === 'number' && Number.isFinite(data.maxLines);
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    if (!raw) return defaultRecords();
    const parsed = JSON.parse(raw);
    if (!isValidRecords(parsed)) return defaultRecords();
    return {
      top: parsed.top.slice(0, MAX_TOP_SCORES),
      bestCombo: parsed.bestCombo,
      maxLines: parsed.maxLines,
    };
  } catch (e) {
    return defaultRecords();
  }
}

function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch (e) {
    // localStorage disabled/full/corrupted — degrade silently, in-memory only.
  }
}

function recordQualifies(score) {
  const records = loadRecords();
  if (records.top.length < MAX_TOP_SCORES) return true;
  return score > records.top[records.top.length - 1].score;
}

function addRecord(name, score, lines, level) {
  const records = loadRecords();
  const safeName = (name && String(name).trim().slice(0, 12)) || 'ANON';
  const entry = { name: safeName, score, lines, level, date: new Date().toISOString() };
  records.top.push(entry);
  records.top.sort((a, b) => b.score - a.score);
  records.top = records.top.slice(0, MAX_TOP_SCORES);
  saveRecords(records);
  return { records, entry };
}

function updateBests(lines, combo) {
  const records = loadRecords();
  let changed = false;
  if (typeof lines === 'number' && lines > records.maxLines) {
    records.maxLines = lines;
    changed = true;
  }
  if (typeof combo === 'number' && combo > records.bestCombo) {
    records.bestCombo = combo;
    changed = true;
  }
  if (changed) saveRecords(records);
  return records;
}

function resetRecords() {
  const fresh = defaultRecords();
  saveRecords(fresh);
  return fresh;
}

// ---- DOM rendering ----

function renderTopTable(tbody, top, highlightEntry) {
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!top.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Sin récords todavía';
    td.className = 'records-empty';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  top.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (highlightEntry && entry === highlightEntry) {
      tr.classList.add('records-highlight');
    }
    [i + 1, entry.name, entry.score.toLocaleString(), entry.lines, entry.level].forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderBests(comboEl, linesEl, records) {
  if (comboEl) comboEl.textContent = records.bestCombo;
  if (linesEl) linesEl.textContent = records.maxLines;
}

// ---- Start screen ----

function renderStartScreen() {
  const records = loadRecords();
  renderTopTable(document.getElementById('start-top-body'), records.top, null);
  renderBests(
    document.getElementById('start-best-combo'),
    document.getElementById('start-max-lines'),
    records
  );
}

function hideStartScreen() {
  const el = document.getElementById('start-screen');
  if (el) el.classList.add('hidden');
}

// ---- Game-over screen glue (called by game.js's endGame()) ----

function showGameOverScores(stats) {
  updateBests(stats.lines, stats.combo);
  const records = loadRecords();

  const comboEl = document.getElementById('gameover-combo');
  const linesEl = document.getElementById('gameover-lines');
  if (comboEl) comboEl.textContent = stats.combo;
  if (linesEl) linesEl.textContent = stats.lines;

  renderBests(
    document.getElementById('gameover-best-combo'),
    document.getElementById('gameover-max-lines'),
    records
  );

  const nameEntry = document.getElementById('name-entry');
  if (recordQualifies(stats.score)) {
    pendingGameStats = stats;
    if (nameEntry) nameEntry.classList.remove('hidden');
    const input = document.getElementById('name-input');
    if (input) {
      input.value = '';
      input.focus();
    }
  } else {
    pendingGameStats = null;
    if (nameEntry) nameEntry.classList.add('hidden');
  }

  renderTopTable(document.getElementById('gameover-top-body'), records.top, null);
}

function submitPendingScore() {
  if (!pendingGameStats) return;
  const input = document.getElementById('name-input');
  const name = input ? input.value : '';
  const stats = pendingGameStats;
  const { records, entry } = addRecord(name, stats.score, stats.lines, stats.level);

  renderTopTable(document.getElementById('gameover-top-body'), records.top, entry);

  const nameEntry = document.getElementById('name-entry');
  if (nameEntry) nameEntry.classList.add('hidden');
  pendingGameStats = null;

  renderStartScreen(); // keep the start screen's table fresh for next time
}

// ---- Wiring (runs immediately: script tag sits after the DOM it needs) ----

renderStartScreen();

const playBtn = document.getElementById('play-btn');
if (playBtn) {
  playBtn.addEventListener('click', () => {
    hideStartScreen();
    if (typeof init === 'function') init();
  });
}

const resetScoresBtn = document.getElementById('reset-scores-btn');
if (resetScoresBtn) {
  const resetOriginalLabel = resetScoresBtn.textContent;
  let resetArmed = false;
  let resetArmTimer = null;
  resetScoresBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetScoresBtn.textContent = '¿Seguro?';
      resetArmTimer = setTimeout(() => {
        resetArmed = false;
        resetScoresBtn.textContent = resetOriginalLabel;
      }, RESET_CONFIRM_MS);
    } else {
      clearTimeout(resetArmTimer);
      resetArmed = false;
      resetScoresBtn.textContent = resetOriginalLabel;
      resetRecords();
      renderStartScreen();
    }
  });
}

const nameSubmitBtn = document.getElementById('name-submit-btn');
if (nameSubmitBtn) nameSubmitBtn.addEventListener('click', submitPendingScore);

const nameInput = document.getElementById('name-input');
if (nameInput) {
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitPendingScore();
    }
  });
}
