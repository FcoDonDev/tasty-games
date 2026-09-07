import { useAppStore } from '@/core/stores/useAppStore';

// Assets: require() se resuelve a número de módulo Metro; wav es asset nativo.
type SoundId = 'cardMove' | 'cardDrop' | 'cardInvalid' | 'gameWin';

const SOURCES: Record<SoundId, number> = {
  cardMove: require('./assets/audio/card-move.wav'),
  cardDrop: require('./assets/audio/card-drop.wav'),
  cardInvalid: require('./assets/audio/card-invalid.wav'),
  gameWin: require('./assets/audio/game-win.wav'),
};

// expo-audio hace monkey-patching de prototipos en su import (necesita el módulo
// nativo): se carga perezoso en el primer play, con fallback silencioso si el
// entorno no lo soporta (jest, cold start nativo aún sin binding).
type ExpoAudio = typeof import('expo-audio');
type Player = import('expo-audio').AudioPlayer;

let audioModule: ExpoAudio | null = null;
const players: Partial<Record<SoundId, Player>> = {};

function getAudioModule(): ExpoAudio | null {
  if (audioModule) return audioModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    audioModule = require('expo-audio') as ExpoAudio;
  } catch {
    audioModule = null;
  }
  return audioModule;
}

function play(id: SoundId): void {
  if (!useAppStore.getState().soundOn) return;
  const audio = getAudioModule();
  if (!audio) return;

  let player = players[id];
  if (!player) {
    try {
      player = audio.createAudioPlayer(SOURCES[id]);
      player.volume = 0.5;
      players[id] = player;
    } catch {
      return;
    }
  }
  void player.seekTo(0).then(() => player?.play());
}

/** Pluck corto al robar del stock. */
export function soundCardMove(): void {
  play('cardMove');
}

/** Snap suave al commit de un drop válido o auto-move. */
export function soundCardDrop(): void {
  play('cardDrop');
}

/** Thud grave al snap-back de un drop inválido. */
export function soundCardInvalid(): void {
  play('cardInvalid');
}

/** Arpegio breve al ganar la partida. */
export function soundGameWin(): void {
  play('gameWin');
}
