import React from 'react'
import {StyleSheet, Text, View} from 'react-native'
import {listingAvailabilityDetail} from '../../shared/listingAvailabilityDetail'
import {colors} from '../theme/tokens'
import Icon from './Icon'

const STATUS = {
  accepting: {icon: 'checkmark-circle-outline', color: colors.primaryDark, background: colors.primaryLight},
  limited: {icon: 'time-outline', color: '#854d0e', background: colors.warningLight},
  paused: {icon: 'pause-circle-outline', color: colors.danger, background: colors.dangerLight},
}

export default function ListingAvailabilityCard({listing}) {
  const detail = listingAvailabilityDetail(listing)
  if (!detail) return null
  const status = STATUS[detail.tone]

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>Availability</Text>
      {!!detail.status && (
        <View style={[styles.status, {backgroundColor: status.background}]}>
          <Icon name={status.icon} size={18} color={status.color} />
          <Text style={[styles.statusText, {color: status.color}]}>{detail.status}</Text>
        </View>
      )}
      {!!detail.lead && (
        <View style={styles.timing}>
          {!!detail.leadLabel && <Text style={styles.secondary}>{detail.leadLabel}</Text>}
          <Text style={styles.lead}>{detail.lead}</Text>
        </View>
      )}
      {!!detail.message && <Text style={styles.message}>{detail.message}</Text>}
      {(!!detail.disclaimer || !!detail.updated) && (
        <View style={styles.meta}>
          {!!detail.disclaimer && <Text style={styles.secondary}>{detail.disclaimer}</Text>}
          {!!detail.updated && <Text style={styles.secondary}>{detail.updated}</Text>}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    marginBottom: 14,
    padding: 16,
    gap: 10,
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
  },
  title: {fontSize: 16, fontWeight: '700', color: colors.textPrimary},
  status: {alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5},
  statusText: {flexShrink: 1, fontSize: 14, fontWeight: '700'},
  timing: {gap: 2},
  lead: {fontSize: 22, lineHeight: 28, fontWeight: '700', color: colors.textPrimary},
  message: {fontSize: 15, lineHeight: 22, color: colors.textPrimary, textAlign: 'left'},
  meta: {gap: 3},
  secondary: {fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'left'},
})
