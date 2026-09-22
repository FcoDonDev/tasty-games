import {
  MAZE,
  MAZE_COLS,
  MAZE_ROWS,
  DIRECTIONS,
  cellDistance,
  cellCenter,
  colOf,
  isCorralCell,
  mazeFor,
  bonusCellFor,
  neighbor,
  oppositeDirection,
  parseLayout,
  rowOf,
  toIndex,
  type MazeData,
} from '../engine/maze';
import { homeCorners, HOME_CORNERS } from '../engine/ai';
import { BONUS_CELL } from '../engine/rules';

/** Layout mínimo paramétrico (5×6, 2 drones): fixture del parseo por modo. */
const LAYOUT_MINI = [
  '#####',
  '#D-.#',
  '#D .#',
  '#-..#',
  '#R..#',
  '#####',
];
// fila de túnel del mini (extremos no-muro): ninguna — se agrega abajo.
const LAYOUT_MINI_TUNNEL = [
  '#####',
  '#D-.#',
  '#D .#',
  '  .. ',
  '#R..#',
  '#####',
];

/** Celdas transitables por el robot (path, sin corral ni puerta). */
function robotWalkable(): number[] {
  const cells: number[] = [];
  for (let i = 0; i < MAZE.grid.length; i++) {
    const probe = neighbor(i, 'up', false) >= 0 || neighbor(i, 'left', false) >= 0 || neighbor(i, 'right', false) >= 0 || neighbor(i, 'down', false) >= 0 || MAZE.robotSpawn === i;
    if (MAZE.grid[i] === 'path' && probe) cells.push(i);
  }
  return cells;
}

describe('maze: dimensiones y topología', () => {
  it('grilla de MAZE_ROWS × MAZE_COLS', () => {
    expect(MAZE.grid).toHaveLength(MAZE_ROWS * MAZE_COLS);
    expect(MAZE_COLS).toBe(19);
    expect(MAZE_ROWS).toBe(21);
  });

  it('borde completo de muros salvo la fila de túnel', () => {
    for (let col = 0; col < MAZE_COLS; col++) {
      expect(MAZE.grid[toIndex(0, col)]).toBe('wall');
      expect(MAZE.grid[toIndex(MAZE_ROWS - 1, col)]).toBe('wall');
    }
    expect(MAZE.grid[toIndex(MAZE.tunnelRow, 0)]).toBe('path');
    expect(MAZE.grid[toIndex(MAZE.tunnelRow, MAZE_COLS - 1)]).toBe('path');
    // solo hay una fila de túnel
    let tunnels = 0;
    for (let row = 0; row < MAZE_ROWS; row++) {
      if (MAZE.grid[toIndex(row, 0)] === 'path') tunnels++;
    }
    expect(tunnels).toBe(1);
  });

  it('túnel: wrap de col 0 ↔ última columna solo en la fila de túnel', () => {
    const t = MAZE.tunnelRow;
    expect(neighbor(toIndex(t, 0), 'left', false)).toBe(toIndex(t, MAZE_COLS - 1));
    expect(neighbor(toIndex(t, MAZE_COLS - 1), 'right', false)).toBe(toIndex(t, 0));
    // fuera del túnel, el borde es muro
    expect(neighbor(toIndex(t - 1, 0), 'left', false)).toBe(-1);
  });

  it('4 súper baterías, spawn de robot y 4 spawns de drone', () => {
    expect(MAZE.superCells).toHaveLength(4);
    expect(MAZE.batteryCells.length).toBeGreaterThan(100);
    expect(MAZE.robotSpawn).toBeGreaterThan(0);
    expect(MAZE.droneSpawns).toHaveLength(4);
    for (const spawn of MAZE.droneSpawns) expect(isCorralCell(spawn)).toBe(true);
  });

  it('corral encerrado: la única salida del robot-spawn no entra al corral', () => {
    expect(isCorralCell(MAZE.robotSpawn)).toBe(false);
    for (const cell of MAZE.corralCells) {
      expect(neighbor(cell, 'up', false)).toBe(-1);
      expect(neighbor(cell, 'down', false)).toBe(-1);
      expect(neighbor(cell, 'left', false)).toBe(-1);
      expect(neighbor(cell, 'right', false)).toBe(-1);
    }
    // la puerta conecta el corral con un camino del robot
    const outside = neighbor(MAZE.doorIndex, 'up', false);
    expect(outside).toBeGreaterThanOrEqual(0);
  });
});

describe('maze: conectividad y sin callejones', () => {
  it('todas las celdas del robot forman una sola componente conexa', () => {
    const walkable = new Set(robotWalkable());
    const start = MAZE.robotSpawn;
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const dir of DIRECTIONS) {
        const next = neighbor(current, dir, false);
        if (next >= 0 && walkable.has(next) && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(walkable.size);
  });

  it('todas las baterías y súper baterías son alcanzables por el robot', () => {
    const walkable = new Set(robotWalkable());
    for (const cell of [...MAZE.batteryCells, ...MAZE.superCells]) {
      expect(walkable.has(cell)).toBe(true);
    }
  });

  it('sin callejones sin salida (toda celda del robot tiene ≥2 vecinas)', () => {
    for (const cell of robotWalkable()) {
      const exits = DIRECTIONS.filter((dir) => neighbor(cell, dir, false) >= 0).length;
      expect(exits).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('maze: pines del layout (sentinels E2E, IA, chip)', () => {
  it('fila del spawn: corredor horizontal c4..c14 con topes c3/c15 (seeds E2E)', () => {
    // test-win (baterías c4..c8), test-power/test-combo (súper c8, drones c4/c6)
    // dependen de esta fila; c3/c15 son los muros que detienen al robot.
    for (let col = 4; col <= 14; col++) {
      expect(MAZE.grid[toIndex(15, col)]).not.toBe('wall');
    }
    expect(MAZE.grid[toIndex(15, 3)]).toBe('wall');
    expect(MAZE.grid[toIndex(15, 15)]).toBe('wall');
    expect(MAZE.robotSpawn).toBe(toIndex(15, 9));
  });

  it('esquinas scatter de ai.ts (HOME_CORNERS) transitables y sin callejón', () => {
    for (const corner of HOME_CORNERS) {
      expect(MAZE.grid[corner]).toBe('path');
      const exits = DIRECTIONS.filter((dir) => neighbor(corner, dir, false) >= 0).length;
      expect(exits).toBeGreaterThanOrEqual(2);
    }
  });

  it('BONUS_CELL (11,9): camino sin batería (pickup corre cada tick en la celda)', () => {
    expect(BONUS_CELL).toBe(toIndex(11, 9));
    expect(MAZE.grid[BONUS_CELL]).toBe('path');
    expect(MAZE.batteryCells).not.toContain(BONUS_CELL);
    expect(MAZE.superCells).not.toContain(BONUS_CELL);
  });
  it('sin áreas abiertas 3×3 (regla del usuario: solo pasillos)', () => {
    // cualquier ventana 3×3 debe tener al menos un muro (o celda no robot)
    const violaciones: string[] = [];
    for (let row = 0; row + 2 < MAZE_ROWS; row++) {
      for (let col = 0; col + 2 < MAZE_COLS; col++) {
        let allPath = true;
        for (let dr = 0; dr < 3 && allPath; dr++) {
          for (let dc = 0; dc < 3; dc++) {
            const index = toIndex(row + dr, col + dc);
            if (MAZE.grid[index] !== 'path' || isCorralCell(index)) {
              allPath = false;
              break;
            }
          }
        }
        if (allPath) violaciones.push(`(${row},${col})`);
      }
    }
    expect(violaciones).toEqual([]);
  });

});

describe('maze: utilidades', () => {
  it('rowOf/colOf/toIndex consistentes', () => {
    for (let i = 0; i < MAZE_COLS * MAZE_ROWS; i++) {
      expect(toIndex(rowOf(i), colOf(i))).toBe(i);
    }
  });

  it('oppositeDirection', () => {
    expect(oppositeDirection('up')).toBe('down');
    expect(oppositeDirection('left')).toBe('right');
    expect(oppositeDirection('right')).toBe('left');
    expect(oppositeDirection('down')).toBe('up');
  });

  it('cellCenter y cellDistance', () => {
    expect(cellCenter(toIndex(3, 4))).toEqual({ x: 4.5, y: 3.5 });
    expect(cellDistance(toIndex(0, 0), toIndex(3, 4))).toBe(5);
  });
});

describe('maze: refactor paramétrico por modo (T4a)', () => {
  it('mazeFor(normal) ES el maze activo: 19×21, 4 drones, bonus cell (11,9)', () => {
    expect(MAZE).toBe(mazeFor('normal')); // buildMaze delega en mazeFor
    expect(MAZE.cols).toBe(19);
    expect(MAZE.rows).toBe(21);
    expect(MAZE.droneSpawns).toHaveLength(4);
    expect(MAZE.bonusCell).toBe(BONUS_CELL);
    expect(bonusCellFor('normal')).toBe(BONUS_CELL);
  });

  it('mazeFor(facil): 11×13, 2 drones, chip en el spawn (8,5) — T4c', () => {
    const facil = mazeFor('facil');
    expect(facil.cols).toBe(11);
    expect(facil.rows).toBe(13);
    expect(facil.grid).toHaveLength(11 * 13);
    expect(facil.droneSpawns).toHaveLength(2);
    expect(facil.robotSpawn).toBe(toIndex(8, 5, 11));
    expect(facil.bonusCell).toBe(toIndex(8, 5, 11));
    expect(bonusCellFor('facil')).toBe(facil.bonusCell);
    // memoizado: misma referencia
    expect(mazeFor('facil')).toBe(facil);
  });

  it('parseLayout paramétrico: layout mini 5×6 con 2 drones', () => {
    const mini: MazeData = parseLayout(LAYOUT_MINI_TUNNEL, 2);
    expect(mini.cols).toBe(5);
    expect(mini.rows).toBe(6);
    expect(mini.grid).toHaveLength(30);
    expect(mini.droneSpawns).toHaveLength(2);
    expect(mini.robotSpawn).toBe(toIndex(4, 1, 5));
    expect(mini.tunnelRow).toBe(3);
    expect(mini.doorIndex).toBe(toIndex(1, 2, 5));
    // helpers con maze explícito (default cols=19 no sirve acá)
    expect(rowOf(toIndex(4, 1, 5), 5)).toBe(4);
    expect(colOf(toIndex(4, 1, 5), 5)).toBe(1);
    expect(isCorralCell(toIndex(1, 1, 5), mini)).toBe(true);
    expect(isCorralCell(toIndex(4, 1, 5), mini)).toBe(false);
  });

  it('parseLayout paramétrico: el túnel del mini hace wrap en SU ancho', () => {
    const mini = parseLayout(LAYOUT_MINI_TUNNEL, 2);
    // (3,0) ' ← (3,4) ' con wrap en cols=5
    expect(neighbor(toIndex(3, 0, 5), 'left', false, mini)).toBe(toIndex(3, 4, 5));
    expect(neighbor(toIndex(3, 4, 5), 'right', false, mini)).toBe(toIndex(3, 0, 5));
    // fuera del túnel, el borde bloquea
    expect(neighbor(toIndex(4, 0, 5), 'left', false, mini)).toBe(-1);
  });

  it('parseLayout valida anchos consistentes, carácter desconocido y drones esperados', () => {
    const anchoRoto = [...LAYOUT_MINI_TUNNEL];
    anchoRoto[1] = '#D-#'; // 4 chars != 5
    expect(() => parseLayout(anchoRoto, 2)).toThrow(/ancho/);
    const caracterRaro = [...LAYOUT_MINI_TUNNEL];
    caracterRaro[4] = '#R.X#';
    expect(() => parseLayout(caracterRaro, 2)).toThrow(/desconocido/);
    // 2 spawns en el layout, se pidieron 3
    expect(() => parseLayout(LAYOUT_MINI_TUNNEL, 3)).toThrow(/3 spawns/);
    // sin fila de túnel (LAYOUT_MINI: todas las filas con extremos en muro)
    expect(() => parseLayout(LAYOUT_MINI, 2)).toThrow(/túnel/);
  });

  it('homeCorners es función del maze: normal ≡ HOME_CORNERS legacy', () => {
    expect(homeCorners(MAZE)).toEqual(HOME_CORNERS);
    expect(HOME_CORNERS).toEqual([
      toIndex(1, 1),
      toIndex(1, 17),
      toIndex(19, 1),
      toIndex(19, 17),
    ]);
  });
});
