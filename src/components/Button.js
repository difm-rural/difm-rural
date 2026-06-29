import React from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme/tokens'
import Icon from './Icon'

// The single source of truth for action buttons. Four predictable looks that
// read identically across job, booking, service, chat, and profile flows:
//
//   variant="primary"      solid green   — the main action
//   variant="secondary"    outline green — the lesser / alternative action
//   variant="destructive"  outline red   — cancel / decline / delete
//   disabled (or loading)  muted + non-interactive — for any variant
//
// Buttons stretch to fill their container; for a row, pass style={{ flex: 1 }}.
const VARIANTS = {
  primary:     { bg: colors.primary, border: colors.primary, text: colors.white },
  secondary:   { bg: 'transparent',  border: colors.primary, text: colors.primary },
  destructive: { bg: 'transparent',  border: colors.danger,  text: colors.danger },
}

const DISABLED = {
  primary:     { bg: colors.primaryMuted, border: colors.primaryMuted, text: colors.white },
  secondary:   { bg: 'transparent',       border: colors.border,       text: colors.textMuted },
  destructive: { bg: 'transparent',       border: colors.border,       text: colors.textMuted },
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  size = 'md',
  style,
  textStyle,
  accessibilityLabel,
}) {
  const off = disabled || loading
  const c = off ? DISABLED[variant] : VARIANTS[variant]
  const small = size === 'sm'

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      accessibilityLabel={accessibilityLabel || title}
      style={[
        styles.base,
        small && styles.baseSm,
        { backgroundColor: c.bg, borderColor: c.border },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={c.text} />
      ) : (
        <View style={styles.row}>
          {!!icon && (
            <Icon name={icon} size={small ? 15 : 18} color={c.text} style={styles.icon} />
          )}
          <Text
            style={[small ? styles.textSm : styles.text, { color: c.text }, textStyle]}
            numberOfLines={1}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,      // 8 — controls sit one step tighter than cards
    borderWidth: 1.5,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baseSm: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  icon: { marginRight: 8 },
  text:   { fontSize: typography.sizeMd, fontWeight: '700', textAlign: 'center' },
  textSm: { fontSize: typography.sizeSm, fontWeight: '700', textAlign: 'center' },
})
