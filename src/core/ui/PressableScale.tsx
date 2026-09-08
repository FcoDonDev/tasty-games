import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type AccessibilityState,
  type Insets,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { cubicBezier } from 'react-native-reanimated';

interface PressableScaleProps {
  /** Label estable de accesibilidad: es el selector de los E2E */
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  /** Estilo visual (border, padding, background) del contenido escalado */
  style?: StyleProp<ViewStyle>;
  /** Agranda el área táctil sin agrandar el visual (HIG: ≥44px) */
  hitSlop?: Insets | number;
  /** Un drift de pocos px no cancela el press intencional */
  pressRetentionOffset?: Insets | number;
  disabled?: boolean;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
}

/**
 * Botón con feedback de press (gate expo-animation: frecuencia tens-daily →
 * techo 120ms / scale 0.97, CSS transition en vez de worklet/spring).
 * El feedback aparece en press-in, no al completar el tap.
 */
export function PressableScale({
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  onPress,
  children,
  style,
  hitSlop = 8,
  pressRetentionOffset = 12,
  disabled,
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const hit = typeof hitSlop === 'number' ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop } : hitSlop;
  const retention =
    typeof pressRetentionOffset === 'number'
      ? { top: pressRetentionOffset, bottom: pressRetentionOffset, left: pressRetentionOffset, right: pressRetentionOffset }
      : pressRetentionOffset;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      hitSlop={hit}
      pressRetentionOffset={retention}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
    >
      <Animated.View style={[styles.scale, style, pressed && styles.pressed]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Las props transition* existen en runtime (rn-web) pero no en los tipos de
  // RN: cast local del estilo para que tsc pase sin cambiar el comportamiento.
  // El timing function usa el helper cubicBezier() de Reanimated, NO el string
  // 'cubic-bezier(...)': el normalizador nativo de CSS transitions solo acepta
  // keywords predefinidas o este objeto (en web se serializa al mismo string).
  scale: {
    transitionProperty: 'transform',
    transitionDuration: '120ms',
    transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
  } as unknown as ViewStyle,
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
