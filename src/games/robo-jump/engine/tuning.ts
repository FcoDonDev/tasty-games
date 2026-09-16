/**
 * Tabla de tuning de Robo Jump (PLAN-DOODLE-JUMP §3.2): ÚNICA fuente de
 * constantes del juego. Valores iniciales a calibrar en playtest (T6); los
 * tests de invariantes (`tuning.test.ts`) candean relaciones entre ellos,
 * no valores exactos.
 */

/** Dimensiones del mundo lógico (D5): la pantalla escala al contenedor real. */
export const WORLD_W = 360;
export const WORLD_H = 640;

/** Sub-pasos físicos a paso fijo (D9): determinismo E2E + estabilidad. */
export const STEP_MS = 8;
export const MAX_SUBSTEPS = 8;

/** Física: gravedad e impulsos de salto (u/s, u/s²). */
export const GRAVITY = 1400;
export const JUMP_V = 560;
/** D15 (playtest 2): 950 u/s ≈ 322 u de pico (~2.9 pantallas de impulso). */
export const SPRING_V = 950;

/** Propeller hat: ascenso sostenido `HAT_MS` a `-HAT_VY` u/s (anula disparo).
 * D15 (playtest 2): 4 s @ 200 u/s ≈ 800 u (~80 m) por uso — potente y largo. */
export const HAT_MS = 4000;
export const HAT_VY = 200;

/** Balas: velocidad vertical y tope de balas activas. */
export const BULLET_SPEED = 700;
export const MAX_BULLETS = 3;

/** Movimiento horizontal: teclado web (D7) y clamp del drag (D2). */
export const KEY_VX = 260;
export const DRAG_CLAMP_VX = 520;
/** Delta máximo por evento de gesto (anti-teletransporte). */
export const DRAG_MAX_DELTA = 24;

/** Cámara: sube solo cuando el Robo cruza `CAM_LINE * WORLD_H` sobre camY. */
export const CAM_LINE = 0.4;

/** Generación: separación vertical entre plataformas. */
export const MIN_GAP = 48;
export const MAX_GAP_BASE = 85;
export const MAX_GAP_STEP = 4;
/** Banda de altura que define cada tramo de dificultad. */
export const DIFFICULTY_BAND = 1000;
/** Margen de seguridad: todo gap ≤ `MAX_JUMP_MARGIN * maxJumpHeight()`. */
export const MAX_JUMP_MARGIN = 0.8;
/** D16 (playtest 2): la brown SIEMPRE trae una compañera verde a
 * `COMPANION_DROP` u por debajo y a ≤ `COMPANION_DIST` u de distancia —
 * al romperse la brown, el jugador cae sobre la compañera y sigue vivo
 * (escáner de alcanzabilidad: 75% de spans en banda alta terminaban en
 * brown como única ruta → rebote eterno sin avanzar). El gap posterior a
 * una brown se acota a `maxGap − COMPANION_DROP` para que el salto
 * compañera→siguiente siga siendo alcanzable verticalmente. */
export const COMPANION_DROP = 36;
export const COMPANION_DIST = 90;

/** Tamaños de entidades (u). */
export const PLATFORM_W = 64;
export const PLATFORM_H = 12;
export const ROBO_W = 24;
export const ROBO_H = 24;
export const MONSTER_W = 26;
export const MONSTER_H = 26;
/** Bala ("nose ball"): elipse horizontal de render (la colisión es puntual). */
export const BULLET_W = 8;
export const BULLET_H = 5;

/** Oscilaciones: plataformas azules y monstruos móviles (seno, rad). */
export const BLUE_AMP = 45;
export const BLUE_SPEED = 1.6;
export const MOBILE_AMP = 40;
export const MOBILE_SPEED = 2.4;

/** Probabilidades de decoración/spawn por plataforma generada. */
export const SPRING_PROB = 0.12;
export const HAT_PROB = 0.05;
/** Altura mínima (u) antes del primer monstruo: arranque amable. */
export const MONSTER_START_HEIGHT = 800;
/** Tope de monstruos simultáneos vivos. */
export const MAX_MONSTERS = 3;

/** Score D11: `score = round(height / SCORE_DIVISOR)` (metros enteros). */
export const SCORE_DIVISOR = 10;

/** Posición inicial del Robo (centro) y de la primera plataforma. */
export const START_Y = WORLD_H * 0.85;

/** Margen de limpieza de entidades bajo la cámara y de spawn por encima. */
export const CLEAN_MARGIN = 40;
export const SPAWN_AHEAD = 320;
/**
 * Pool de render para plataformas (R0): el span vivo de entidades
 * (CLEAN_MARGIN + WORLD_H + SPAWN_AHEAD) dividido por el gap mínimo debe
 * caber SIEMPRE — candea `tuning.test.ts`. Un span mayor deja plataformas
 * del engine sin nodo de render ("escenario en blanco" del playtest).
 * D16: el peor caso incluye las compañeras verdes de las brown
 * (~worstCaseLive × (1 + brownProb max) ≈ 27 vivas → pool 28).
 */
export const PLATFORM_POOL = 28;

/** D19 (fase 5 juice): pools de partículas cosméticas (tweens UI-thread).
 * Los bursts usan el rango [0, PARTICLE_POOL) y la estela del turbo el
 * rango final [PARTICLE_POOL, PARTICLE_POOL + TRAIL_POOL). */
export const PARTICLE_POOL = 20;
export const TRAIL_POOL = 8;

/** D19: cadencia de la estela del turbo (emisión round-robin, ms). */
export const TRAIL_EVERY_MS = 50;
