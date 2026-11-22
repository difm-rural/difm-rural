import {completedWorkLabel,providerProfileUrl,loadAdvertisedServices,loadSavedProviders,loadInviteChoices,mergeMyPeople,providerServiceSummary,providerInviteJobs,setProviderSaved} from '../../shared/trustedLocals'
import {LocalAction,LocalInvitePicker,LocalMoreMenu,copyProviderLink,shareProviderProfile} from '../components/LocalProviderActions'
import React, { useCallback, useRef, useState } from 'react'
import { Alert, Dimensions, FlatList, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { sendJobInvitation } from '../lib/invites'
import { colors } from '../theme/tokens'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { ConnectionAvatar } from '../components/ConnectionAvatar'
import ConnectionNetwork from '../components/ConnectionNetwork'
import {
  fetchConnections,
  formatLastWorked,
  timesWorkedLabel,
  categoriesLabel,
  categoryColor,
  primaryCategory,
} from '../lib/connections'
import {relationshipLabels,relationshipSide} from '../../shared/relationshipHistory'

const CANVAS_SIZE = Math.min(Dimensions.get('window').width - 32, 420)

export default function ConnectionsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets()
  const inviteJob = route.params?.inviteJob || null
  const side = inviteJob ? 'locals' : relationshipSide(route.params?.side)
  const [saved, setSaved] = useState([])
  const [savedFailed,setSavedFailed] = useState(false)
  const [choices,setChoices] = useState(null)
  const [target,setTarget] = useState(null)
  const [changing,setChanging] = useState(false)
  const changeLock = useRef(false)
  const [viewer,setViewer] = useState(null)
  const locals = side==='locals'&&!inviteJob
  const [connections, setConnections] = useState([])
  const [me, setMe] = useState(null)
  const [view, setView] = useState('list')
  const [failed,setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const request = useRef(0)

  useFocusEffect(useCallback(() => {
    setLoading(true)
    load()
    return ()=>{request.current++}
  }, [side, inviteJob?.id]))

  async function load() {
    const id=++request.current
    setFailed(false)
    try {
      const {data:{user}}=await supabase.auth.getUser()
      if(!user){
        if(id===request.current)setConnections([])
        return
      }
      const [history, profile, savedResult, inviteResult] = await Promise.allSettled([
        fetchConnections(user.id,side),
        supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single(),
        locals ? loadSavedProviders(supabase,user.id) : [],
        locals ? loadInviteChoices(supabase,user.id) : null,
      ])
      // People you have only worked with: load what they advertise too, so every
      // card can say what they offer. If this fails, cards just leave it out.
      let worked=history.status==='fulfilled'?history.value:[]
      if(locals&&worked.length){
        const savedIds=new Set(savedResult.status==='fulfilled'?savedResult.value.map(person=>person.id):[])
        const ids=[...new Set(worked.filter(row=>row.person&&!savedIds.has(row.personId)).map(row=>row.personId))]
        const advertised=ids.length?await loadAdvertisedServices(supabase,ids).catch(()=>null):null
        if(advertised)worked=worked.map(row=>row.person&&advertised.has(row.personId)?{...row,person:{...row.person,services:advertised.get(row.personId)}}:row)
      }
      if(id===request.current){
        setViewer(user.id)
        setConnections(worked)
        setFailed(history.status==='rejected')
        setSavedFailed(savedResult.status==='rejected')
        setSaved(savedResult.status==='fulfilled'?savedResult.value:[])
        setChoices(inviteResult.status==='fulfilled'?inviteResult.value:null)
        const profRes=profile.status==='fulfilled'?profile.value.data:null
        setMe({ name:profRes?.full_name, avatarUrl:profRes?.avatar_url })
      }
    }catch{if(id===request.current)setFailed(true)}finally{
      if(id===request.current){
        setLoading(false)
        setRefreshing(false)
      }
    }
  }

  function onRefresh() {
    setRefreshing(true)
    load()
  }

  async function inviteConnection(conn) {
    const name = conn.person?.full_name || 'this provider'
    Alert.alert(
      'Invite previous provider?',
      `Invite ${name} to view and offer on “${inviteJob.title}”?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send invite',
          onPress: async () => {
            const { error } = await sendJobInvitation(inviteJob.id,conn.provider_id)
            if (error) {
              Alert.alert('Invite not sent', error.message || 'Please try again.')
              return
            }
            Alert.alert('Invitation sent', `${name} will be notified about this job.`, [
              { text: 'OK', onPress: () => navigation.goBack() },
            ])
          },
        },
      ],
    )
  }

  function openConnection(conn) {
    if (inviteJob) {
      inviteConnection(conn)
      return
    }
    navigation.navigate('ConnectionDetail', { connection: conn, side })
  }

  async function toggleSaved(person, currentlySaved) {
    if (changeLock.current || !viewer) return
    changeLock.current=true
    setChanging(true)
    try{
      await setProviderSaved(supabase,viewer,person.id,!currentlySaved)
      if(currentlySaved)setSaved(rows=>rows.filter(row=>row.id!==person.id))
      else setSaved(rows=>[person,...rows.filter(row=>row.id!==person.id)])
    }catch{Alert.alert('Could not update My People','Try again.')}
    finally{changeLock.current=false;setChanging(false)}
  }

  async function sendLocalInvite(job){
    if(changeLock.current || !target) return
    changeLock.current=true
    setChanging(true)
    try{
      const {error}=await sendJobInvitation(job.id,target.id,job.revision)
      if(error)throw error
      setChoices(current=>current&&({...current,invites:[
        ...current.invites.filter(row=>row.job_id!==job.id||row.provider_id!==target.id),
        {job_id:job.id,provider_id:target.id,status:'pending',revision:(job.revision??0)+1},
      ]}))
      setTarget(null)
      Alert.alert('Invitation sent','The provider can view the job and make an offer.')
    }catch{Alert.alert('Invitation could not be sent','Check that the job is still open and try again.')}
    finally{changeLock.current=false;setChanging(false)}
  }

  function openProfile(person){
    navigation.navigate('ProviderProfile',{providerId:person.id})
  }

  // My People: each provider once, with every relationship they have to you.
  const myPeople = locals ? mergeMyPeople(saved, connections) : []

  function personMenu(entry){
    const person=entry.person, name=person.full_name||person.display_name||'Provider'
    const actions=[]
    if(!savedFailed)actions.push({label:entry.saved?'Remove from saved':'Save provider',icon:entry.saved?'bookmark':'bookmark-outline',
      destructive:entry.saved,disabled:changing,onPress:()=>toggleSaved(person,entry.saved)})
    actions.push({label:'Share profile',icon:'share-outline',onPress:async()=>{
      if(!await shareProviderProfile(person.id))Alert.alert('Could not share','Use Copy link instead.')}})
    actions.push({label:'Copy link',icon:'link-outline',onPress:()=>{
      if(!copyProviderLink(person.id))Alert.alert('Profile link',providerProfileUrl(person.id))}})
    if(entry.work)actions.push({label:'Work history',icon:'time-outline',onPress:()=>openConnection(entry.work)})
    return <LocalMoreMenu title={name} actions={actions}/>
  }

  function renderPerson({ item: entry }) {
    const person=entry.person, work=entry.work
    const name=person.full_name||person.display_name||'Provider'
    const services=providerServiceSummary(person)
    const done=completedWorkLabel(work)
    // Two short lines: where and how much you've worked together, then what they
    // advertise. Job-by-job history stays under More → Work history.
    const meta=[person.region,done&&(done+(work?.last_engaged_at?', last '+formatLastWorked(work.last_engaged_at):''))].filter(Boolean).join(' · ')
    return <View style={styles.personCard}>
      <TouchableOpacity style={styles.personTop} accessibilityRole="button" onPress={()=>openProfile(person)}
        accessibilityLabel={[name,entry.saved?'Saved':'',work?'Worked together':'',done].filter(Boolean).join(', ')+'. Opens profile'}>
        <ConnectionAvatar name={name} avatarUrl={person.avatar_url}/>
        <View style={{flex:1}}>
          <Text style={styles.name}>{name}</Text>
          <View style={styles.badges}>
            {entry.saved&&<View style={styles.badge}><Icon name="bookmark" size={11} color={colors.primary}/><Text style={styles.badgeText}>Saved</Text></View>}
            {!!work&&<View style={styles.badge}><Icon name="checkmark-circle-outline" size={12} color={colors.primary}/><Text style={styles.badgeText}>Worked together</Text></View>}
          </View>
          {!!meta&&<Text style={styles.meta}>{meta}</Text>}
          {!!services&&<Text style={styles.categories}>Offers: {services}</Text>}
        </View>
      </TouchableOpacity>
      <View style={styles.personActions}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Invite '+name+' to a job'} style={styles.inviteBtn} onPress={()=>setTarget(person)}>
          <Icon name="paper-plane-outline" size={16} color={colors.white}/><Text style={styles.inviteText}>Invite to job</Text>
        </TouchableOpacity>
        {personMenu(entry)}
      </View>
    </View>
  }

  const localHeader = <View>
    {savedFailed&&<LocalAction label="Could not load saved providers. Retry" onPress={onRefresh}/>}
    {failed&&<LocalAction label="Could not load work history. Retry" onPress={onRefresh}/>}
  </View>
  const localEmpty = failed||savedFailed?null:<View style={{paddingVertical:12}}>
    <Text style={styles.meta}>No providers yet. Save providers you’d like to use again; people you complete jobs or bookings with appear here too.</Text>
    <LocalAction label="Browse local providers" onPress={()=>navigation.getParent()?.navigate('Browse')}/>
  </View>

  function renderItem({ item }) {
    const name = item.person?.full_name || 'Member'
    return (
      <View>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => openConnection(item)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${timesWorkedLabel(item.times_worked)}`}>
        <View style={[styles.rowDot, { backgroundColor: categoryColor(primaryCategory(item.categories)) }]} />
        <ConnectionAvatar name={name} avatarUrl={item.person?.avatar_url} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {timesWorkedLabel(item.times_worked)}
            {item.last_engaged_at ? ` · last ${formatLastWorked(item.last_engaged_at)}` : ''}
          </Text>
          {item.categories?.length > 0 && (
            <Text style={styles.categories} numberOfLines={1}>{categoriesLabel(item.categories)}</Text>
          )}
          {!!item.person?.region&&<Text style={styles.meta}>{item.person.region}</Text>}
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      </View>
    )
  }

  const legendCats = [...new Set(connections.map(c => primaryCategory(c.categories)).filter(Boolean))]

  const networkView = (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}>
      <ConnectionNetwork center={me} connections={connections} onSelect={openConnection} size={CANVAS_SIZE} />

      <View style={styles.legend}>
        <View style={styles.legendRow}><Icon name="resize-outline" size={15} color={colors.textMuted} /><Text style={styles.legendText}>Closer to you = worked together more recently</Text></View>
        <View style={styles.legendRow}><Icon name="ellipse" size={13} color={colors.textMuted} /><Text style={styles.legendText}>Bigger dot = worked together more often</Text></View>
        <View style={styles.legendRow}><Icon name="color-palette-outline" size={15} color={colors.textMuted} /><Text style={styles.legendText}>Colour = main type of work</Text></View>
        {legendCats.length > 0 && (
          <View style={styles.legendChips}>
            {legendCats.map(cat => (
              <View key={cat} style={styles.legendChip}>
                <View style={[styles.legendChipDot, { backgroundColor: categoryColor(cat) }]} />
                <Text style={styles.legendChipText}>{cat}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {connections.length > 16 && (
        <Text style={styles.moreNote}>Showing your 16 most recent. Switch to List to see all {connections.length}.</Text>
      )}
    </ScrollView>
  )

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back">
          <Text style={styles.backBtnText}><Icon name="chevron-back" size={14} color={colors.primary} /> Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {inviteJob ? 'Choose a previous provider' : relationshipLabels[side]}
        </Text>
        {!inviteJob&&<Text style={styles.headerSubtitle}>{side==='locals'?'Providers you’ve saved or worked with':'Requesters you’ve completed work for'}</Text>}
        {!inviteJob&&side==='locals'&&<View style={styles.toggle}>
          <TouchableOpacity style={styles.toggleBtn} accessibilityRole="button" onPress={()=>
            route.params?.fromPropertyNetwork?navigation.goBack():navigation.getParent()?.navigate('Home',{screen:'PropertyNetwork'})}>
            <Text style={styles.toggleText}>My Network</Text>
          </TouchableOpacity>
          <View style={[styles.toggleBtn,styles.toggleBtnActive]}><Text style={[styles.toggleText,styles.toggleTextActive]}>My People</Text></View>
        </View>}
        {!inviteJob&&side==='customers'&&<View style={styles.toggle}>
          {Object.entries(relationshipLabels).map(([value,label])=>(
            <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{selected:side===value}}
              style={[styles.toggleBtn,side===value&&styles.toggleBtnActive]} onPress={()=>{
                if(side!==value){setLoading(true);navigation.setParams({side:value})}
              }}>
              <Text style={[styles.toggleText,side===value&&styles.toggleTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>}
        {side==='customers'&&<TouchableOpacity accessibilityRole="button" style={styles.backBtn}
          onPress={()=>navigation.getParent()?.navigate('Home',{screen:'InvitedJobs'})}>
          <Text style={styles.backBtnText}>Job invitations</Text>
        </TouchableOpacity>}
        {inviteJob ? (
          <Text style={styles.headerSubtitle} numberOfLines={2}>{inviteJob.title}</Text>
        ) : null}

        {!locals && !loading && connections.length > 0 && (
          <View style={styles.toggle}>
            {['network', 'list'].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.toggleBtn, view === v && styles.toggleBtnActive]}
                onPress={() => setView(v)}
                accessibilityRole="button"
                accessibilityState={{ selected: view === v }}
                accessibilityLabel={v === 'network' ? 'Network view' : 'List view'}>
                <Icon name={v === 'network' ? 'git-network-outline' : 'list-outline'} size={15} color={view === v ? colors.white : colors.textSecondary} />
                <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
                  {v === 'network' ? 'Network' : 'List'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {loading ? (
        <Loading label={`Loading ${relationshipLabels[side]}…`} />
      ) : locals ? (
        <FlatList data={myPeople} ListHeaderComponent={localHeader} renderItem={renderPerson}
         ListEmptyComponent={localEmpty}
         keyExtractor={entry=>entry.id}
         contentContainerStyle={{padding:16,paddingBottom:insets.bottom+24}}
         refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary}/>}/>
      ) : failed ? (
        <TouchableOpacity accessibilityRole="button" onPress={onRefresh} style={styles.row}>
          <Text style={styles.name}>Could not load work history. Tap to retry.</Text>
        </TouchableOpacity>
      ) : connections.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={side==='locals'?'No previous providers yet':'No previous customers yet'}
          body={side==='locals'?'Providers appear here after a completed job or booking.':'Requesters appear here after you complete a job or booking for them.'}
        />
      ) : view === 'network' ? (
        networkView
      ) : (
        <FlatList
          data={connections}
          ListHeaderComponent={!inviteJob?<Text style={styles.headerSubtitle}>Worked together</Text>:null}
          renderItem={renderItem}
          keyExtractor={item => `${item.requester_id}-${item.provider_id}`}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        />
      )}
      <LocalInvitePicker person={target} jobs={target&&choices?providerInviteJobs(choices.jobs,choices.invites,target.id):[]}
       failed={!choices} busy={changing} onInvite={sendLocalInvite}
       onClose={()=>{if(!changeLock.current)setTarget(null)}}
       onPost={()=>{
        setTarget(null)
        navigation.getParent()?.navigate('Jobs',{screen:'PostJob',params:{inviteProviderId:target.id,inviteProviderName:target.full_name||target.display_name}})
       }}/>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  header: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { marginBottom: 8 },
  backBtnText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  kicker: { fontSize: 12, letterSpacing: 1.5, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: colors.textPrimary },
  headerSubtitle: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: 5 },

  toggle: { flexDirection: 'row', backgroundColor: colors.background, borderRadius: 10, padding: 3, marginTop: 12, alignSelf: 'flex-start' },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  toggleTextActive: { color: colors.white },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  meta: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  categories: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
  personCard: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10, gap: 10 },
  personTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
  personActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inviteBtn: { flex: 1, minHeight: 44, borderRadius: 10, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  inviteText: { color: colors.white, fontWeight: '700', fontSize: 15 },

  legend: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendText: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  legendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  legendChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  legendChipDot: { width: 10, height: 10, borderRadius: 5 },
  legendChipText: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },

  moreNote: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 14 },
})
