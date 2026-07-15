import React, { useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors } from '../theme/tokens'
import { coarseSuburb } from '../lib/location'
import Icon from '../components/Icon'
import Button from '../components/Button'

export default function GuestJobDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { job } = route.params
  const [showAuthSheet, setShowAuthSheet] = useState(false)

  function openAuthSheet() {
    setShowAuthSheet(true)
  }

  function closeAuthSheet() {
    setShowAuthSheet(false)
  }

  // Remember which job the guest wanted to act on so we can return them to it
  // once they've signed in (and finished onboarding, for brand-new accounts).
  async function savePendingJobView() {
    try {
      await AsyncStorage.setItem('pendingJobView', JSON.stringify({ job, savedAt: Date.now() }))
    } catch (e) {
      console.log('Could not save pending job view:', e)
    }
  }

  // Passwordless email-code login auto-creates the account, so both
  // "Create account" and "Sign in" route to the Login screen.
  async function goToRegister() {
    closeAuthSheet()
    await savePendingJobView()
    navigation.navigate('Login', { intent: 'register' })
  }

  async function goToLogin() {
    closeAuthSheet()
    await savePendingJobView()
    navigation.navigate('Login', { intent: 'login' })
  }

  return (
    <>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>{job.category}</Text>
        <Text style={styles.headerTitle} accessibilityRole="header">{job.title}</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.badgeRow}>
          <Text style={styles.category}>{job.category}</Text>
          <Text style={styles.price}>
            {job.price_type === 'fixed' ? `$${job.price} NZD` : job.price_type === 'unpaid' ? 'Free / in-kind' : 'Open to Offers'}
          </Text>
        </View>

        <Text style={styles.location}><Icon name="location-outline" size={13} color={colors.textMuted} /> {job.category === 'House-sitting'
          ? (coarseSuburb(job.location_area || job.location_name) || 'Area shared privately')
          : (job.location_name || job.location_area || "Location shared once you're accepted")}</Text>
        <Text style={styles.description}>{job.description}</Text>

        <Button
          title="Offer on this job"
          onPress={openAuthSheet}
          style={{ marginBottom: 12 }}
          accessibilityLabel="Offer on this job"
        />
        <Button
          variant="secondary"
          title="Contact requester"
          onPress={openAuthSheet}
          accessibilityLabel="Contact requester"
        />
      </ScrollView>

      <Modal
        visible={showAuthSheet}
        transparent
        animationType="slide"
        onRequestClose={closeAuthSheet}>
        <View style={styles.modalWrap}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeAuthSheet} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Create a free account to offer on this job</Text>
            <Button
              title="Create account"
              onPress={goToRegister}
              style={{ marginBottom: 12 }}
              accessibilityLabel="Create account"
            />
            <Button
              variant="secondary"
              title="Sign in"
              onPress={goToLogin}
              style={{ marginBottom: 20 }}
              accessibilityLabel="Sign in to existing account"
            />
            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={closeAuthSheet}
              accessibilityRole="button"
              accessibilityLabel="Dismiss">
              <Text style={styles.sheetCancel}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  backBtn: { marginBottom: 12, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker: { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  category: { backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, fontSize: 13, fontWeight: '600' },
  price: { fontWeight: 'bold', color: colors.primary, fontSize: 17 },
  location: { color: colors.textMuted, fontSize: 14, marginBottom: 16 },
  description: { color: colors.textSecondary, fontSize: 16, lineHeight: 26, marginBottom: 32 },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 28, paddingBottom: 48 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center', marginBottom: 24 },
  sheetCancelBtn: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  sheetCancel: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
})
