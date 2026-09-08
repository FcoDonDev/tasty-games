import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/core/ui/PressableScale';
import { hapticSelection } from '@/core/ui/haptics';
import { useWakWakStore } from '../engine/state';
import type { Direction } from '../engine/maze';

/**
 * D-pad compacto bajo el laberinto: input accesible y selectores estables para
 * E2E (Playwright/Maestro), complementario al swipe sobre el tablero.
 * Un haptic de selección por pulsación (mismo frame que el cambio de dirección).
 */

function PadButton({ label, text, dir }: { label: string; text: string; dir: Direction }) {
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={() => {
        hapticSelection();
        useWakWakStore.getState().setDirection(dir);
      }}
      style={styles.button}
    >
      <Text style={styles.buttonText}>{text}</Text>
    </PressableScale>
  );
}

export function DirectionPad() {
  return (
    <View style={styles.pad} accessibilityLabel="control-direccion">
      <View style={styles.row}>
        <PadButton label="wakwak-arriba" text="▲" dir="up" />
      </View>
      <View style={styles.row}>
        <PadButton label="wakwak-izquierda" text="◀" dir="left" />
        <PadButton label="wakwak-abajo" text="▼" dir="down" />
        <PadButton label="wakwak-derecha" text="▶" dir="right" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  button: {
    width: 56,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#33415C',
    backgroundColor: '#141D33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '700',
  },
});
