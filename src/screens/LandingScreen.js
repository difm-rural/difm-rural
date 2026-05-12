import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors } from '../theme/tokens'

const TILES = [
  {
    label: 'Post a task',
    subtitle: 'Describe your job and get offers',
    icon: '✏️',
    primary: true,
    screen: 'GuestPostJob',
    hint: 'Opens the task posting form',
  },
  {
    label: 'Browse listings',
    subtitle: 'See available jobs near you',
    icon: '🔍',
    primary: false,
    screen: 'GuestJobFeed',
    hint: 'Opens the job listings feed',
  },
]

export default function LandingScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>RURAL SERVICES MARKETPLACE</Text>
        <Text style={styles.brand} accessibilityRole="header">DIFM Rural</Text>
        <Text style={styles.tagline}>Get rural jobs done, reliably</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>What would you like to do?</Text>

        <View style={styles.grid}>
          {TILES.map(tile => (
            <TouchableOpacity
              key={tile.label}
              style={[styles.tile, tile.primary && styles.tilePrimary]}
              onPress={() => navigation.navigate(tile.screen)}
              accessibilityRole="button"
              accessibilityLabel={tile.label}
              accessibilityHint={tile.hint}>
              <Text style={styles.tileIcon}>{tile.icon}</Text>
              <Text style={[styles.tileLabel, tile.primary && styles.tileLabelPrimary]}>
                {tile.label}
              </Text>
              <Text style={[styles.tileSubtitle, tile.primary && styles.tileSubtitlePrimary]}>
                {tile.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <TouchableOpacity
          style={styles.authButton}
          onPress={() => navigation.navigate('Register')}
          accessibilityRole="button"
          accessibilityLabel="Sign in or create an account"
          accessibilityHint="Opens the account registration screen">
          <Text style={styles.authButtonText}>Sign in / Create account</Text>
        </TouchableOpacity>
        <View style={styles.loginRow}>
          <Text style={styles.loginPrompt}>Already have an account? </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Login')}
            hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            style={styles.loginLinkBtn}
            accessibilityRole="button"
            accessibilityLabel="Log in to existing account">
            <Text style={styles.loginLink}>Log in</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    backgroundColor: colors.primary,
    paddingTop: 70,
    paddingBottom: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: colors.primaryMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  brand: { fontSize: 40, fontWeight: 'bold', color: colors.white, marginBottom: 8 },
  tagline: { fontSize: 16, color: colors.primaryMuted, textAlign: 'center', lineHeight: 24 },

  body: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  sectionLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginBottom: 16, letterSpacing: 0.3 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  tile: {
    width: '47.5%',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 44,
  },
  tilePrimary: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  tileIcon: { fontSize: 26, marginBottom: 10 },
  tileLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  tileLabelPrimary: { color: colors.primary },
  tileSubtitle: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  tileSubtitlePrimary: { color: '#52b788' },

  footer: { paddingHorizontal: 20, paddingBottom: 16 },
  authButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 14,
    minHeight: 52,
    justifyContent: 'center',
  },
  authButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', minHeight: 44 },
  loginPrompt: { color: colors.textMuted, fontSize: 15 },
  loginLinkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  loginLink: { color: colors.primary, fontSize: 15, fontWeight: '700' },
})
