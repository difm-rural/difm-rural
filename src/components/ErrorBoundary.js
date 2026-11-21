import React from 'react'
import { DevSettings, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Constants from 'expo-constants'
import * as Updates from 'expo-updates'
import { trackEvent } from '../lib/analytics'
import { currentScreen } from '../lib/currentScreen'
import { colors } from '../theme/tokens'

const LIMIT = 2000
const clip = value => (typeof value === 'string' ? value.slice(0, LIMIT) : null)

// What app_crash records: enough to find the failing line from a release build.
export function crashDetails(error, info, screen) {
  return {
    screen: screen || currentScreen() || 'unknown',
    message: clip(String(error?.message ?? error)),
    stack: clip(error?.stack),
    componentStack: clip(info?.componentStack),
    appVersion: Constants.expoConfig?.version ?? null,
    updateId: Updates.updateId ?? null,
    channel: Updates.channel ?? null,
    runtimeVersion: Updates.runtimeVersion ?? null,
  }
}

export async function restartApp() {
  try { await Updates.reloadAsync() } catch { DevSettings.reload?.() }
}

// Catches render errors below it. With `screen` set it guards one screen and
// "Go back" leaves that screen; without it, it guards the whole app and "Go back"
// remounts the navigator (via onReset).
export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    void trackEvent('app_crash', crashDetails(error, info, this.props.screen))
  }

  goBack = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) return this.props.children
    return <View style={styles.screen} accessibilityRole="alert">
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>This screen hit a problem. It has been reported. Go back and try again, or restart the app.</Text>
      <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={this.goBack}>
        <Text style={styles.primaryText}>Go back</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => void restartApp()}>
        <Text style={styles.secondaryText}>Restart app</Text>
      </TouchableOpacity>
    </View>
  }
}

// Per-screen guard: a crash blanks only this screen, and Go back pops it.
export function withScreenBoundary(Screen, screen) {
  function Guarded(props) {
    return <ErrorBoundary screen={screen} onReset={() => {
      if (props.navigation?.canGoBack?.()) props.navigation.goBack()
    }}>
      <Screen {...props} />
    </ErrorBoundary>
  }
  Guarded.displayName = screen + 'Boundary'
  return Guarded
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  body: { color: colors.textSecondary, lineHeight: 20, marginBottom: 8 },
  primary: { minHeight: 48, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  secondary: { minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.primaryDark, fontWeight: '700', fontSize: 15 },
})
