import React, { useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'

const CATEGORIES = ['Fencing', 'Property Check', 'Maintenance', 'Landscaping', 'Animal Care', 'Machinery', 'General Labour', 'Other']

export default function GuestPostJobScreen({ navigation }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [priceType, setPriceType] = useState('fixed')
  const [price, setPrice] = useState('')
  const [locationName, setLocationName] = useState('')
  const [showAuthSheet, setShowAuthSheet] = useState(false)

  async function handlePostJob() {
    if (!title || !description || !category || !locationName) {
      Alert.alert('Missing Details', 'Please fill in all fields')
      return
    }
    if (priceType === 'fixed' && !price) {
      Alert.alert('Missing Price', 'Please enter a price or select Open to Bids')
      return
    }

    const pendingJob = {
      title,
      description,
      category,
      price_type: priceType,
      price: priceType === 'fixed' ? parseFloat(price) : null,
      location_name: locationName,
    }
    await AsyncStorage.setItem('pendingJob', JSON.stringify(pendingJob))
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled">

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <Text style={styles.heading}>Post a Job</Text>

          <Text style={styles.label}>Job Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Fix fence on north paddock"
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Describe the job in detail..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryButton, category === cat && styles.categoryActive]}
                onPress={() => setCategory(cat)}>
                <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Rural Road, Hawke's Bay"
            value={locationName}
            onChangeText={setLocationName}
            returnKeyType="next"
          />

          <Text style={styles.label}>Pricing</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.priceButton, priceType === 'fixed' && styles.priceActive]}
              onPress={() => setPriceType('fixed')}>
              <Text style={[styles.priceText, priceType === 'fixed' && styles.priceTextActive]}>Fixed Price</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.priceButton, priceType === 'open' && styles.priceActive]}
              onPress={() => setPriceType('open')}>
              <Text style={[styles.priceText, priceType === 'open' && styles.priceTextActive]}>Open to Bids</Text>
            </TouchableOpacity>
          </View>

          {priceType === 'fixed' && (
            <TextInput
              style={styles.input}
              placeholder="Enter price (NZD)"
              value={price}
              onChangeText={setPrice}
              keyboardType="numeric"
              returnKeyType="done"
            />
          )}

          <TouchableOpacity style={styles.button} onPress={handlePostJob}>
            <Text style={styles.buttonText}>Post Job</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showAuthSheet}
        transparent
        animationType="slide"
        onRequestClose={closeAuthSheet}>
        <View style={styles.modalWrap}>
          <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeAuthSheet} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Create a free account to post your task</Text>
            <TouchableOpacity style={styles.sheetPrimary} onPress={goToRegister}>
              <Text style={styles.sheetPrimaryText}>Create account</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetSecondary} onPress={goToLogin}>
              <Text style={styles.sheetSecondaryText}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={closeAuthSheet}>
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
  backRow: { marginBottom: 8 },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  heading: { fontSize: 26, fontWeight: 'bold', color: colors.primary, marginBottom: 20 },
  label: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 8, marginTop: 12 },
  input: { backgroundColor: colors.white, borderRadius: 8, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 4 },
  multiline: { height: 100, textAlignVertical: 'top' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  categoryActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  categoryText: { color: colors.textSecondary, fontSize: 13 },
  categoryTextActive: { color: colors.white },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  priceButton: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 2, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.white },
  priceActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  priceText: { fontWeight: '600', color: colors.textSecondary },
  priceTextActive: { color: colors.primary },
  button: { backgroundColor: colors.primary, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 20 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 28, paddingBottom: 48 },
  sheetTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center', marginBottom: 24 },
  sheetPrimary: { backgroundColor: colors.primary, borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 12 },
  sheetPrimaryText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  sheetSecondary: { borderRadius: 10, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: colors.primary, marginBottom: 20 },
  sheetSecondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  sheetCancel: { color: colors.textMuted, textAlign: 'center', fontSize: 14 },
})
