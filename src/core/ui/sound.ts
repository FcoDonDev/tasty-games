import { useAppStore } from '@/core/stores/useAppStore';

// Assets: require() se resuelve a número de módulo Metro; wav es asset nativo.
type SoundId = 'cardMove' | 'cardDrop' | 'cardInvalid' | 'gameWin' | 'pickup' | 'powerUp' | 'hit';

const SOURCES: Record<SoundId, number> = {
  cardMove: require('./assets/audio/card-move.wav'),
  cardDrop: require('./assets/audio/card-drop.wav'),
  cardInvalid: require('./assets/audio/card-invalid.wav'),
  gameWin: require('./assets/audio/game-win.wav'),
  pickup: require('./assets/audio/pickup.wav'),
  powerUp: require('./assets/audio/power-up.wav'),
  hit: require('./assets/audio/hit.wav'),
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

function ensurePlayer(id: SoundId): Player | null {
  const audio = getAudioModule();
  if (!audio) return null;

  let player = players[id];
  if (!player) {
    try {
      player = audio.createAudioPlayer(SOURCES[id]);
      player.volume = 0.5;
      players[id] = player;
    } catch {
      return null;
    }
  }
  return player;
}

function play(id: SoundId): void {
  if (!useAppStore.getState().soundOn) return;
  const player = ensurePlayer(id);
  if (!player) return;

  // seekTo + play fire-and-forget (patrón de los docs de expo-audio): encadenar
  // el play a la promesa de seekTo sumaba un round-trip nativo completo al
  // desfase del sonido (ver PLAN-PERFORMANCE.md, Fase 2).
  player.seekTo(0);
  player.play();
}

/**
 * Precalienta el módulo de audio y crea los players indicados (o todos) sin
 * reproducir: el primer play() de la sesión no paga la creación del player.
 * Llamar en idle (post-primer render de la pantalla del juego).
 */
export function primeAudioPlayers(ids?: SoundId[]): void {
  if (ids) {
    ids.forEach(ensurePlayer);
    return;
  }
  (Object.keys(SOURCES) as SoundId[]).forEach(ensurePlayer);
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

/** Blip corto al recoger una batería (wakwak). */
export function soundPickup(): void {
  play('pickup');
}

/** Barrido ascendente al activar la súper carga (wakwak). */
export function soundPowerUp(): void {
  play('powerUp');
}

/** Golpe grave: robot atrapado o drone recogido (wakwak). */
export function soundHit(): void {
  play('hit');
}

/**
 * Blip del combo (wakwak): reutiliza el pickup con playback rate creciente —
 * el pitch sube con la cadena (1..8+) para que cada eslabón "suene" más alto.
 * Silencioso con el sonido apagado o si el rate no está soportado.
 */
export function soundCombo(chain: number): void {
  if (!useAppStore.getState().soundOn) return;
  const player = ensurePlayer('pickup');
  if (!player) return;
  try {
    const rate = Math.min(2, 1 + 0.12 * Math.max(0, Math.floor(chain) - 1));
    (player as unknown as { setPlaybackRate?: (rate: number) => void }).setPlaybackRate?.(rate);
  } catch {
    // rate no soportado: pitch por defecto
  }
  player.seekTo(0);
  player.play();
}
