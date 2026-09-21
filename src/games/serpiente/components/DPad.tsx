import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/core/ui/PressableScale';
import { hapticSelection } from '@/core/ui/haptics';
import type { Direction } from '../engine/grid';

/**
 * D-pad en cruz (T3, PLAN-ACCESIBILIDAD): grilla 3×3 con brazos arriba/
 * abajo/izquierda/derecha y celda central conectora — el plus queda contiguo
 * y centrado POR CONSTRUCCIÓN (nada alineado a ojo). Targets S=40 / M=48 /
 * XL=56 (reducidos a pedido; hitSlop de PressableScale compensa el target
 * táctil en S). El press encola la dirección vía `queued` (setDirection del
 * store) con feedback de press ya integrado en PressableScale.
 */

export type DPadSize = 'S' | 'M' | 'XL';
export type DPadPos = 'bajo' | 'overlay';

/** Celda de la grilla por preset (px): brazo = target táctil. */
export const DPAD_SIZES: Record<DPadSize, number> = { S: 40, M: 48, XL: 56 };

interface ArmSpec {
  dir: Direction;
  label: string;
  glyph: string;
}

const ARMS: Record<'up' | 'left' | 'right' | 'down', ArmSpec> = {
  up: { dir: 'up', label: 'serpiente-btn-arriba', glyph: '↑' },
  down: { dir: 'down', label: 'serpiente-btn-abajo', glyph: '↓' },
  left: { dir: 'left', label: 'serpiente-btn-izquierda', glyph: '←' },
  right: { dir: 'right', label: 'serpiente-btn-derecha', glyph: '→' },
};

function Arm({
  spec,
  cell,
  onDirection,
}: {
  spec: ArmSpec;
  cell: number;
  onDirection: (dir: Direction) => void;
}) {
  return (
    <PressableScale
      accessibilityLabel={spec.label}
      accessibilityHint="Encola la dirección en la serpiente"
      hitSlop={4}
      onPress={() => {
        hapticSelection();
        onDirection(spec.dir);
      }}
      style={[styles.arm, { width: cell, height: cell }]}
    >
      <Text style={[styles.glyph, { fontSize: Math.round(cell * 0.42) }]} accessible={false}>
        {spec.glyph}
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
  const cell = DPAD_SIZES[size];
  const spacer = <View style={{ width: cell, height: cell }} />;
  return (
    <View
      accessibilityLabel="serpiente-dpad"
      style={[styles.wrapper, pos === 'overlay' && styles.wrapperOverlay]}
    >
      <View style={styles.row}>
        {spacer}
        <Arm spec={ARMS.up} cell={cell} onDirection={onDirection} />
        {spacer}
      </View>
      <View style={styles.row}>
        <Arm spec={ARMS.left} cell={cell} onDirection={onDirection} />
        {/* Conector central: da el plus contiguo (estilo mando); no es
            táctil, solo decora la unión de los 4 brazos. */}
        <View style={[styles.center, { width: cell, height: cell }]} />
        <Arm spec={ARMS.right} cell={cell} onDirection={onDirection} />
      </View>
      <View style={styles.row}>
        {spacer}
        <Arm spec={ARMS.down} cell={cell} onDirection={onDirection} />
        {spacer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    padding: 10,
    borderRadius: 18,
    backgroundColor: '#0B1F14',
    borderWidth: 1,
    borderColor: '#14532B',
  },
  wrapperOverlay: {
    backgroundColor: '#07120C99',
    borderColor: '#14532B99',
  },
  row: {
    flexDirection: 'row',
  },
  arm: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#16351F',
  },
  center: {
    backgroundColor: '#16351F',
  },
  glyph: {
    color: '#86EFAC',
    fontWeight: '900',
  },
});
