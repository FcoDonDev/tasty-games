import { render, screen } from '@testing-library/react-native';
import { MazeLayer } from '../renderer/reanimated/MazeLayer';

describe('MazeLayer EdibleDot (I-WW-1)', () => {
  it('renderiza un dot por comestible (batería, súper y bonus)', async () => {
    await render(<MazeLayer cellSize={10} batteries={[0, 1]} supers={[2]} bonusActive />);
    expect(screen.getByTestId('wakwak-dot-0')).toBeOnTheScreen();
    expect(screen.getByTestId('wakwak-dot-1')).toBeOnTheScreen();
    expect(screen.getByTestId('wakwak-dot-2')).toBeOnTheScreen();
    expect(screen.getByTestId('wakwak-bonus')).toBeOnTheScreen();
  });

  it('al recoger solo desaparece el dot comido (el resto conserva identidad)', async () => {
    const view = await render(<MazeLayer cellSize={10} batteries={[0, 1]} supers={[]} bonusActive={false} />);
    expect(screen.getByTestId('wakwak-dot-0')).toBeOnTheScreen();
    await view.rerender(<MazeLayer cellSize={10} batteries={[1]} supers={[]} bonusActive={false} />);
    expect(screen.queryByTestId('wakwak-dot-0')).toBeNull();
    expect(screen.getByTestId('wakwak-dot-1')).toBeOnTheScreen();
  });

  it('sin cambios de props no re-renderiza (memo del MazeLayer)', async () => {
    const view = await render(<MazeLayer cellSize={10} batteries={[0]} supers={[]} bonusActive={false} />);
    await view.rerender(<MazeLayer cellSize={10} batteries={[0]} supers={[]} bonusActive={false} />);
    expect(screen.getByTestId('wakwak-dot-0')).toBeOnTheScreen();
  });
});
