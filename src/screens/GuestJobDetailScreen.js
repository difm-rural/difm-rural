import React, { useState } from 'react'
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'

export default function GuestJobDetailScreen({ route, navigation }) {
  const { job } = route.params
  const [showAuthSheet, setShowAuthSheet] = useState(false)

  function openAuthSheet() {
    setShowAuthSheet(true)
  }

  function closeAuthSheet() {
    setShowAuthSheet(false)
  }

  function goToRegister() {
    closeAuthSheet()
    navigation.navigate('Register')
  }

  function goToLogin() {
    closeAuthSheet()
    navigation.navigate('Login')
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backRow}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.badgeRow}>
          <Text style={styles.category}>{job.category}</Text>
          <Text style={styles.price}>
            {job.price_type === 'fixed' ? `$${job.price} NZD` : 'Open to Bids'}
          </Text>
        </View>

        <Text style={styles.title} accessibilityRole="header">{job.title}</Text>
        <Text style={styles.location}>📍 {job.location_name}</Text>
        <Text style={styles.description}>{job.description}</Text>

        <TouchableOpacity
          style={styles.bidButton}
          onPress={openAuthSheet}
          accessibilityRole="button"
          accessibilityLabel="Bid on this job"
          accessibilityHint="Double tap to create an account and bid on this job">
          <Text style={styles.bidButtonText}>Bid on this job</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.contactButton}
          onPress={openAuthSheet}
          accessibilityRole="button"
          accessibilityLabel="Contact requester"
          accessibilityHint="Double tap to create an account and contact the requester">
          <Text style={styles.contactButtonText}>Contact requester</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showAuthSheet}
        transparent
        animationType="slide"
        onRequestClose={closeAuthSheet}>
        <View style={styles.modalWrap}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeAuthSheet} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Create a free account to bid on this job</Text>
            <TouchableOpacity
              style={styles.sheetPrimary}
              onPress={goToRegister}
              accessibilityRole="button"
              accessibilityLabel="Create account">
              <Text style={styles.sheetPrimaryText}>Create account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetSecondary}
              onPress={goToLogin}
              accessibilityRole="button"
              accessibilityLabel="Sign in to existing account">
              <Text style={styles.sheetSecondaryText}>Sign in</Text>
            </TouchableOpacity>
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
  container: { flex: 1, backgroundColor: colors.background, padding: 20, paddingTop: 60 },
  backRow: { marginBottom: 16, minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  category: { backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, fontSize: 13, fontWeight: '600' },
  price: { fontWeight: 'bold', color: colors.primary, fontSize: 17 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
  location: { color: colors.textMuted, fontSize: 14, marginBottom: 16 },
  description: { color: colors.textSecondary, fontSize: 16, lineHeight: 26, marginBottom: 32 },
  bidButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 12, minHeight: 52, justifyContent: 'center' },
  bidButtonText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  contactButton: { borderRadius: 10, paddingVertical: 16, alignItems: 'center', borderWidth: 2, borderColor: colors.primary, minHeight: 52, justifyContent: 'center' },
  contactButtonText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 28, paddingBottom: 48 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center', marginBottom: 24 },
  sheetPrimary: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 16, alignItems: 'center', marginBottom: 12, minHeight: 52, justifyContent: 'center' },
  sheetPrimaryText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  sheetSecondary: { borderRadius: 10, paddingVertical: 16, alignItems: 'center', borderWidth: 2, borderColor: colors.primary, marginBottom: 20, minHeight: 52, justifyContent: 'center' },
  sheetSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  sheetCancelBtn: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  sheetCancel: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
})
