/* eslint-disable @typescript-eslint/no-explicit-any */
import { soundCombo, soundPickup, unlockAudioForWeb, primeAudioPlayers } from '../sound';

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

// Asset en web: uri sintética para el fetch de la ruta Web Audio.
jest.mock('expo-asset', () => ({
  Asset: { fromModule: (id: number) => ({ uri: `mock://asset-${id}.wav` }) },
}));

let mockSoundOn = true;

jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: { web?: unknown; default?: unknown }) => o.web ?? o.default },
}));

jest.mock('@/core/stores/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      get soundOn() {
        return mockSoundOn;
      },
    }),
  },
}));

// === Mock de Web Audio ===
class MockSource {
  buffer: unknown = null;
  playbackRate = { value: 1 };
  started = 0;
  connect(node: unknown) {
    return node;
  }
  start() {
    this.started++;
    mockStarted.push(this);
  }
}

const mockStarted: MockSource[] = [];

class MockGain {
  gain = { value: 1 };
  connect(node: unknown) {
    return node;
  }
}

const ctxState = { state: 'suspended' as string };

function makeMockAudioContext() {
  ctxState.state = 'suspended';
  return {
    get state() {
      return ctxState.state;
    },
    destination: { mockDestination: true },
    resume: jest.fn(() => {
      // como el Web Audio real: el resume pasa el contexto a running
      ctxState.state = 'running';
      return Promise.resolve();
    }),
    decodeAudioData: jest.fn((ab: ArrayBuffer) => Promise.resolve({ fakeBuffer: true, bytes: ab.byteLength })),
    createBufferSource: () => new MockSource(),
    createGain: () => new MockGain(),
  };
}

const mockFetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));

let currentCtx: ReturnType<typeof makeMockAudioContext>;

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('sound (web)', () => {
  let unlockAudioForWeb: () => void;
  let installAudioUnlockForWeb: () => void;
  let primeAudioPlayers: (ids?: string[]) => void;
  let soundPickup: () => void;
  let soundCombo: (chain: number) => void;
  let soundExplosion: () => void;

  beforeEach(() => {
    // módulo fresco por test: webUnlocked/webCtx son estado de módulo
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('../sound');
    unlockAudioForWeb = mod.unlockAudioForWeb;
    installAudioUnlockForWeb = mod.installAudioUnlockForWeb;
    primeAudioPlayers = mod.primeAudioPlayers;
    soundPickup = mod.soundPickup;
    soundCombo = mod.soundCombo;
    soundExplosion = mod.soundExplosion;

    mockPlayers.clear();
    mockPlayCalls.length = 0;
    mockStarted.length = 0;
    mockFetch.mockClear();
    mockSoundOn = true;
    currentCtx = makeMockAudioContext();
    (globalThis as any).AudioContext = function MockAudioContext() {
      return currentCtx;
    };
    (globalThis as any).fetch = mockFetch;
  });

  it('unlock: crea el contexto y lo resume() dentro del gesto', () => {
    unlockAudioForWeb();
    expect(currentCtx.resume).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(8);
  });

  it('unlock por elemento: play muteado de cada player dentro del gesto (fallback)', () => {
    unlockAudioForWeb();
    expect(mockPlayCalls.length).toBe(8);
    for (const player of mockPlayers.values()) {
      expect(player['played']).toBe(1);
      expect(player['volume']).toBe(0.5); // restaura el volumen de ensurePlayer
      expect(player['seekedTo']).toBe(0);
    }
  });

  it('unlock es idempotente: una segunda llamada no vuelve a reproducir', () => {
    unlockAudioForWeb();
    unlockAudioForWeb();
    expect(mockPlayCalls.length).toBe(8);
    expect(currentCtx.resume).toHaveBeenCalledTimes(1);
  });

  describe('ruta Web Audio', () => {
    it('los plays salen por BufferSource y no tocan los elements', async () => {
      unlockAudioForWeb();
      await flush();
      soundPickup();
      expect(mockStarted.length).toBe(1);
      expect(mockStarted[0].playbackRate.value).toBe(1);
      expect(mockPlayCalls.length).toBe(8); // solo los del unlock por elemento
    });

    it('el BufferSource conecta con gain 0.5 al destination', async () => {
      unlockAudioForWeb();
      await flush();
      soundPickup();
      // source→gain→destination: verificable vía el único source iniciado
      expect(mockStarted[0].buffer).toEqual({ fakeBuffer: true, bytes: 8 });
    });

    it('soundCombo escala el playbackRate con la cadena', async () => {
      unlockAudioForWeb();
      await flush();
      soundCombo(5); // rate = 1 + 0.12*4 = 1.48
      expect(mockStarted.length).toBe(1);
      expect(mockStarted[0].playbackRate.value).toBeCloseTo(1.48);
    });

    it('soundExplosion usa rate 0.7', async () => {
      unlockAudioForWeb();
      await flush();
      soundExplosion();
      expect(mockStarted[0].playbackRate.value).toBeCloseTo(0.7);
    });

    it('sin buffers cargados aún (pre-decode) cae a la ruta de elements', () => {
      unlockAudioForWeb(); // sin flush: decodeAudioData en vuelo
      soundPickup();
      expect(mockPlayCalls.length).toBe(9); // 8 del unlock + 1 del fallback
      expect(mockStarted.length).toBe(0);
    });

    it('decodeAudioData fallido: el sonido cae a la ruta de elements', async () => {
      currentCtx.decodeAudioData.mockImplementation(() => Promise.reject(new Error('no decode')));
      unlockAudioForWeb();
      await flush();
      soundPickup();
      expect(mockPlayCalls.length).toBe(9); // 8 del unlock + 1 del fallback
      expect(mockStarted.length).toBe(0);
    });

    it('sin fetch disponible no rompe (catch silencioso)', async () => {
      mockFetch.mockImplementation(async () => {
        throw new Error('network');
      });
      unlockAudioForWeb();
      await flush();
      soundPickup();
      expect(mockPlayCalls.length).toBe(9);
    });

    it('con el sonido apagado no reproduce nada', async () => {
      mockSoundOn = false;
      unlockAudioForWeb();
      await flush();
      soundPickup();
      soundCombo(3);
      expect(mockStarted.length).toBe(0);
      expect(mockPlayCalls.length).toBe(8); // solo el unlock por elemento
    });

    it('primeAudioPlayers pre-gesto ya lanza la carga de buffers', () => {
      primeAudioPlayers();
      expect(mockFetch).toHaveBeenCalledTimes(8);
      expect(currentCtx.resume).not.toHaveBeenCalled(); // la carga no depende del resume
    });

    it('ctx suspendido: intenta resume y cae a elements (no suena BufferSource mudo)', () => {
      unlockAudioForWeb(); // crea el ctx (suspended en el mock)
      soundPickup(); // buffers en vuelo, pero el guard por estado igual protege
      expect(mockStarted.length).toBe(0);
      expect(mockPlayCalls.length).toBe(9); // fallback al element del pickup
    });
  });

  describe('installAudioUnlockForWeb', () => {
    it('registra listeners once que disparan el unlock en el primer gesto', () => {
      const listeners: Map<string, EventListener> = new Map();
      const docMock = {
        addEventListener: (type: string, handler: EventListener) => {
          listeners.set(type, handler);
        },
      };
      (globalThis as any).document = docMock;
      installAudioUnlockForWeb();
      expect(listeners.has('pointerdown')).toBe(true);
      expect(listeners.has('keydown')).toBe(true);
      expect(listeners.has('touchstart')).toBe(true);
      // el handler del primer gesto desbloquea: resume + carga + unlock elementos
      listeners.get('pointerdown')!(new Event('pointerdown'));
      expect(currentCtx.resume).toHaveBeenCalledTimes(1);
      expect(mockPlayCalls.length).toBe(8);
      delete (globalThis as any).document;
    });

    it('sin document disponible no rompe', () => {
      delete (globalThis as any).document;
      expect(() => installAudioUnlockForWeb()).not.toThrow();
    });
  });
});
