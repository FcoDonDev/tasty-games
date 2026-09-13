import { perfSnapshotChunks, persistNativeSnapshot } from '../snapshotSink';

describe('snapshotSink (nativo)', () => {
  describe('perfSnapshotChunks', () => {
    it('payload corto → un único chunk re-ensamblable', () => {
      const payload = '{"schemaVersion":1}';
      expect(perfSnapshotChunks(payload)).toEqual([payload]);
    });

    it('payload largo → chunks de 3500 que concatenados reproducen el original', () => {
      const payload = 'x'.repeat(8200);
      const chunks = perfSnapshotChunks(payload);
      expect(chunks.length).toBe(3);
      for (const c of chunks) expect(c.length).toBeLessThanOrEqual(3500);
      expect(chunks.join('')).toBe(payload);
    });

    it('payload de límite exacto (3500) → un solo chunk', () => {
      expect(perfSnapshotChunks('a'.repeat(3500))).toHaveLength(1);
      expect(perfSnapshotChunks('a'.repeat(3501))).toHaveLength(2);
    });
  });

  describe('persistNativeSnapshot (fallback de consola)', () => {
    it('emite PERF_SNAPSHOT re-ensamblable con prefijo estable', () => {
      const logs: string[] = [];
      const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
        logs.push(args.join(' '));
      });
      const payload = JSON.stringify({ schemaVersion: 1, timers: {}, counters: {} });
      persistNativeSnapshot('solitario', payload, 123);
      expect(logs.some((l) => l.startsWith('[perf][solitario]'))).toBe(true);
      const snapshotLines = logs.filter((l) => l.startsWith('PERF_SNAPSHOT solitario '));
      expect(snapshotLines).toHaveLength(1);
      // formato: PERF_SNAPSHOT <gameId> <i>/<n> <chunk>
      expect(snapshotLines[0]).toBe(`PERF_SNAPSHOT solitario 1/1 ${payload}`);
      spy.mockRestore();
    });

    it('payload > 3500 → chunks numerados que concatenados reproducen el JSON', () => {
      const logs: string[] = [];
      const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
        logs.push(args.join(' '));
      });
      const payload = JSON.stringify({ data: 'y'.repeat(8000) });
      persistNativeSnapshot('damas', payload, 456);
      const snapshotLines = logs.filter((l) => l.startsWith('PERF_SNAPSHOT damas '));
      expect(snapshotLines.length).toBeGreaterThan(1);
      const reassembled = snapshotLines
        .map((l) => l.replace(/^PERF_SNAPSHOT damas \d+\/\d+ /, ''))
        .join('');
      expect(reassembled).toBe(payload);
      expect(snapshotLines[0]).toMatch(/PERF_SNAPSHOT damas 1\/\d+ /);
      expect(snapshotLines.at(-1)).toMatch(new RegExp(`PERF_SNAPSHOT damas ${snapshotLines.length}/${snapshotLines.length} `));
      spy.mockRestore();
    });
  });
});
