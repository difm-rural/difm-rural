import React from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens'

export function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

// Circular avatar with an initials fallback. Used by the connections list,
// detail header, Home strip, and the network view.
export function ConnectionAvatar({ name, avatarUrl, size = 48 }) {
  const dim = { width: size, height: size, borderRadius: size / 2 }
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[styles.avatar, dim]} />
  }
  return (
    <View style={[styles.avatar, styles.fallback, dim]}>
      <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{getInitials(name)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  avatar:   { backgroundColor: colors.primaryLight },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.primary, fontWeight: '700' },
})
