import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { CATEGORIES, CATEGORY_CAPABILITIES } from '../lib/categories'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'

const AUDIENCES = [
  { id: 'requester', label: 'Requesters' },
  { id: 'provider', label: 'Providers' },
  { id: 'both', label: 'Both' },
]

const ACTIONS = [
  { id: 'post_job', label: 'Post a job' },
  { id: 'browse_services', label: 'Browse services' },
  { id: 'manage_profile', label: 'Update profile' },
  { id: 'none', label: 'Information only' },
]

const DEFAULT_SETTINGS = {
  singleton: true,
  in_app_enabled: true,
  email_enabled: false,
  push_enabled: false,
  weather_enabled: false,
  max_cards_per_month: 2,
  max_emails_per_month: 1,
}

function dateInput(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function initialCampaign() {
  const end = new Date()
  end.setDate(end.getDate() + 30)
  return {
    id: null,
    title: '',
    body: '',
    category: CATEGORIES[0],
    capability: '',
    audience: 'requester',
    regionsText: '',
    starts_on: dateInput(),
    ends_on: dateInput(end),
    primary_action: 'post_job',
    in_app_enabled: true,
    email_enabled: false,
    push_enabled: false,
    priority: '20',
    is_active: false,
  }
}

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55)
}

function campaignState(campaign) {
  if (!campaign.is_active) return { label: 'Paused', tone: 'muted' }
  const today = dateInput()
  if (campaign.starts_on > today) return { label: 'Scheduled', tone: 'scheduled' }
  if (campaign.ends_on < today) return { label: 'Ended', tone: 'muted' }
  return { label: 'Live', tone: 'live' }
}

function SettingRow({ icon, title, body, value, onChange, disabled }) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}><Icon name={icon} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingBody}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.white}
        accessibilityLabel={title}
      />
    </View>
  )
}

function Stepper({ label, value, min, max, onChange }) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.settingTitle}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepButton} onPress={() => onChange(Math.max(min, value - 1))}>
          <Icon name="remove" size={17} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity style={styles.stepButton} onPress={() => onChange(Math.min(max, value + 1))}>
          <Icon name="add" size={17} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ToggleField({ label, value, onChange, disabled }) {
  return (
    <View style={styles.toggleField}>
      <Text style={[styles.fieldLabel, disabled && styles.disabledText]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.white}
      />
    </View>
  )
}

export default function SeasonalRemindersAdminScreen({ navigation }) {
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [allowed, setAllowed] = useState(false)
  const [userId, setUserId] = useState(null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [campaigns, setCampaigns] = useState([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState(initialCampaign())
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setAllowed(false)
      setLoading(false)
      setRefreshing(false)
      return
    }
    setUserId(user.id)

    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    if (!profile?.is_admin) {
      setAllowed(false)
      setLoading(false)
      setRefreshing(false)
      return
    }
    setAllowed(true)

    const [{ data: settingsData, error: settingsError }, { data: campaignData, error: campaignError }] = await Promise.all([
      supabase.from('seasonal_reminder_settings').select('*').eq('singleton', true).maybeSingle(),
      supabase.from('seasonal_campaigns').select('*').order('starts_on', { ascending: true }).order('priority', { ascending: false }),
    ])
    if (settingsData) setSettings(settingsData)
    if (campaignData) setCampaigns(campaignData)
    if (settingsError || campaignError) {
      Alert.alert('Could not load reminders', settingsError?.message || campaignError?.message)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function updateSettings(patch) {
    const previous = settings
    const next = { ...settings, ...patch }
    setSettings(next)
    const { error } = await supabase
      .from('seasonal_reminder_settings')
      .update({ ...patch, updated_by: userId })
      .eq('singleton', true)
    if (error) {
      setSettings(previous)
      Alert.alert('Setting not saved', error.message)
    }
  }

  function openNew() {
    setDraft(initialCampaign())
    setEditorOpen(true)
  }

  function openEdit(campaign) {
    setDraft({
      ...campaign,
      regionsText: (campaign.regions || []).join(', '),
      priority: String(campaign.priority ?? 20),
    })
    setEditorOpen(true)
  }

  function validateDraft() {
    if (draft.title.trim().length < 3) return 'Add a campaign title.'
    if (draft.body.trim().length < 3) return 'Add a short explanation.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.starts_on) || !/^\d{4}-\d{2}-\d{2}$/.test(draft.ends_on)) {
      return 'Dates must use YYYY-MM-DD.'
    }
    if (draft.ends_on < draft.starts_on) return 'The end date must be on or after the start date.'
    const priority = Number(draft.priority)
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) return 'Priority must be from 0 to 100.'
    if (!draft.in_app_enabled && !draft.email_enabled && !draft.push_enabled) return 'Enable at least one delivery channel.'
    return null
  }

  async function saveCampaign() {
    const validationError = validateDraft()
    if (validationError) return Alert.alert('Check campaign', validationError)

    setSaving(true)
    const regions = draft.regionsText.split(',').map(item => item.trim()).filter(Boolean)
    const payload = {
      title: draft.title.trim(),
      body: draft.body.trim(),
      category: draft.category || null,
      capability: draft.capability.trim() || null,
      audience: draft.audience,
      regions,
      starts_on: draft.starts_on,
      ends_on: draft.ends_on,
      primary_action: draft.primary_action,
      in_app_enabled: draft.in_app_enabled,
      email_enabled: draft.email_enabled,
      push_enabled: draft.push_enabled,
      priority: Number(draft.priority),
      is_active: draft.is_active,
      updated_by: userId,
    }

    let result
    if (draft.id) {
      result = await supabase.from('seasonal_campaigns').update(payload).eq('id', draft.id).select().single()
    } else {
      result = await supabase.from('seasonal_campaigns').insert({
        ...payload,
        slug: `${slugify(draft.title) || 'campaign'}-${Date.now()}`,
        created_by: userId,
      }).select().single()
    }

    setSaving(false)
    if (result.error) return Alert.alert('Campaign not saved', result.error.message)
    setEditorOpen(false)
    await load()
  }

  async function setCampaignActive(campaign, active) {
    const previous = campaigns
    setCampaigns(items => items.map(item => item.id === campaign.id ? { ...item, is_active: active } : item))
    const { error } = await supabase.from('seasonal_campaigns')
      .update({ is_active: active, updated_by: userId }).eq('id', campaign.id)
    if (error) {
      setCampaigns(previous)
      Alert.alert('Campaign not updated', error.message)
    }
  }

  function deleteCampaign(campaign) {
    Alert.alert('Delete campaign?', `Delete “${campaign.title}”? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('seasonal_campaigns').delete().eq('id', campaign.id)
          if (error) Alert.alert('Campaign not deleted', error.message)
          else setCampaigns(items => items.filter(item => item.id !== campaign.id))
        },
      },
    ])
  }

  if (loading) return <View style={styles.screen}><Loading label="Loading seasonal reminders..." /></View>

  if (!allowed) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={18} color={colors.primary} /><Text style={styles.backText}>Account</Text>
          </TouchableOpacity>
          <Text style={styles.brand}>RURAL CONNECTIONS</Text>
          <Text style={styles.title}>Seasonal reminders</Text>
        </View>
        <EmptyState icon="lock-closed-outline" title="Admin access required" body="Only administrators can manage seasonal campaigns." />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Icon name="chevron-back" size={18} color={colors.primary} /><Text style={styles.backText}>Account</Text>
        </TouchableOpacity>
        <Text style={styles.brand}>RURAL CONNECTIONS</Text>
        <Text style={styles.title}>Seasonal reminders</Text>
        <Text style={styles.subtitle}>Plan regional, occasional prompts without overwhelming users.</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 36 }}>

        <Text style={styles.sectionLabel}>Global settings</Text>
        <View style={styles.card}>
          <SettingRow icon="phone-portrait-outline" title="In-app cards" body="Allow active campaigns to appear in the app." value={settings.in_app_enabled} onChange={value => updateSettings({ in_app_enabled: value })} />
          <SettingRow icon="mail-outline" title="Seasonal email" body="Master switch; individual campaigns must also enable email." value={settings.email_enabled} onChange={value => updateSettings({ email_enabled: value })} />
          <SettingRow icon="notifications-outline" title="Seasonal push" body="Keep off until targeting and frequency controls are proven." value={settings.push_enabled} onChange={value => updateSettings({ push_enabled: value })} />
          <SettingRow icon="rainy-outline" title="Weather triggers" body="Reserved for a future regional forecast integration." value={settings.weather_enabled} onChange={value => updateSettings({ weather_enabled: value })} disabled />
          <Stepper label="Maximum cards per month" value={settings.max_cards_per_month} min={0} max={10} onChange={value => updateSettings({ max_cards_per_month: value })} />
          <Stepper label="Maximum emails per month" value={settings.max_emails_per_month} min={0} max={5} onChange={value => updateSettings({ max_emails_per_month: value })} />
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionLabel}>Campaigns</Text>
            <Text style={styles.sectionHint}>{campaigns.length} campaign{campaigns.length === 1 ? '' : 's'} · activation is always manual</Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={openNew} accessibilityRole="button" accessibilityLabel="New seasonal campaign">
            <Icon name="add" size={18} color={colors.white} /><Text style={styles.addButtonText}>New</Text>
          </TouchableOpacity>
        </View>

        {campaigns.length === 0 ? (
          <View style={styles.card}><EmptyState icon="leaf-outline" title="No campaigns yet" body="Create the first seasonal reminder when you are ready." /></View>
        ) : campaigns.map(campaign => {
          const state = campaignState(campaign)
          return (
            <TouchableOpacity key={campaign.id} style={styles.campaignCard} onPress={() => openEdit(campaign)} activeOpacity={0.75}>
              <View style={styles.campaignTop}>
                <View style={[styles.statusBadge, state.tone === 'live' && styles.statusLive, state.tone === 'scheduled' && styles.statusScheduled]}>
                  <Text style={[styles.statusText, state.tone === 'live' && styles.statusLiveText]}>{state.label}</Text>
                </View>
                <Switch
                  value={campaign.is_active}
                  onValueChange={value => setCampaignActive(campaign, value)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                  accessibilityLabel={`${campaign.title} active`}
                />
              </View>
              <Text style={styles.campaignTitle}>{campaign.title}</Text>
              <Text style={styles.campaignBody} numberOfLines={2}>{campaign.body}</Text>
              <Text style={styles.campaignMeta}>{campaign.starts_on} → {campaign.ends_on} · {campaign.audience}</Text>
              <Text style={styles.campaignMeta}>{campaign.category || 'No category'}{campaign.regions?.length ? ` · ${campaign.regions.join(', ')}` : ' · All regions'}</Text>
              <View style={styles.channelRow}>
                {campaign.in_app_enabled && <Text style={styles.channelPill}>IN APP</Text>}
                {campaign.email_enabled && <Text style={styles.channelPill}>EMAIL</Text>}
                {campaign.push_enabled && <Text style={styles.channelPill}>PUSH</Text>}
                <Text style={styles.priorityText}>Priority {campaign.priority}</Text>
              </View>
              <View style={styles.campaignActions}>
                <TouchableOpacity onPress={() => openEdit(campaign)}><Text style={styles.editText}>Edit campaign</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => deleteCampaign(campaign)}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
              </View>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <Modal visible={editorOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditorOpen(false)}>
        <SafeAreaView style={styles.modalScreen}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditorOpen(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <Text style={styles.modalTitle}>{draft.id ? 'Edit campaign' : 'New campaign'}</Text>
              <TouchableOpacity onPress={saveCampaign} disabled={saving}><Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput style={styles.input} value={draft.title} onChangeText={title => setDraft(current => ({ ...current, title }))} placeholder="Prepare your water system for summer" placeholderTextColor={colors.textMuted} maxLength={100} />

              <Text style={styles.fieldLabel}>Message</Text>
              <TextInput style={[styles.input, styles.textArea]} multiline value={draft.body} onChangeText={body => setDraft(current => ({ ...current, body }))} placeholder="Explain why this is timely and useful." placeholderTextColor={colors.textMuted} maxLength={300} />

              <Text style={styles.fieldLabel}>Audience</Text>
              <View style={styles.choiceWrap}>{AUDIENCES.map(option => <TouchableOpacity key={option.id} style={[styles.choice, draft.audience === option.id && styles.choiceSelected]} onPress={() => setDraft(current => ({ ...current, audience: option.id }))}><Text style={[styles.choiceText, draft.audience === option.id && styles.choiceTextSelected]}>{option.label}</Text></TouchableOpacity>)}</View>

              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.choiceWrap}>{CATEGORIES.map(category => <TouchableOpacity key={category} style={[styles.choice, draft.category === category && styles.choiceSelected]} onPress={() => setDraft(current => ({ ...current, category, capability: '' }))}><Text style={[styles.choiceText, draft.category === category && styles.choiceTextSelected]}>{category}</Text></TouchableOpacity>)}</View>

              <Text style={styles.fieldLabel}>Suggested capability (optional)</Text>
              <View style={styles.choiceWrap}>{(CATEGORY_CAPABILITIES[draft.category] || []).map(capability => <TouchableOpacity key={capability} style={[styles.choice, draft.capability === capability && styles.choiceSelected]} onPress={() => setDraft(current => ({ ...current, capability }))}><Text style={[styles.choiceText, draft.capability === capability && styles.choiceTextSelected]}>{capability}</Text></TouchableOpacity>)}</View>

              <Text style={styles.fieldLabel}>Regions</Text>
              <TextInput style={styles.input} value={draft.regionsText} onChangeText={regionsText => setDraft(current => ({ ...current, regionsText }))} placeholder="Leave blank for all, or Auckland, Waikato" placeholderTextColor={colors.textMuted} />
              <Text style={styles.fieldHelp}>Comma-separated. Use the same region wording stored on profiles.</Text>

              <View style={styles.twoColumns}>
                <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Starts</Text><TextInput style={styles.input} value={draft.starts_on} onChangeText={starts_on => setDraft(current => ({ ...current, starts_on }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} /></View>
                <View style={{ flex: 1 }}><Text style={styles.fieldLabel}>Ends</Text><TextInput style={styles.input} value={draft.ends_on} onChangeText={ends_on => setDraft(current => ({ ...current, ends_on }))} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} /></View>
              </View>

              <Text style={styles.fieldLabel}>Primary action</Text>
              <View style={styles.choiceWrap}>{ACTIONS.map(option => <TouchableOpacity key={option.id} style={[styles.choice, draft.primary_action === option.id && styles.choiceSelected]} onPress={() => setDraft(current => ({ ...current, primary_action: option.id }))}><Text style={[styles.choiceText, draft.primary_action === option.id && styles.choiceTextSelected]}>{option.label}</Text></TouchableOpacity>)}</View>

              <Text style={styles.fieldLabel}>Priority</Text>
              <TextInput style={styles.input} keyboardType="number-pad" value={draft.priority} onChangeText={priority => setDraft(current => ({ ...current, priority }))} placeholder="20" placeholderTextColor={colors.textMuted} maxLength={3} />
              <Text style={styles.fieldHelp}>Higher-priority campaigns are considered first when dates overlap.</Text>

              <Text style={styles.fieldLabel}>Channels</Text>
              <View style={styles.card}>
                <ToggleField label="In-app card" value={draft.in_app_enabled} onChange={in_app_enabled => setDraft(current => ({ ...current, in_app_enabled }))} />
                <ToggleField label="Email" value={draft.email_enabled} onChange={email_enabled => setDraft(current => ({ ...current, email_enabled }))} disabled={!settings.email_enabled} />
                <ToggleField label="Push" value={draft.push_enabled} onChange={push_enabled => setDraft(current => ({ ...current, push_enabled }))} disabled={!settings.push_enabled} />
                <ToggleField label="Activate campaign" value={draft.is_active} onChange={is_active => setDraft(current => ({ ...current, is_active }))} />
              </View>

              <TouchableOpacity style={styles.saveButton} onPress={saveCampaign} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save campaign'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.white, paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, alignSelf: 'flex-start' },
  backText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  brand: { color: colors.danger, fontSize: 12, fontWeight: '800', letterSpacing: 1.7, marginBottom: 5 },
  title: { color: colors.textPrimary, fontSize: 29, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 5 },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionHint: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 13, overflow: 'hidden', marginTop: 9, marginBottom: 24 },
  settingRow: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  settingIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, marginRight: 11 },
  settingTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  settingBody: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 9, overflow: 'hidden' },
  stepButton: { width: 38, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  stepValue: { minWidth: 35, textAlign: 'center', color: colors.textPrimary, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9 },
  addButtonText: { color: colors.white, fontWeight: '700', fontSize: 13 },
  campaignCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 15, marginBottom: 12 },
  campaignTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.background },
  statusLive: { backgroundColor: colors.primaryLight },
  statusScheduled: { backgroundColor: '#fff4d6' },
  statusText: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  statusLiveText: { color: colors.primary },
  campaignTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', marginTop: 9 },
  campaignBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  campaignMeta: { color: colors.textMuted, fontSize: 11, marginTop: 7 },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
  channelPill: { color: colors.primary, backgroundColor: colors.primaryLight, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3, fontSize: 9, fontWeight: '800' },
  priorityText: { color: colors.textMuted, fontSize: 10, marginLeft: 'auto' },
  campaignActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  editText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  modalScreen: { flex: 1, backgroundColor: colors.background },
  modalHeader: { height: 58, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '800' },
  cancelText: { color: colors.textSecondary, fontSize: 14 },
  saveText: { color: colors.primary, fontSize: 14, fontWeight: '800' },
  form: { padding: 16, paddingBottom: 50 },
  fieldLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 7, marginTop: 13 },
  fieldHelp: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 10, color: colors.textPrimary, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11 },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  choiceSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  choiceText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  choiceTextSelected: { color: colors.primary, fontWeight: '800' },
  twoColumns: { flexDirection: 'row', gap: 10 },
  toggleField: { minHeight: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  disabledText: { color: colors.textMuted },
  saveButton: { backgroundColor: colors.primary, borderRadius: 11, alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  saveButtonText: { color: colors.white, fontSize: 15, fontWeight: '800' },
})

