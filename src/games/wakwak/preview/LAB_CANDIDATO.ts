/**
 * Layout CANDIDATO para iterar en el preview (PLAN-WAK-POLISH F4-iteración).
 * NO está activo en el juego: `maze.ts` sigue sirviendo el LAYOUT v2. Cuando
 * el diseño cierre con el usuario, este layout reemplaza el LAYOUT, se
 * agregan los tests de invariantes (incluida la regla NO 3×3) y se verifica
 * el E2E completo.
 *
 * Base: layout v1 (pasillos) + sección inferior reconstruida como corredores
 * (el v1 y el v2 tenían 3×3 abiertos en filas 17-19). Pines conservados:
 * fila 15 corredor del spawn, corral 8-10, esquinas scatter, (11,9) chip.
 * Validador: `validateLayout` debe devolver [] para este layout.
 */
export const LAB_CANDIDATO: readonly string[] = [
  '###################',
  '#o.......#.......o#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.####.####.##.#',
  '#......#...#......#',
  '####.#.#.#.#.#.####',
  '####.#.......#.####',
  '####.####-####.####',
  '.....##DD DD##.....',
  '####.#########.####',
  '####.#... ...#.####',
  '####.#.#####.#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#.....R.....#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '###################',
];

/** Layout v2 activo (para comparar lado a lado en el preview). */
export { LAYOUT as LAB_ACTUAL } from '../engine/maze';
