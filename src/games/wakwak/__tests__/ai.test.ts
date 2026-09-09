import {
  HOME_CORNERS,
  SHY_DISTANCE,
  chaseTarget,
  chooseDroneDirection,
  type DroneDecision,
} from '../engine/ai';
import { toIndex, type Direction } from '../engine/maze';

function decision(overrides: Partial<DroneDecision>): DroneDecision {
  return {
    cell: toIndex(13, 9), // corredor abierto: izquierda/derecha/abajo (arriba es muro)
    dir: 'left',
    robotCell: toIndex(3, 15),
    robotDir: 'left',
    powerMode: false,
    scatter: false,
    personality: 0,
    rng: () => 0.5,
    ...overrides,
  };
}

describe('ai: chaseTarget por personalidad', () => {
  it('Cazador (0) apunta al robot', () => {
    expect(chaseTarget(decision({}))).toBe(toIndex(3, 15));
  });

  it('Emboscador (1) apunta 4 celdas ahead del robot', () => {
    const target = chaseTarget(decision({ personality: 1 }));
    expect(target).toBe(toIndex(3, 11)); // (3,15) + 4 a la izquierda
  });

  it('Emboscador clampa dentro de la grilla', () => {
    const target = chaseTarget(
      decision({ personality: 1, robotCell: toIndex(15, 2), robotDir: 'left' }),
    );
    expect(target).toBe(toIndex(15, 0));
  });

  it('Emboscador sin dirección del robot apunta al robot', () => {
    expect(chaseTarget(decision({ personality: 1, robotDir: null }))).toBe(toIndex(3, 15));
  });

  it('Tímido (3): persigue de lejos y huye a su esquina de cerca', () => {
    const far = chaseTarget(decision({ personality: 3, robotCell: toIndex(3, 9) }));
    expect(far).toBe(toIndex(3, 9)); // distancia 10 > 6
    const near = chaseTarget(decision({ personality: 3, robotCell: toIndex(13, 12) }));
    expect(near).toBe(HOME_CORNERS[3]);
    expect(SHY_DISTANCE).toBe(6);
  });
});

describe('ai: chooseDroneDirection', () => {
  it('chase: elige el vecino euclidianamente más cercano al robot sin revertir', () => {
    // opciones left/down (no puede revertir a right): left está diagonalmente
    // más cerca de (3,15) → hypot(10,7) < hypot(11,6)
    const dir = chooseDroneDirection(decision({}));
    expect(dir).toBe('left');
  });

  it('no revierte aunque el target quede atrás (usa la alternativa más cercana)', () => {
    // robot justo detrás (a la derecha); debe elegir down, no right
    const dir = chooseDroneDirection(decision({ robotCell: toIndex(13, 12) }));
    expect(dir).not.toBe('right');
    expect(dir).toBe('down');
  });

  it('scatter: vuela hacia su esquina', () => {
    const dir = chooseDroneDirection(decision({ scatter: true, personality: 2 }));
    // esquina de Caprichoso: (19,1) → abajo-izquierda
    expect(dir === 'left' || dir === 'down').toBe(true);
  });

  it('power: huye maximizando la distancia al robot', () => {
    // robot a la derecha en la misma fila: left aleja más que down
    const dir = chooseDroneDirection(
      decision({ powerMode: true, rng: () => 0, robotCell: toIndex(13, 12) }),
    );
    expect(dir).toBe('left');
  });

  it('Caprichoso (2): deambula al azar según el rng', () => {
    const wander = chooseDroneDirection(decision({ personality: 2, rng: () => 0.1 }));
    // rng 0.1 < 0.25 → deambula: options[0] con segundo rng 0.1 → primer candidato
    expect(wander).toBe('down'); // DIRECTIONS orden up/down/left/right: sin up (muro), sin right (reversa) → options[0]='down'
    const normal = chooseDroneDirection(decision({ personality: 2, rng: () => 0.9 }));
    expect(normal).toBe('left'); // chase normal (mismo criterio euclidiano: hypot(10,7) < hypot(11,6))
  });

  it('es determinista dado el mismo rng', () => {
    const a = chooseDroneDirection(decision({ personality: 2, rng: () => 0.3 }));
    const b = chooseDroneDirection(decision({ personality: 2, rng: () => 0.3 }));
    expect(a).toBe(b);
  });

  it('dir null: elige entre todos los vecinos transitables', () => {
    const dir = chooseDroneDirection(decision({ dir: null }));
    expect(['down', 'left', 'right']).toContain(dir);
  });

  it('type Direction importado se usa en la firma', () => {
    const dir: Direction | null = chooseDroneDirection(decision({}));
    expect(dir).not.toBeNull();
  });
});
