import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EntitiesLayer, type EntitiesHandle } from '../renderer/reanimated/EntitiesLayer';
import type { WorldSnapshot } from '../renderer/types';

/**
 * Galería de personajes (PLAN-WAK-POLISH iteración de diseño): usa los
 * componentes REALES de render (EntitiesLayer) con los idle loops corriendo,
 * a celda grande. Dos filas: estado normal y modo súper carga (powered).
 * La pose se escribe UNA vez por `present` (estática); el wobble/bob es loop
 * del UI thread y sigue vivo. Iterar el diseño acá y solo al cerrar tocar
 * EntitiesLayer.
 */

const CELL = 56;
const DRONE_NAMES = ['Cazador', 'Emboscador', 'Caprichoso', 'Tímido'];

function snapshot(powered: boolean): WorldSnapshot {
  return {
    robot: { x: 0.5, y: 0.5, dir: 'right', powered },
    drones: [
      { id: 0, x: 1.5, y: 0.5, dir: 'up', mode: 'roaming', powered },
      { id: 1, x: 2.5, y: 0.5, dir: 'up', mode: 'roaming', powered },
      { id: 2, x: 3.5, y: 0.5, dir: 'up', mode: 'roaming', powered },
      { id: 3, x: 4.5, y: 0.5, dir: 'up', mode: 'roaming', powered },
    ],
    remaining: 1,
    powerFraction: powered ? 0.8 : 0,
  };
}

function Fila({ powered, titulo }: { powered: boolean; titulo: string }) {
  const ref = useRef<EntitiesHandle | null>(null);
  useEffect(() => {
    ref.current?.present(snapshot(powered));
  }, [powered]);
  return (
    <View style={styles.fila}>
      <Text style={styles.titulo}>{titulo}</Text>
      <View style={styles.contenedor}>
        <EntitiesLayer ref={ref} cellSize={CELL} />
        <Text style={[styles.label, { left: 0, width: CELL }]}>Aspiradora</Text>
        {DRONE_NAMES.map((name, i) => (
          <Text key={name} style={[styles.label, { left: (i + 1) * CELL, width: CELL }]}>
            {name}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function PersonajesPreview() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.seccion}>Personajes (iteración de diseño)</Text>
      <Fila powered={false} titulo="Normal" />
      <Fila powered titulo="Súper carga" />
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
  fila: {
    gap: 4,
  },
  titulo: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  contenedor: {
    width: CELL * 5,
    height: CELL * 1.6,
    backgroundColor: '#0B1220',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#33415C',
  },
  label: {
    position: 'absolute',
    top: CELL * 1.05,
    color: '#64748B',
    fontSize: 8,
    fontWeight: '600',
    textAlign: 'center',
  },
});
