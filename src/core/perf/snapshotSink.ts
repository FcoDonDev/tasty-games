/**
 * Sink de snapshots nativo (Android/iOS): archivo en Documents + fallback por
 * consola (logcat). Par dual con snapshotSink.web.ts (no-op: en web persiste
 * en localStorage vía persistSnapshot). Ver AGENTS.md (persistencia dual) y
 * PLAN-PERFORMANCE §19/§1N.
 */

type GameId = string;

/** Fallback logcat: chunks re-ensamblables (logcat trunca ~4KB por línea). */
const PERF_CHUNK = 3500;

export function perfSnapshotChunks(payload: string): string[] {
  const n = Math.max(1, Math.ceil(payload.length / PERF_CHUNK));
  const chunks: string[] = [];
  for (let i = 0; i < n; i++) chunks.push(payload.slice(i * PERF_CHUNK, (i + 1) * PERF_CHUNK));
  return chunks;
}

/**
 * Persiste el snapshot:
 *  1. Archivo `Documents/perf-snapshots/<gameId>-<startedAt>.json` (canal
 *     primario; un archivo por sesión → rescate con `adb pull`).
 *  2. Consola con prefijo `PERF_SNAPSHOT <gameId> <i>/<n> <chunk>`
 *     (canal secundario; re-ensamblar filtrando el prefijo y concatenando).
 * Errores no son críticos: la medición no depende del sink.
 */
export function persistNativeSnapshot(gameId: GameId, snapshotJson: string, startedAt: number): void {
  void (async () => {
    try {
      // require dinámico: en Jest no hay módulo nativo y el import estático
      // del entry fallaría; en el build nativo Metro lo resuelve igual.
      const { File, Paths, Directory } = require('expo-file-system');
      const dir = new Directory(Paths.document, 'perf-snapshots');
      dir.create({ idempotent: true, intermediates: true });
      const file = new File(Paths.document, 'perf-snapshots', `${gameId}-${startedAt}.json`);
      file.write(snapshotJson, { overwrite: true });
      console.log(`[perf][${gameId}] snapshot guardado en ${file.uri}`);
    } catch {
      // Sin módulo nativo (Jest) o error de FS: queda el fallback de consola.
    }
  })();
  const chunks = perfSnapshotChunks(snapshotJson);
  const n = chunks.length;
  chunks.forEach((chunk, i) => {
    console.log(`PERF_SNAPSHOT ${gameId} ${i + 1}/${n} ${chunk}`);
  });
}
