import { fireEvent, render, screen } from '@testing-library/react-native';
import { DifficultyModal } from '@/core/ui/DifficultyModal';

describe('DifficultyModal', () => {
  const options = [
    { value: 'facil', label: 'Fácil', hint: 'Movimientos más lentos' },
    { value: 'normal', label: 'Normal' },
  ];

  it('renderiza el overlay y las opciones con labels E2E estables', async () => {
    await render(
      <DifficultyModal gameId="serpiente" visible options={options} onChoose={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.getByLabelText('modal-dificultad-home')).toBeOnTheScreen();
    expect(screen.getByLabelText('elegir-dificultad-home-facil')).toBeOnTheScreen();
    expect(screen.getByLabelText('elegir-dificultad-home-normal')).toBeOnTheScreen();
    expect(screen.getByText('Fácil')).toBeOnTheScreen();
    expect(screen.getByText('Movimientos más lentos')).toBeOnTheScreen();
    expect(screen.queryByText('Normal')) .toBeTruthy();
    // la opción sin hint no renderiza hint vacío
    expect(screen.queryByText('undefined')).toBeNull();
  });

  it('onChoose entrega el value de la opción tocada', async () => {
    const onChoose = jest.fn();
    await render(
      <DifficultyModal gameId="serpiente" visible options={options} onChoose={onChoose} onDismiss={() => {}} />,
    );
    fireEvent.press(screen.getByLabelText('elegir-dificultad-home-facil'));
    expect(onChoose).toHaveBeenCalledWith('facil');
  });

  it('el botón de descarte dispara onDismiss con el gameId en el label', async () => {
    const onDismiss = jest.fn();
    await render(
      <DifficultyModal gameId="wakwak" visible options={options} onChoose={() => {}} onDismiss={onDismiss} />,
    );
    fireEvent.press(screen.getByLabelText('cerrar-dificultad-home-wakwak'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('visible=false no renderiza nada', async () => {
    await render(
      <DifficultyModal gameId="serpiente" visible={false} options={options} onChoose={() => {}} onDismiss={() => {}} />,
    );
    expect(screen.queryByLabelText('modal-dificultad-home')).toBeNull();
  });
});
