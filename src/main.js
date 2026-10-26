// Entry point: wires the simulation, renderer, audio, input and UI together.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Bot } from './bot.js';
import { META, CHARACTERS } from './data.js';

const SAVE_KEY = 'ayatori_yako_save_v1';
const params = new URLSearchParams(location.search);
const AUTOPLAY = params.has('autoplay');
const TEST = params.has('test');

function loadSave() {
  const def = { spools: 0, meta: {}, unlocks: {}, best: {}, settings: { music: 0.6, sfx: 0.8, shake: 1, numbers: true }, tutorial: false, runs: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s) return { ...def, ...s, settings: { ...def.settings, ...(s.settings || {}) }, meta: s.meta || {}, unlocks: s.unlocks || {}, best: s.best || {} };
  } catch (e) { /* ignore */ }
  return def;
}
function writeSave() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

const save = loadSave();
if (params.has('unlockall')) { save.unlocks.boss1 = true; save.unlocks.boss2 = true; }
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const audio = new Audio();
const ui = new UI(document.getElementById('ui'), audio);
renderer.settings.shake = save.settings.shake;
renderer.settings.numbers = save.settings.numbers;

let mode = 'title'; // title | run
let game = null;
let bot = null;
let paused = false;
let runOver = false;
let lastUiState = null;
let hintStage = 0;
let hintTimer = 0;
const speed = +(params.get('speed') || 1);

// ---------------------------------------------------------------- input
const keys = new Set();
let dashQueued = false;
const pointer = { down: false, x: 0, y: 0, touch: false, id: null, ox: 0, oy: 0 };
let stickEl = null;

addEventListener('keydown', (e) => {
  audio.init();
  if (ui.layer && ui.onKey(e)) { e.preventDefault(); return; }
  if (mode === 'run' && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) { togglePause(); e.preventDefault(); return; }
  keys.add(e.key.toLowerCase());
  if (e.key === ' ' || e.key === 'Shift') { dashQueued = true; e.preventDefault(); }
  if (e.key.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); pointer.down = false; if (mode === 'run' && game && game.state === 'play' && !AUTOPLAY) togglePause(true); });
addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'run' && game && game.state === 'play' && !AUTOPLAY) togglePause(true); });

canvas.addEventListener('pointerdown', (e) => {
  audio.init();
  if (mode !== 'run') return;
  pointer.down = true; pointer.touch = e.pointerType === 'touch'; pointer.id = e.pointerId;
  pointer.x = pointer.ox = e.clientX; pointer.y = pointer.oy = e.clientY;
  if (pointer.touch) {
    stickEl = document.createElement('div'); stickEl.className = 'stick'; stickEl.innerHTML = '<i></i>';
    stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px';
    document.getElementById('ui').appendChild(stickEl);
  }
});
addEventListener('pointermove', (e) => {
  if (!pointer.down || e.pointerId !== pointer.id) return;
  pointer.x = e.clientX; pointer.y = e.clientY;
  if (stickEl) {
    let dx = pointer.x - pointer.ox, dy = pointer.y - pointer.oy;
    const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx = (dx / l) * m; dy = (dy / l) * m; }
    stickEl.firstChild.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
});
const endPointer = (e) => { if (e.pointerId !== pointer.id) return; pointer.down = false; if (stickEl) { stickEl.remove(); stickEl = null; } };
addEventListener('pointerup', endPointer);
addEventListener('pointercancel', endPointer);

function readInput() {
  let x = 0, y = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 1;
  if (keys.has('d') || keys.has('arrowright')) x += 1;
  if (keys.has('w') || keys.has('arrowup')) y -= 1;
  if (keys.has('s') || keys.has('arrowdown')) y += 1;
  if (pointer.down && x === 0 && y === 0) {
    if (pointer.touch) {
      const dx = pointer.x - pointer.ox, dy = pointer.y - pointer.oy, l = Math.hypot(dx, dy);
      if (l > 8) { const m = Math.min(1, l / 45); x = (dx / l) * m; y = (dy / l) * m; }
    } else {
      const s = renderer.worldToScreen(game.player.x, game.player.y);
      const dx = pointer.x - s.x, dy = pointer.y - s.y, l = Math.hypot(dx, dy);
      if (l > 12) { const m = Math.min(1, l / 60); x = (dx / l) * m; y = (dy / l) * m; }
    }
  }
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  const dash = dashQueued; dashQueued = false;
  return { x, y, dash };
}

let dashBtn = null;
function showTouchDash(show) {
  if (dashBtn) { dashBtn.remove(); dashBtn = null; }
  if (!show || !('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
  dashBtn = document.createElement('button');
  dashBtn.className = 'dashbtn'; dashBtn.textContent = 'ダッシュ';
  dashBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); dashQueued = true; });
  document.getElementById('ui').appendChild(dashBtn);
}

// ---------------------------------------------------------------- portraits
function drawPortrait(cv, ch) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const g = ctx.createRadialGradient(96, 100, 10, 96, 100, 80);
  g.addColorStop(0, ch.glow + '0.45)'); g.addColorStop(1, ch.glow + '0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 192, 192);
  const fake = { player: { x: 0, y: 0, vx: 0, vy: 0, face: 1, inv: 0, dashT: 0, dashCd: 0 }, char: ch, stats: { cdMul: 1 } };
  const saveCtx = renderer.ctx;
  renderer.ctx = ctx;
  ctx.save(); ctx.translate(96, 130); ctx.scale(3.4, 3.4);
  renderer.drawPlayer(ctx, fake);
  ctx.restore();
  renderer.ctx = saveCtx;
}

// ---------------------------------------------------------------- screens
function startAttract() {
  game = new Game({ seed: (Math.random() * 1e9) | 0, char: 'yui' });
  bot = new Bot(game, 'burst');
  renderer.reset(game);
  // fast-forward a little so the title has a lively crowd
  for (let i = 0; i < 60 * 25; i++) { stepGame(1 / 60); }
  renderer.reset(game);
}

function showTitle() {
  mode = 'title';
  runOver = false;
  paused = false;
  ui.removeHud(); ui.hint(null);
  showTouchDash(false);
  startAttract();
  audio.setIntensity(4);
  ui.showTitle(save, (a) => {
    audio.init(); audio.startMusic();
    if (a === 'start') showSelect();
    else if (a === 'howto') ui.showHowto(showTitle2);
    else if (a === 'settings') ui.showSettings(save.settings, applySettings, showTitle2);
    else if (a === 'shop') ui.showShop(save, buyMeta, showTitle2);
  });
}
// return to the title menu without rebuilding the attract game
function showTitle2() {
  ui.showTitle(save, (a) => {
    if (a === 'start') showSelect();
    else if (a === 'howto') ui.showHowto(showTitle2);
    else if (a === 'settings') ui.showSettings(save.settings, applySettings, showTitle2);
    else if (a === 'shop') ui.showShop(save, buyMeta, showTitle2);
  });
}

function showSelect() {
  ui.showSelect(save, drawPortrait, (charId) => startRun(charId), showTitle2);
}

function applySettings(s) {
  save.settings = s;
  renderer.settings.shake = s.shake; renderer.settings.numbers = s.numbers;
  audio.setVolumes(s.music, s.sfx);
  writeSave();
}

function buyMeta(id) {
  const m = META.find((x) => x.id === id);
  const l = save.meta[id] || 0;
  if (l >= m.max) return false;
  const c = m.cost(l);
  if (save.spools < c) return false;
  save.spools -= c; save.meta[id] = l + 1;
  writeSave();
  return true;
}

let lastChar = 'yui';
function startRun(charId) {
  lastChar = charId;
  mode = 'run';
  runOver = false;
  paused = false;
  lastUiState = null;
  ui.clear();
  const seed = params.has('seed') ? +params.get('seed') : (Math.random() * 1e9) | 0;
  game = new Game({ seed, char: charId, meta: { ...save.meta } });
  if (params.has('god')) game.player.maxHp = game.stats.maxHp = game.player.hp = 99999;
  bot = AUTOPLAY ? new Bot(game, params.get('build') || 'random') : null;
  renderer.reset(game);
  ui.buildHud(game, () => togglePause());
  showTouchDash(true);
  audio.init(); audio.startMusic(); audio.setIntensity(0);
  hintStage = save.tutorial || AUTOPLAY ? 99 : 0;
  hintTimer = 0;
  if (params.has('t')) {
    // test helper: fast-forward the simulation to a given time with the bot
    const target = +params.get('t');
    const ffBot = new Bot(game, params.get('build') || 'burst');
    while (game.time < target && game.state !== 'dead' && game.state !== 'win') {
      if (game.state === 'levelup') { game.choose(ffBot.pickChoice(game.choices)); continue; }
      if (game.state === 'chest') { game.closeChest(); continue; }
      game.update(1 / 60, ffBot.input(1 / 60)); game.fx.length = 0;
    }
    renderer.reset(game);
  }
  save.runs++;
  writeSave();
}

function togglePause(force) {
  if (mode !== 'run' || !game || runOver) return;
  if (game.state !== 'play' && !paused) return;
  if (paused && !force) { paused = false; ui.clear(); return; }
  if (paused) return;
  paused = true;
  const showP = () => ui.showPause(game, (a) => {
    if (a === 'resume') { paused = false; ui.clear(); }
    else if (a === 'howto') ui.showHowto(showP);
    else if (a === 'settings') ui.showSettings(save.settings, applySettings, showP);
    else if (a === 'quit') { paused = false; game.state = 'dead'; game.emit({ type: 'dead' }); }
  });
  showP();
}

function endRun() {
  runOver = true;
  const res = game.results();
  const unlocks = [];
  save.spools += res.spools;
  const b = save.best;
  b.time = Math.max(b.time || 0, res.time); b.kills = Math.max(b.kills || 0, res.kills); b.knot = Math.max(b.knot || 0, res.bestKnot);
  if (res.won) b.wins = (b.wins || 0) + 1;
  if (res.bosses >= 1 && !save.unlocks.boss1) { save.unlocks.boss1 = true; unlocks.push('新たな糸「シロガネ（銀の糸）」が解放された'); }
  if (res.bosses >= 2 && !save.unlocks.boss2) { save.unlocks.boss2 = true; unlocks.push('新たな糸「アイ（藍の糸）」が解放された'); }
  if (res.won && !save.unlocks.win) { save.unlocks.win = true; unlocks.push('夜織を祓い、夜明けを迎えた！'); }
  writeSave();
  showTouchDash(false);
  ui.hint(null);
  setTimeout(() => {
    ui.showResults(game, res, unlocks, (a) => {
      if (a === 'retry') startRun(lastChar);
      else showTitle();
    });
  }, res.won ? 600 : 1400);
}

// ---------------------------------------------------------------- tutorial hints
function updateHints(dt) {
  if (hintStage >= 99 || !game) return;
  hintTimer += dt;
  if (hintStage === 0) { ui.hint('<b>WASD / 矢印 / マウス長押し</b> で移動。あなたの後ろに<b>紅い糸</b>が伸びていく'); hintStage = 1; hintTimer = 0; }
  else if (hintStage === 1 && hintTimer > 4) { ui.hint('妖の群れを<b>ぐるりと囲み、自分の糸を横切って</b>輪を結ぼう！'); hintStage = 2; hintTimer = 0; }
  else if (hintStage === 2 && game.knotCount >= 1) { ui.hint('お見事！ <b>一度に多く囲むほど</b>威力が倍増する'); hintStage = 3; hintTimer = 0; }
  else if (hintStage === 3 && hintTimer > 5) { ui.hint('<b>Space / Shift</b> でダッシュ（無敵）。素早く輪を閉じるのにも使える'); hintStage = 4; hintTimer = 0; }
  else if (hintStage === 4 && hintTimer > 5) { ui.hint(null); hintStage = 5; }
  else if (hintStage === 5 && game.level >= 3) { save.tutorial = true; writeSave(); hintStage = 99; }
}

// ---------------------------------------------------------------- loop
function stepGame(dt) {
  if (!game) return;
  if (mode === 'title' || AUTOPLAY) {
    if (game.state === 'levelup') { game.choose(bot.pickChoice(game.choices)); }
    if (game.state === 'chest') { game.closeChest(); }
    if (mode === 'title' && (game.state === 'dead' || game.state === 'win')) { startAttract(); return; }
    game.update(dt, bot.input(dt));
    if (mode === 'title' && game.player.hp < game.player.maxHp * 0.5) game.player.hp = game.player.maxHp;
  } else {
    game.update(dt, readInput());
  }
}

function handleRunEvents(fx) {
  for (const e of fx) {
    if (e.type === 'bossSpawn') ui.banner('大妖 襲来', `${e.name} ― ${e.title}`);
    else if (e.type === 'bossDead' && e.id !== 'jorou') ui.banner('調伏', '大妖を祓った！', true);
    else if (e.type === 'evolve') ui.banner('結び直し', `${upName(e.id)} が生まれた`, true);
    else if (e.type === 'warn') ui.toast(e.text);
    else if (e.type === 'greatKnot') ui.toast(`大結び！ ${e.n}体`);
    else if (e.type === 'revive') ui.toast('身代わり人形が砕けた…！');
  }
}
import { EVOLUTIONS } from './data.js';
function upName(id) { return EVOLUTIONS[id]?.name || id; }

let last = performance.now();
let acc = 0;
const STEP = 1 / 60;
function frame(now) {
  if (!params.has('capture')) requestAnimationFrame(frame);
  let dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  if (!game) return;
  const v = renderer.viewSize();
  game.view.w = v.w; game.view.h = v.h;
  const running = !(mode === 'run' && (paused || runOver));
  if (running) {
    acc += dt * (AUTOPLAY ? speed : 1);
    let n = 0;
    while (acc >= STEP && n < 8) { stepGame(STEP); acc -= STEP; n++; }
    if (n === 8) acc = 0;
  }
  const fx = game.fx;
  renderer.consume(game, fx);
  if (mode === 'run') { audio.handle(fx); handleRunEvents(fx); }
  game.fx = [];
  const frozen = mode === 'run' && (paused || game.state === 'levelup' || game.state === 'chest');
  renderer.draw(game, frozen ? 0 : dt, { preview: mode === 'run' });

  if (mode === 'run') {
    ui.updateHud(game);
    if (!runOver) updateHints(dt);
    // music intensity
    const b = game.boss;
    audio.setIntensity(b ? (b.def.boss === 3 ? 3 : 2) : game.time > 300 ? 1 : 0);
    if (!runOver && !paused) {
      if (game.state === 'levelup' && lastUiState !== 'levelup' + game.level + game.pendingLevels + game.choices?.join()) {
        lastUiState = 'levelup' + game.level + game.pendingLevels + game.choices?.join();
        if (!AUTOPLAY) ui.showLevelUp(game, (i) => { game.choose(i); ui.clear(); lastUiState = null; }, () => { if (game.reroll()) { lastUiState = null; } });
      } else if (game.state === 'chest' && lastUiState !== 'chest') {
        lastUiState = 'chest';
        if (!AUTOPLAY) ui.showChest(game, () => { game.closeChest(); ui.clear(); lastUiState = null; });
      } else if (game.state === 'dead' || game.state === 'win') {
        endRun();
      }
    }
  }
}

// debug/test hooks
window.__ayatori = {
  get game() { return game; }, get mode() { return mode; }, renderer, ui, audio, save,
  start: (c) => startRun(c || 'yui'), title: () => showTitle(),
};

applySettings(save.settings);
if (TEST && params.has('run')) startRun(params.get('char') || 'yui');
else if (AUTOPLAY) startRun(params.get('char') || 'yui');
else showTitle();
// Capture mode (used to record docs/demo.gif): the page is stepped frame-by-frame by the
// recorder instead of requestAnimationFrame, so the recording is smooth regardless of host speed.
if (params.has('capture')) {
  let simNow = performance.now();
  last = simNow;
  window.__frame = (ms = 1000 / 30) => { simNow += ms; frame(simNow); };
} else requestAnimationFrame(frame);
