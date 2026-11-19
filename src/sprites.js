'use strict';
// ---------- 도트 스프라이트 ----------
// 문자 그리드 + 팔레트 → 캔버스. 공백/'.'은 투명, 윤곽선은 자동 생성.
const OUTLINE = '#1a1220';

function buildSprite(rows, pal, outline = OUTLINE) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = document.createElement('canvas');
  c.width = w + 2; c.height = h + 2;
  const g = c.getContext('2d');
  const at = (i, j) => (j >= 0 && j < h && i >= 0 && i < rows[j].length) ? rows[j][i] : ' ';
  const filled = (i, j) => { const ch = at(i, j); return ch !== ' ' && ch !== '.'; };
  if (outline) {
    g.fillStyle = outline;
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
      if (!filled(i, j) && (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1))) g.fillRect(i + 1, j + 1, 1, 1);
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = at(i, j);
    if (ch === ' ' || ch === '.') continue;
    g.fillStyle = pal[ch] || '#ff00ff';
    g.fillRect(i + 1, j + 1, 1, 1);
  }
  return c;
}

function flipCanvas(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}

function tintCanvas(src, color) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

function scaleCanvas(src, s) {
  if (s === 1) return src;
  const c = document.createElement('canvas');
  c.width = src.width * s; c.height = src.height * s;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// 좌우 + 피격(흰색) 버전 세트
function makeSet(rows, pal, scale = 1) {
  const r = scaleCanvas(buildSprite(rows, pal), scale);
  const l = flipCanvas(r);
  return { r, l, wr: tintCanvas(r, '#ffffff'), wl: tintCanvas(l, '#ffffff') };
}

// ---------- 스프라이트 데이터 ----------
const PLAYER_PAL = { h: '#6b3e26', s: '#f2c299', e: '#2a1c18', g: '#4f8a3a', p: '#4a3b5c', f: '#2e2433' };
const PLAYER_ARMOR_PAL = Object.assign({}, PLAYER_PAL, { g: '#9a6a3c' });

const PLAYER_HEAD_DOWN = ['  hhhhhh  ', ' hhhhhhhh ', ' hhsssshh ', ' sesssses ', ' ssssssss ', '  ssssss  '];
const PLAYER_HEAD_UP = ['  hhhhhh  ', ' hhhhhhhh ', ' hhhhhhhh ', ' hhhhhhhh ', ' shhhhhhs ', '  ssssss  '];
const PLAYER_BODY_FRONT = [' gggggggg ', 'sggggggggs', 'sggggggggs', ' gggggggg ', ' pppppppp '];
const PLAYER_LEGS_FRONT = [
  [' ppp  ppp ', ' ppp  ppp ', ' fff  fff '],
  [' ppp  ppp ', ' ppp  fff ', ' fff      '],
  [' ppp  ppp ', ' fff  ppp ', '      fff '],
];
const PLAYER_SIDE_TOP = ['  hhhhh   ', ' hhhhhhh  ', ' hhhssss  ', ' hhsssess ', ' hssssss  ', '  sssss   ',
  '  gggggg  ', '  gggggg  ', '  gsgggg  ', '  gggggg  ', '  pppppp  '];
const PLAYER_LEGS_SIDE = [
  ['   pppp   ', '   pppp   ', '   ffff   '],
  ['  pp  pp  ', ' pp    pp ', ' ff    ff '],
  ['   pppp   ', '   pppp   ', '   ffff   '],
];

const DINO_SPRITES = {
  compy: {
    pal: { g: '#7cb342', d: '#4e7d2a', l: '#d7e3a0', e: '#111111' },
    rows: [
      '         gg ',
      '        gggg',
      '        gegg',
      'g      gggg ',
      'gg   ggggg  ',
      ' ggggggdgg  ',
      '  ggdgggggl ',
      '   glllll   ',
      '    g  g    ',
      '    g  g    ',
      '   gg gg    ',
    ],
  },
  raptor: {
    pal: { o: '#c8743a', d: '#7a3f1d', l: '#ecc79a', e: '#111111', w: '#f4efe1' },
    rows: [
      '              ooo  ',
      '             ooooo ',
      '             oeooow',
      '             oooooo',
      'oo          ooo    ',
      ' ooo       oooo    ',
      '  ooood doooooo    ',
      '   oooooooood      ',
      '    ooodoooooo     ',
      '     llllllloo     ',
      '      oo   oo w    ',
      '      oo   oo      ',
      '     ooo   ooo     ',
      '    ww    ww       ',
    ],
  },
  para: {
    pal: { p: '#8e7cc3', d: '#5f4f94', c: '#e07a5f', l: '#d8cfee', e: '#111111' },
    rows: [
      '            ccccc       ',
      '          cccpppp       ',
      '             pppp       ',
      '             peppppp    ',
      '             pppppppp   ',
      '            ppp         ',
      '           ppp          ',
      'pp       pppppp         ',
      ' ppp  pppppppppp        ',
      '  pppppppppppppppp      ',
      '   ppppdppdppdpppp      ',
      '     pppppppppppp       ',
      '      lllllllll         ',
      '       pp    pp         ',
      '       pp    pp         ',
      '      ppp   ppp         ',
    ],
  },
  trike: {
    pal: { t: '#6d8a96', d: '#4b6470', f: '#d9a95b', w: '#f2ecd8', l: '#a9bec7', e: '#111111' },
    rows: [
      '                 ff      ',
      '      ttttt     ffff     ',
      '    ttttttttt  fffff  w  ',
      '   tttdttttdtttftttt ww  ',
      '  ttttttttttttttttetww   ',
      ' ttttttttttttttttttttt   ',
      'tt tttttttttttttttttt  w ',
      't  lllllllllllllttttttww ',
      '    tt  tt   tt  tt      ',
      '    tt  tt   tt  tt      ',
      '   ttt ttt  ttt ttt      ',
    ],
  },
  rex: {
    pal: { r: '#9c4a3a', d: '#6b2d22', l: '#d9b38c', e: '#ffe14d', w: '#ffffff' },
    rows: [
      '                  rrrrrrr  ',
      '                 rrrrrrrrr ',
      '                 rrerrrrrrr',
      '                 rrrrrrrrrr',
      '                 rrrrwwwwww',
      '                 rrr       ',
      '                 rrrwwwww  ',
      '                 rrrrrrrr  ',
      'rr             rrrrrr      ',
      ' rrr        rrrrrrrr       ',
      '  rrrrr  rrrrrrrrrrr  r    ',
      '   rrrrrrrrdrrrdrrrrrrr    ',
      '     rrrrrrrrrrrrrrrr r    ',
      '       rrrrrrrrrrrll       ',
      '         llllllllll        ',
      '          rrrr  rrr        ',
      '          rrr    rr        ',
      '          rr     rr        ',
      '         rrr    rrr        ',
      '        ww     ww          ',
    ],
    scale: 2,
  },
};

const OBJ_PAL = {
  L: '#3f8f3a', l: '#5fb34f', D: '#2b6a2f', T: '#7a5230', t: '#5a3a22',
  R: '#8b8f99', r: '#b3b7c0', d: '#62656e', G: '#3d8b3d', g: '#2c6b30', B: '#d8344a',
  Y: '#ffe066', O: '#ff9a2e', F: '#e2401f', c: '#c9a46a', P: '#2f6e4a', p: '#3f8a5c',
};

const OBJ_ROWS = {
  tree: [
    '     LLLLLL     ',
    '   LLLlLLLLLL   ',
    '  LLlllLLLLLLL  ',
    ' LLLllLLLLLLDLL ',
    ' LLLLLLLLLLLDDL ',
    'LLLLLLLLLLLLDDLL',
    'LLlLLLLLLLLLDDDL',
    'LLLLLLLLLLLDDDDL',
    ' LLLLLLLLLDDDDL ',
    ' DLLLLLLDDDDDDD ',
    '  DDDDDDDDDDDD  ',
    '    DDDDDDDD    ',
    '      TTTT      ',
    '      TTTT      ',
    '      TtTT      ',
    '     TTTTTT     ',
  ],
  pine: [
    '       p       ',
    '      ppP      ',
    '     ppPPP     ',
    '    pppPPPP    ',
    '      pPP      ',
    '    ppPPPPP    ',
    '   pppPPPPPP   ',
    '  ppppPPPPPPP  ',
    '     ppPPP     ',
    '   pppPPPPPP   ',
    '  ppppPPPPPPP  ',
    ' pppppPPPPPPPP ',
    'PPPPPPPPPPPPPPP',
    '      TtT      ',
    '      TTT      ',
    '     TTTTT     ',
  ],
  stump: ['  TTTT  ', ' TccccT ', ' TTccTT ', 'TTTTTTtT', ' tTtTTt '],
  rock: [
    '    RRRRR     ',
    '  RRrrRRRRR   ',
    ' RRrrRRRRRRRd ',
    'RRRRRRRRRRRRdd',
    'RRRRRRRRRRRddd',
    ' RRRRRRRRdddd ',
    '  dddddddddd  ',
  ],
  bush: [
    '   GGGGGG    ',
    '  GGBGGGGGG  ',
    ' GGGGGGGBGGG ',
    'GGBGGGGGGGGGG',
    'GGGGGGBGGGBGG',
    ' GGGGGGGGGGG ',
    '  ggggggggg  ',
  ],
  bushEmpty: [
    '   GGGGGG    ',
    '  GGGGGGGGG  ',
    ' GGGGGGGGGGG ',
    'GGGGGGGGGGGGG',
    'GGGGGGGGGGGGG',
    ' GGGGGGGGGGG ',
    '  ggggggggg  ',
  ],
  fire1: [
    '     Y      ',
    '    YOY     ',
    '   YOFOY    ',
    '  YOFFFOY   ',
    '   OFFOO    ',
    ' TTTTTTTTT  ',
    'RRtTTTTtRR  ',
    ' RR    RR   ',
  ],
  fire2: [
    '      Y     ',
    '     YOY    ',
    '   YOOFOY   ',
    '  YOFFFOY   ',
    '   OOFFO    ',
    ' TTTTTTTTT  ',
    'RRtTTTTtRR  ',
    ' RR    RR   ',
  ],
  fireOff: [
    '            ',
    '            ',
    '            ',
    '    d  d    ',
    '   dddddd   ',
    ' TTTTTTTTT  ',
    'RRtTTTTtRR  ',
    ' RR    RR   ',
  ],
  wall: [
    ' TT  TT  TT  TT ',
    'TTTTTTTTTTTTTTTT',
    'TtTTtTTtTTtTTtTT',
    'TtTTtTTtTTtTTtTT',
    'cccccccccccccccc',
    'TtTTtTTtTTtTTtTT',
    'TtTTtTTtTTtTTtTT',
    'TtTTtTTtTTtTTtTT',
    'cccccccccccccccc',
    'TtTTtTTtTTtTTtTT',
    'TTTTTTTTTTTTTTTT',
  ],
};

const ICON_PAL = {
  T: '#8a5a32', t: '#5e3b20', W: '#d9b07a', R: '#9aa0a8', r: '#c3c8cf', d: '#666a72',
  G: '#4fa043', g: '#2f6e2c', B: '#d8344a', b: '#ff7a8a', M: '#e8737a', m: '#ffb3b3', w: '#f1ece0',
  C: '#9a5a2c', c: '#c98a4a', H: '#b07a48', h: '#7f5430', X: '#d8344a',
};
const ICON_ROWS = {
  wood: ['   TTTTW', ' TTtTTWW', 'TTTTTTWt', 'TtTTTTWW', ' TTTTWW '],
  stone: ['  RRR   ', ' RrRRR  ', 'RRrRRRd ', 'RRRRRddd', ' RRdddd '],
  fiber: ['G   G  ', ' G G G ', ' GgGG  ', '  GgG  ', ' gGgGg '],
  hide: ['H  H H', 'HHHHHH', 'HhHHhH', 'HHHHHH', 'HHhHHH', ' HHHH '],
  bone: ['ww    ', 'www   ', ' www  ', '  www ', '   www', '    ww'],
  berry: ['   g  ', '  g   ', ' BB BB', 'BbBBbB', 'BBBBBB', ' BB BB'],
  meat: ['   MMMM ', '  MMmMMM', ' MMMMMMM', 'wMMMMMM ', 'ww MMM  '],
  cooked: ['   CCCC ', '  CCcCCC', ' CCCCCCC', 'wCCCCCC ', 'ww CCC  '],
  bandage: ['wwwwww', 'wwXXww', 'wXXXXw', 'wwXXww', 'wwwwww'],
  axe: ['  RRR ', ' RRRRR', ' RRTRR', '   T  ', '  T   ', ' T    ', 'T     '],
  spear: ['      rR', '     rRR', '    TrR ', '   T    ', '  T     ', ' T      ', 'T       '],
  bonespear: ['      ww', '     www', '    Tww ', '   T    ', '  T     ', ' T      ', 'T       '],
  armor: ['HH  HH', 'HHHHHH', 'HhHHhH', 'HHHHHH', 'HHHHHH'],
};

// ---------- 지형 타일 (절차적 생성) ----------
function genTile(seed, base, specks, extra) {
  const c = document.createElement('canvas');
  c.width = TILE; c.height = TILE;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, TILE, TILE);
  const r = mulberry32(seed);
  for (let i = 0; i < TILE * TILE; i++) {
    let v = r();
    for (const [col, p] of specks) {
      if (v < p) { g.fillStyle = col; g.fillRect(i % TILE, (i / TILE) | 0, 1, 1); break; }
      v -= p;
    }
  }
  if (extra) extra(g, r);
  return c;
}

function tufts(colors, n) {
  return (g, r) => {
    for (let k = 0; k < n; k++) {
      const x = 1 + Math.floor(r() * 13), y = 2 + Math.floor(r() * 12);
      g.fillStyle = colors[0]; g.fillRect(x, y, 1, 1); g.fillRect(x + 2, y, 1, 1);
      g.fillStyle = colors[1]; g.fillRect(x + 1, y + 1, 1, 1);
    }
  };
}

const SPR = {};

function initSprites() {
  // 플레이어
  const mk = (rows, pal) => buildSprite(rows, pal);
  for (const [key, pal] of [['player', PLAYER_PAL], ['playerArmor', PLAYER_ARMOR_PAL]]) {
    const set = { down: [], up: [], right: [], left: [] };
    for (let f = 0; f < 3; f++) {
      set.down.push(mk([...PLAYER_HEAD_DOWN, ...PLAYER_BODY_FRONT, ...PLAYER_LEGS_FRONT[f]], pal));
      set.up.push(mk([...PLAYER_HEAD_UP, ...PLAYER_BODY_FRONT, ...PLAYER_LEGS_FRONT[f]], pal));
      const side = mk([...PLAYER_SIDE_TOP, ...PLAYER_LEGS_SIDE[f]], pal);
      set.right.push(side); set.left.push(flipCanvas(side));
    }
    SPR[key] = set;
  }
  SPR.playerHurt = tintCanvas(SPR.player.down[0], '#ffffff');

  // 공룡
  SPR.dino = {};
  for (const [k, d] of Object.entries(DINO_SPRITES)) SPR.dino[k] = makeSet(d.rows, d.pal, d.scale || 1);

  // 오브젝트
  SPR.obj = {};
  for (const [k, rows] of Object.entries(OBJ_ROWS)) SPR.obj[k] = buildSprite(rows, OBJ_PAL);

  // 아이콘
  SPR.icon = {};
  for (const [k, rows] of Object.entries(ICON_ROWS)) SPR.icon[k] = buildSprite(rows, ICON_PAL);
  SPR.icon.campfire = SPR.obj.fire1;
  SPR.icon.wall = SPR.obj.wall;

  // 지형
  SPR.tiles = { grass: [], forest: [], sand: [], deep: [], water: [[], [], []] };
  for (let v = 0; v < 4; v++) {
    SPR.tiles.grass.push(genTile(11 + v, '#5d9e3f', [['#6fb34c', 0.07], ['#4f8b35', 0.07]],
      (g, r) => {
        tufts(['#7cc45a', '#4a8531'], v === 0 ? 2 : 1)(g, r);
        if (v === 3) { // 꽃
          for (let k = 0; k < 3; k++) {
            const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
            g.fillStyle = k % 2 ? '#fff4c2' : '#ffd84a'; g.fillRect(x, y, 1, 1);
          }
        }
      }));
    SPR.tiles.forest.push(genTile(31 + v, '#467d36', [['#3b6d2e', 0.1], ['#538d40', 0.05]], tufts(['#5c9a45', '#335f28'], 2)));
    SPR.tiles.sand.push(genTile(51 + v, '#e0c486', [['#ebd29b', 0.08], ['#c9ab6c', 0.07]],
      (g, r) => { if (v === 2) { g.fillStyle = '#f5ead0'; g.fillRect(4 + Math.floor(r() * 8), 4 + Math.floor(r() * 8), 2, 1); } }));
    SPR.tiles.deep.push(genTile(71 + v, '#2b5ea8', [['#3368b2', 0.05]]));
    for (let f = 0; f < 3; f++) {
      SPR.tiles.water[f].push(genTile(91 + v, '#3d7ccc', [['#4485d2', 0.05]], (g) => {
        g.fillStyle = '#6aa5e6';
        const r2 = mulberry32(200 + v);
        for (let k = 0; k < 3; k++) {
          const x = Math.floor(r2() * 12), y = Math.floor(r2() * 14);
          const xx = (x + f * 2) % 14;
          g.fillRect(xx, y, 3, 1);
        }
      }));
    }
  }
}
