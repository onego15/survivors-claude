// Game content definitions: upgrades, enemies, characters, meta shop.

export const RUN_LENGTH = 720; // seconds until the final boss appears (12:00)
export const BOSS_TIMES = [240, 480, RUN_LENGTH];

// ---- Upgrades -------------------------------------------------------------
// kind: 'art' (結術, triggers when a loop closes), 'charm' (御守, auto weapon), 'passive'
// Weapon slots (art + charm) and passive slots are limited.
export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

export const UPGRADES = {
  // --- 結術 Knot Arts: fire when you close a loop
  burst: {
    kind: 'art', name: '爆結', en: 'Burst Knot', icon: '爆', color: '#ff7a45', max: 5,
    desc: (lv) => lv === 0 ? '輪で捕らえた妖が爆ぜ、周囲を巻き込む。' : `爆発の威力と範囲が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ radius: 38 + lv * 9, dmg: 10 + lv * 7 }),
    evolve: { with: 'steel', into: 'burst_x' },
  },
  thunder: {
    kind: 'art', name: '雷結', en: 'Thunder Knot', icon: '雷', color: '#9fd6ff', max: 5,
    desc: (lv) => lv === 0 ? '輪を閉じると、輪の外の妖へ雷が走る。' : `雷の本数と威力が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ arcs: 2 + lv, dmg: 16 + lv * 9, chain: lv >= 3 ? 1 : 0, range: 320 }),
    evolve: { with: 'haste', into: 'thunder_x' },
  },
  seal: {
    kind: 'art', name: '封陣', en: 'Seal Field', icon: '封', color: '#c792ff', max: 5,
    desc: (lv) => lv === 0 ? '閉じた輪がしばらく残り、中の妖を蝕み鈍らせる。' : `持続時間と継続ダメージが上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ life: 1.6 + lv * 0.5, dps: 9 + lv * 6, slow: 0.45 }),
    evolve: { with: 'ward', into: 'seal_x' },
  },
  gravity: {
    kind: 'art', name: '引結', en: 'Gravity Knot', icon: '引', color: '#7ef0c8', max: 5,
    desc: (lv) => lv === 0 ? '輪を閉じる瞬間、周囲の妖を輪の中へ引きずり込む。' : `引き込む範囲が拡大（Lv${lv + 1}）`,
    stat: (lv) => ({ reach: 70 + lv * 28, power: 1 }),
    evolve: { with: 'magnet', into: 'gravity_x' },
  },
  petal: {
    kind: 'art', name: '花結', en: 'Petal Knot', icon: '花', color: '#ff9ccf', max: 5,
    desc: (lv) => lv === 0 ? '輪の縁から花弁の刃が外へ舞い散る。' : `花弁の数と貫通が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ count: 8 + lv * 3, dmg: 9 + lv * 4, pierce: 1 + Math.floor(lv / 2) }),
    evolve: { with: 'swift', into: 'petal_x' },
  },
  echo: {
    kind: 'art', name: '響結', en: 'Echo Knot', icon: '響', color: '#ffe08a', max: 5,
    desc: (lv) => lv === 0 ? '閉じた輪が少し遅れてもう一度締まる。' : `残響の威力が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ echoes: lv >= 4 ? 2 : 1, ratio: 0.4 + lv * 0.1 }),
    evolve: { with: 'luck', into: 'echo_x' },
  },
  shiki: {
    kind: 'art', name: '折鶴', en: 'Paper Cranes', icon: '鶴', color: '#f4f1e6', max: 5,
    desc: (lv) => lv === 0 ? '輪を閉じると折鶴の式神が生まれ、妖を追う。捕らえた数が多いほど増える。' : `折鶴の数・威力・寿命が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ base: 1, per: 8, cap: 3 + lv, life: 4 + lv * 0.8, dmg: 10 + lv * 5 }),
    evolve: { with: 'vigor', into: 'shiki_x' },
  },
  razor: {
    kind: 'art', name: '刃糸', en: 'Razor Thread', icon: '刃', color: '#e6f0ff', max: 5,
    desc: (lv) => lv === 0 ? '糸そのものが刃になり、触れた妖を切り刻む。' : `糸の切れ味が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ dmg: 5 + lv * 4, tick: 0.3 }),
    evolve: { with: 'longthread', into: 'razor_x' },
  },
  // --- 御守 Charms: always-on weapons, which loops "excite"
  needle: {
    kind: 'charm', name: '縫針', en: 'Needles', icon: '針', color: '#d8e6ff', max: 5,
    desc: (lv) => lv === 0 ? '最寄りの妖へ針を放つ。輪を閉じた直後は連射になる。' : `針の数と威力が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ cd: 0.95 - lv * 0.07, dmg: 8 + lv * 4, count: 1 + Math.floor((lv + 1) / 2), pierce: lv >= 3 ? 2 : 1 }),
    evolve: { with: 'haste', into: 'needle_x' },
  },
  bell: {
    kind: 'charm', name: '神楽鈴', en: 'Kagura Bell', icon: '鈴', color: '#ffd76a', max: 5,
    desc: (lv) => lv === 0 ? '一定間隔で鈴が鳴り、衝撃波で妖を押し返す。輪を閉じると即座に鳴る。' : `衝撃波の範囲と威力が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ cd: 3.2 - lv * 0.25, radius: 95 + lv * 16, dmg: 10 + lv * 7 }),
    evolve: { with: 'ward', into: 'bell_x' },
  },
  foxfire: {
    kind: 'charm', name: '狐火', en: 'Foxfire', icon: '狐', color: '#7fd8ff', max: 5,
    desc: (lv) => lv === 0 ? '青い狐火が身の回りを巡る。糸が長いほど速く回る。' : `狐火の数と威力が上昇（Lv${lv + 1}）`,
    stat: (lv) => ({ count: 1 + lv, dmg: 7 + lv * 3, radius: 72 + lv * 4 }),
    evolve: { with: 'magnet', into: 'foxfire_x' },
  },
  // --- Passives
  longthread: { kind: 'passive', name: '長糸', en: 'Long Thread', icon: '長', color: '#ff6b6b', max: 5,
    desc: (lv) => `糸の長さ +18%（大きな輪を描ける）` },
  steel: { kind: 'passive', name: '鋼糸', en: 'Steel Thread', icon: '鋼', color: '#b8c4d6', max: 5,
    desc: (lv) => `輪の締め付けダメージ +15%` },
  swift: { kind: 'passive', name: '韋駄天', en: 'Swiftness', icon: '駆', color: '#8ff0a4', max: 5,
    desc: (lv) => `移動速度 +8%` },
  magnet: { kind: 'passive', name: '吸魂', en: 'Soul Pull', icon: '魂', color: '#7fc8ff', max: 5,
    desc: (lv) => `魂玉の回収範囲 +35%` },
  ward: { kind: 'passive', name: '護符', en: 'Ward', icon: '護', color: '#ffcf70', max: 5,
    desc: (lv) => `受けるダメージ -1、被弾後の無敵時間 +10%` },
  vigor: { kind: 'passive', name: '生命', en: 'Vigor', icon: '命', color: '#ff8fa3', max: 5,
    desc: (lv) => `最大体力 +20、毎秒 0.25 回復` },
  luck: { kind: 'passive', name: '招福', en: 'Fortune', icon: '福', color: '#ffe066', max: 5,
    desc: (lv) => lv === 2 ? `会心率 +6%。強化候補が4枚に！` : `輪の会心率 +6%（会心で2倍）、宝箱の出現率上昇` },
  haste: { kind: 'passive', name: '刻', en: 'Haste', icon: '刻', color: '#a0f0ff', max: 5,
    desc: (lv) => `御守の間隔・ダッシュの再使用 -8%` },
};

// Evolutions (結び直し): weapon at max level + catalyst passive owned
export const EVOLUTIONS = {
  burst_x: { from: 'burst', name: '大輪華', en: 'Grand Bloom', icon: '華', color: '#ffb347',
    desc: '捕らえた妖が大輪の花火となり、さらに小さな花火を連鎖させる。' },
  thunder_x: { from: 'thunder', name: '雷神網', en: "Raijin's Net", icon: '神', color: '#bfe6ff',
    desc: '雷が妖から妖へと何度も連鎖し、網のように戦場を走る。' },
  seal_x: { from: 'seal', name: '結界', en: 'Kekkai', icon: '界', color: '#d9b3ff',
    desc: '輪が長く残る結界となる。妖を弾き、中にいるあなたを癒す。' },
  gravity_x: { from: 'gravity', name: '黒結び', en: 'Black Knot', icon: '黒', color: '#9dffd8',
    desc: '輪の中心に小さな闇が生まれ、周囲の妖を飲み込み続ける。' },
  petal_x: { from: 'petal', name: '千本桜', en: 'Thousand Blossoms', icon: '桜', color: '#ffc0e0',
    desc: '花弁が倍増し、妖を追尾して舞う。' },
  echo_x: { from: 'echo', name: '無限結', en: 'Endless Knot', icon: '∞', color: '#fff0b0',
    desc: '輪が三度、減衰せずに締まり直す。' },
  shiki_x: { from: 'shiki', name: '鳳凰', en: 'Phoenix', icon: '鳳', color: '#ffcf8a',
    desc: '折鶴が炎の鳳凰となり、通った跡を燃やす。' },
  razor_x: { from: 'razor', name: '斬鉄糸', en: 'Iron-Cleaving Silk', icon: '斬', color: '#ffffff',
    desc: '糸の切れ味が倍増し、さらに糸が30%長くなる。' },
  needle_x: { from: 'needle', name: '千本針', en: 'Thousand Needles', icon: '千', color: '#e8f2ff',
    desc: '針が絶え間なく降り注ぐ。輪を閉じると全方位に一斉射。' },
  bell_x: { from: 'bell', name: '大梵鐘', en: 'Great Temple Bell', icon: '鐘', color: '#ffe9a6',
    desc: '巨大な鐘の音が敵弾をかき消し、妖を大きく吹き飛ばす。' },
  foxfire_x: { from: 'foxfire', name: '狐の嫁入り', en: 'Fox Wedding', icon: '嫁', color: '#a8e8ff',
    desc: '狐火が行列となり、糸に沿って巡りながら妖を焼く。' },
};
for (const [id, ev] of Object.entries(EVOLUTIONS)) ev.id = id;
for (const [id, up] of Object.entries(UPGRADES)) up.id = id;

// ---- Characters -------------------------------------------------------------
export const CHARACTERS = [
  { id: 'yui', name: 'ユイ', title: '紅の糸', color: '#ff4d6d', thread: '#ff3b5c', glow: 'rgba(255,60,90,',
    start: 'burst', charm: 'needle', desc: 'バランス型。捕らえた妖を爆ぜさせる「爆結」を持つ。', mods: {} , unlock: null },
  { id: 'shirogane', name: 'シロガネ', title: '銀の糸', color: '#cfe3ff', thread: '#dfeeff', glow: 'rgba(190,220,255,',
    start: 'razor', charm: 'foxfire', desc: '糸が15%長く、糸自体が刃となる「刃糸」を持つ。体力は低め。',
    mods: { threadLen: 1.15, maxHp: -15 }, unlock: { key: 'boss1', text: '大鋏を倒すと解放' } },
  { id: 'ai', name: 'アイ', title: '藍の糸', color: '#7aa8ff', thread: '#6f9bff', glow: 'rgba(100,150,255,',
    start: 'seal', charm: 'bell', desc: '体力が高く、輪を結界として残す「封陣」を持つ。少し遅い。',
    mods: { maxHp: 30, speed: 0.94 }, unlock: { key: 'boss2', text: '百目灯を倒すと解放' } },
];

// ---- Meta shop (工房) -------------------------------------------------------------
export const META = [
  { id: 'hp', name: '丈夫な体', desc: '最大体力 +10', max: 5, cost: (l) => 30 + l * 30 },
  { id: 'thread', name: '紡ぎ車', desc: '糸の長さ +6%', max: 5, cost: (l) => 40 + l * 40 },
  { id: 'knot', name: '結びの技', desc: '輪のダメージ +6%', max: 5, cost: (l) => 40 + l * 45 },
  { id: 'speed', name: '草履', desc: '移動速度 +3%', max: 3, cost: (l) => 40 + l * 50 },
  { id: 'magnet', name: '霊感', desc: '回収範囲 +12%', max: 3, cost: (l) => 30 + l * 30 },
  { id: 'reroll', name: '占い札', desc: '強化候補の引き直し +1回', max: 3, cost: (l) => 60 + l * 60 },
  { id: 'revive', name: '身代わり人形', desc: '一度だけ倒れても復活', max: 1, cost: () => 250 },
  { id: 'xp', name: '学び', desc: '獲得経験 +5%', max: 4, cost: (l) => 50 + l * 50 },
];

// ---- Enemies -------------------------------------------------------------
// ai: chase | dasher | ranged | cutter | school | boss_*
export const ENEMIES = {
  sumi:    { name: '墨玉', hp: 9, spd: 72, r: 12, dmg: 7, xp: 1, ai: 'chase', mass: 1 },
  chochin: { name: '火袋', hp: 7, spd: 108, r: 11, dmg: 6, xp: 1, ai: 'chase', mass: 0.8 },
  kasa:    { name: '跳傘', hp: 26, spd: 60, r: 14, dmg: 10, xp: 2, ai: 'dasher', mass: 1.2 },
  omote:   { name: '面霊', hp: 70, spd: 46, r: 19, dmg: 13, xp: 4, ai: 'chase', mass: 3 },
  hasami:  { name: '糸切り', hp: 20, spd: 92, r: 13, dmg: 8, xp: 3, ai: 'cutter', mass: 1 },
  onibi:   { name: '鬼火', hp: 16, spd: 62, r: 12, dmg: 6, xp: 2, ai: 'ranged', mass: 0.8 },
  kamiuo:  { name: '紙魚', hp: 6, spd: 150, r: 10, dmg: 6, xp: 1, ai: 'school', mass: 0.6 },
  kumo:    { name: '子蜘蛛', hp: 14, spd: 120, r: 10, dmg: 6, xp: 1, ai: 'chase', mass: 0.7 },
  // bosses
  obasami: { name: '大鋏', title: '糸断ちの大鋏', hp: 2600, spd: 85, r: 46, dmg: 18, xp: 60, ai: 'boss_scissors', mass: 50, boss: 1 },
  hyakume: { name: '百目灯', title: '百の眼の大提灯', hp: 7500, spd: 55, r: 54, dmg: 18, xp: 120, ai: 'boss_lantern', mass: 60, boss: 2 },
  jorou:   { name: '夜織', title: '夜を織る女郎蜘蛛', hp: 21000, spd: 70, r: 60, dmg: 22, xp: 0, ai: 'boss_spider', mass: 80, boss: 3 },
};
for (const [id, e] of Object.entries(ENEMIES)) e.id = id;

// Spawn table by time: [time, rate(per sec), weights]
export const WAVES = [
  { t: 0,   rate: 1.3, w: { sumi: 10, chochin: 3 } },
  { t: 40,  rate: 2.2, w: { sumi: 8, chochin: 5 } },
  { t: 75,  rate: 3.0, w: { sumi: 7, chochin: 5, kasa: 3 } },
  { t: 110, rate: 3.6, w: { sumi: 7, chochin: 4, kasa: 3, hasami: 0.7 } },
  { t: 160, rate: 4.2, w: { sumi: 6, chochin: 5, kasa: 3, hasami: 0.8, onibi: 2 } },
  { t: 200, rate: 4.8, w: { sumi: 5, chochin: 4, kasa: 3, hasami: 0.8, onibi: 2, omote: 1 } },
  { t: 270, rate: 5.4, w: { sumi: 5, chochin: 5, kasa: 3, hasami: 1, onibi: 2, omote: 2 } },
  { t: 340, rate: 6.4, w: { sumi: 4, chochin: 5, kasa: 4, hasami: 1, onibi: 3, omote: 3 } },
  { t: 420, rate: 7.2, w: { sumi: 4, chochin: 4, kasa: 4, hasami: 1.2, onibi: 3, omote: 4 } },
  { t: 500, rate: 8.2, w: { sumi: 3, chochin: 4, kasa: 4, hasami: 1.4, onibi: 3, omote: 5 } },
  { t: 600, rate: 9.0, w: { sumi: 3, chochin: 4, kasa: 4, hasami: 1.5, onibi: 4, omote: 6 } },
  { t: 690, rate: 6.0, w: { chochin: 5, kasa: 3, omote: 4, hasami: 1 } },
];

// Scripted events: schools of paper fish, encirclements, elites
export const EVENTS = [
  { t: 55, type: 'school', count: 14 },
  { t: 130, type: 'ring', count: 26, kind: 'sumi' },
  { t: 150, type: 'elite', kind: 'kasa' },
  { t: 185, type: 'school', count: 22 },
  { t: 215, type: 'elite', kind: 'omote' },
  { t: 300, type: 'ring', count: 36, kind: 'chochin' },
  { t: 320, type: 'elite', kind: 'hasami' },
  { t: 360, type: 'school', count: 30 },
  { t: 390, type: 'elite', kind: 'onibi' },
  { t: 440, type: 'ring', count: 44, kind: 'kasa' },
  { t: 455, type: 'elite', kind: 'omote' },
  { t: 540, type: 'school', count: 40 },
  { t: 560, type: 'elite', kind: 'kasa' },
  { t: 590, type: 'ring', count: 54, kind: 'omote' },
  { t: 620, type: 'elite', kind: 'hasami' },
  { t: 650, type: 'school', count: 46 },
  { t: 665, type: 'elite', kind: 'omote' },
];
