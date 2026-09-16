/**
 * Reglas puras de Robo Jump (PLAN-DOODLE-JUMP T1, D2/D4/D5/D9/D11/D12).
 * Sin UI, sin imports de otros juegos ni de core: funciones puras sobre
 * `GameState` con física de sub-pasos fijos (D9). El store (`state.ts`, T4)
 * las invoca; la pantalla escribe shared values desde `getGame()` (D8).
 *
 * Coordenadas del mundo: `y` crece hacia abajo (0 = tope inicial); la
 * cámara (`camY`, borde superior visible) SOLO sube. El score es la altura
 * máxima trepada en metros (D11: más es mejor).
 */

import {
  BLUE_AMP,
  BLUE_SPEED,
  BULLET_SPEED,
  CAM_LINE,
  CLEAN_MARGIN,
  DIFFICULTY_BAND,
  ROBO_H,
  ROBO_W,
  DRAG_MAX_DELTA,
  GRAVITY,
  HAT_MS,
  HAT_PROB,
  HAT_VY,
  JUMP_V,
  KEY_VX,
  MAX_BULLETS,
  MAX_GAP_BASE,
  MAX_GAP_STEP,
  MAX_JUMP_MARGIN,
  MAX_MONSTERS,
  MAX_SUBSTEPS,
  MIN_GAP,
  MOBILE_AMP,
  MOBILE_SPEED,
  MONSTER_H,
  MONSTER_START_HEIGHT,
  MONSTER_W,
  COMPANION_DROP,
  COMPANION_DIST,
  PLATFORM_H,
  PLATFORM_W,
  SCORE_DIVISOR,
  SPAWN_AHEAD,
  SPRING_PROB,
  SPRING_V,
  START_Y,
  STEP_MS,
  WORLD_H,
  WORLD_W,
} from './tuning';

export type GameStatus = 'playing' | 'over';

/** Eventos discretos → sonido/haptics (D10/D11), espejo de serpiente. */
export type RoboJumpEvent =
  | 'bounce'
  | 'spring'
  | 'hat'
  | 'shoot'
  | 'break'
  | 'kill'
  | { type: 'die'; cause: 'fall' | 'monster' };

export type PlatformKind = 'green' | 'blue' | 'brown';

export interface Platform {
  id: number;
  kind: PlatformKind;
  /** Centro x base (blue: base de la oscilación senoidal); y = borde superior. */
  x: number;
  y: number;
  /** Fase de oscilación en rad (solo blue). */
  phase: number;
  spring: boolean;
  hat: boolean;
}

export interface Monster {
  id: number;
  kind: 'static' | 'mobile';
  /** Centro x base (mobile: base de la oscilación senoidal). */
  x: number;
  /** Centro y. */
  y: number;
  /** Fase de oscilación en rad (solo mobile). */
  phase: number;
}

export interface Bullet {
  id: number;
  /** Centro. */
  x: number;
  y: number;
  /** Velocidad (D3): dirección del disparo × BULLET_SPEED (u/s). */
  vx: number;
  vy: number;
}

export interface Robo {
  /** Centro. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  hatMs: number;
}

export interface GameState {
  status: GameStatus;
  /** Altura máxima trepada en unidades del mundo. */
  height: number;
  /** Metros enteros: `round(height / SCORE_DIVISOR)` (D11). */
  score: number;
  elapsedMs: number;
  robo: Robo;
  platforms: Platform[];
  monsters: Monster[];
  bullets: Bullet[];
  /** Borde superior de la vista; solo crece (la cámara no baja). */
  camY: number;
  /** y de la próxima plataforma a generar (por encima de la cámara). */
  nextSpawnY: number;
  nextId: number;
  /** Teclado web (D7): -1 izq, 0 nada, 1 der. */
  moveDir: -1 | 0 | 1;
  /** Estado serializable del PRNG (sin closures). */
  rngSeed: number;
}

export interface RoboJumpConfig {
  rngSeed?: number;
  platforms?: Platform[];
  monsters?: Monster[];
  /** Para tests: height inicial (evita regenerar la escalera por banda 0). */
  height?: number;
  /** Fixtures/tests: estado inicial del Robo (posición, velocidad, facing). */
  robo?: Partial<Robo>;
  /**
   * Fixtures/tests: mundo CERRADO — sin generación procedural
   * (`nextSpawnY` fuera de alcance) y sin limpieza de lo provisto.
   */
  closed?: boolean;
}

/** Altura máxima de un salto normal (u): impulsor de la generación. */
export function maxJumpHeight(): number {
  return (JUMP_V * JUMP_V) / (2 * GRAVITY);
}

/** Banda de dificultad de una altura dada. */
function bandOf(height: number): number {
  return Math.floor(Math.max(0, height) / DIFFICULTY_BAND);
}

/** Separación máxima de la banda, clampeada al margen de salto. */
export function maxGapFor(height: number): number {
  const cap = MAX_JUMP_MARGIN * maxJumpHeight();
  return Math.min(cap, MAX_GAP_BASE + bandOf(height) * MAX_GAP_STEP);
}

export function blueProbFor(height: number): number {
  return Math.min(0.25, 0.05 + bandOf(height) * 0.02);
}
export function brownProbFor(height: number): number {
  return Math.min(0.2, 0.02 + bandOf(height) * 0.02);
}
export function monsterProbFor(height: number): number {
  return Math.min(0.25, 0.08 + bandOf(height) * 0.03);
}

/**
 * D16: alcance horizontal (u) del salto hacia una plataforma `gap` u más
 * arriba — tiempo en el aire de la rama DESCENDENTE del salto (la que
 * aterriza) × velocidad de teclado (base conservadora: el drag llega a
 * ~2×), más el solape de bordes (media plataforma) y descontando la
 * oscilación de las azules involucradas. 0 si el gap es verticalmente
 * inalcanzable con salto normal.
 */
export function reachForGap(gap: number, blueNext: boolean, bluePrev: boolean): number {
  const disc = JUMP_V * JUMP_V - 2 * GRAVITY * gap;
  if (disc <= 0) return 0;
  const t = (JUMP_V + Math.sqrt(disc)) / GRAVITY;
  const reach =
    KEY_VX * t +
    PLATFORM_W / 2 -
    (blueNext ? BLUE_AMP : 0) -
    (bluePrev ? BLUE_AMP : 0);
  return Math.max(0, reach);
}

/**
 * D16: ¿es `p` la compañera verde de alguna brown? (la compañera no es
 * parte de la escalera: vive `COMPANION_DROP` u por debajo de su brown).
 * Lo consumen los invariantes de generación (tests) y el fixture density.
 */
export function isCompanionPlatform(p: Platform, all: Platform[]): boolean {
  if (p.kind !== 'green') return false;
  return all.some(
    (b) =>
      b.kind === 'brown' &&
      b !== p &&
      Math.abs(p.y - (b.y + COMPANION_DROP)) <= 1 &&
      Math.abs(p.x - b.x) % WORLD_W <= COMPANION_DIST + PLATFORM_W,
  );
}

/**
 * mulberry32 como transición de estado (duplicado propio por la regla de
 * aislamiento entre juegos). Determinista: mismo seed → misma secuencia.
 */
export function randomNext(seed: number): { value: number; seed: number } {
  const a = (seed + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, seed: a };
}

// --- geometría (AABB por centro) ---

function horizontalOverlap(l1: number, r1: number, l2: number, r2: number): boolean {
  return l1 < r2 && l2 < r1;
}

/** x de oscilación efectiva de una plataforma azul. */
export function platformX(p: Platform): number {
  if (p.kind !== 'blue') return p.x;
  return p.x + Math.sin(p.phase) * BLUE_AMP;
}

/** x de oscilación de un monstruo móvil. */
export function monsterX(m: Monster): number {
  if (m.kind !== 'mobile') return m.x;
  return m.x + Math.sin(m.phase) * MOBILE_AMP;
}

// --- generación determinista ---

function spawnPlatform(
  y: number,
  gap: number,
  prevX: number,
  prevKind: PlatformKind,
  height: number,
  rngSeed: number,
  nextId: number,
): { platform: Platform; companion: Platform | null; rngSeed: number; nextId: number } {
  let s = rngSeed;
  const rKind = randomNext(s);
  s = rKind.seed;
  const blueProb = blueProbFor(height);
  const brownProb = brownProbFor(height);
  const roll = rKind.value;
  const kind: PlatformKind =
    roll < blueProb ? 'blue' : roll < blueProb + brownProb ? 'brown' : 'green';
  const rX = randomNext(s);
  s = rX.seed;
  const amp = kind === 'blue' ? BLUE_AMP : 0;
  const prevAmp = prevKind === 'blue' ? BLUE_AMP : 0;
  const margin = PLATFORM_W / 2 + Math.max(amp, prevAmp) + 4;
  // D16: x DENTRO de la ventana alcanzable desde la plataforma previa
  // (recorte por margen de oscilación; el clamp hacia adentro solo acerca).
  const reach = reachForGap(gap, kind === 'blue', prevKind === 'blue');
  const lo = Math.max(margin, prevX - reach);
  const hi = Math.min(WORLD_W - margin, prevX + reach);
  const x = hi > lo ? lo + rX.value * (hi - lo) : Math.min(hi, Math.max(lo, prevX));
  const rDeco = randomNext(s);
  s = rDeco.seed;
  const spring = kind === 'green' && rDeco.value < SPRING_PROB;
  const hat = kind === 'green' && !spring && rDeco.value < SPRING_PROB + HAT_PROB;
  const platform: Platform = { id: nextId, kind, x, y, phase: rX.value * Math.PI * 2, spring, hat };
  // D16: la brown nunca es trampa — compañera verde que la sustituye al
  // romperse (cae 40 u y aterriza en ella).
  let companion: Platform | null = null;
  let idOut = nextId + 1;
  if (kind === 'brown') {
    const rC = randomNext(s);
    s = rC.seed;
    const side = rC.value < 0.5 ? -1 : 1;
    const cx = Math.min(
      WORLD_W - PLATFORM_W / 2 - 4,
      Math.max(PLATFORM_W / 2 + 4, platform.x + side * COMPANION_DIST),
    );
    companion = { id: idOut, kind: 'green', x: cx, y: y + COMPANION_DROP, phase: 0, spring: false, hat: false };
    idOut += 1;
  }
  return { platform, companion, rngSeed: s, nextId: idOut };
}

function spawnMonster(
  y: number,
  height: number,
  rngSeed: number,
  nextId: number,
): { monster: Monster | null; rngSeed: number; nextId: number } {
  if (height < MONSTER_START_HEIGHT) return { monster: null, rngSeed, nextId };
  let s = rngSeed;
  const r = randomNext(s);
  s = r.seed;
  if (r.value >= monsterProbFor(height)) return { monster: null, rngSeed: s, nextId };
  const rX = randomNext(s);
  s = rX.seed;
  const rKind = randomNext(s);
  s = rKind.seed;
  const mobile = rKind.value < 0.5;
  const amp = mobile ? MOBILE_AMP : 0;
  const margin = MONSTER_W / 2 + amp + 2;
  const x = margin + rX.value * (WORLD_W - 2 * margin);
  return {
    monster: {
      id: nextId,
      kind: mobile ? 'mobile' : 'static',
      x,
      y,
      phase: rX.value * Math.PI * 2,
    },
    rngSeed: s,
    nextId: nextId + 1,
  };
}

function nextGap(height: number, rngSeed: number, cap?: number): { gap: number; rngSeed: number } {
  const maxGap = cap === undefined ? maxGapFor(height) : Math.max(MIN_GAP, cap);
  const r = randomNext(rngSeed);
  return { gap: MIN_GAP + r.value * (maxGap - MIN_GAP), rngSeed: r.seed };
}

/** Rellena la escalera de plataformas de `y` hacia arriba hasta `-SPAWN_AHEAD`. */
function generateUpward(
  platforms: Platform[],
  fromY: number,
  prevX: number,
  prevKind: PlatformKind,
  height: number,
  rngSeed: number,
  nextId: number,
): { platforms: Platform[]; rngSeed: number; nextId: number; highestY: number } {
  let seed = rngSeed;
  let id = nextId;
  let y = fromY;
  let cursorX = prevX;
  let cursorKind = prevKind;
  while (y > -SPAWN_AHEAD) {
    // D16: tras una brown (compañera a COMPANION_DROP por debajo), el gap
    // se acota para que saltar de la compañera a la siguiente plataforma
    // siga siendo alcanzable.
    const cap =
      cursorKind === 'brown' ? maxGapFor(height) - COMPANION_DROP : undefined;
    const gap = nextGap(height, seed, cap);
    seed = gap.rngSeed;
    y -= gap.gap;
    const spawned = spawnPlatform(y, gap.gap, cursorX, cursorKind, height, seed, id);
    seed = spawned.rngSeed;
    id = spawned.nextId;
    platforms = [...platforms, spawned.platform];
    if (spawned.companion) {
      platforms = [...platforms, spawned.companion];
    }
    cursorX = spawned.platform.x;
    cursorKind = spawned.platform.kind;
  }
  return { platforms, rngSeed: seed, nextId: id, highestY: y };
}

export function createGameState(config: RoboJumpConfig = {}): GameState {
  const startRobo: Robo = {
    x: WORLD_W / 2,
    y: START_Y,
    vx: 0,
    vy: 0,
    facing: 1,
    hatMs: 0,
    ...config.robo,
  };
  const firstPlatform: Platform = {
    id: 0,
    kind: 'green',
    x: WORLD_W / 2,
    y: START_Y + ROBO_H / 2,
    phase: 0,
    spring: false,
    hat: false,
  };
  const provided = config.platforms ? [...config.platforms] : [firstPlatform];
  const initialHeight = config.height ?? 0;
  // Mundo cerrado (fixtures/tests): lo provisto ES el mundo — sin
  // generación procedural y con el cursor de spawn fuera de alcance.
  const fromY = Math.min(...provided.map((p) => p.y));
  const fromPlatform = provided.find((p) => p.y === fromY);
  const generated = config.closed
    ? {
        platforms: provided,
        rngSeed: config.rngSeed ?? 0,
        nextId: provided.length,
        highestY: fromY,
      }
    : generateUpward(
        provided,
        fromY,
        fromPlatform?.x ?? WORLD_W / 2,
        fromPlatform?.kind ?? 'green',
        initialHeight,
        config.rngSeed ?? (Date.now() % 2147483647),
        provided.length,
      );
  const monsters = config.monsters ? [...config.monsters] : [];
  const nextId = Math.max(generated.nextId, ...monsters.map((m) => m.id + 1), 0);
  return {
    status: 'playing',
    height: initialHeight,
    score: Math.round(initialHeight / SCORE_DIVISOR),
    elapsedMs: 0,
    robo: startRobo,
    platforms: generated.platforms,
    monsters,
    bullets: [],
    camY: 0,
    nextSpawnY: config.closed ? Number.NEGATIVE_INFINITY : generated.highestY,
    nextId,
    moveDir: 0,
    rngSeed: generated.rngSeed,
  };
}

// --- inputs discretos (entre frames; los eventos salen para audio) ---

/**
 * Disparo (D3 revisada 2×): con `aim` (dx, dy en unidades del mundo) la
 * bala sale hacia ese punto — apuntado por toque (Fandom: "aim your shot
 * by tapping"); sin `aim` (teclado), horizontal según `facing`. Anulado
 * con hat activo (D12).
 */
export function shoot(
  state: GameState,
  aim?: { dx: number; dy: number },
): { state: GameState; events: RoboJumpEvent[] } {
  if (
    state.status !== 'playing' ||
    state.robo.hatMs > 0 ||
    state.bullets.length >= MAX_BULLETS
  ) {
    return { state, events: [] };
  }
  let nx: number = state.robo.facing;
  let ny = 0;
  if (aim) {
    const len = Math.hypot(aim.dx, aim.dy);
    if (len < 1) return { state, events: [] }; // deadzone: sin dirección útil
    nx = aim.dx / len;
    ny = aim.dy / len;
  }
  const id = state.nextId;
  const bullet: Bullet = {
    id,
    x: state.robo.x + nx * (ROBO_W / 2 + 4),
    y: state.robo.y + ny * (ROBO_H / 2 + 4),
    vx: nx * BULLET_SPEED,
    vy: ny * BULLET_SPEED,
  };
  return {
    state: { ...state, bullets: [...state.bullets, bullet], nextId: id + 1 },
    events: ['shoot'],
  };
}

/** Teclado web (D7): velocidad horizontal fija mientras la tecla está presionada. */
export function setMoveDir(state: GameState, dir: -1 | 0 | 1): GameState {
  if (state.status !== 'playing' || state.moveDir === dir) return state;
  return { ...state, moveDir: dir };
}

/** Drag (D2): delta relativo directo sobre x, con wrap y clamp anti-teleport. */
export function applyDragX(state: GameState, deltaUnits: number): GameState {
  if (state.status !== 'playing' || deltaUnits === 0) return state;
  const clamped = Math.max(-DRAG_MAX_DELTA, Math.min(DRAG_MAX_DELTA, deltaUnits));
  let x = state.robo.x + clamped;
  if (x < 0) x += WORLD_W;
  if (x >= WORLD_W) x -= WORLD_W;
  return {
    ...state,
    robo: { ...state.robo, x, vx: 0, facing: clamped < 0 ? -1 : 1 },
  };
}

// --- sub-paso físico (D9) ---

function stepOnce(state: GameState): { state: GameState; events: RoboJumpEvent[] } {
  const robo = state.robo;
  const prevBottom = robo.y + ROBO_H / 2;
  const dtS = STEP_MS / 1000;
  const events: RoboJumpEvent[] = [];
  const halfW = ROBO_W / 2;

  // 0) Oscilaciones: plataformas azules y monstruos móviles avanzan fase.
  let platforms = state.platforms.map((p) =>
    p.kind === 'blue' ? { ...p, phase: p.phase + BLUE_SPEED * dtS } : p,
  );
  let monsters = state.monsters.map((m) =>
    m.kind === 'mobile' ? { ...m, phase: m.phase + MOBILE_SPEED * dtS } : m,
  );

  // 1) Vertical: hat manda (ascenso sostenido); si no, gravedad.
  const hatActive = robo.hatMs > 0;
  const vy = hatActive ? -HAT_VY : robo.vy + GRAVITY * dtS;
  let y = robo.y + vy * dtS;
  let hatMs = hatActive ? Math.max(0, robo.hatMs - STEP_MS) : 0;

  // 2) Horizontal: teclado (el drag escribe x directo vía applyDragX).
  const vx = state.moveDir * KEY_VX;
  let x = robo.x + vx * dtS;
  if (x < 0) x += WORLD_W;
  if (x >= WORLD_W) x -= WORLD_W;
  const facing: 1 | -1 = vx < 0 ? -1 : vx > 0 ? 1 : robo.facing;
  let vyOut = vy;

  const newBottom = y + ROBO_H / 2;

  // 3) Plataforma: solo cayendo y cruzando su borde superior.
  for (const p of platforms) {
    if (vyOut <= 0) break;
    const px = platformX(p);
    if (
      prevBottom <= p.y &&
      newBottom >= p.y &&
      px + PLATFORM_W / 2 > x - halfW &&
      px - PLATFORM_W / 2 < x + halfW
    ) {
      if (p.kind === 'brown') {
        platforms = platforms.filter((q) => q.id !== p.id);
        events.push('break');
        continue;
      }
      if (p.hat) {
        hatMs = HAT_MS;
        vyOut = -HAT_VY;
        // D15: el hat se CONSUME — el ícono deja la plataforma (el Robo
        // lo lleva); re-caer sobre la plataforma no lo re-activa.
        platforms = platforms.map((q) => (q.id === p.id ? { ...q, hat: false } : q));
        events.push('hat');
      } else if (p.spring) {
        vyOut = -SPRING_V;
        events.push('spring');
      } else {
        vyOut = -JUMP_V;
        events.push('bounce');
      }
      y = p.y - ROBO_H / 2;
      break;
    }
  }

  // 4) Monstruos: hat los atraviesa letal (D12); aplaste solo cayendo sobre
  //    la cabeza; otro contacto = muerte.
  for (const m of state.monsters) {
    if (!monsters.some((q) => q.id === m.id)) continue;
    const mx = monsterX(m);
    const overlapping =
      mx - MONSTER_W / 2 < x + halfW &&
      mx + MONSTER_W / 2 > x - halfW &&
      newBottom >= m.y - MONSTER_H / 2 &&
      y - ROBO_H / 2 <= m.y + MONSTER_H / 2;
    if (!overlapping) continue;
    if (hatMs > 0) {
      monsters = monsters.filter((q) => q.id !== m.id);
      events.push('kill');
      continue;
    }
    // Aplaste (R4/T14): la tolerancia escala con el desplazamiento vertical
    // del PROPIO sub-paso — con caídas rápidas el cruce puede saltarse
    // varios u por sub-paso y una tolerancia fija lo lee como muerte.
    const squishTolerance = Math.abs(robo.vy) * dtS + 2;
    if (vyOut > 0 && prevBottom <= m.y - MONSTER_H / 2 + squishTolerance) {
      monsters = monsters.filter((q) => q.id !== m.id);
      vyOut = -JUMP_V;
      y = m.y - MONSTER_H / 2 - ROBO_H / 2;
      events.push('kill');
      break;
    }
    return {
      state: {
        ...state,
        status: 'over',
        robo: { ...robo, x, y, vx, vy: vyOut, hatMs, facing },
        monsters,
        elapsedMs: state.elapsedMs + STEP_MS,
      },
      events: [...events, { type: 'die', cause: 'monster' }],
    };
  }

  // 5) Balas (D3): viajan a velocidad constante en su dirección (sin
  //    gravedad); matan por contacto y despawn al salir de la vista.
  let bullets = state.bullets;
  if (bullets.length > 0) {
    const alive: Bullet[] = [];
    for (const b of bullets) {
      const bx = b.x + b.vx * dtS;
      const by = b.y + b.vy * dtS;
      let killed = false;
      for (const m of monsters) {
        const mx = monsterX(m);
        if (
          Math.abs(bx - mx) < MONSTER_W / 2 + 3 &&
          by >= m.y - MONSTER_H / 2 &&
          by <= m.y + MONSTER_H / 2
        ) {
          monsters = monsters.filter((q) => q.id !== m.id);
          events.push('kill');
          break;
        }
      }
      if (
        bx > 0 &&
        bx < WORLD_W &&
        by > state.camY &&
        by < state.camY + WORLD_H
      ) {
        alive.push({ ...b, x: bx, y: by });
      }
    }
    bullets = alive;
  }

  // 6) Cámara: sube (camY decrece) solo cuando el Robo cruza la línea;
  //    nunca baja (no hay descenso). Altura/score (D11).
  const camY = Math.min(state.camY, y - CAM_LINE * WORLD_H);
  const height = Math.max(state.height, Math.max(0, START_Y - y));
  const score = Math.round(height / SCORE_DIVISOR);

  const moved: GameState = {
    ...state,
    robo: { x, y, vx, vy: vyOut, facing, hatMs },
    platforms,
    monsters,
    bullets,
    camY,
    height,
    score,
    elapsedMs: state.elapsedMs + STEP_MS,
  };

  // 7) Muerte por caída bajo la vista.
  if (moved.robo.y - ROBO_H / 2 > moved.camY + WORLD_H) {
    return { state: { ...moved, status: 'over' }, events: [...events, { type: 'die', cause: 'fall' }] };
  }

  // 8) Limpieza bajo cámara + generación por encima (con monstruos).
  const camBottom = moved.camY + WORLD_H + CLEAN_MARGIN;
  let platformsOut = moved.platforms.filter((p) => p.y + PLATFORM_H < camBottom);
  let monstersOut = moved.monsters.filter((m) => m.y - MONSTER_H / 2 < camBottom);
  let rngSeed = state.rngSeed;
  let nextId = state.nextId;
  // D16: la ventana de alcanzabilidad usa la plataforma más alta viva como
  // ancla (x/kind) — la escalera generada es siempre encadenable.
  const topPlatform = moved.platforms.reduce<Platform | null>(
    (best, p) => (best === null || p.y < best.y ? p : best),
    null,
  );
  let cursorX = topPlatform?.x ?? WORLD_W / 2;
  let cursorKind: PlatformKind = topPlatform?.kind ?? 'green';
  let spawnY = state.nextSpawnY;
  while (spawnY > moved.camY - SPAWN_AHEAD) {
    // D16: el gap posterior a una brown se acota (compañera alcanzable).
    const cap =
      cursorKind === 'brown' ? maxGapFor(moved.height) - COMPANION_DROP : undefined;
    const gap = nextGap(moved.height, rngSeed, cap);
    rngSeed = gap.rngSeed;
    spawnY -= gap.gap;
    const spawned = spawnPlatform(spawnY, gap.gap, cursorX, cursorKind, moved.height, rngSeed, nextId);
    rngSeed = spawned.rngSeed;
    nextId = spawned.nextId;
    platformsOut = [...platformsOut, spawned.platform];
    if (spawned.companion) {
      platformsOut = [...platformsOut, spawned.companion];
    }
    cursorX = spawned.platform.x;
    cursorKind = spawned.platform.kind;
    if (monstersOut.length < MAX_MONSTERS) {
      const mon = spawnMonster(spawnY + gap.gap / 2, moved.height, rngSeed, nextId);
      rngSeed = mon.rngSeed;
      nextId = mon.nextId;
      if (mon.monster) monstersOut = [...monstersOut, mon.monster];
    }
  }
  // R7 (playtest 15-9): el cursor de generación DEBE persistir — sin esto
  // cada sub-paso re-genera un lote desde el mismo nextSpawnY y apila
  // plataformas duplicadas encima de la cámara ("racimo" del screenshot).
  return {
    state: {
      ...moved,
      platforms: platformsOut,
      monsters: monstersOut,
      nextSpawnY: spawnY,
      nextId,
      rngSeed,
    },
    events,
  };
}

/**
 * Núcleo puro con sub-pasos fijos (D9): consume `dtMs` en pasos de `STEP_MS`
 * (tope `MAX_SUBSTEPS`, guard anti-espiral) y devuelve el sobrante en
 * `leftoverMs` — la acumulación de fracciones vive en el llamador
 * (`store.tick`). El resultado es independiente de cómo se particione el dt
 * salvo por el guard. Sin sub-pasos devuelve la MISMA referencia.
 */
export function advance(
  state: GameState,
  dtMs: number,
): { state: GameState; events: RoboJumpEvent[]; leftoverMs: number } {
  if (state.status !== 'playing') return { state, events: [], leftoverMs: Math.max(0, dtMs) };
  const events: RoboJumpEvent[] = [];
  let current = state;
  let leftover = Math.max(0, dtMs);
  let guard = 0;
  while (current.status === 'playing' && leftover >= STEP_MS && guard < MAX_SUBSTEPS) {
    leftover -= STEP_MS;
    const result = stepOnce(current);
    events.push(...result.events);
    current = result.state;
    guard += 1;
  }
  if (current === state) return { state, events: [], leftoverMs: leftover };
  return { state: current, events, leftoverMs: leftover };
}
