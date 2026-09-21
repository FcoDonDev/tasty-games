/**
 * Layout FÁCIL (PLAN-ACCESIBILIDAD T4b): ~11×13 para el modo fácil — personajes
 * y escenario ×2 al render (cellSize lo calcula la pantalla del maze activo).
 *
 * Misma gramática del layout normal (v3, solo pasillos):
 *   `#` muro · `.` batería · `o` súper (2) · ` ` camino sin batería
 *   `-` puerta del corral · `D` spawn de drone (2) · `R` spawn del robot
 *
 * Pines (candeados por validateLayoutEasy):
 *   - spawn R en (9,2) con corredor recto de 5 baterías a su derecha
 *     (c3..c7, topes c0/c8) → sentinelas tipo test-win fáciles;
 *   - corral sellado para 2 drones en la fila 6 (D D gap) con puerta (5,5);
 *   - esquinas scatter (1,1),(1,9),(11,1),(11,9) = homeCorners(maze fácil);
 *   - BONUS_CELL (8,5) camino sin batería;
 *   - 1 sola fila de túnel (la 6, con wrap en ancho 11); sin callejones,
 *     conectividad total, sin áreas 3×3 (misma regla del usuario).
 */
export const LAB_FACIL: readonly string[] = [
  '###########',
  '#o........#',
  '#.##.#.##.#',
  '#.........#',
  '#..#...#..#',
  '#..##-##..#',
  '...#D D#...',
  '#..####...#',
  '#.... ....#',
  '#.R.....#o#',
  '#.#####.#.#',
  '#.........#',
  '###########',
];
