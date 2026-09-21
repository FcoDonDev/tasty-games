import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/core/ui/PressableScale';
import { hapticSelection } from '@/core/ui/haptics';
import type { Direction } from '../engine/grid';

/**
 * D-pad visible (T3, PLAN-ACCESIBILIDAD): 4 direcciones en cruz para jugar sin
 * gestos. Targets S=48 / M=56 / XL=64 con separación 10 (Google Playables:
 * ≥48dp con separación ≥8dp — el spec E2E lo candea con boundingBox).
 * `overlay` lo posiciona translúcido sobre la parte inferior del tablero;
 * sin overlay vive como fila propia bajo el tablero (default).
 * El press encola la dirección vía `queued` (setDirection del store) con
 * feedback de press ya integrado en PressableScale.
 */

export type DPadSize = 'S' | 'M' | 'XL';
export type DPadPos = 'bajo' | 'overlay';

/** Tamaño del target por preset (px). Todos ≥48dp. */
export const DPAD_SIZES: Record<DPadSize, number> = { S: 48, M: 56, XL: 64 };
/** Separación entre filas y entre botones de la fila media (px). ≥8dp. */
export const DPAD_GAP = 10;

function DPadButton({
  label,
  glyph,
  size,
  onDirection,
  dir,
}: {
  label: string;
  glyph: string;
  size: number;
  onDirection: (dir: Direction) => void;
  dir: Direction;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityHint="Encola la dirección en la serpiente"
      hitSlop={4}
      onPress={() => {
        hapticSelection();
        onDirection(dir);
      }}
      style={[styles.cell, { width: size, height: size }]}
    >
      <Text style={[styles.glyph, { fontSize: Math.round(size * 0.42) }]} accessible={false}>
        {glyph}
      </Text>
    </PressableScale>
  );
}

interface DPadProps {
  size: DPadSize;
  pos: DPadPos;
  onDirection: (dir: Direction) => void;
}

export function DPad({ size, pos, onDirection }: DPadProps) {
  const button = DPAD_SIZES[size];
  return (
    <View
      accessibilityLabel="serpiente-dpad"
      style={[styles.wrapper, pos === 'overlay' && styles.wrapperOverlay]}
    >
      {/* Gap REAL entre Pressables (el spec candea boundingBox): filas con
          gap y fila media con gap lateral; sin márgenes en hijos internos. */}
      <View style={styles.row}>
        <DPadButton dir="up" label="serpiente-btn-arriba" glyph="↑" size={button} onDirection={onDirection} />
      </View>
      <View style={styles.row}>
        <DPadButton dir="left" label="serpiente-btn-izquierda" glyph="←" size={button} onDirection={onDirection} />
        <DPadButton dir="right" label="serpiente-btn-derecha" glyph="→" size={button} onDirection={onDirection} />
      </View>
      <View style={styles.row}>
        <DPadButton dir="down" label="serpiente-btn-abajo" glyph="↓" size={button} onDirection={onDirection} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  wrapperOverlay: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#07120C66',
    borderWidth: 1,
    borderColor: '#14532B66',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#0E2417',
    borderWidth: 1,
    borderColor: '#14532B',
  },
  glyph: {
    color: '#86EFAC',
    fontWeight: '900',
  },
});
