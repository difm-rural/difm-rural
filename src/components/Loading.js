import React from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../theme/tokens'

// Centered loading spinner with an optional label. Use for detail / profile
// screens where a skeleton list doesn't fit. For list screens prefer
// <SkeletonList /> which previews the shape of the content to come.
export default function Loading({ label, size = 'large', style }) {
  return (
    <View style={[styles.wrap, style]}>
      <ActivityIndicator size={size} color={colors.primary} />
      {!!label && <Text style={styles.label}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  label: {
    marginTop: spacing.md,
    fontSize: typography.sizeSm,
    color: colors.textMuted,
  },
})
