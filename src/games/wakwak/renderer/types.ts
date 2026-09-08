/**
 * Puerto de presentación de Wak Wak (ADR 0010): contrato agnóstico al motor.
 * El núcleo (`engine/`) no conoce esta interfaz; los adaptadores en
 * `renderer/<motor>/` la implementan y son el ÚNICO lugar que importa la
 * librería de render elegida.
 *
 * El flujo por frame (dirigido desde WakWakScreen):
 *   1. loop del adaptador acumula dt y pide `store.tick(dt)`
 *   2. la pantalla construye un `WorldSnapshot` con las poses interpoladas
 *   3. `renderer.present(snapshot)` pinta el frame
 */

import type { Direction } from '../engine/maze';
import type { DroneMode } from '../engine/rules';

export interface Pose {
  /** posición en unidades de celda (centro de celda 0 = origen) */
  x: number;
  y: number;
  dir: Direction | null;
}

export interface WorldSnapshot {
  robot: Pose & { powered: boolean };
  /** siempre 4 drones, con su id estable */
  drones: Array<Pose & { id: number; mode: DroneMode; powered: boolean }>;
  /** fracción de comestibles restantes (para efectos opcionales) */
  remaining: number;
}

export interface WakWakRenderer {
  /** (Re)construye el mundo estático (muros, baterías) con la celda medida */
  createWorld(cellSize: number): void;
  /** pinta un frame; debe ser barato (sin reconciliación de React) */
  present(snapshot: WorldSnapshot): void;
  /** libera recursos (timers, listeners) */
  destroy(): void;
}
