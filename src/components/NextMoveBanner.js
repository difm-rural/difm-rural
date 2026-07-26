import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens'
import Icon from './Icon'

export default function NextMoveBanner({ nextMove, style }) {
  if (!nextMove) return null
  return (
    <View style={[
      styles.banner,
      nextMove.tone === 'attention' && styles.attention,
      nextMove.tone === 'scheduled' && styles.scheduled,
      nextMove.tone === 'active' && styles.active,
      style,
    ]}>
      <View style={styles.icon}>
        <Icon
          name={nextMove.icon || 'time-outline'}
          size={19}
          color={nextMove.tone === 'attention' ? '#8a5d00' : colors.primary}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[
          styles.label,
          nextMove.tone === 'attention' && styles.attentionLabel,
        ]}>
          {nextMove.label}
        </Text>
        <Text style={styles.detail}>{nextMove.detail}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f2f5f3',
    borderWidth: 1,
    borderColor: '#dfe6e1',
    borderRadius: 12,
    padding: 13,
  },
  attention: { backgroundColor: '#fff7df', borderColor: '#ecd89a' },
  scheduled: { backgroundColor: '#edf4ff', borderColor: '#cbdcf3' },
  active: { backgroundColor: '#eaf6ef', borderColor: '#c8e4d3' },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 14, fontWeight: '800', color: colors.primary },
  attentionLabel: { color: '#8a5d00' },
  detail: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, marginTop: 2 },
})
