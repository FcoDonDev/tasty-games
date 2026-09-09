import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Personajes de la PROPUESTA del usuario (borrame/) como componentes RN
 * (PLAN-WAK-POLISH, iteración de diseño): hexágono con visor y expresiones
 * fijas + aspiradora para el robot. Vistas puras proporcionales a `size`
 * (sin SVG ni imágenes) para previsualizar cómo quedarían en la UI. Aún NO
 * es el render del juego: vive en preview/ y se itera acá antes de tocar
 * EntitiesLayer.
 */

const VISOR = '#0B1220';

/** Color por variante (misma paleta que DRONE_COLORS del render activo). */
const TUNE = [
  { nombre: 'Cazador', body: '#F97316', dark: '#9A3412', light: '#FB923C' },
  { nombre: 'Emboscador', body: '#A78BFA', dark: '#6D28D9', light: '#C4B5FD' },
  { nombre: 'Caprichoso', body: '#38BDF8', dark: '#0369A1', light: '#7DD3FC' },
  { nombre: 'Tímido', body: '#FB7185', dark: '#BE123C', light: '#FDA4AF' },
] as const;

/** Wobble + escala en caja de celda (paridad con DRONE_TUNE del render). */
const WOBBLE = [
  { wobbleMs: 150, wobbleDeg: 4, scale: 0.64 },
  { wobbleMs: 240, wobbleDeg: 6, scale: 0.6 },
  { wobbleMs: 120, wobbleDeg: 9, scale: 0.58 },
  { wobbleMs: 320, wobbleDeg: 3, scale: 0.66 },
] as const;

/** Loop de wobble del UI thread (misma forma que el idle de EntitiesLayer). */
function useWobble(variant: number) {
  const reduced = useReducedMotion();
  const idle = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      idle.set(0);
      return;
    }
    idle.set(0);
    idle.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: WOBBLE[variant].wobbleMs, easing: Easing.linear }),
          withTiming(0, { duration: WOBBLE[variant].wobbleMs, easing: Easing.linear }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      idle.set(0);
    };
  }, [reduced, variant, idle]);
  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${idle.get() * WOBBLE[variant].wobbleDeg}deg` }],
  }));
}

/** Expresión fija dentro del visor (los ojos NO siguen la dirección). */
function Ojos({ variant, s }: { variant: number; s: number }) {
  switch (variant) {
    case 0: // Cazador: dos cejas enojadas (barras blancas en V invertida)
      return (
        <View style={{ flexDirection: 'row', gap: s * 0.055 }}>
          <View style={{ width: s * 0.15, height: s * 0.07, borderRadius: s * 0.035, backgroundColor: '#F8FAFC', transform: [{ rotate: '22deg' }] }} />
          <View style={{ width: s * 0.15, height: s * 0.07, borderRadius: s * 0.035, backgroundColor: '#F8FAFC', transform: [{ rotate: '-22deg' }] }} />
        </View>
      );
    case 1: // Emboscador: ojo lente grande (blanco + pupila + brillo central)
      return (
        <View style={{ width: s * 0.17, height: s * 0.17, borderRadius: s * 0.085, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.095, height: s * 0.095, borderRadius: s * 0.047, backgroundColor: VISOR, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: s * 0.03, height: s * 0.03, borderRadius: s * 0.015, backgroundColor: '#F8FAFC' }} />
          </View>
        </View>
      );
    case 2: // Caprichoso: ojo único mirando de costado (iris + pupila excéntricos)
      return (
        <View style={{ width: s * 0.2, height: s * 0.14, borderRadius: s * 0.07, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: s * 0.1, height: s * 0.1, borderRadius: s * 0.05, backgroundColor: TUNE[2].body, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: s * 0.03 }] }}>
            <View style={{ width: s * 0.05, height: s * 0.05, borderRadius: s * 0.025, backgroundColor: VISOR, transform: [{ translateX: s * 0.016 }] }} />
          </View>
        </View>
      );
    default: // Tímido: sonrisa cerrada (semicírculo blanco) — ojos apretados
      return (
        <View style={{ width: s * 0.2, height: s * 0.1, borderBottomLeftRadius: s * 0.1, borderBottomRightRadius: s * 0.1, backgroundColor: '#F8FAFC' }} />
      );
  }
}

/** Drone hexagonal de la propuesta: cuerpo 3 caras + asas + capucha + visor. */
export function DroneHexFig({ variant, size }: { variant: number; size: number }) {
  const t = TUNE[variant];
  const wobbleStyle = useWobble(variant);
  const s = size;
  const headW = s * 0.96;
  const topH = s * 0.22;
  const midH = s * 0.28;
  const botH = s * 0.26;
  const earW = s * 0.13;
  const earH = s * 0.18;
  return (
    <View style={{ width: s, height: s, alignItems: 'center' }}>
      {/* capucha (aleta superior) con ranura */}
      <View style={{ position: 'absolute', top: 0, width: s * 0.32, height: s * 0.15, alignItems: 'center' }}>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: s * 0.16,
            borderRightWidth: s * 0.16,
            borderBottomWidth: s * 0.15,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: t.dark,
          }}
        />
        <View style={{ position: 'absolute', top: s * 0.05, width: s * 0.04, height: s * 0.07, borderRadius: s * 0.02, backgroundColor: VISOR, opacity: 0.55 }} />
      </View>
      <Animated.View style={[{ position: 'absolute', top: s * 0.14, width: headW }, wobbleStyle]}>
        {/* cara superior (luz): trapecio */}
        <View
          style={{
            width: headW * 0.6,
            height: 0,
            borderLeftWidth: headW * 0.2,
            borderRightWidth: headW * 0.2,
            borderBottomWidth: topH,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: t.light,
          }}
        />
        {/* franja media: asas + visor */}
        <View style={{ width: headW, height: midH, backgroundColor: t.body }}>
          <View style={{ position: 'absolute', left: -s * 0.055, top: (midH - earH) / 2, width: earW, height: earH, borderRadius: s * 0.055, backgroundColor: t.dark }} />
          <View style={{ position: 'absolute', right: -s * 0.055, top: (midH - earH) / 2, width: earW, height: earH, borderRadius: s * 0.055, backgroundColor: t.dark }} />
          <View style={{ position: 'absolute', left: (headW - s * 0.66) / 2, top: (midH - s * 0.26) / 2, width: s * 0.66, height: s * 0.26, borderRadius: s * 0.13, backgroundColor: VISOR, alignItems: 'center', justifyContent: 'center' }}>
            <Ojos variant={variant} s={s} />
          </View>
        </View>
        {/* punta inferior */}
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: headW / 2,
            borderRightWidth: headW / 2,
            borderTopWidth: botH,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: t.body,
          }}
        />
        <View style={{ position: 'absolute', bottom: -s * 0.055, left: (headW - s * 0.15) / 2, width: s * 0.15, height: s * 0.15, borderRadius: s * 0.075, backgroundColor: t.body }} />
        {/* Tímido: marcas de susto arriba a la derecha (fuera del cuerpo) */}
        {variant === 3 ? (
          <View style={{ position: 'absolute', right: -s * 0.02, top: -s * 0.06, width: s * 0.2, height: s * 0.14 }}>
            <View style={{ position: 'absolute', right: s * 0.06, top: 0, width: s * 0.11, height: s * 0.03, borderRadius: s * 0.015, backgroundColor: t.light, transform: [{ rotate: '-38deg' }] }} />
            <View style={{ position: 'absolute', right: 0, top: s * 0.055, width: s * 0.09, height: s * 0.03, borderRadius: s * 0.015, backgroundColor: t.light, transform: [{ rotate: '-72deg' }] }} />
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

/** Aspiradora del robot (propuesta): cuerpo elipse 3/4 + banda frontal. */
export function AspiradoraFig({ size }: { size: number }) {
  const s = size;
  return (
    <View style={{ width: s, height: s, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: s, height: s * 0.74, borderRadius: s * 0.37, backgroundColor: '#E7ECF2', overflow: 'hidden' }}>
        {/* placa superior */}
        <View style={{ position: 'absolute', top: s * 0.05, left: s * 0.08, width: s * 0.84, height: s * 0.44, borderRadius: s * 0.22, backgroundColor: '#F8FAFC' }} />
        {/* junta lateral */}
        <View style={{ position: 'absolute', top: s * 0.51, left: 0, right: 0, height: s * 0.035, backgroundColor: '#C6CFDA' }} />
        {/* botón superior */}
        <View style={{ position: 'absolute', top: s * 0.15, left: s * 0.42, width: s * 0.16, height: s * 0.08, borderRadius: s * 0.04, backgroundColor: '#0F172A' }} />
        {/* puerto lateral */}
        <View style={{ position: 'absolute', left: s * 0.012, top: s * 0.3, width: s * 0.028, height: s * 0.07, borderRadius: s * 0.014, backgroundColor: '#9AA7B8' }} />
        {/* banda frontal con ojitos */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: s * 0.21, backgroundColor: '#141E2E' }} />
        <View style={{ position: 'absolute', bottom: s * 0.075, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: s * 0.075 }}>
          <View style={{ width: s * 0.05, height: s * 0.05, borderRadius: s * 0.025, backgroundColor: '#F8FAFC' }} />
          <View style={{ width: s * 0.05, height: s * 0.05, borderRadius: s * 0.025, backgroundColor: '#F8FAFC' }} />
        </View>
      </View>
    </View>
  );
}

/**
 * Fila de la propuesta como componentes, a la ESCALA del juego: robot 0.78
 * de celda y drones con su scale por personalidad (misma caja que
 * EntitiesLayer). `cellSize` grande = fila de detalle.
 */
export function PropuestaComponentesRow({ cellSize, titulo }: { cellSize: number; titulo: string }) {
  const box = cellSize * 1.6;
  const labelSize = Math.max(7, cellSize * 0.13);
  return (
    <View style={st.fila}>
      <Text style={st.titulo}>{titulo}</Text>
      <View style={[st.contenedor, { width: cellSize * 5, height: box }]}>
        <View style={{ position: 'absolute', left: (cellSize - cellSize * 0.78) / 2, top: (box - cellSize) / 2 }}>
          <AspiradoraFig size={cellSize * 0.78} />
        </View>
        {TUNE.map((t, i) => (
          <View
            key={t.nombre}
            style={{
              position: 'absolute',
              left: (i + 1) * cellSize + (cellSize - cellSize * WOBBLE[i].scale) / 2,
              top: (box - cellSize) / 2,
            }}
          >
            <DroneHexFig variant={i} size={cellSize * WOBBLE[i].scale} />
          </View>
        ))}
        {['Aspiradora', ...TUNE.map((t) => t.nombre)].map((nombre, i) => (
          <Text
            key={nombre}
            style={[st.label, { left: i * cellSize, width: cellSize, top: cellSize * 1.18, fontSize: labelSize }]}
          >
            {nombre}
          </Text>
        ))}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
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
    backgroundColor: '#0B1220',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#33415C',
  },
  label: {
    position: 'absolute',
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
});
