/**
 * Invariantes del layout FÁCIL (PLAN-ACCESIBILIDAD T4b): el candidato de
 * `preview/LAB_FACIL.ts` debe pasar el validador paramétrico con SUS pines
 * (spawn, corredor del sentinela, corners scatter, chip) y parsear como
 * MazeData de 2 drones. Es el gate automático antes del checkpoint visual.
 */

import { parseLayout, bonusCellFor, mazeFor, toIndex } from '../engine/maze';
import { LAB_FACIL } from '../preview/LAB_FACIL';
import { validateLayoutEasy, openAreas3x3, parseLenient } from '../preview/validateLayout';

describe('LAB_FACIL (modo fácil, T4b): invariantes del candidato', () => {
  it('pasa el validador fácil sin problemas', () => {
    expect(validateLayoutEasy(LAB_FACIL)).toEqual([]);
  });

  it('parsea como MazeData 11×13 con 2 drones y corral de 3 celdas', () => {
    const maze = parseLayout(LAB_FACIL, 2);
    expect(maze.cols).toBe(11);
    expect(maze.rows).toBe(13);
    expect(maze.grid).toHaveLength(11 * 13);
    expect(maze.droneSpawns).toHaveLength(2);
    expect(maze.corralCells).toHaveLength(3); // D D gap
    expect(maze.doorIndex).toBe(toIndex(5, 5, 11));
    expect(maze.robotSpawn).toBe(toIndex(9, 2, 11));
    expect(maze.tunnelRow).toBe(6);
    expect(maze.superCells).toHaveLength(2);
    // chip: camino sin batería en (8,5)
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

  it('corredor del spawn: 5 baterías en línea a la derecha (c3..c7), topes c0/c8', () => {
    const p = parseLenient(LAB_FACIL, 11, 13)!;
    for (let c = 3; c <= 7; c++) expect(p.batteries).toContain(toIndex(9, c, 11));
    expect(p.grid[toIndex(9, 0, 11)]).toBe('wall');
    expect(p.grid[toIndex(9, 8, 11)]).toBe('wall');
  });

  it('el maze del modo fácil solo existirá cuando mazeFor lo registre (T4c)', () => {
    expect(() => mazeFor('facil')).toThrow();
    expect(() => bonusCellFor('facil')).toThrow();
  });
});

function neighborLeft(row: number, col: number, maze: ReturnType<typeof parseLayout>): number {
  const from = toIndex(row, col, maze.cols);
  // via el validador (semántica robot): simulo con grid+wrap del engine
  const left = neighborEngine(from, 'left', maze);
  return left;
}

function neighborRight(row: number, col: number, maze: ReturnType<typeof parseLayout>): number {
  return neighborEngine(toIndex(row, col, maze.cols), 'right', maze);
}

function neighborEngine(
  index: number,
  dir: 'left' | 'right',
  maze: ReturnType<typeof parseLayout>,
): number {
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
