import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colOf, parseLayout, rowOf, type MazeData } from '../engine/maze';
import { MazeStaticLayer } from '../renderer/reanimated/MazeLayer';
import { LAB_ACTUAL, LAB_CANDIDATO } from './LAB_CANDIDATO';
import { validateLayout } from './validateLayout';

/**
 * Preview del laberinto para iterar (PLAN-WAK-POLISH F4-iteración): muestra
 * el layout ACTIVO y el CANDIDATO con el MISMO look de render (MazeStaticLayer)
 * y valida en vivo: callejones, inaccesibles, corral sellado, pines de
 * sentinels/IA/chip y la regla del usuario de NO áreas abiertas 3×3
 * (solo pasillos). Al cerrar el diseño: el candidato pasa a maze.ts LAYOUT +
 * tests de invariantes + E2E completo.
 */

const CELL = 18;

function MazeCard({ titulo, layout, destacado }: { titulo: string; layout: readonly string[]; destacado: boolean }) {
  const { maze, problemas, parseError } = useMemo(() => {
    try {
      return { maze: parseLayout(layout) as MazeData, problemas: validateLayout(layout), parseError: false };
    } catch {
      return { maze: null, problemas: ['layout: no parsea (dims o caracteres inválidos)'], parseError: true };
    }
  }, [layout]);

  return (
    <View style={[styles.card, destacado && styles.cardActivo]}>
      <Text style={styles.titulo}>
        {titulo}
        {destacado ? ' (activo en el juego)' : ''}
      </Text>
      {maze ? (
        <View style={{ width: MAZE_W, height: MAZE_H }}>
          <MazeStaticLayer maze={maze} cellSize={CELL} />
          {maze.batteryCells.map((cell) => (
            <View
              key={`b-${cell}`}
              style={{
                position: 'absolute',
                left: colOf(cell) * CELL + CELL * 0.36,
                top: rowOf(cell) * CELL + CELL * 0.36,
                width: CELL * 0.28,
                height: CELL * 0.28,
                borderRadius: 1.5,
                backgroundColor: '#FBBF24',
              }}
            />
          ))}
          {maze.superCells.map((cell) => (
            <View
              key={`s-${cell}`}
              style={{
                position: 'absolute',
                left: colOf(cell) * CELL + CELL * 0.22,
                top: rowOf(cell) * CELL + CELL * 0.22,
                width: CELL * 0.55,
                height: CELL * 0.55,
                borderRadius: 3,
                backgroundColor: '#FDE047',
              }}
            />
          ))}
        </View>
      ) : (
        <Text style={styles.error}>{parseError ? 'No parsea como laberinto.' : ''}</Text>
      )}
      <Text style={problemas.length === 0 ? styles.ok : styles.error}>
        {problemas.length === 0
          ? '✓ Válido: sin callejones, sin áreas 3×3, pines OK'
          : problemas.map((p) => `• ${p}`).join('\n')}
      </Text>
    </View>
  );
}

export function LaberintoPreview() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.seccion}>Laberinto (iteración de diseño)</Text>
      <Text style={styles.help}>
        Regla: solo pasillos — sin áreas abiertas 3×3. El candidato debe validar
        sin problemas antes de reemplazar el layout del juego.
      </Text>
      <MazeCard titulo="CANDIDATO" layout={LAB_CANDIDATO} destacado={false} />
      <MazeCard titulo="ACTIVO" layout={LAB_ACTUAL} destacado />
    </View>
  );
}

const MAZE_W = 19 * CELL;
const MAZE_H = 21 * CELL;

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  seccion: {
    color: '#E2E8F0',
    fontSize: 16,
    fontWeight: '800',
  },
  help: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
  },
  card: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#33415C',
    backgroundColor: '#0B1220',
    alignSelf: 'flex-start',
  },
  cardActivo: {
    borderColor: '#44557A',
  },
  titulo: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ok: {
    color: '#4ADE80',
    fontSize: 12,
    fontWeight: '600',
  },
  error: {
    color: '#FB7185',
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'monospace',
  },
});
