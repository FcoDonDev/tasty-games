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
  useSharedValue: (initial) => ({ value: initial }),
  useDerivedValue: (compute) => ({ value: compute() }),
  useAnimatedStyle: (compute) => compute(),
  useAnimatedReaction: NOOP,
  useAnimatedScrollHandler: () => ({}),
  useAnimatedGestureHandler: () => ({}),
  useFrameCallback: NOOP,
  useSharedValueEffect: NOOP,
  useAnimatedProps: (compute) => compute(),
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  withTiming: identity,
  withSpring: identity,
  withDelay: identity,
  withSequence: identity,
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
};
