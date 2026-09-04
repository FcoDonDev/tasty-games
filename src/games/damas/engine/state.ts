import { create } from 'zustand';
import { initialBoard, otherPlayer, parseSetupSeed, type Board, type Player, type SetupSeed } from './board';
import { applyMove, gameOutcome, legalMovesForPiece, moveKey, type Move } from './rules';

export interface DamasState {
  board: Board;
  /** jugador al que le toca mover (1 arranca) */
  turn: Player;
  moves: number;
  /** epoch ms del primer movimiento; null hasta empezar */
  startedAt: number | null;
  /** epoch ms al terminar la partida; null mientras se juega */
  finishedAt: number | null;
  /** ganador una vez terminada la partida */
  winner: Player | null;
  reset: (seed?: SetupSeed) => void;
  /** Valida y aplica el movimiento; devuelve false si es ilegal */
  applyMove: (move: Move) => boolean;
}

export const useDamasStore = create<DamasState>()((set, get) => ({
  board: initialBoard(),
  turn: 1,
  moves: 0,
  startedAt: null,
  finishedAt: null,
  winner: null,

  reset: (seed) =>
    set(() => ({
      board: initialBoard(seed),
      turn: 1,
      moves: 0,
      startedAt: null,
      finishedAt: null,
      winner: null,
    })),

  applyMove: (move) => {
    const state = get();
    if (state.finishedAt !== null) return false;

    const piece = state.board[move.from];
    if (!piece || piece.player !== state.turn) return false;

    // Validación canónica: el movimiento debe ser uno de los legales generados
    const key = moveKey(move);
    if (!legalMovesForPiece(state.board, move.from).some((m) => moveKey(m) === key)) {
      return false;
    }

    const board = applyMove(state.board, move);
    const nextTurn = otherPlayer(state.turn);
    const { over, winner } = gameOutcome(board, nextTurn);

    set(() => ({
      board,
      // si terminó, el turno queda en el ganador (solo informativo)
      turn: over ? state.turn : nextTurn,
      moves: state.moves + 1,
      startedAt: state.startedAt ?? Date.now(),
      finishedAt: over ? Date.now() : null,
      winner: over ? winner : null,
    }));
    return true;
  },
}));
