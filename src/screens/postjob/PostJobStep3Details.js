import { JobPrivateGallery } from '../../components/JobPrimaryImage'
import {POSTING_TITLE_MAX,POSTING_DESCRIPTION_MAX,postingTextError} from '../../../shared/postingText'
import {addGuidanceToDescription,jobDescriptionGuidance,removeUnusedGuidance} from '../../../shared/jobGuidance'
import React, { useEffect, useState } from 'react'
import {
  Alert, Image, Keyboard, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PostJobHeader from './PostJobHeader'
import { usePostJob } from '../../context/PostJobContext'
import { shrinkPhoto } from '../../lib/shrinkPhoto'
import { supabase } from '../../lib/supabase'
import { colors } from '../../theme/tokens'
import Icon from '../../components/Icon'
import Button from '../../components/Button'

function getPhotoUri(photo) { return typeof photo === 'string' ? photo : photo?.uri }

function normalizeAsset(asset) {
  return {
    uri:      asset.uri,
    base64:   asset.base64 || null,
    mimeType: asset.mimeType || 'image/jpeg',
    fileName: asset.fileName || `job-photo-${Date.now()}.jpg`,
    width:    asset.width || null,
    height:   asset.height || null,
  }
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

export default function PostJobStep3Details({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const { jobData, updateJobData } = usePostJob()
  const checkPhoto=process.env.EXPO_PUBLIC_JOB_PRIMARY_MEDIA==='true'&&route.params?.mode==='edit'&&!!route.params?.job?.id
  const privateEdit=route.params?.mode==='edit'&&route.params?.job?.visibility==='invite_only'
  const [privateCount,setPrivateCount]=useState(null)
  useEffect(()=>{
    if(!privateEdit)return
    let active=true
    supabase.rpc('list_job_private_photos',{p_job:route.params.job.id}).then(({data,error})=>{
      if(active&&!error)setPrivateCount(data.length)
    })
    return ()=>{active=false}
  },[privateEdit,route.params?.job?.id])
  const [privatePrimaryPhoto,setPrivatePrimaryPhoto]=useState(checkPhoto)
  useEffect(()=>{
    if(!checkPhoto)return
    let active=true
    supabase.rpc('owns_job_with_primary_media',{p_job:route.params.job.id}).then(({data,error})=>{
      if(active&&!error)setPrivatePrimaryPhoto(data===true)
    })
    return ()=>{active=false}
  },[checkPhoto,route.params?.job?.id])

  const [description,      setDescription]      = useState(jobData.description)
  const [photos,           setPhotos]           = useState(jobData.photos || [])
  const [accessConditions] = useState(jobData.accessConditions || [])
  const [locationNote,     setLocationNote]     = useState(jobData.locationNote || '')

  const locationSummary = jobData.jobAddress
    ? `${String(jobData.jobAddress).split(',').slice(-2).join(',').trim()}`
    : jobData.areaPolygon?.length > 0
      ? `${jobData.areaHectares} ha traced`
      : jobData.latitude ? 'Location set' : null

  const guidance = jobDescriptionGuidance({
    category: jobData.category,
    // Service prompts only while the category is still the one it came with.
    service: jobData.propertyServiceCategory === jobData.category ? jobData.propertyService : '',
  })
  const finalDescription = removeUnusedGuidance(description, guidance.prompts)
  const guidanceAdded = guidance.prompts.every(prompt => description.includes(prompt + ':'))
  const charsLeft = 8 - finalDescription.length

  useEffect(() => {
    updateJobData({ description, photos, accessConditions, locationNote })
  }, [description, photos, accessConditions, locationNote])

  const [attempted,setAttempted]=useState(false)
  function canProceed() {
    return finalDescription.length >= 8 && !postingTextError(finalDescription,'description')
  }

  function handleBack() { navigation.goBack() }

  function handleNext() {
    Keyboard.dismiss()
    setAttempted(true)
    if (!canProceed()) return
    if (finalDescription !== description) setDescription(finalDescription)
    navigation.navigate('PostJobStep4Budget', { ...route.params })
  }

  async function handleAddPhoto() {
    if (photos.length + (privateCount ?? 0) >= 6) return
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
      if (!result.canceled) {
        const picked = await shrinkPhoto(result.assets[0])
        setPhotos(prev => [...prev, normalizeAsset(picked)])
      }
    } catch { Alert.alert('Photo library unavailable', 'Could not open photos.') }
  }

  async function handleTakePhoto() {
    if (photos.length + (privateCount ?? 0) >= 6) return
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return }
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 })
      if (!result.canceled) {
        const taken = await shrinkPhoto(result.assets[0])
        setPhotos(prev => [...prev, normalizeAsset(taken)])
      }
    } catch { Alert.alert('Camera unavailable', 'Could not open the camera.') }
  }

  return (
    <View style={styles.screen}>
      <PostJobHeader currentStep={3} title={route.params?.mode === 'repeat' ? 'Repeat a job' : undefined} onBack={handleBack} />

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
            { label: 'Title',    value: jobData.title },
          ]} />

          {/* 1. Description */}
          <View style={styles.card}>
            <Text style={styles.cardQuestion}>Describe the job</Text>
            {/* Optional prompts. Before they're added: what to mention. After: where to answer. */}
            {!guidanceAdded ? (
              <View style={styles.guide} accessibilityLabel={'Optional. ' + guidance.heading + ': ' + guidance.prompts.join('; ')}>
                <View style={[styles.cardQuestionRow, {marginBottom: 2}]}>
                  <Text style={styles.guideHeading}>{guidance.heading}</Text>
                  <Text style={styles.optionalTag}>Optional</Text>
                </View>
                {guidance.prompts.map(prompt => <Text key={prompt} style={styles.guideItem}>• {prompt}</Text>)}
                <TouchableOpacity accessibilityRole="button" accessibilityHint="Adds each one as a line in the description box below, for you to answer or delete"
                  style={styles.guideButton} onPress={() => setDescription(value => addGuidanceToDescription(value, guidance.prompts))}>
                  <Icon name="add" size={15} color={colors.primary} />
                  <Text style={styles.guideButtonText}>Add these to the description</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.guide, styles.guideAdded]}>
                <Icon name="create-outline" size={15} color={colors.primary} />
                <Text style={[styles.guideItem, {flex: 1}]}>Type your answers after each colon in the box below. Lines you leave blank are removed when you continue.</Text>
              </View>
            )}
            <TextInput
              style={[styles.textarea, attempted && !canProceed() && {borderColor:colors.danger,borderWidth:2}]}
              placeholder="What needs doing? Include any special requirements..."
              placeholderTextColor={colors.textMuted}
              maxLength={POSTING_DESCRIPTION_MAX}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              autoCapitalize="sentences"
              accessibilityLabel="Job description"
            />
            <Text style={styles.hintText}>{description.length} / {POSTING_DESCRIPTION_MAX} characters</Text>
            {!!postingTextError(description,'description') && <Text accessibilityRole="alert" style={{color:colors.danger}}>{postingTextError(description,'description')}</Text>}
            {attempted && finalDescription.length < 8 && <Text accessibilityRole="alert" style={{color:colors.danger}}>Enter a job description with at least 8 characters.</Text>}
            {finalDescription.length > 0 && charsLeft > 0 && (
              <Text style={styles.hintText}>
                {charsLeft} more character{charsLeft !== 1 ? 's' : ''} needed to continue
              </Text>
            )}
          </View>

          {/* 2. Photos */}
          <View style={styles.card}>
            <View style={styles.cardQuestionRow}>
              <Text style={styles.cardQuestion}>Photos</Text>
              <Text style={styles.optionalTag}>Optional · up to 6</Text>
            </View>
            {photos.length === 0 && (
              <View style={styles.photoNudge}>
                <Icon name="camera-outline" size={16} color={colors.primary} />
                <Text style={styles.photoNudgeText}>
                  Providers are far more likely to make an offer when they can see the job — a quick photo or two really helps.
                </Text>
              </View>
            )}
            {privateEdit&&<JobPrivateGallery jobId={route.params.job.id} style={{width:100,height:100}}/>}
            <View style={styles.photoGrid}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoThumb}>
                  <Image source={{ uri: getPhotoUri(p) }} style={styles.photoImg} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Icon name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {(privateEdit ? privateCount!==null : !privatePrimaryPhoto) && !jobData.primaryPhotoRequired && photos.length + (privateCount ?? 0) < 6 && (
                <View style={styles.photoAddGroup}>
                  <TouchableOpacity
                    style={styles.photoAdd}
                    onPress={handleAddPhoto}
                    accessibilityRole="button"
                    accessibilityLabel="Choose from library">
                    <Icon name="images-outline" size={22} color={colors.primary} />
                    <Text style={styles.photoAddText}>Library</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoAdd}
                    onPress={handleTakePhoto}
                    accessibilityRole="button"
                    accessibilityLabel="Take a photo">
                    <Icon name="camera-outline" size={22} color={colors.primary} />
                    <Text style={styles.photoAddText}>Camera</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {/* 3. Site access */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Site access</Text>

            <Text style={styles.fieldLabel}>
              Access note<Text style={styles.optional}> (optional)</Text>
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Last gate on the left past the woolshed, park by the shed..."
              placeholderTextColor={colors.textMuted}
              value={locationNote}
              onChangeText={setLocationNote}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
              autoCapitalize="sentences"
              accessibilityLabel="Access note"
            />
            <Text style={styles.hintText}>Only shared with the provider you accept.</Text>
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
              title="Next — Budget"
              icon="arrow-forward"
              onPress={handleNext}

              style={{ flex: 1 }}
              accessibilityLabel="Next step"
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
    padding: 14,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
  },
  cardTitle:       { fontSize: 14, fontWeight: '500', color: '#222', marginBottom: 10 },
  cardQuestion:    { fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 12 },
  cardQuestionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  optionalTag:     { fontSize: 13, color: colors.textMuted },
  hintText:        { fontSize: 12, color: colors.textMuted, marginTop: 6 },

  fieldLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  optional:   { fontSize: 12, color: '#999', fontWeight: '400' },

  input: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 0.5,
    borderColor: '#e0e0e0',
    color: '#222',
    textAlignVertical: 'top',
    minHeight: 60,
  },

  tilesRow: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  tileActive:      { backgroundColor: '#f0faf5', borderColor: colors.primary },
  tileIcon:        { fontSize: 22 },
  tileLabel:       { fontSize: 11, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', lineHeight: 14 },
  tileLabelActive: { color: colors.primary },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#f0f0f0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#ccc',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxSelected: { backgroundColor: '#e8f5e9', borderColor: '#2d6a4f' },
  checkTick:        { fontSize: 13, color: '#2d6a4f', fontWeight: '500' },
  checkContent:     { flex: 1 },
  checkLabel:       { fontSize: 13, fontWeight: '500', color: '#222' },
  checkSub:         { fontSize: 11, color: '#888', marginTop: 2 },

  textarea: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    color: '#222',
    minHeight: 120,
    textAlignVertical: 'top',
  },

  guide:           { backgroundColor: colors.primaryLight, borderRadius: 8, padding: 10, marginBottom: 10, gap: 2 },
  guideHeading:    { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  guideItem:       { fontSize: 12, color: colors.primary, lineHeight: 17 },
  guideButton:     { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 36, marginTop: 4 },
  guideButtonText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  guideAdded:      { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  photoNudge:      { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.primaryLight, borderRadius: 8, padding: 10, marginBottom: 10 },
  photoNudgeText:  { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 17 },
  photoGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb:      { width: 72, height: 72, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoImg:        { width: 72, height: 72 },
  photoRemove:     { position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  photoAddGroup:   { flexDirection: 'row', gap: 8 },
  photoAdd:        { width: 72, height: 72, borderRadius: 8, backgroundColor: '#f9f9f9', borderWidth: 1.5, borderColor: '#ddd', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 3 },
  photoAddIcon:    { fontSize: 20 },
  photoAddText:    { fontSize: 9, color: colors.textMuted, fontWeight: '600' },

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
