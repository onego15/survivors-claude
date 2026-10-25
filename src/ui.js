// DOM user interface: menus, HUD, level-up cards, results.
import { UPGRADES, EVOLUTIONS, CHARACTERS, META, MAX_WEAPONS } from './data.js';

const $ = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const fmtTime = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const KIND = { art: '結術', charm: '御守', passive: '心得' };

export function upInfo(id) {
  if (EVOLUTIONS[id]) return { ...EVOLUTIONS[id], kind: 'evo', max: 1 };
  if (id === '_heal') return { name: '休息', en: 'Rest', icon: '癒', color: '#8dffb0', kind: 'misc', desc: () => '体力を40回復する。', max: 1 };
  if (id === '_spool') return { name: '糸巻', en: 'Spools', icon: '巻', color: '#ffcf5a', kind: 'misc', desc: () => '工房で使える糸巻を15個得る。', max: 1 };
  return UPGRADES[id];
}

export class UI {
  constructor(root, audio) {
    this.root = root;
    this.audio = audio;
    this.layer = null;
    this.hud = null;
    this.keyHandler = null;
    this.focusIdx = 0;
    this.focusables = [];
  }

  clear() {
    if (this.layer) { this.layer.remove(); this.layer = null; }
    this.focusables = [];
    this.keyHandler = null;
  }

  mount(el) {
    this.clear();
    this.layer = el;
    this.root.appendChild(el);
    const btns = [...el.querySelectorAll('[data-nav]')];
    this.focusables = btns;
    btns.forEach((b, i) => {
      b.addEventListener('mouseenter', () => { this.setFocus(i); });
      b.addEventListener('click', () => this.audio.ui('select'));
    });
    this.focusIdx = 0;
    if (btns.length) this.setFocus(0, true);
    return el;
  }

  setFocus(i, silent) {
    if (!this.focusables.length) return;
    this.focusIdx = (i + this.focusables.length) % this.focusables.length;
    this.focusables.forEach((b, k) => b.classList.toggle('sel', k === this.focusIdx));
    if (!silent) this.audio.ui('hover');
  }

  // generic keyboard navigation; returns true if handled
  onKey(e) {
    if (this.keyHandler && this.keyHandler(e)) return true;
    if (!this.focusables.length) return false;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 's' || k === 'd') { this.setFocus(this.focusIdx + 1); return true; }
    if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'w' || k === 'a') { this.setFocus(this.focusIdx - 1); return true; }
    if (k === 'Enter' || k === ' ') { const b = this.focusables[this.focusIdx]; if (b && !b.disabled) b.click(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- title
  showTitle(save, cb) {
    const best = save.best || {};
    const el = this.mount($(`
      <div class="screen" style="background: radial-gradient(ellipse at center, rgba(8,6,18,0.15), rgba(5,4,12,0.78));">
        <div class="spools">糸巻 ${save.spools}</div>
        <div class="title-wrap">
          <div class="logo-sub">AYATORI YAKO</div>
          <h1 class="logo">あやと<span class="thread">り</span>夜行</h1>
          <svg class="title-thread" viewBox="0 0 520 30"><path d="M10 15 C 120 -5, 180 35, 260 15 S 400 -5, 510 15" fill="none" stroke="#ff3b5c" stroke-width="2.5" stroke-linecap="round" style="filter: drop-shadow(0 0 6px #ff3b5c)"/></svg>
          <div class="tagline">糸で輪を結び、百鬼を祓え</div>
          <div class="menu">
            <button class="btn primary" data-nav data-a="start">はじめる</button>
            <button class="btn" data-nav data-a="howto">遊び方</button>
            <button class="btn" data-nav data-a="shop">工房 <span class="muted" style="font-size:12px">（永続強化）</span></button>
            <button class="btn" data-nav data-a="settings">設定</button>
          </div>
        </div>
        <div class="title-foot">${best.time ? `最高記録 ${fmtTime(best.time)} ・ 最大結び ${best.knot || 0}体 ・ 撃破 ${best.kills || 0}${best.wins ? ` ・ 祓い成功 ${best.wins}回` : ''}` : '移動：WASD / 矢印キー / マウス長押し / タッチ　　ダッシュ：Space / Shift'}</div>
      </div>`));
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => cb(b.dataset.a)));
  }

  // ---------------------------------------------------------------- character select
  showSelect(save, drawPortrait, cb, back) {
    const unlocked = (c) => !c.unlock || save.unlocks?.[c.unlock.key];
    const el = this.mount($(`
      <div class="screen dim">
        <div class="panel" style="max-width:860px">
          <h2 class="heading">糸を選ぶ<small>CHOOSE YOUR THREAD</small></h2>
          <div class="chars">
            ${CHARACTERS.map((c) => `
              <div class="char ${unlocked(c) ? '' : 'locked'}" data-nav data-id="${c.id}" tabindex="0">
                <canvas width="192" height="192" data-portrait="${c.id}"></canvas>
                <div class="nm" style="color:${c.color}">${c.name}</div>
                <div class="tt" style="color:${c.color}">${c.title}</div>
                <div class="ds">${c.desc}<br><span class="muted">初期：${UPGRADES[c.start].name}・${UPGRADES[c.charm].name}</span></div>
                ${unlocked(c) ? '' : `<div class="lock">🔒 ${c.unlock.text}</div>`}
              </div>`).join('')}
          </div>
          <div class="row"><button class="btn small" data-nav data-a="back">戻る</button></div>
        </div>
      </div>`));
    el.querySelectorAll('canvas[data-portrait]').forEach((cv) => drawPortrait(cv, CHARACTERS.find((c) => c.id === cv.dataset.portrait)));
    el.querySelectorAll('.char').forEach((d) => d.addEventListener('click', () => {
      const c = CHARACTERS.find((x) => x.id === d.dataset.id);
      if (!unlocked(c)) { this.audio.ui('back'); return; }
      cb(c.id);
    }));
    el.querySelector('[data-a=back]').addEventListener('click', back);
  }

  // ---------------------------------------------------------------- how to play
  showHowto(back) {
    const el = this.mount($(`
      <div class="screen dim">
        <div class="panel">
          <h2 class="heading">遊び方<small>HOW TO PLAY</small></h2>
          <div class="howto">
            <figure>
              <svg viewBox="0 0 200 130"><path d="M20 100 C 50 100, 70 60, 110 60 S 160 40, 170 30" fill="none" stroke="#ff3b5c" stroke-width="3" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #ff3b5c)"/><circle cx="170" cy="30" r="9" fill="#f3ead6"/><text x="20" y="124" fill="#9a93ad" font-size="11">移動すると糸が伸びる</text></svg>
              <figcaption><b>① 動くと糸が伸びる</b>あなたの後ろには、いつも紅い糸がたなびいています。糸には長さの限界があります。</figcaption>
            </figure>
            <figure>
              <svg viewBox="0 0 200 130"><path d="M60 110 C 20 80, 30 30, 90 25 S 170 50, 150 90 S 80 110, 60 70" fill="rgba(255,60,90,0.18)" stroke="#ff3b5c" stroke-width="3" stroke-linecap="round" style="filter:drop-shadow(0 0 4px #ff3b5c)"/><circle cx="66" cy="84" r="9" fill="none" stroke="#ffcf5a" stroke-width="2"/><g fill="#2a2240" stroke="#000"><circle cx="95" cy="60" r="8"/><circle cx="118" cy="72" r="8"/><circle cx="100" cy="84" r="8"/><circle cx="125" cy="50" r="8"/></g><text x="10" y="124" fill="#9a93ad" font-size="11">自分の糸を横切ると輪が閉じる</text></svg>
              <figcaption><b>② 自分の糸を横切って輪を結ぶ</b>妖の群れの周りをぐるりと回り、自分の糸に触れると「結び」が発動！</figcaption>
            </figure>
            <figure>
              <svg viewBox="0 0 200 130"><text x="100" y="80" text-anchor="middle" font-size="64" fill="#fff" style="font-family:'Zen Antique',serif;filter:drop-shadow(0 0 10px #ff3b5c)">結</text><text x="100" y="118" text-anchor="middle" fill="#ffcf5a" font-size="14" font-weight="700">12体 結び！</text></svg>
              <figcaption><b>③ 輪の中の妖をまとめて祓う</b>一度に多く捕らえるほど威力が倍増。結術（強化）で輪に爆発や雷などの効果が加わります。</figcaption>
            </figure>
          </div>
          <div class="ctrl"><span><kbd>WASD</kbd>/<kbd>矢印</kbd>/マウス長押し：移動</span><span><kbd>Space</kbd>/<kbd>Shift</kbd>：ダッシュ（無敵）</span><span><kbd>Esc</kbd>：ポーズ</span><span>スマホ：左で移動・右下でダッシュ</span></div>
          <ul class="tips">
            <li>輪が閉じる直前、閉じる位置が<b class="gold">金色の円</b>で光ります。</li>
            <li>糸に触れた妖は<b class="gold">絡まって鈍く</b>なります。囲い込みのチャンス。</li>
            <li>短い間に続けて結ぶと<b class="gold">「連」</b>でダメージが上がります。</li>
            <li>輪の中の魂玉はまとめて回収できます。</li>
            <li><b style="color:#ff6b7a">糸切り（鋏の妖）</b>は糸を断ち切ります。先に倒しましょう。</li>
            <li>結術 Lv5 ＋ 対応する心得で<b class="gold">「結び直し」（進化）</b>が出現。</li>
            <li>4分・8分に大妖、12分に最後の大妖「夜織」が現れます。</li>
            <li>糸巻を集めて<b class="gold">工房</b>で永続強化。新たな糸も解放されます。</li>
          </ul>
          <div class="row"><button class="btn" data-nav data-a="back">戻る</button></div>
        </div>
      </div>`));
    el.querySelector('[data-a=back]').addEventListener('click', back);
  }

  // ---------------------------------------------------------------- settings
  showSettings(settings, onChange, back) {
    const el = this.mount($(`
      <div class="screen dim">
        <div class="panel" style="max-width:520px">
          <h2 class="heading">設定<small>SETTINGS</small></h2>
          <div class="settings">
            <label>音楽 <input type="range" min="0" max="1" step="0.05" data-k="music" value="${settings.music}"><span>${Math.round(settings.music * 100)}</span></label>
            <label>効果音 <input type="range" min="0" max="1" step="0.05" data-k="sfx" value="${settings.sfx}"><span>${Math.round(settings.sfx * 100)}</span></label>
            <label>画面の揺れ <input type="range" min="0" max="1" step="0.1" data-k="shake" value="${settings.shake}"><span>${Math.round(settings.shake * 100)}</span></label>
            <label class="tog">ダメージ表示 <span><button class="btn small" data-nav data-t="numbers">${settings.numbers ? 'ON' : 'OFF'}</button></span></label>
          </div>
          <div class="row"><button class="btn" data-nav data-a="back">戻る</button></div>
        </div>
      </div>`));
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      settings[inp.dataset.k] = +inp.value; inp.nextElementSibling.textContent = Math.round(inp.value * 100); onChange(settings);
    }));
    el.querySelector('[data-t=numbers]').addEventListener('click', (e) => { settings.numbers = !settings.numbers; e.target.textContent = settings.numbers ? 'ON' : 'OFF'; onChange(settings); });
    el.querySelector('[data-a=back]').addEventListener('click', back);
  }

  // ---------------------------------------------------------------- shop
  showShop(save, buy, back) {
    const render = () => {
      const el = this.mount($(`
        <div class="screen dim">
          <div class="panel">
            <h2 class="heading">工房<small>WORKSHOP — 糸巻 ${save.spools}</small></h2>
            <div class="shop">
              ${META.map((m) => {
                const l = save.meta[m.id] || 0, max = l >= m.max, cost = m.cost(l);
                return `<div class="item"><div class="t"><b>${m.name}</b><span>${m.desc}</span>
                  <div class="pips">${Array.from({ length: m.max }, (_, i) => `<u class="${i < l ? 'on' : ''}"></u>`).join('')}</div></div>
                  <button class="btn small" data-nav data-id="${m.id}" ${max || save.spools < cost ? 'disabled' : ''}>${max ? '最大' : `糸巻 ${cost}`}</button></div>`;
              }).join('')}
            </div>
            <div class="row"><button class="btn" data-nav data-a="back">戻る</button></div>
          </div>
        </div>`));
      el.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => { if (buy(b.dataset.id)) { this.audio.ui('open'); render(); } }));
      el.querySelector('[data-a=back]').addEventListener('click', back);
    };
    render();
  }

  // ---------------------------------------------------------------- HUD
  buildHud(game, onPause) {
    if (this.hud) this.hud.remove();
    this.hud = $(`
      <div class="hud">
        <div class="xpbar"><i></i></div>
        <div class="lvl"></div>
        <div class="timer"></div>
        <div class="kills"></div>
        <div class="hpbox">
          <div class="hpbar"><i></i><b></b></div>
          <div class="threadbar"><i></i></div>
          <div class="threadlbl">糸</div>
          <div class="slots w"></div>
          <div class="slots p"></div>
        </div>
        <div class="combo"><div class="c1"></div><div class="c2"></div></div>
        <button class="pausebtn" title="ポーズ (Esc)">❚❚</button>
        <div class="bossbar" style="display:none"><div class="bn"></div><div class="bb"><s></s><i></i></div></div>
      </div>`);
    this.root.prepend(this.hud);
    this.hud.querySelector('.pausebtn').addEventListener('click', onPause);
    this.h = {
      xp: this.hud.querySelector('.xpbar i'), lvl: this.hud.querySelector('.lvl'), timer: this.hud.querySelector('.timer'), kills: this.hud.querySelector('.kills'),
      hp: this.hud.querySelector('.hpbar i'), hpt: this.hud.querySelector('.hpbar b'), th: this.hud.querySelector('.threadbar i'),
      w: this.hud.querySelector('.slots.w'), p: this.hud.querySelector('.slots.p'), c1: this.hud.querySelector('.combo .c1'), c2: this.hud.querySelector('.combo .c2'),
      boss: this.hud.querySelector('.bossbar'), bn: this.hud.querySelector('.bossbar .bn'), bb: this.hud.querySelector('.bossbar .bb i'), bbs: this.hud.querySelector('.bossbar .bb s'),
    };
    this.slotKey = '';
    this.last = {};
  }

  removeHud() { if (this.hud) { this.hud.remove(); this.hud = null; } }

  set(key, el, prop, val) {
    if (this.last[key] === val) return;
    this.last[key] = val;
    if (prop === 'text') el.textContent = val; else el.style[prop] = val;
  }

  updateHud(game) {
    if (!this.hud) return;
    const h = this.h, p = game.player;
    this.set('xp', h.xp, 'width', `${Math.min(100, (game.xp / game.xpNext) * 100).toFixed(1)}%`);
    this.set('lvl', h.lvl, 'text', `Lv ${game.level}`);
    this.set('timer', h.timer, 'text', fmtTime(game.time));
    this.set('kills', h.kills, 'text', `祓った妖 ${game.kills}`);
    this.set('hp', h.hp, 'width', `${Math.max(0, (p.hp / p.maxHp) * 100).toFixed(1)}%`);
    this.set('hpt', h.hpt, 'text', `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.maxHp)}`);
    this.set('th', h.th, 'width', `${Math.min(100, (game.threadLen / game.stats.threadLen) * 100).toFixed(0)}%`);
    this.set('c1', h.c1, 'text', game.combo >= 2 ? `連 ×${game.combo}` : '');
    this.set('c2', h.c2, 'text', `最大結び ${game.bestKnot}体`);
    const key = game.weapons.map((w) => w + game.lv(w) + (game.evolved[w] ? '*' : '')).join() + '|' + game.passives.map((w) => w + game.lv(w)).join();
    if (key !== this.slotKey) {
      this.slotKey = key;
      const slot = (id, passive) => {
        const up = UPGRADES[id];
        const ev = game.evolved[id] ? EVOLUTIONS[up.evolve.into] : null;
        const icon = ev ? ev.icon : up.icon, color = ev ? ev.color : up.color;
        const pips = passive ? '' : `<span class="pips">${Array.from({ length: up.max }, (_, i) => `<u class="${i < game.lv(id) ? 'on' : ''}"></u>`).join('')}</span>`;
        return `<div class="slot ${passive ? 'passive' : ''} ${ev ? 'ev' : ''}" style="color:${color}" title="${ev ? ev.name : up.name}">${icon}${passive ? `<sub style="font-size:9px;color:#ccc">${game.lv(id)}</sub>` : ''}${pips}</div>`;
      };
      h.w.innerHTML = game.weapons.map((w) => slot(w, false)).join('');
      h.p.innerHTML = game.passives.map((w) => slot(w, true)).join('');
    }
    const b = game.boss;
    if (b && !b.dead) {
      this.set('bossOn', h.boss, 'display', 'block');
      this.set('bn', h.bn, 'text', `${b.def.name} ― ${b.def.title}`);
      const f = `${Math.max(0, (b.hp / b.maxHp) * 100).toFixed(1)}%`;
      this.set('bb', h.bb, 'width', f);
      this.set('bbs', h.bbs, 'width', f);
    } else this.set('bossOn', h.boss, 'display', 'none');
  }

  // ---------------------------------------------------------------- transient messages
  banner(text, sub, gold) {
    const el = $(`<div class="banner ${gold ? 'gold' : ''}"><div class="b1">${text}</div><div class="b2">${sub || ''}</div></div>`);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 3300);
  }

  toast(text) {
    const el = $(`<div class="toast">${text}</div>`);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2700);
  }

  hint(html) {
    if (this.hintEl) this.hintEl.remove();
    this.hintEl = null;
    if (!html) return;
    this.hintEl = $(`<div class="hint">${html}</div>`);
    this.root.appendChild(this.hintEl);
  }

  // ---------------------------------------------------------------- level up
  cardHtml(id, game, i, opts = {}) {
    const info = upInfo(id);
    const isEvo = info.kind === 'evo';
    const lv = isEvo ? 0 : game.lv(id);
    const kind = isEvo ? '結び直し' : KIND[info.kind] || '';
    const desc = isEvo ? info.desc : info.desc(lv);
    const lvTxt = isEvo ? `${UPGRADES[info.from].name} の進化` : info.kind === 'misc' ? '' : lv === 0 ? 'NEW!' : `Lv ${lv} → ${lv + 1}`;
    let syn = '';
    if (!isEvo && UPGRADES[id]?.evolve) {
      const ev = EVOLUTIONS[UPGRADES[id].evolve.into];
      syn = `進化：${UPGRADES[UPGRADES[id].evolve.with].name} と組み合わせ「${ev.name}」`;
    } else if (!isEvo && UPGRADES[id]?.kind === 'passive') {
      const pairs = Object.values(UPGRADES).filter((u) => u.evolve?.with === id).map((u) => u.name);
      if (pairs.length) syn = `進化の鍵：${pairs.join('・')}`;
    }
    const pips = isEvo || info.kind === 'misc' ? '' : `<div class="pips">${Array.from({ length: info.max }, (_, k) => `<u class="${k < lv ? 'on' : k === lv ? 'next' : ''}"></u>`).join('')}</div>`;
    return `
      <button class="card ${isEvo ? 'evo' : ''}" ${opts.nav === false ? '' : 'data-nav'} data-i="${i}">
        <span class="kind ${info.kind}">${kind}</span>
        <div class="ic" style="background:${info.color}">${info.icon}</div>
        <div class="nm">${info.name}</div>
        <div class="en">${info.en || ''}</div>
        ${lvTxt ? `<div class="lv ${lv === 0 && !isEvo ? 'new' : ''}">${lvTxt}</div>` : ''}
        <div class="ds">${desc}</div>
        ${syn ? `<div class="syn">${syn}</div>` : ''}
        ${pips}
        ${opts.nav === false ? '' : `<span class="num">${i + 1}</span>`}
      </button>`;
  }

  showLevelUp(game, choose, reroll) {
    const el = this.mount($(`
      <div class="screen dim lvup">
        <div class="panel">
          <h2 class="heading">Lv ${game.level - game.pendingLevels + 1} ― 糸を紡ぐ<small>CHOOSE AN UPGRADE${game.pendingLevels > 1 ? ` （あと ${game.pendingLevels - 1} 回）` : ''}</small></h2>
          <div class="cards">${game.choices.map((id, i) => this.cardHtml(id, game, i)).join('')}</div>
          <div class="lvbar">
            <span class="muted" style="font-size:12px">武器枠 ${game.weapons.length}/${MAX_WEAPONS} ・ 心得 ${game.passives.length}/6 ・ 数字キーでも選択</span>
            <button class="btn small" data-a="reroll" ${game.rerolls > 0 ? '' : 'disabled'}>引き直し（残り ${game.rerolls}）</button>
          </div>
        </div>
      </div>`));
    el.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => choose(+c.dataset.i)));
    el.querySelector('[data-a=reroll]').addEventListener('click', reroll);
    // ignore stray key presses for a moment so movement keys don't instantly pick a card
    const opened = performance.now();
    this.keyHandler = (e) => {
      if (performance.now() - opened < 350) return true;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= game.choices.length) { choose(n - 1); return true; }
      if (e.key === 'r' || e.key === 'R') { reroll(); return true; }
      return false;
    };
  }

  showChest(game, done) {
    const items = game.chest.items;
    const el = this.mount($(`
      <div class="screen dim">
        <div class="panel chestbox" style="max-width:760px">
          <h2 class="heading">玉手箱<small>TREASURE</small></h2>
          <div class="chest-items">${items.map((id, i) => `<div style="animation-delay:${i * 0.25}s">${this.cardHtml(id, game, i, { nav: false })}</div>`).join('')}</div>
          <div class="row"><button class="btn primary" data-nav data-a="ok">受け取る</button></div>
        </div>
      </div>`));
    el.querySelectorAll('.card').forEach((c, i) => { c.style.animationDelay = `${i * 0.25}s`; c.style.pointerEvents = 'none'; c.querySelector('.lv') && (c.querySelector('.lv').textContent = upInfo(items[i]).kind === 'evo' ? '結び直し！' : `Lv ${game.lv(items[i])}`); c.querySelector('.pips') && c.querySelector('.pips').remove(); });
    el.querySelector('[data-a=ok]').addEventListener('click', done);
    this.audio.ui('open');
  }

  // ---------------------------------------------------------------- pause & results
  buildList(game) {
    return game.weapons.map((w) => {
      const up = UPGRADES[w], ev = game.evolved[w] ? EVOLUTIONS[up.evolve.into] : null;
      return `<span class="slot ${ev ? 'ev' : ''}" style="color:${(ev || up).color}"><em>${(ev || up).icon}</em>${(ev || up).name} ${ev ? '' : 'Lv' + game.lv(w)}</span>`;
    }).join('') + game.passives.map((w) => `<span class="slot" style="color:${UPGRADES[w].color}"><em>${UPGRADES[w].icon}</em>${UPGRADES[w].name} Lv${game.lv(w)}</span>`).join('');
  }

  showPause(game, cb) {
    const el = this.mount($(`
      <div class="screen dim">
        <div class="panel" style="max-width:720px">
          <h2 class="heading">ひと休み<small>PAUSED — ${fmtTime(game.time)}</small></h2>
          <div class="build">${this.buildList(game)}</div>
          <div class="row" style="flex-direction:column;align-items:center">
            <button class="btn primary" data-nav data-a="resume">再開する</button>
            <button class="btn" data-nav data-a="howto">遊び方</button>
            <button class="btn" data-nav data-a="settings">設定</button>
            <button class="btn" data-nav data-a="quit">あきらめる</button>
          </div>
        </div>
      </div>`));
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => cb(b.dataset.a)));
    this.keyHandler = (e) => { if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { cb('resume'); return true; } return false; };
  }

  showResults(game, res, unlocks, cb) {
    const names = { knot: '結び', burst: '爆結', thunder: '雷結', seal: '封陣', gravity: '引結', petal: '花結', shiki: '折鶴', razor: '刃糸', needle: '縫針', bell: '神楽鈴', foxfire: '狐火' };
    const dmg = Object.entries(res.dmg).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = dmg.length ? dmg[0][1] : 1;
    const el = this.mount($(`
      <div class="screen dim">
        <div class="panel" style="max-width:760px">
          <h2 class="heading" style="font-size:38px">${res.won ? '夜明け' : '糸が切れた…'}<small>${res.won ? 'THE NIGHT PARADE IS OVER — 祓い成功！' : 'GAME OVER'}</small></h2>
          ${unlocks.map((u) => `<p class="unlock">✦ ${u}</p>`).join('')}
          <div class="stats">
            <div class="stat"><div class="k">生存時間</div><div class="v">${fmtTime(res.time)}</div></div>
            <div class="stat"><div class="k">祓った妖</div><div class="v">${res.kills}</div></div>
            <div class="stat"><div class="k">レベル</div><div class="v">${res.level}</div></div>
            <div class="stat"><div class="k">最大結び</div><div class="v">${res.bestKnot}体</div></div>
            <div class="stat"><div class="k">結んだ輪</div><div class="v">${res.knots}</div></div>
            <div class="stat"><div class="k">獲得 糸巻</div><div class="v gold">+${res.spools}</div></div>
          </div>
          <div class="build">${this.buildList(game)}</div>
          <div class="dmgbars">${dmg.map(([k, v]) => `<div><span>${names[k] || k}</span><i style="width:${(v / max) * 100}%"></i><span class="muted">${Math.round(v).toLocaleString()}</span></div>`).join('')}</div>
          <div class="row">
            <button class="btn primary" data-nav data-a="retry">もう一度</button>
            <button class="btn" data-nav data-a="title">タイトルへ</button>
          </div>
        </div>
      </div>`));
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => cb(b.dataset.a)));
  }
}

export { fmtTime };
