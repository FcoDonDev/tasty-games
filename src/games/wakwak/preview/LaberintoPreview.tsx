import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colOf, parseLayout, rowOf, type MazeData } from '../engine/maze';
import { MazeStaticLayer } from '../renderer/reanimated/MazeLayer';
import { LAB_ACTUAL } from './LAB_CANDIDATO';
import { LAB_FACIL } from './LAB_FACIL';
import { validateLayout, validateLayoutEasy } from './validateLayout';

/**
 * Preview del laberinto para iterar (PLAN-WAK-POLISH F4-iteración + T4b):
 * muestra el layout ACTIVO y los CANDIDATOS con el MISMO look de render
 * (MazeStaticLayer) y valida en vivo: callejones, inaccesibles, corral
 * sellado, pines de sentinels/IA/chip y la regla del usuario de NO áreas
 * abiertas 3×3 (solo pasillos). Paramétrico en dims (T4b: incluye el
 * candidato fácil 11×13 con SUS pines). Al cerrar el diseño: el candidato
 * pasa a maze.ts SPECS + tests de invariantes + E2E completo.
 */

const CELL = 18;

function MazeCard({
  titulo,
  layout,
  destacado,
  validator,
  expectedDrones = 4,
}: {
  titulo: string;
  layout: readonly string[];
  destacado: boolean;
  validator: (layout: readonly string[]) => string[];
  /** spawns 'D' esperados: 4 normal / 2 fácil (T4b) */
  expectedDrones?: number;
}) {
  const { maze, problemas, parseError } = useMemo(() => {
    try {
      return {
        maze: parseLayout(layout, expectedDrones) as MazeData,
        problemas: validator(layout),
        parseError: false,
      };
    } catch {
      return { maze: null, problemas: ['layout: no parsea (dims o caracteres inválidos)'], parseError: true };
    }
  }, [layout, validator, expectedDrones]);

  const w = maze ? maze.cols * CELL : 0;
  const h = maze ? maze.rows * CELL : 0;

  return (
    <View style={[styles.card, destacado && styles.cardActivo]}>
      <Text style={styles.titulo}>
        {titulo}
        {destacado ? ' (activo en el juego)' : ''}
      </Text>
      {maze ? (
        <View style={{ width: w, height: h }}>
          <MazeStaticLayer maze={maze} cellSize={CELL} />
          {maze.batteryCells.map((cell) => (
            <View
              key={`b-${cell}`}
              style={{
                position: 'absolute',
                left: colOf(cell, maze.cols) * CELL + CELL * 0.36,
                top: rowOf(cell, maze.cols) * CELL + CELL * 0.36,
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
                left: colOf(cell, maze.cols) * CELL + CELL * 0.22,
                top: rowOf(cell, maze.cols) * CELL + CELL * 0.22,
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
      <MazeCard
        titulo="FÁCIL (candidato T4b, 11×13)"
        layout={LAB_FACIL}
        destacado={false}
        validator={validateLayoutEasy}
        expectedDrones={2}
      />
      <MazeCard titulo="NORMAL" layout={LAB_ACTUAL} destacado validator={validateLayout} />
    </View>
  );
}

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
