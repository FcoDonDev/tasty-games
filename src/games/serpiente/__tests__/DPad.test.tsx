import { fireEvent, render, screen } from '@testing-library/react-native';
import { DPad, DPAD_GAP, DPAD_SIZES, type DPadSize } from '../components/DPad';
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

  it('targets ≥48dp en todos los presets y separación ≥8dp', () => {
    const presets = Object.keys(DPAD_SIZES) as DPadSize[];
    for (const preset of presets) {
      expect(DPAD_SIZES[preset]).toBeGreaterThanOrEqual(48);
    }
    expect(DPAD_GAP).toBeGreaterThanOrEqual(8);
  });
});
