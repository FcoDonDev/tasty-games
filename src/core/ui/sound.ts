import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { useAppStore } from '@/core/stores/useAppStore';

// Assets: require() se resuelve a número de módulo Metro; wav es asset nativo.
type SoundId =
  | 'cardMove'
  | 'cardDrop'
  | 'cardInvalid'
  | 'gameWin'
  | 'pickup'
  | 'powerUp'
  | 'hit'
  | 'explosion';

const SOURCES: Record<SoundId, number> = {
  cardMove: require('./assets/audio/card-move.wav'),
  cardDrop: require('./assets/audio/card-drop.wav'),
  cardInvalid: require('./assets/audio/card-invalid.wav'),
  gameWin: require('./assets/audio/game-win.wav'),
  pickup: require('./assets/audio/pickup.wav'),
  powerUp: require('./assets/audio/power-up.wav'),
  hit: require('./assets/audio/hit.wav'),
  // reutiliza el asset del hit con playback rate grave (PLAN-WAK-POLISH F5):
  // player PROPIO, así el rate 0.7 no contamina a soundHit
  explosion: require('./assets/audio/hit.wav'),
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
  // Ruta primaria en web (PLAN-SAFARI-WEBKIT Fase 5): Web Audio con buffers
  // decodificados — latencia ~0 y plays imposibles de omitir (HTMLMediaElement
  // en WebKit-iOS suena desfasado y descarta plays encadenados). Si el buffer
  // aún no cargó o no hay AudioContext, cae a la ruta de elements.
  if (playWebAudio(id)) return;
  const player = ensurePlayer(id);
  if (!player) return;

  // seekTo + play fire-and-forget (patrón de los docs de expo-audio): encadenar
  // el play a la promesa de seekTo sumaba un round-trip nativo completo al
  // desfase del sonido (ver PLAN-PERFORMANCE.md, Fase 2).
  player.seekTo(0);
  player.play();
}

// === Ruta Web Audio (solo web) ===

const WEB_VOLUME = 0.5;

type AudioContextCtor = new () => AudioContext;

let webCtx: AudioContext | null = null;
let webLoadingStarted = false;
const webBuffers: Partial<Record<SoundId, AudioBuffer>> = {};

function getWebAudioContext(): AudioContext | null {
  if (Platform.OS !== 'web') return null;
  if (webCtx) return webCtx;
  const g = globalThis as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) return null;
  try {
    webCtx = new Ctor();
  } catch {
    webCtx = null;
  }
  return webCtx;
}

/**
 * Carga (fetch → decodeAudioData) de los buffers indicados, fire-and-forget:
 * el decode falla silencioso por sonido y ese sonido cae a la ruta de
 * elements. Se puede llamar pre-gesto (el contexto nace suspended; la carga
 * no depende de él) y es idempotente.
 */
function loadWebBuffers(ctx: AudioContext, ids: SoundId[]): void {
  ids.forEach((id) => {
    if (webBuffers[id]) return;
    try {
      const uri = Asset.fromModule(SOURCES[id]).uri;
      if (!uri) return;
      void fetch(uri)
        .then((res) => res.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buffer) => {
          webBuffers[id] = buffer;
        })
        .catch(() => {
          // buffer no disponible: ese sonido usa la ruta de elements
        });
    } catch {
      // Asset no resoluble: ese sonido usa la ruta de elements
    }
  });
}

/** Reproduce con BufferSource (rate 1 = pitch original). false si no hay ctx/buffer. */
function playWebAudio(id: SoundId, rate = 1): boolean {
  const buffer = webBuffers[id];
  if (!webCtx || !buffer) return false;
  // Contexto suspendido (desbloqueo aún no corrido): el BufferSource nacería
  // inaudible; intenta resume (fire-and-forget) y cae a la ruta de elements
  // para ese sonido — el siguiente play ya sale por Web Audio.
  if (webCtx.state === 'suspended') {
    try {
      void webCtx.resume().catch(() => {
        // resume sin gesto: solo elements disponibles para este play
      });
    } catch {
      // resume no soportado: fallback a elements
    }
    return false;
  }
  try {
    const source = webCtx.createBufferSource();
    source.buffer = buffer;
    if (rate !== 1) source.playbackRate.value = rate;
    const gain = webCtx.createGain();
    gain.gain.value = WEB_VOLUME;
    source.connect(gain);
    gain.connect(webCtx.destination);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Precalienta el módulo de audio y crea los players indicados (o todos) sin
 * reproducir: el primer play() de la sesión no paga la creación del player.
 * Llamar en idle (post-primer render de la pantalla del juego).
 */
export function primeAudioPlayers(ids?: SoundId[]): void {
  const target = ids ?? (Object.keys(SOURCES) as SoundId[]);
  target.forEach(ensurePlayer);
  // web: arranca la carga de buffers en idle (primeAudioPlayers corre
  // post-primer render, pre-gesto) — el decode está listo antes del primer
  // gesto, así el primer play ya sale por Web Audio sin esperar red.
  const ctx = getWebAudioContext();
  if (ctx) loadWebBuffers(ctx, target);
}

let webUnlocked = false;

/**
 * Desbloqueo de audio en web (PLAN-SAFARI-WEBKIT Fases 4-5). Dos capas:
 *
 * 1. Web Audio (ruta primaria): un solo AudioContext desbloqueado con
 *    resume() dentro del gesto habilita TODOS los buffers de la sesión —
 *    sin política por-elemento, sin latencia ni omisión en iOS WebKit.
 * 2. Elements (fallback): la política de WebKit otorga la reproducción POR
 *    ELEMENTO y rechaza intermitentemente los play() fuera del call-stack
 *    del gesto (NotAllowedError); reproducir cada elemento una vez (muteado)
 *    DENTRO del gesto lo habilita para toda la sesión.
 *
 * Llamar desde handlers de gesto reales (keydown, pan.onBegin); idempotente,
 * no-op en nativo.
 */
export function unlockAudioForWeb(): void {
  if (Platform.OS !== 'web' || webUnlocked) return;
  webUnlocked = true;
  const ctx = getWebAudioContext();
  if (ctx) {
    // resume() dentro del gesto: la llamada única que desbloquea la ruta
    // Web Audio; loading de buffers por si primeAudioPlayers no corrió.
    try {
      void ctx.resume().catch(() => {
        // resume fallido: la ruta de elements sigue disponible
      });
    } catch {
      // resume no soportado: fallback a elements
    }
    loadWebBuffers(ctx, Object.keys(SOURCES) as SoundId[]);
  }
  // capa 2: unlock por elemento para el fallback (ruta expo-audio)
  (Object.keys(SOURCES) as SoundId[]).forEach((id) => {
    const player = ensurePlayer(id);
    if (!player) return;
    try {
      const volume = player.volume;
      player.volume = 0;
      player.seekTo(0);
      player.play();
      player.volume = volume;
    } catch {
      // desbloqueo best-effort: si falla, los plays normales lo intentan
    }
  });
}

/**
 * Enganche del desbloqueo a nivel de app (web): el primer pointerdown o
 * keydown de la sesión corre unlockAudioForWeb dentro del call-stack del
 * gesto, cubriendo a TODOS los juegos sin que cada pantalla tenga que
 * llamarlo. Los listeners son once (y el unlock es idempotente), así que el
 * handler se desarma solo después del primer gesto real.
 */
export function installAudioUnlockForWeb(): void {
  if (Platform.OS !== 'web') return;
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.addEventListener) return;
  const handler = () => unlockAudioForWeb();
  try {
    doc.addEventListener('pointerdown', handler, { once: true });
    doc.addEventListener('keydown', handler, { once: true });
    doc.addEventListener('touchstart', handler, { once: true, passive: true });
  } catch {
    // entorno sin DOM real: el enganche por pantalla sigue disponible
  }
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
 * Explosión de la destrucción del robot (wakwak, PLAN-WAK-POLISH F5): el hit
 * con playback rate grave en un player propio (pitch abajo sin asset nuevo;
 * si no convence en playtest, sintetizar explosion.wav propio).
 */
export function soundExplosion(): void {
  if (!useAppStore.getState().soundOn) return;
  // hit con rate grave (PLAN-WAK-POLISH F5): pitch abajo sin asset nuevo
  if (playWebAudio('explosion', 0.7)) return;
  const player = ensurePlayer('explosion');
  if (!player) return;
  try {
    (player as unknown as { setPlaybackRate?: (rate: number) => void }).setPlaybackRate?.(0.7);
  } catch {
    // rate no soportado: pitch por defecto
  }
  player.seekTo(0);
  player.play();
}

/**
 * Blip del combo (wakwak): reutiliza el pickup con playback rate creciente —
 * el pitch sube con la cadena (1..8+) para que cada eslabón "suene" más alto.
 * Silencioso con el sonido apagado o si el rate no está soportado.
 */
export function soundCombo(chain: number): void {
  if (!useAppStore.getState().soundOn) return;
  const rate = Math.min(2, 1 + 0.12 * Math.max(0, Math.floor(chain) - 1));
  // pickup con rate creciente (pitch sube con la cadena, 1..8+)
  if (playWebAudio('pickup', rate)) return;
  const player = ensurePlayer('pickup');
  if (!player) return;
  try {
    (player as unknown as { setPlaybackRate?: (rate: number) => void }).setPlaybackRate?.(rate);
  } catch {
    // rate no soportado: pitch por defecto
  }
  player.seekTo(0);
  player.play();
}
