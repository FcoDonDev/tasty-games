jest.mock('expo-audio', () => {
  const created: Array<{ source: unknown; volume: number; played: number }> = [];
  const createAudioPlayer = jest.fn((source: unknown) => {
    const player = {
      source,
      volume: 1,
      played: 0,
      seekTo: jest.fn(),
      play: jest.fn(function (this: { played: number }) {
        this.played += 1;
      }),
    };
    created.push(player);
    return player;
  });
  return { createAudioPlayer, __created: created };
});

jest.mock('@/core/stores/useAppStore', () => ({
  useAppStore: { getState: () => ({ soundOn: true }) },
}));

type SoundModule = typeof import('../sound');
type AudioMock = {
  createAudioPlayer: jest.Mock;
  __created: Array<{ source: unknown; played: number }>;
};

/**
 * Carga una instancia fresca de sound.ts por test: el map de players vive en el
 * módulo, y resetModules + requireMock devuelve también un mock de expo-audio
 * nuevo (el require de expo-audio es perezoso dentro de sound.ts).
 */
function loadFresh(): { sound: SoundModule; audio: AudioMock } {
  jest.resetModules();
  return {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sound: require('../sound') as SoundModule,
    audio: jest.requireMock('expo-audio') as AudioMock,
  };
}

describe('sound', () => {
  it('crea el player perezosamente al primer play y no lo recrea', () => {
    const { sound, audio } = loadFresh();
    sound.soundCardDrop();
    sound.soundCardDrop();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.__created[0].played).toBe(2);
  });

  it('primeAudioPlayers(ids) crea solo el subset pedido sin reproducir', () => {
    const { sound, audio } = loadFresh();
    sound.primeAudioPlayers(['cardMove', 'gameWin']);
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(2);
    expect(audio.__created.every((p) => p.played === 0)).toBe(true);
    // El play posterior reutiliza el player primado
    sound.soundGameWin();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(2);
    expect(audio.__created[1].played).toBe(1);
  });

  it('primeAudioPlayers() es idempotente (crea los 7 sonidos definidos)', () => {
    const { sound, audio } = loadFresh();
    sound.primeAudioPlayers();
    sound.primeAudioPlayers();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(7);
    sound.soundCardInvalid();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(7);
  });

  it('play fire-and-forget: play() corre síncronamente tras seekTo (sin .then)', () => {
    const { sound, audio } = loadFresh();
    sound.soundCardDrop();
    expect(audio.__created[0].played).toBe(1);
  });
});
