import { render, screen } from '@testing-library/react-native';
import { arcAngles, Board } from '../components/Board';
import { SPECIAL_TTL_MS } from '../engine/rules';
import { toIndex } from '../engine/grid';
import { useSerpienteStore } from '../engine/state';

beforeEach(() => {
  useSerpienteStore.getState().setWrap(true);
  useSerpienteStore.getState().startRun('test-crecer');
});

describe('arcAngles (D18: arco de depletion del especial)', () => {
  it('lleno = círculo completo (mitades en su rotación "llena")', () => {
    expect(arcAngles(SPECIAL_TTL_MS)).toEqual({ right: 45, left: -45 });
  });

  it('medio = solo la mitad derecha; vacío = nada visible', () => {
    expect(arcAngles(SPECIAL_TTL_MS / 2)).toEqual({ right: 45, left: -225 });
    expect(arcAngles(0)).toEqual({ right: 225, left: -225 });
  });

  it('cuartos y clamp (ttl fuera de rango)', () => {
    expect(arcAngles(SPECIAL_TTL_MS / 4)).toEqual({ right: 135, left: -225 });
    expect(arcAngles(SPECIAL_TTL_MS * 0.75)).toEqual({ right: 45, left: -135 });
    // clamp: ttl mayor al total = lleno; negativo = vacío
    expect(arcAngles(999999)).toEqual({ right: 45, left: -45 });
    expect(arcAngles(-5)).toEqual({ right: 225, left: -225 });
  });
});

describe('Board serpiente (T3, §9.2)', () => {
  it('renderiza serpiente (3 segmentos + cabeza), comida y labels', async () => {
    await render(<Board cellSize={10} />);
    expect(screen.getByLabelText('tablero-serpiente')).toBeOnTheScreen();
    expect(screen.getByLabelText('serpiente-cabeza')).toBeOnTheScreen();
    // D4: los segmentos viven en testID (a11y solo cabeza/comida/tablero).
    expect(screen.getByTestId(`serpiente-seg-${toIndex(10, 10)}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`serpiente-seg-${toIndex(10, 9)}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`serpiente-seg-${toIndex(10, 8)}`)).toBeOnTheScreen();
    expect(screen.getByLabelText('serpiente-comida')).toBeOnTheScreen();
  });

  it('tras un tick sin comer la cabeza avanza y la cola se libera (identidad por celda)', async () => {
    // La comida de test-crecer está justo delante: se aparta para mover sin comer.
    const game = useSerpienteStore.getState().game;
    useSerpienteStore.setState({ game: { ...game, food: toIndex(0, 0) } });
    const view = await render(<Board cellSize={10} />);
    useSerpienteStore.getState().tick(140);
    await view.rerender(<Board cellSize={10} />);
    // Nueva cabeza en (10,11); la vieja cola (10,8) desapareció.
    expect(screen.getByTestId(`serpiente-seg-${toIndex(10, 11)}`)).toBeOnTheScreen();
    expect(screen.queryByTestId(`serpiente-seg-${toIndex(10, 8)}`)).toBeNull();
    // El cuerpo conserva sus celdas.
    expect(screen.getByTestId(`serpiente-seg-${toIndex(10, 10)}`)).toBeOnTheScreen();
    expect(screen.getByTestId(`serpiente-seg-${toIndex(10, 9)}`)).toBeOnTheScreen();
  });

  it('sin especial no hay ring; con 5 comidas aparece', async () => {
    const view = await render(<Board cellSize={10} />);
    expect(screen.queryByLabelText('serpiente-especial')).toBeNull();
    // Come 5 veces poniendo la comida adelante (test-crecer ya comió 1 al tickar).
    for (let i = 0; i < 5; i++) {
      const game = useSerpienteStore.getState().game;
      useSerpienteStore.setState({ game: { ...game, food: game.snake[0] + 1 } });
      useSerpienteStore.getState().tick(140);
    }
    await view.rerender(<Board cellSize={10} />);
    expect(screen.getByLabelText('serpiente-especial')).toBeOnTheScreen();
  });

  it('peligro solo con wrap=false y muro a ≤2 celdas', async () => {
    // test-crecer va a la derecha en fila 10 con wrap=true: sin peligro.
    const view = await render(<Board cellSize={10} />);
    expect(screen.queryByLabelText('serpiente-peligro')).toBeNull();
    // Muro cerca sin wrap: cabeza en (0,5) subiendo.
    useSerpienteStore.getState().setWrap(false);
    useSerpienteStore.setState({
      game: {
        ...useSerpienteStore.getState().game,
        wrap: false,
        snake: [toIndex(1, 5), toIndex(2, 5), toIndex(3, 5)],
        dir: 'up',
        queued: [],
      },
    });
    await view.rerender(<Board cellSize={10} />);
    expect(screen.getByLabelText('serpiente-peligro')).toBeOnTheScreen();
  });
});
