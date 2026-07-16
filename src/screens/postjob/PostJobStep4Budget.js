import React, { useEffect, useState } from 'react'
import {
  Keyboard, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PostJobHeader from './PostJobHeader'
import { usePostJob } from '../../context/PostJobContext'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import Button from '../../components/Button'

const PRICE_OPTIONS = [
  { id: 'fixed', icon: 'cash-outline',      label: 'Fixed price',    desc: 'Set your budget upfront' },
  { id: 'open',  icon: 'pricetags-outline', label: 'Open to offers', desc: 'Let providers quote you' },
]

const MATERIALS_OPTIONS = [
  { id: 'none',      label: 'Nothing required', icon: 'checkmark-circle-outline' },
  { id: 'requester', label: "I'll provide", icon: 'home-outline' },
  { id: 'provider',  label: 'Provider supplies', icon: 'construct-outline' },
]

const SCHEDULE_LABELS = {
  asap:     'As soon as possible',
  specific: 'On a specific date',
  flexible: "I'm flexible",
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function SummaryBar({ items }) {
  const visible = items.filter(it => it && it.value)
  if (!visible.length) return null
  return (
    <View style={styles.summaryBar}>
      {visible.map((item, i) => (
        <View key={i} style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>{item.label}</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{item.value}</Text>
        </View>
      ))}
    </View>
  )
}

export default function PostJobStep4Budget({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { jobData, updateJobData } = usePostJob()

  const [priceType,     setPriceType]     = useState(jobData.priceType || 'fixed')
  const [price,         setPrice]         = useState(jobData.price)
  const [materialsType, setMaterialsType] = useState(jobData.materialsType || 'none')

  const locationSummary = jobData.jobAddress
    ? `${String(jobData.jobAddress).split(',').slice(-2).join(',').trim()}`
    : jobData.areaPolygon?.length > 0
      ? `${jobData.areaHectares} ha traced`
      : jobData.latitude ? 'Location set' : null

  const scheduleLabel   = SCHEDULE_LABELS[jobData.scheduleType] || jobData.scheduleType
  const scheduleDisplay = jobData.scheduleType === 'specific' && jobData.scheduledDate
    ? `${scheduleLabel} — ${formatDate(jobData.scheduledDate)}`
    : scheduleLabel

  // Keep context in sync
  useEffect(() => {
    updateJobData({ priceType, price, materialsType })
  }, [priceType, price, materialsType])

  function canProceed() {
    if (!materialsType) return false
    if (!priceType) return false
    if (priceType === 'open') return true
    return !!(price.trim() && parseFloat(price) > 0)
  }

  function handleBack() {
    navigation.goBack()
  }

  function handleNext() {
    Keyboard.dismiss()
    if (!canProceed()) return
    navigation.navigate('PostJobStep5Review', { ...route.params })
  }

  return (
    <View style={styles.screen}>
      <PostJobHeader currentStep={4} onBack={handleBack} />

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        enabled={Platform.OS === 'android'}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
          showsVerticalScrollIndicator={false}>

          <SummaryBar items={[
            locationSummary ? { label: 'Location', value: locationSummary } : null,
            jobData.category ? { label: 'Category', value: jobData.category } : null,
            { label: 'When',     value: scheduleDisplay },
          ]} />

          <View style={styles.card}>
            <Text style={styles.cardQuestion}>How do you want to set the budget?</Text>
            <View style={styles.priceOptions}>
              {PRICE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.priceTile, priceType === opt.id && styles.priceTileActive]}
                  onPress={() => setPriceType(opt.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: priceType === opt.id }}>
                  <Icon name={opt.icon} size={24} color={colors.primary} />
                  <Text style={[styles.priceTileLabel, priceType === opt.id && styles.priceTileLabelActive]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.priceTileDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardQuestion}>Who supplies the materials?</Text>
            <View style={styles.tilesRow}>
              {MATERIALS_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.tile, materialsType === opt.id && styles.tileActive]}
                  onPress={() => setMaterialsType(opt.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: materialsType === opt.id }}>
                  <Icon name={opt.icon} size={22} color={colors.primary} />
                  <Text style={[styles.tileLabel, materialsType === opt.id && styles.tileLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {priceType === 'fixed' && (
            <View style={styles.card}>
              <Text style={styles.cardQuestion}>What's your budget?</Text>
              <View style={styles.amountRow}>
                <View style={styles.currencyTag}>
                  <Text style={styles.currencyText}>$</Text>
                </View>
                <TextInput
                  style={styles.amountInput}
                  placeholder="e.g. 250"
                  placeholderTextColor={colors.textMuted}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  accessibilityLabel="Price in NZD"
                />
              </View>
            </View>
          )}

          <View style={styles.settleBox}>
            <Icon name="chatbubbles-outline" size={18} color={colors.textSecondary} />
            <Text style={styles.settleText}>
              You'll agree the price with the provider and settle up directly — Rural Connections doesn't handle payments.
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.footerBtns}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Go back">
              <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.textSecondary} /> Back</Text>
            </TouchableOpacity>
            <Button
              title="Review"
              icon="arrow-forward"
              onPress={handleNext}
              disabled={!canProceed()}
              style={{ flex: 1 }}
              accessibilityLabel="Review job"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  screen:        { flex: 1, backgroundColor: '#f5f5f5' },
  flex1:         { flex: 1 },
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },

  summaryBar: {
    backgroundColor: '#f0faf5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c3e6d4',
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  summaryRow:   { flexDirection: 'row', gap: 8, alignItems: 'center' },
  summaryLabel: { fontSize: 9, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.8, minWidth: 52 },
  summaryValue: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: 16,
    marginBottom: 12,
  },
  cardQuestion: { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 12 },

  priceOptions:        { flexDirection: 'row', gap: 10 },
  priceTile:           { flex: 1, padding: 16, backgroundColor: '#f9f9f9', borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#ddd' },
  priceTileActive:     { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  priceIcon:           { fontSize: 26, marginBottom: 6 },
  priceTileLabel:      { fontSize: 14, fontWeight: '700', color: '#555', textAlign: 'center', marginBottom: 4 },
  priceTileLabelActive: { color: colors.primary },
  priceTileDesc:       { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  tilesRow:        { flexDirection: 'row', gap: 8 },
  tile:            { flex: 1, backgroundColor: '#f9f9f9', borderRadius: 10, borderWidth: 1.5, borderColor: '#e0e0e0', padding: 10, alignItems: 'center', gap: 4 },
  tileActive:      { backgroundColor: '#f0faf5', borderColor: colors.primary },
  tileLabel:       { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', lineHeight: 14 },
  tileLabelActive: { color: colors.primary },

  amountRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  currencyTag:  { backgroundColor: colors.primaryLight, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#c3e6d4' },
  currencyText: { fontSize: 16, fontWeight: '700', color: colors.primary },
  amountInput:  {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#222',
  },

  settleBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f0faf5',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#c3e6d4',
    gap: 10,
    marginTop: 4,
  },
  settleText: { flex: 1, fontSize: 13, color: '#2d6a4f', lineHeight: 19 },

  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  footerBtns:      { flexDirection: 'row', gap: 10 },
  // Neutral so it doesn't compete with the primary green "Next".
  backBtn:         { borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, paddingVertical: 15, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  backBtnText:     { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
})
