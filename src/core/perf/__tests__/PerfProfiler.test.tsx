import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PerfProfiler } from '../PerfProfiler';
import { beginPerfSession, endPerfSession, readPerfMetrics, setPerfEnabledForTests, setPerfStorageForTests } from '../index';

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const GAME = 'profiler-test';

beforeAll(() => {
  setPerfStorageForTests({
    getItem: () => null,
    setItem: () => undefined,
  });
});

afterEach(() => {
  setPerfEnabledForTests(false);
});

afterAll(() => {
  setPerfStorageForTests(null);
  logSpy.mockRestore();
});

describe('PerfProfiler', () => {
  it('con el gate apagado no monta el Profiler (children directos)', async () => {
    await render(
      <PerfProfiler gameId={GAME} id="board">
        <Text testID="child">contenido</Text>
      </PerfProfiler>,
    );
    expect(screen.getByTestId('child')).toBeOnTheScreen();
  });

  it('con el gate encendido reporta la duración de render vía perfRenderReport', async () => {
    setPerfEnabledForTests(true);
    beginPerfSession(GAME);
    await render(
      <PerfProfiler gameId={GAME} id="board">
        <Text testID="child">contenido</Text>
      </PerfProfiler>,
    );
    expect(screen.getByTestId('child')).toBeOnTheScreen();
    // El montaje dispara al menos un onRender con duración ≥ 0
    endPerfSession(GAME);
    const snapshot = readPerfMetrics(GAME);
    expect(snapshot?.timers['render.board']).toBeDefined();
    expect(snapshot?.timers['render.board'].count).toBeGreaterThanOrEqual(1);
  });
});
