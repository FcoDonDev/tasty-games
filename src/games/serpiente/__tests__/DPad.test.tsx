import { fireEvent, render, screen } from '@testing-library/react-native';
import { DPad, DPAD_SIZES, type DPadSize } from '../components/DPad';
import type { Direction } from '../engine/grid';

describe('DPad serpiente (T3)', () => {
  const labels = [
    'serpiente-btn-arriba',
    'serpiente-btn-abajo',
    'serpiente-btn-izquierda',
    'serpiente-btn-derecha',
  ] as const;

  it('renderiza las 4 direcciones con labels estables', async () => {
    await render(<DPad size="M" pos="bajo" onDirection={() => {}} />);
    for (const label of labels) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
  });

  it('cada botón encola su dirección (setDirection vía onDirection)', async () => {
    const pressed: Direction[] = [];
    await render(<DPad size="M" pos="bajo" onDirection={(dir) => pressed.push(dir)} />);
    fireEvent.press(screen.getByLabelText('serpiente-btn-arriba'));
    fireEvent.press(screen.getByLabelText('serpiente-btn-abajo'));
    fireEvent.press(screen.getByLabelText('serpiente-btn-izquierda'));
    fireEvent.press(screen.getByLabelText('serpiente-btn-derecha'));
    expect(pressed).toEqual(['up', 'down', 'left', 'right']);
  });

  it('presets reducidos: celda ≥40px en todos (S=40, M=48, XL=56)', () => {
    expect(DPAD_SIZES).toEqual({ S: 40, M: 48, XL: 56 });
    const presets = Object.keys(DPAD_SIZES) as DPadSize[];
    for (const preset of presets) {
      expect(DPAD_SIZES[preset]).toBeGreaterThanOrEqual(40);
    }
  });
});
