import {
  BONUS_CELL,
  TICK_MS,
  advance,
  createGameState,
  floatPos,
  queueDirection,
  worldSnapshot,
  type GameState,
} from '../engine/rules';
import { MAZE, toIndex } from '../engine/maze';
import { seedConfig } from '../engine/seed';

/** Avanza n ticks fijos agregando los eventos. */
function run(state: GameState, ticks: number): { state: GameState; events: string[] } {
  let current = state;
  const events: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const result = advance(current, TICK_MS);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
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
    expect(events).toContain('battery');
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
    expect(events).toContain('battery');
  });

  it('súper batería activa el modo power y suma puntos', () => {
    const config = seedConfig('__test_power__');
    let state = createGameState(config);
    expect(state.supers).toEqual([toIndex(15, 8)]); // izquierda del spawn
    state = queueDirection(state, 'left');
    const { state: after, events } = run(state, 60);
    expect(events).toContain('super');
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
    expect(events).toContain('bonusTaken');
    expect(after.bonusTaken).toBe(true);
    // batería en la celda de partida (f11,c8) + chip + baterías f11,c10..c12
    expect(after.score).toBe(4 * 10 + 100);
    expect(after.robot.cell).toBe(toIndex(11, 12)); // se detiene contra el muro
  });

  it('chip dorado: expira si no se toma a tiempo', () => {
    const base = createGameState(seedConfig());
    const state: GameState = { ...base, bonus: { expiresAt: 200 }, bonusTaken: false };
    const { state: after, events } = run(state, 30);
    expect(events).toContain('bonusExpired');
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
    expect(events).toContain('caught');
    expect(after.lives).toBe(2);
    expect(after.robot.cell).toBe(MAZE.robotSpawn);
    expect(after.robot.dir).toBeNull();
    for (const drone of after.drones) expect(drone.mode).toBe('waiting');
  });

  it('con power: el robot come al drone, suma puntos y este reaparece luego', () => {
    const { state: after, events } = run(droneOnRobot(true), 5);
    expect(events).toContain('droneEaten');
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
    expect(events).toContain('caught');
    expect(after.lives).toBe(0);
  });
});

describe('rules: fases scatter/chase', () => {
  it('arranca en scatter y alterna con reversa de drones', () => {
    const state = playingGame();
    expect(state.phase).toBe('scatter');
    // scatter dura 5000ms; tras ~5s alterna a chase
    const { state: after } = run(state, Math.ceil(5200 / TICK_MS));
    expect(after.phase).toBe('chase');
    expect(after.phaseUntil).toBeGreaterThan(after.elapsedMs);
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
