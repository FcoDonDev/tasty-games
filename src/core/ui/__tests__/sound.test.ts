

// Mock de expo-audio (require perezoso dentro de sound.ts) y de Platform.
const mockPlayers: Map<string, Record<string, unknown>> = new Map();
const mockPlayCalls: string[] = [];

jest.mock('expo-audio', () => ({
  createAudioPlayer: (source: number) => {
    const player = {
      source,
      volume: 1,
      played: 0,
      paused: true,
      seekedTo: 0,
      play() {
        this.played++;
        this.paused = false;
        mockPlayCalls.push(String(this.source));
      },
      pause() {
        this.paused = true;
      },
      seekTo(seconds: number) {
        this.seekedTo = seconds;
      },
    };
    mockPlayers.set(String(source), player);
    return player;
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: { web?: unknown; default?: unknown }) => o.web ?? o.default },
}));

jest.mock('@/core/stores/useAppStore', () => ({
  useAppStore: { getState: () => ({ soundOn: true }) },
}));

describe('unlockAudioForWeb', () => {
  let unlockAudioForWeb: () => void;

  beforeEach(() => {
    // módulo fresco por test: el flag `webUnlocked` es estado de módulo
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    unlockAudioForWeb = require('../sound').unlockAudioForWeb;
    mockPlayers.clear();
    mockPlayCalls.length = 0;
  });

  it('reproduce y pausa cada player muteado dentro del gesto (desbloqueo por elemento)', () => {
    unlockAudioForWeb();
    // 8 sonidos del registro; cada uno play()+pause() con volumen 0
    expect(mockPlayCalls.length).toBe(8);
    for (const player of mockPlayers.values()) {
      expect(player['played']).toBe(1);
      
      expect(player['volume']).toBe(0.5); // restaura el volumen de ensurePlayer
      expect(player['seekedTo']).toBe(0);
    }
  });

  it('es idempotente: una segunda llamada no vuelve a reproducir', () => {
    unlockAudioForWeb();
    unlockAudioForWeb();
    expect(mockPlayCalls.length).toBe(8);
  });
});
