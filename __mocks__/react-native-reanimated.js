// Mock de react-native-reanimated para Jest (SDK 57 / Reanimated 4).
// El mock oficial (`react-native-reanimated/mock`) importa el índice real,
// que inicializa react-native-worklets nativo y falla en Node.
const React = require('react');
const RN = require('react-native');

const NOOP = () => {};
const identity = (value) => value;

const animatedComponent = (Component) =>
  React.forwardRef(function AnimatedComponent(props, ref) {
    const { style, ...rest } = props;
    return React.createElement(Component, { ...rest, ref, style });
  });

const Animated = {
  View: animatedComponent(RN.View),
  Text: animatedComponent(RN.Text),
  ScrollView: animatedComponent(RN.ScrollView),
  Image: animatedComponent(RN.Image),
  createAnimatedComponent: animatedComponent,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue: (initial) => {
    // Estable por componente (semántica real); el frame inicial basta en Jest.
    const [sv] = React.useState(() => ({ value: initial }));
    return sv;
  },
  useDerivedValue: (compute) => ({ value: compute() }),
  useAnimatedStyle: (compute) => compute(),
  useAnimatedReaction: NOOP,
  useAnimatedScrollHandler: () => ({}),
  useAnimatedGestureHandler: () => ({}),
  useFrameCallback: NOOP,
  useSharedValueEffect: NOOP,
  useAnimatedProps: (compute) => compute(),
  // En Jest no hay preferencia del SO: se ejercita la rama CON animación.
  useReducedMotion: () => false,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  withTiming: identity,
  withSpring: identity,
  withDelay: identity,
  // Destino = último valor (p. ej. el shake termina en 0).
  withSequence: (...args) => args[args.length - 1],
  withRepeat: identity,
  withDecay: identity,
  withStyle: identity,
  cancelAnimation: NOOP,
  interpolate: identity,
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing: {
    linear: identity,
    ease: identity,
    in: identity,
    out: identity,
    inOut: identity,
  },
  // Helper de CSS transitions (consume PressableScale). En runtime nativo
  // normalizeTimingFunction acepta este objeto; en Jest basta con que exista.
  cubicBezier: (x1, y1, x2, y2) => ({
    normalize: () => ({ name: 'cubicBezier', x1, y1, x2, y2 }),
  }),
  // Builders de entrada/salida: en Jest devuelven objeto inerte.
  FadeIn: { duration: () => ({}) },
  FadeInUp: { duration: () => ({}) },
  FadeOut: { duration: () => ({}) },
  ReduceMotion: { System: 0, Always: 1, Never: 2 },
};
