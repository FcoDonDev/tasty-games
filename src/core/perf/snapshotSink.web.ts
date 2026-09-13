/**
 * Sink de snapshots web (no-op): en web el snapshot persiste en localStorage
 * vía persistSnapshot (src/core/perf/index.ts) — no hay canal de archivo.
 * Par dual con snapshotSink.ts (nativo). Ver AGENTS.md (persistencia dual).
 */

type GameId = string;

export function persistNativeSnapshot(_gameId: GameId, _snapshotJson: string, _startedAt: number): void {
  // no-op: web usa localStorage; este módulo existe para que Metro resuelva
  // el par dual sin bundlear expo-file-system en web.
}
