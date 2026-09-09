/**
 * Layout v3 "solo pasillos" (PLAN-WAK-POLISH F4-iteración): APROBADO por el
 * usuario en el preview y APLICADO como LAYOUT activo en `engine/maze.ts`
 * (con tests de invariantes, incluida la regla NO 3×3). El preview sigue
 * mostrando esta constante como referencia junto al ACTIVO (ahora idénticos);
 * sirve como base para futuras iteraciones.
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
