import { render, screen } from '@testing-library/react-native';
import { GameCard } from '@/core/ui/GameCard';
import type { GameDefinition } from '@/core/types';

jest.mock('@/core/db/repositories/recordsRepository', () => ({
  recordsRepository: {
    bestFor: jest.fn().mockResolvedValue(null),
  },
}));

function makeGame(overrides: Partial<GameDefinition> = {}): GameDefinition {
  return {
    id: 'memorice',
    name: 'Memorice',
    description: 'Encuentra los pares.',
    Component: () => null,
    ...overrides,
  };
}

describe('GameCard', () => {
  it('muestra el icono del juego cuando está definido', async () => {
    await render(<GameCard game={makeGame({ icon: '🧠' })} onPress={() => {}} />);
    expect(screen.getByText('🧠')).toBeOnTheScreen();
  });

  it('usa la inicial del nombre como fallback cuando no hay icono', async () => {
    await render(<GameCard game={makeGame()} onPress={() => {}} />);
    expect(screen.getByText('M')).toBeOnTheScreen();
  });

  it('conserva el accessibilityLabel estable para E2E', async () => {
    await render(<GameCard game={makeGame({ icon: '🧠' })} onPress={() => {}} />);
    expect(screen.getByLabelText('Jugar Memorice')).toBeOnTheScreen();
  });
});
