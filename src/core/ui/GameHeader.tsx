import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { getGameById } from '@/core/game-registry';
import { useTheme } from './ThemeProvider';
import { HelpModal } from './HelpModal';
import { PressableScale } from './PressableScale';
import { overlayEnter, overlayExit } from './overlayAnimation';

interface GameHeaderProps {
  gameId: string;
  onExit: () => void;
  /** Reinicia la partida conservando settings/seed según el juego */
  onRestart?: () => void;
  /** Contenido propio del juego en el centro (turno, contador, etc.) */
  center?: ReactNode;
  /** Acciones propias del juego a la derecha (undo, ajustes...) */
  left?: ReactNode;
  /**
   * `vertical` (landscape móvil): rail de botones apilados al costado
   * izquierdo, liberando el alto para la zona de juego. Default: horizontal.
   */
  variant?: 'horizontal' | 'vertical';
}

const HEADER_ACTIONS = { paddingH: 12, paddingV: 6, gap: 8 } as const;

function HeaderButton({
  label,
  text,
  onPress,
  borderColor,
  textColor,
  vertical = false,
}: {
  label: string;
  text: string;
  onPress: () => void;
  borderColor: string;
  textColor: string;
  vertical?: boolean;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.headerButton,
        vertical && styles.headerButtonVertical,
        { borderColor, paddingVertical: HEADER_ACTIONS.paddingV, borderCurve: 'continuous' },
      ]}
    >
      <Text
        style={[
          styles.headerButtonText,
          vertical && styles.headerButtonTextVertical,
          { color: textColor },
        ]}
      >
        {text}
      </Text>
    </PressableScale>
  );
}

/**
 * Header estandarizado de todos los juegos: salir, reiniciar (con
 * confirmación) y ayuda (modal de reglas del registro). `center` y `left`
 * permiten el contenido/acciones propios de cada juego sin romper el patrón.
 * Los modales se renderizan como hermanos del header: cubren la pantalla
 * completa del contenedor del juego.
 */
export function GameHeader({ gameId, onExit, onRestart, center, left, variant = 'horizontal' }: GameHeaderProps) {
  const theme = useTheme();
  const rules = getGameById(gameId)?.rules;
  const vertical = variant === 'vertical';
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <>
      <View style={[styles.header, vertical && styles.headerVertical]}>
        <HeaderButton
          label={`salir-${gameId}`}
          text={vertical ? '←' : '← Salir'}
          onPress={onExit}
          borderColor={theme.surfaceBorder}
          textColor={theme.textMuted}
          vertical={vertical}
        />

        <View style={[styles.center, vertical && styles.centerVertical]}>{center}</View>

        <View style={[styles.actions, vertical && styles.actionsVertical, { gap: HEADER_ACTIONS.gap }]}>
          {left}
          {onRestart ? (
            <HeaderButton
              label={`reiniciar-${gameId}`}
              text="↻"
              onPress={() => setShowRestartConfirm(true)}
              borderColor={theme.surfaceBorder}
              textColor={theme.textMuted}
              vertical={vertical}
            />
          ) : null}
          {rules ? (
            <HeaderButton
              label={`ayuda-${gameId}`}
              text="?"
              onPress={() => setShowHelp(true)}
              borderColor={theme.surfaceBorder}
              textColor={theme.textMuted}
              vertical={vertical}
            />
          ) : null}
        </View>
      </View>

      {showRestartConfirm && onRestart ? (
        <Animated.View
          entering={overlayEnter()}
          exiting={overlayExit()}
          style={[styles.overlay, { backgroundColor: `${theme.background}F2` }]}
          accessibilityRole="alert"
          accessibilityLabel={`modal-reinicio-${gameId}`}
        >
          <Text style={[styles.overlayTitle, { color: theme.text }]}>¿Reiniciar la partida?</Text>
          <Text style={[styles.overlaySubtitle, { color: theme.textMuted }]}>
            Se perderá el progreso actual.
          </Text>
          <PressableScale
            accessibilityLabel={`confirmar-reinicio-${gameId}`}
            onPress={() => {
              setShowRestartConfirm(false);
              onRestart();
            }}
            style={[styles.overlayButton, { backgroundColor: theme.primary, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.overlayButtonText, { color: theme.primaryText }]}>Reiniciar</Text>
          </PressableScale>
          <PressableScale
            accessibilityLabel={`cancelar-reinicio-${gameId}`}
            onPress={() => setShowRestartConfirm(false)}
            style={[styles.overlayButtonGhost, { borderColor: theme.surfaceBorder, borderCurve: 'continuous' }]}
          >
            <Text style={[styles.overlayButtonTextGhost, { color: theme.textMuted }]}>Cancelar</Text>
          </PressableScale>
        </Animated.View>
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
  /** Rail vertical (landscape móvil): columna de botones a la izquierda. */
  headerVertical: {
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    width: 64,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  headerButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: HEADER_ACTIONS.paddingH,
  },
  headerButtonVertical: {
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  headerButtonTextVertical: {
    fontSize: 16,
  },
  center: {
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  centerVertical: {
    flex: 0,
    flexShrink: 0,
    alignItems: 'center',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionsVertical: {
    flexDirection: 'column',
    alignItems: 'stretch',
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
