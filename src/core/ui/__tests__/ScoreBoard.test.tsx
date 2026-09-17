import { render, screen, act } from '@testing-library/react-native';
import { ScoreBoard } from '@/core/ui/ScoreBoard';
import type { GameResult } from '@/core/types';

jest.mock('@/core/db/repositories/recordsRepository', () => ({
  recordsRepository: {
    bestFor: jest.fn(),
  },
}));

import { recordsRepository } from '@/core/db/repositories/recordsRepository';

const bestForMock = jest.mocked(recordsRepository.bestFor);

function result(score: number): GameResult {
  return {
    gameId: 'robo-jump',
    won: false,
    score,
    durationMs: 1000,
    finishedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('ScoreBoard', () => {
  it('muestra el mejor score con récord won:false (endless)', async () => {
    bestForMock.mockResolvedValue(result(47));
    await render(<ScoreBoard gameId="robo-jump" compact />);
    expect(await screen.findByText('47 pts')).toBeOnTheScreen();
    expect(screen.getByLabelText('record-robo-jump')).toBeOnTheScreen();
  });

  it('refreshKey: re-consulta el récord cuando cambia', async () => {
    bestForMock.mockResolvedValue(null);
    const { rerender } = await render(<ScoreBoard gameId="robo-jump" compact />);
    expect(await screen.findByText('—')).toBeOnTheScreen();
    const callsAfterMount = bestForMock.mock.calls.length;

    bestForMock.mockResolvedValue(result(47));
    await act(async () => {
      await rerender(<ScoreBoard gameId="robo-jump" compact refreshKey={1} />);
    });
    expect(await screen.findByText('47 pts')).toBeOnTheScreen();
    expect(bestForMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });

  it('sin partidas: muestra el placeholder', async () => {
    bestForMock.mockResolvedValue(null);
    await render(<ScoreBoard gameId="memorice" />);
    expect(await screen.findByText('Sin partidas')).toBeOnTheScreen();
  });
});
