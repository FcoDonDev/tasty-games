import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScoreBoard } from './ScoreBoard';
import { useTheme } from './ThemeProvider';
import type { GameDefinition } from '@/core/types';

interface GameCardProps {
  game: GameDefinition;
  onPress: () => void;
}

export function GameCard({ game, onPress }: GameCardProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Jugar ${game.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.thumbnail, { backgroundColor: theme.primary }]}>
        <Text style={[styles.thumbnailText, { color: theme.primaryText }]}>
          {game.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <Text style={[styles.name, { color: theme.text }]}>{game.name}</Text>
      <Text style={[styles.description, { color: theme.textMuted }]} numberOfLines={2}>
        {game.description}
      </Text>
      {game.minDurationHint ? (
        <Text style={[styles.duration, { color: theme.textMuted }]}>{game.minDurationHint}</Text>
      ) : null}
      <View style={styles.footer}>
        <ScoreBoard gameId={game.id} compact />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    margin: 8,
    gap: 8,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbnailText: {
    fontSize: 22,
    fontWeight: '700',
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  duration: {
    fontSize: 12,
  },
  footer: {
    marginTop: 4,
  },
});
