import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getGameById } from '@/core/game-registry';
import { useTheme } from './ThemeProvider';
import { HelpModal } from './HelpModal';

interface GameHeaderProps {
  gameId: string;
  onExit: () => void;
  /** Reinicia la partida conservando settings/seed según el juego */
  onRestart?: () => void;
  /** Contenido propio del juego en el centro (turno, contador, etc.) */
  center?: ReactNode;
  /** Acciones propias del juego a la derecha (undo, ajustes...) */
  left?: ReactNode;
}

const HEADER_ACTIONS = { paddingH: 12, paddingV: 6, gap: 8 } as const;

function HeaderButton({
  label,
  text,
  onPress,
  borderColor,
  textColor,
}: {
  label: string;
  text: string;
  onPress: () => void;
  borderColor: string;
  textColor: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.headerButton, { borderColor, paddingVertical: HEADER_ACTIONS.paddingV }]}
    >
      <Text style={[styles.headerButtonText, { color: textColor }]}>{text}</Text>
    </Pressable>
  );
}

/**
 * Header estandarizado de todos los juegos: salir, reiniciar (con
 * confirmación) y ayuda (modal de reglas del registro). `center` y `left`
 * permiten el contenido/acciones propios de cada juego sin romper el patrón.
 * Los modales se renderizan como hermanos del header: cubren la pantalla
 * completa del contenedor del juego.
 */
export function GameHeader({ gameId, onExit, onRestart, center, left }: GameHeaderProps) {
  const theme = useTheme();
  const rules = getGameById(gameId)?.rules;
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <View style={styles.header}>
        <HeaderButton
          label={`salir-${gameId}`}
          text="← Salir"
          onPress={onExit}
          borderColor={theme.surfaceBorder}
          textColor={theme.textMuted}
        />

        <View style={styles.center}>{center}</View>

        <View style={[styles.actions, { gap: HEADER_ACTIONS.gap }]}>
          {left}
          {onRestart ? (
            <HeaderButton
              label={`reiniciar-${gameId}`}
              text="↻"
              onPress={() => setShowRestartConfirm(true)}
              borderColor={theme.surfaceBorder}
              textColor={theme.textMuted}
            />
          ) : null}
          {rules ? (
            <HeaderButton
              label={`ayuda-${gameId}`}
              text="?"
              onPress={() => setShowHelp(true)}
              borderColor={theme.surfaceBorder}
              textColor={theme.textMuted}
            />
          ) : null}
        </View>
      </View>

      {showRestartConfirm && onRestart ? (
        <View
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel={`modal-reinicio-${gameId}`}
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>¿Reiniciar la partida?</Text>
          <Text style={[styles.overlaySubtitle, { color: theme.textMuted }]}>
            Se perderá el progreso actual.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`confirmar-reinicio-${gameId}`}
            onPress={() => {
              setShowRestartConfirm(false);
              onRestart();
            }}
            style={[styles.overlayButton, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>Reiniciar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`cancelar-reinicio-${gameId}`}
            onPress={() => setShowRestartConfirm(false)}
            style={[styles.overlayButtonGhost, { borderColor: theme.surfaceBorder }]}
          >
            <Text style={[styles.overlayButtonTextGhost, { color: theme.textMuted }]}>Cancelar</Text>
          </Pressable>
        </View>
      ) : null}

      {rules ? (
        <HelpModal gameId={gameId} rules={rules} visible={showHelp} onClose={() => setShowHelp(false)} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 8,
  },
  headerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: HEADER_ACTIONS.paddingH,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  overlayTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  overlaySubtitle: {
    fontSize: 15,
  },
  overlayButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  overlayButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  overlayButtonGhost: {
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  overlayButtonTextGhost: {
    fontSize: 16,
    fontWeight: '600',
  },
});
