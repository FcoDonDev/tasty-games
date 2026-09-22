/**
 * Invariantes del layout FÁCIL (PLAN-ACCESIBILIDAD T4b): el candidato FINAL
 * del usuario en `preview/LAB_FACIL.ts` debe pasar el validador paramétrico
 * con SUS pines (spawn, corredor del sentinela, corners scatter, chip) y
 * parsear como MazeData de 2 drones. Es el gate automático del diseño.
 */

import { parseLayout, mazeFor, toIndex, type MazeData } from '../engine/maze';
import { LAB_FACIL } from '../preview/LAB_FACIL';
import { validateLayoutEasy, openAreas3x3, parseLenient } from '../preview/validateLayout';

describe('LAB_FACIL (modo fácil, T4b): invariantes del candidato', () => {
  it('pasa el validador fácil sin problemas', () => {
    expect(validateLayoutEasy(LAB_FACIL)).toEqual([]);
  });

  it('parsea como MazeData 11×13 con 2 drones y corral de 3 celdas', () => {
    const maze: MazeData = parseLayout(LAB_FACIL, 2);
    expect(maze.cols).toBe(11);
    expect(maze.rows).toBe(13);
    expect(maze.grid).toHaveLength(11 * 13);
    expect(maze.droneSpawns).toHaveLength(2);
    expect(maze.corralCells).toHaveLength(3); // D D gap
    expect(maze.doorIndex).toBe(toIndex(5, 5, 11));
    expect(maze.robotSpawn).toBe(toIndex(8, 5, 11));
    expect(maze.tunnelRow).toBe(6);
    // 4 súper: (1,1),(1,9),(11,1),(11,9) — versión final del usuario
    expect(maze.superCells).toEqual([
      toIndex(1, 1, 11),
      toIndex(1, 9, 11),
      toIndex(11, 1, 11),
      toIndex(11, 9, 11),
    ]);
    // chip: el spawn (8,5) cuenta como camino sin batería
    expect(maze.grid[toIndex(8, 5, 11)]).toBe('path');
    expect(maze.batteryCells).not.toContain(toIndex(8, 5, 11));
  });

  it('wrap de túnel en ANCHO 11 (solo en la fila 6)', () => {
    const maze = parseLayout(LAB_FACIL, 2);
    expect(neighborLeft(6, 0, maze)).toBe(toIndex(6, 10, 11));
    expect(neighborRight(6, 10, maze)).toBe(toIndex(6, 0, 11));
  });

  it('no hay áreas abiertas 3×3 (regla del usuario)', () => {
    const p = parseLenient(LAB_FACIL, 11, 13)!;
    expect(openAreas3x3(p)).toEqual([]);
  });

  it('corredor del spawn: baterías consecutivas c1..c9 sin pasar del borde', () => {
    const p = parseLenient(LAB_FACIL, 11, 13)!;
    for (let c = 1; c <= 9; c++) {
      expect(p.grid[toIndex(8, c, 11)]).not.toBe('wall');
    }
    expect(p.grid[toIndex(8, 0, 11)]).toBe('wall');
    expect(p.grid[toIndex(8, 10, 11)]).toBe('wall');
  });

  it('el maze del modo fácil solo existirá cuando mazeFor lo registre (T4c)', () => {
    expect(() => mazeFor('facil')).toThrow();
  });
});

function neighborLeft(row: number, col: number, maze: MazeData): number {
  return neighborEngine(toIndex(row, col, maze.cols), 'left', maze);
}

function neighborRight(row: number, col: number, maze: MazeData): number {
  return neighborEngine(toIndex(row, col, maze.cols), 'right', maze);
}

function neighborEngine(index: number, dir: 'left' | 'right', maze: MazeData): number {
  const row = Math.floor(index / maze.cols);
  const col = index % maze.cols;
  const nc = dir === 'left' ? col - 1 : col + 1;
  if (nc < 0 || nc >= maze.cols) {
    if (row !== maze.tunnelRow) return -1;
    return toIndex(row, nc < 0 ? maze.cols - 1 : 0, maze.cols);
  }
  const cell = maze.grid[toIndex(row, nc, maze.cols)];
  return cell === 'wall' || cell === 'door' ? -1 : toIndex(row, nc, maze.cols);
}
