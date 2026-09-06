import { Easing, FadeIn, FadeOut } from 'react-native-reanimated';

const buildEnter = () => FadeIn.duration(220).easing(Easing.bezier(0.23, 1, 0.32, 1));
const buildExit = () => FadeOut.duration(150);

let enter: ReturnType<typeof buildEnter> | undefined;
let exit: ReturnType<typeof buildExit> | undefined;

/**
 * Builders de overlay compartidos, creados perezosamente y memoizados.
 * Opacity-only: cumplen reduced motion por diseño (es exactamente lo que
 * reduced motion conserva). Salida ~30% más rápida que la entrada
 * (receta: la llegada merece el tiempo, la salida no).
 * Perezoso porque FadeIn/FadeOut no existen al importar módulos en jest.
 */
export function overlayEnter(): ReturnType<typeof buildEnter> {
  enter ??= buildEnter();
  return enter;
}

export function overlayExit(): ReturnType<typeof buildExit> {
  exit ??= buildExit();
  return exit;
}
