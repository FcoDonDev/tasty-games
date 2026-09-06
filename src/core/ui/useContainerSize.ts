import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

export interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Mide el contenedor real vía onLayout (fuente única para computeLayout de
 * cada juego). Reemplaza la adivinanza `window - CHROME_HEIGHT`: el layout
 * derivado llena exactamente el área disponible, sin scroll ni sobrantes.
 * `size` es null hasta el primer layout (render el tablero una sola vez).
 */
export function useContainerSize(): {
  size: ContainerSize | null;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const [size, setSize] = useState<ContainerSize | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((prev) =>
      prev !== null && prev.width === width && prev.height === height ? prev : { width, height },
    );
  }, []);

  return { size, onLayout };
}
