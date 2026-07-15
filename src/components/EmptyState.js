import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors, radius, spacing, typography } from '../theme/tokens'
import Icon from './Icon'

// A consistent, intentionally-designed empty state: an icon in a soft tinted
// circle, a title, supporting body text, and an optional action button.
//
// Props
//   icon        Ionicons name (default a friendly tray)
//   title       short headline
//   body        one or two supporting lines
//   actionLabel + onAction   optional primary button
//   actionIcon  optional Ionicons name shown after the button label
//   tone        'neutral' (primary tint) | 'positive' (green, e.g. "all caught up")
//   compact     smaller footprint for inline / per-section empties
export default function EmptyState({
  icon = 'file-tray-outline',
  title,
  body,
  actionLabel,
  onAction,
  actionIcon,
  tone = 'neutral',
  compact = false,
  panel = false,
  style,
}) {
  const tint = tone === 'positive' ? colors.successLight : colors.primaryLight
  const iconColor = tone === 'positive' ? colors.success : colors.primary

  return (
    <View style={[compact ? styles.wrapCompact : styles.wrap, panel && styles.panel, style]}>
      <View
        style={[
          styles.iconCircle,
          compact && styles.iconCircleCompact,
          { backgroundColor: tint },
        ]}>
        <Icon name={icon} size={compact ? 20 : 26} color={iconColor} />
      </View>

      {!!title && (
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
      )}
      {!!body && (
        <Text style={[styles.body, compact && styles.bodyCompact]}>{body}</Text>
      )}

      {!!actionLabel && !!onAction && (
        <TouchableOpacity
          style={styles.btn}
          onPress={onAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}>
          <Text style={styles.btnText}>{actionLabel}</Text>
          {!!actionIcon && (
            <Icon name={actionIcon} size={16} color={colors.white} style={{ marginLeft: 6 }} />
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  wrapCompact: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  // Contained panel look for list/section empties that would otherwise float in
  // a large area.
  panel: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    marginHorizontal: spacing.lg,
  },

  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconCircleCompact: {
    width: 40,
    height: 40,
    marginBottom: spacing.sm,
  },

  title: {
    fontSize: typography.sizeLg,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  titleCompact: {
    fontSize: typography.sizeMd,
    marginBottom: spacing.xs,
  },

  body: {
    fontSize: typography.sizeMd,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  bodyCompact: {
    fontSize: typography.sizeSm,
    color: colors.textMuted,
    lineHeight: 19,
  },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.lg,
    minHeight: 48,
  },
  btnText: {
    color: colors.white,
    fontSize: typography.sizeMd,
    fontWeight: '700',
  },
})
