/**
 * Layout FÁCIL (PLAN-ACCESIBILIDAD T4b): 11×13 para el modo fácil — personajes
 * y escenario ×2 al render (cellSize lo calcula la pantalla del maze activo).
 *
 * Misma gramática del layout normal (v3, solo pasillos):
 *   `#` muro · `.` batería · `o` súper (4) · ` ` camino sin batería
 *   `-` puerta del corral · `D` spawn de drone (2) · `R` spawn del robot
 *
 * Versión FINAL del usuario (checkpoint T4b): combs verticales en la zona
 * inferior eliminan las áreas abiertas 2×2 del primer candidato; spawn en el
 * centro (8,5) con corredor completo c1..c9 (topes en los bordes); chip
 * dorado en el propio spawn (8,5: el chip aparece a mitad de partida, cuando
 * la celda ya está libre).
 *
 * Pines (candeados por validateLayoutEasy):
 *   - spawn R en (8,5) con corredor recto c1..c9 (topes c0/c10) → sentinelas
 *     tipo test-win fáciles (baterías colocables consecutivas ≥5);
 *   - corral sellado para 2 drones en la fila 6 (D D gap) con puerta (5,5);
 *   - esquinas scatter (1,1),(1,9),(11,1),(11,9) = homeCorners(maze fácil);
 *   - BONUS_CELL (8,5) = spawn, camino sin batería;
 *   - 1 sola fila de túnel (la 6, con wrap en ancho 11); sin callejones,
 *     conectividad total, sin áreas 3×3 (misma regla del usuario).
 */
export const LAB_FACIL: readonly string[] = [
  '###########',
  '#o.......o#',
  '#.##.#.##.#',
  '#....#....#',
  '##.#...#.##',
  '##.##-##.##',
  '...#D D#...',
  '##.#####.##',
  '#....R....#',
  '#.#.#.#.#.#',
  '#.#.#.#.#.#',
  '#o.......o#',
  '###########',
];
