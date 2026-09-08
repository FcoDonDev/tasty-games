import { StyleSheet, Text, View } from 'react-native';
import { PressableScale } from '@/core/ui/PressableScale';

/**
 * Selector de nivel de inicio (PLAN-WAK-WAK-V2 §D1): chips 1..maxUnlocked;
 * los niveles por encima del desbloqueado aparecen bloqueados (sin handler).
 * `preferencesRepository` guarda `wakwak.maxLevel` (dual repo, ya existe).
 */
export function LevelPicker({
  maxUnlocked,
  current,
  onPick,
}: {
  maxUnlocked: number;
  current: number;
  onPick: (level: number) => void;
}) {
  const levels = Array.from({ length: maxUnlocked }, (_, i) => i + 1);
  return (
    <View style={styles.row} accessibilityLabel="selector-nivel-wakwak">
      {levels.map((level) => {
        const active = level === current;
        return (
          <PressableScale
            key={level}
            accessibilityLabel={`nivel-wakwak-${level}`}
            onPress={() => onPick(level)}
            style={[styles.chip, active ? styles.chipActive : null]}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{level}</Text>
          </PressableScale>
        );
      })}
      {maxUnlocked < 8 ? <Text style={styles.locked}>🔒</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chip: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#33415C',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#34D399',
    borderColor: '#34D399',
  },
  chipText: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextActive: {
    color: '#0B1220',
  },
  locked: {
    fontSize: 12,
    marginLeft: 2,
  },
});
