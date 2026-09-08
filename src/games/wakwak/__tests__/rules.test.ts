import {
  BONUS_CELL,
  TICK_MS,
  advance,
  createGameState,
  droneChainPoints,
  floatPos,
  queueDirection,
  worldSnapshot,
  type GameEvent,
  type GameState,
} from '../engine/rules';
import { MAZE, toIndex } from '../engine/maze';
import { seedConfig } from '../engine/seed';
import { levelConfig } from '../engine/levels';

/** Avanza n ticks fijos agregando los eventos. */
function run(state: GameState, ticks: number): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const result = advance(current, TICK_MS);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

function typeNames(events: GameEvent[]): string[] {
  return events.map((e) => e.type);
}

function playingGame(): GameState {
  return createGameState(seedConfig());
}

describe('rules: creación y determinismo', () => {
  it('estado inicial: robot en spawn, drones en corral esperando', () => {
    const state = playingGame();
    expect(state.robot.cell).toBe(MAZE.robotSpawn);
    expect(state.robot.dir).toBeNull();
    expect(state.drones).toHaveLength(4);
    for (const drone of state.drones) {
      expect(drone.mode).toBe('waiting');
      expect(MAZE.droneSpawns).toContain(drone.cell);
    }
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
    expect(state.totalEdibles).toBe(state.batteries.length + state.supers.length);
    expect(state.totalEdibles).toBeGreaterThan(100);
  });

  it('mismo seed → misma simulación (determinismo)', () => {
    const a = run(playingGame(), 300).state;
    const b = run(playingGame(), 300).state;
    expect(a.robot).toEqual(b.robot);
    expect(a.drones).toEqual(b.drones);
    expect(a.score).toBe(b.score);
    expect(a.elapsedMs).toBe(b.elapsedMs);
  });

  it('advance acumula resto para mantener el paso fijo', () => {
    const result = advance(playingGame(), 7); // menos de un tick
    expect(result.state.elapsedMs).toBe(0);
    expect(result.state.remainderMs).toBe(7);
    const result2 = advance(result.state, TICK_MS); // 7 + 16.67 → 1 tick
    expect(result2.state.elapsedMs).toBe(TICK_MS);
    expect(result2.state.remainderMs).toBeLessThan(TICK_MS);
  });

  it('advance no simula una partida terminada', () => {
    const finished = { ...playingGame(), status: 'won' as const };
    const result = advance(finished, 1000);
    expect(result.state).toBe(finished);
    expect(result.events).toHaveLength(0);
  });
});

describe('rules: movimiento del robot', () => {
  it('queueDirection desde el spawn: avanza y consume baterías en el camino', () => {
    let state = queueDirection(playingGame(), 'left');
    expect(state.robot.dir).toBe('left');
    const { state: after, events } = run(state, 60); // ~1 segundo
    // avanza por la fila 15 hasta el muro (f15,c3): come c8..c4
    expect(after.robot.cell).toBe(toIndex(15, 4));
    expect(after.robot.dir).toBeNull(); // se detiene contra el muro
    expect(after.score).toBe(50);
    expect(typeNames(events)).toContain('battery');
    expect(after.eaten).toBe(5);
  });

  it('queueDirection contra un muro queda encolada sin mover al robot', () => {
    // sobre el spawn (f15,c9) hay muro
    const state = queueDirection(playingGame(), 'up');
    expect(state.robot.dir).toBeNull();
    expect(state.robot.queued).toBe('up');
    const { state: after } = run(state, 30);
    expect(after.robot.cell).toBe(MAZE.robotSpawn);
  });

  it('reversa inmediata en medio del movimiento, sin teletransporte', () => {
    const { state: mid } = run(queueDirection(playingGame(), 'left'), 6); // ~100ms
    expect(mid.robot.progress).toBeGreaterThan(0);
    const reversed = queueDirection(mid, 'right');
    expect(reversed.robot.dir).toBe('right');
    expect(reversed.robot.progress).toBeLessThan(1);
    expect(reversed.robot.cell).not.toBe(mid.robot.cell);
  });

  it('reversa con progress 0 solo cambia la dirección', () => {
    const stopped = queueDirection(playingGame(), 'left');
    const reversed = queueDirection(stopped, 'right');
    expect(reversed.robot.cell).toBe(MAZE.robotSpawn);
    expect(reversed.robot.dir).toBe('right');
    expect(reversed.robot.progress).toBe(0);
  });

  it('el wrap del túnel interpola hacia el borde, no cruza el mapa', () => {
    const pos = floatPos({ cell: toIndex(MAZE.tunnelRow, 0), dir: 'left', progress: 0.5 }, false);
    expect(pos.x).toBeLessThan(1);
  });
});

describe('rules: recolección y victoria', () => {
  /** Partida artesanal: 5 baterías en línea recta a la izquierda del spawn. */
  function straightGame(count: number): GameState {
    const base = createGameState(seedConfig());
    const batteries: number[] = [];
    for (let c = 8; c > 8 - count; c--) batteries.push(toIndex(15, c));
    return {
      ...base,
      batteries,
      supers: [],
      totalEdibles: count,
    };
  }

  it('comer todos los comestibles declara victoria con bonus por vidas', () => {
    const { state: after, events } = run(queueDirection(straightGame(5), 'left'), 60 * 3);
    expect(after.status).toBe('won');
    expect(after.finishedAt).not.toBeNull();
    // 5 baterías × 10 + 3 vidas × 100
    expect(after.score).toBe(5 * 10 + 3 * 100);
    expect(typeNames(events)).toContain('battery');
  });

  it('súper batería activa el modo power y suma puntos', () => {
    const config = seedConfig('__test_power__');
    let state = createGameState(config);
    expect(state.supers).toEqual([toIndex(15, 8)]); // izquierda del spawn
    state = queueDirection(state, 'left');
    const { state: after, events } = run(state, 60);
    expect(typeNames(events)).toContain('super');
    expect(after.powerUntil).not.toBeNull();
    expect(after.score).toBeGreaterThanOrEqual(50);
  });

  it('chip dorado: se toma al pasar por su celda mientras está activo', () => {
    const base = createGameState(seedConfig());
    const state: GameState = {
      ...base,
      robot: { cell: toIndex(11, 8), dir: 'right', progress: 0, queued: null },
      bonus: { expiresAt: 100_000 },
      bonusTaken: false,
    };
    expect(BONUS_CELL).toBe(toIndex(11, 9));
    const { state: after, events } = run(state, 60);
    expect(typeNames(events)).toContain('bonusTaken');
    expect(after.bonusTaken).toBe(true);
    // batería en la celda de partida (f11,c8) + chip + baterías f11,c10..c12
    expect(after.score).toBe(4 * 10 + 100);
    expect(after.robot.cell).toBe(toIndex(11, 12)); // se detiene contra el muro
  });

  it('chip dorado: expira si no se toma a tiempo', () => {
    const base = createGameState(seedConfig());
    const state: GameState = { ...base, bonus: { expiresAt: 200 }, bonusTaken: false };
    const { state: after, events } = run(state, 30);
    expect(typeNames(events)).toContain('bonusExpired');
    expect(after.bonus).toBeNull();
    expect(after.bonusTaken).toBe(true);
  });
});

describe('rules: colisiones, power y vidas', () => {
  /** Drone 0 sobre la celda del robot, en roaming. */
  function droneOnRobot(power: boolean): GameState {
    const base = createGameState(seedConfig());
    return {
      ...base,
      powerUntil: power ? base.elapsedMs + 5000 : null,
      drones: base.drones.map((d, i) =>
        i === 0 ? { ...d, cell: base.robot.cell, mode: 'roaming' as const, dir: null, progress: 0 } : d,
      ),
    };
  }

  it('sin power: el robot es atrapado, pierde una vida y se reinician posiciones', () => {
    const { state: after, events } = run(droneOnRobot(false), 5);
    expect(typeNames(events)).toContain('caught');
    expect(after.lives).toBe(2);
    expect(after.robot.cell).toBe(MAZE.robotSpawn);
    expect(after.robot.dir).toBeNull();
    for (const drone of after.drones) expect(drone.mode).toBe('waiting');
  });

  it('con power: el robot come al drone, suma puntos y este reaparece luego', () => {
    const { state: after, events } = run(droneOnRobot(true), 5);
    expect(typeNames(events)).toContain('droneEaten');
    expect(after.score).toBe(200);
    const eaten = after.drones[0];
    expect(eaten.mode).toBe('eaten');
    expect(eaten.respawnAt).not.toBeNull();
    // justo al cumplirse el tiempo de respawn: waiting, aún en el corral
    const { state: respawned } = run(after, Math.ceil(6000 / TICK_MS));
    expect(respawned.drones[0].mode).toBe('waiting');
    expect(respawned.drones[0].cell).toBe(MAZE.droneSpawns[0]);
  });

  it('tres capturas → derrota', () => {
    function placeDroneOnRobot(state: GameState): GameState {
      return {
        ...state,
        drones: state.drones.map((d, i) =>
          i === 0 ? { ...d, cell: state.robot.cell, mode: 'roaming' as const, dir: null, progress: 0 } : d,
        ),
      };
    }
    let state = placeDroneOnRobot(playingGame());
    let guard = 0;
    while (state.status === 'playing' && guard < 60 * 120) {
      const result = advance(state, TICK_MS);
      state = result.state;
      // tras cada reinicio, volver a poner un drone encima para forzar la captura siguiente
      if (
        state.status === 'playing' &&
        state.robot.cell === MAZE.robotSpawn &&
        state.robot.dir === null &&
        state.drones[0].mode === 'waiting'
      ) {
        state = placeDroneOnRobot(state);
      }
      guard++;
    }
    expect(state.status).toBe('lost');
    expect(state.lives).toBe(0);
  });

  it('test-lose: robot quieto pierde la partida sin intervención', () => {
    const { state: after, events } = run(createGameState(seedConfig('__test_lose__')), 60 * 30);
    expect(after.status).toBe('lost');
    expect(typeNames(events)).toContain('caught');
    expect(after.lives).toBe(0);
  });
});

describe('rules: fases scatter/chase', () => {
  it('arranca en scatter y alterna con reversa de drones (duración del nivel)', () => {
    const state = playingGame();
    expect(state.phase).toBe('scatter');
    // scatter dura `scatterMs` del nivel; tras ese tiempo alterna a chase
    const ticks = Math.ceil((levelConfig(state.level).scatterMs + 200) / TICK_MS);
    const { state: after } = run(state, ticks);
    expect(after.phase).toBe('chase');
    expect(after.phaseUntil).toBeGreaterThan(after.elapsedMs);
  });
});

describe('rules: combo (cadena de drones en un power)', () => {
  it('droneChainPoints duplica con cap en 3200', () => {
    expect(droneChainPoints(1)).toBe(200);
    expect(droneChainPoints(2)).toBe(400);
    expect(droneChainPoints(3)).toBe(800);
    expect(droneChainPoints(4)).toBe(1600);
    expect(droneChainPoints(5)).toBe(3200);
    expect(droneChainPoints(6)).toBe(3200);
    expect(droneChainPoints(12)).toBe(3200);
  });

  it('test-combo: dos drones en el mismo power → eventos chain 1 y 2, 650 pts', () => {
    let lastState = queueDirection(createGameState(seedConfig('__test_combo__')), 'left');
    let eaten = 0;
    const allEvents: GameEvent[] = [];
    for (let i = 0; i < 60 * 10 && eaten < 2; i++) {
      const result = advance(lastState, TICK_MS);
      allEvents.push(...result.events);
      lastState = result.state;
      eaten += result.events.filter((e) => e.type === 'droneEaten').length;
    }
    const eatenEvents = allEvents.filter((e) => e.type === 'droneEaten');
    expect(eatenEvents.map((e) => (e as { chain: number }).chain)).toEqual([1, 2]);
    expect(eatenEvents.map((e) => (e as { points: number }).points)).toEqual([200, 400]);
    // 50 (súper) + 200 + 400
    expect(lastState.score).toBe(650);
    expect(lastState.chain).toBe(2);
    expect(lastState.bestChain).toBe(2);
  });

  it('la cadena se reinicia al expirar el modo power', () => {
    const base = createGameState(seedConfig());
    const powered: GameState = {
      ...base,
      powerUntil: base.elapsedMs + 100,
      chain: 2,
      bestChain: 2,
    };
    const { state: after } = run(powered, 30);
    expect(after.powerUntil).toBeNull();
    expect(after.chain).toBe(0);
    expect(after.bestChain).toBe(2); // el récord de la partida se conserva
  });

  it('la cadena se reinicia al ser atrapado', () => {
    const base = createGameState(seedConfig());
    const state: GameState = {
      ...base,
      powerUntil: null,
      chain: 3,
      bestChain: 3,
      drones: base.drones.map((d, i) =>
        i === 0 ? { ...d, cell: base.robot.cell, mode: 'roaming' as const, dir: null, progress: 0 } : d,
      ),
    };
    const { state: after, events } = run(state, 5);
    expect(typeNames(events)).toContain('caught');
    expect(after.chain).toBe(0);
    expect(after.bestChain).toBe(3); // el récord de la partida se conserva
  });
});

describe('rules: Elroy (Cazador acelera al final del nivel)', () => {
  /** Drone 0 lejos del robot (esquina) para aislar la velocidad sin colisiones. */
  function stateAt(remainingFrac: number, threshold: number | null, power = false): GameState {
    const base = createGameState(seedConfig());
    const total = base.totalEdibles;
    const eaten = Math.floor(total * (1 - remainingFrac));
    const cfg = { ...base.cfg, elroyThreshold: threshold, elroyBoost: 1.05 };
    return {
      ...base,
      cfg,
      eaten,
      powerUntil: power ? base.elapsedMs + 5000 : null,
      drones: base.drones.map((d, i) =>
        i === 0 ? { ...d, cell: toIndex(1, 1), mode: 'roaming' as const, dir: 'right' as const, progress: 0 } : d,
      ),
    };
  }

  it('bajo el umbral: el Cazador avanza más rápido (boost)', () => {
    // restan pocas baterías: 1 - eaten/total < 0.12
    const { state: boosted } = run(stateAt(0.05, 0.12), 1);
    const { state: normal } = run(stateAt(0.05, null), 1);
    expect(boosted.drones[0].progress).toBeGreaterThan(normal.drones[0].progress);
  });

  it('sobre el umbral o en power: velocidad normal', () => {
    const { state: above } = run(stateAt(0.5, 0.12), 1);
    const { state: noElroy } = run(stateAt(0.5, null), 1);
    expect(above.drones[0].progress).toBeCloseTo(noElroy.drones[0].progress, 10);

    // en power huye a droneFrightened: el boost no aplica
    const { state: powered } = run(stateAt(0.05, 0.12, true), 1);
    const { state: poweredNormal } = run(stateAt(0.05, null, true), 1);
    expect(powered.drones[0].progress).toBeCloseTo(poweredNormal.drones[0].progress, 10);
  });
});

describe('rules: snapshot para render', () => {
  it('poses dentro de la grilla y 4 drones con id estable', () => {
    const { state: after } = run(queueDirection(playingGame(), 'left'), 30);
    const snap = worldSnapshot(after);
    expect(snap.drones).toHaveLength(4);
    expect(snap.drones.map((d) => d.id).sort()).toEqual([0, 1, 2, 3]);
    expect(snap.robot.x).toBeGreaterThan(0);
    expect(snap.robot.x).toBeLessThan(19);
    expect(snap.robot.y).toBeGreaterThan(0);
    expect(snap.robot.y).toBeLessThan(21);
    expect(snap.remaining).toBeGreaterThan(0);
    expect(snap.remaining).toBeLessThan(1);
  });
});
