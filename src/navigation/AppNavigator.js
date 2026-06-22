import { NavigationContainer, useNavigationContainerRef, getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { updateLastSeen } from '../lib/preferences'
import { clearSessionTokens, isBiometricEnabled, saveSession } from '../lib/biometrics'
import { uploadJobPhotos } from '../lib/jobPhotos'
import { registerForPushNotifications, addPushResponseListener } from '../lib/push'

// ─── Tab screens ──────────────────────────────────────────────────────────────
import HomeTabScreen     from '../screens/tabs/HomeTabScreen'
import JobsTabScreen     from '../screens/tabs/JobsTabScreen'
import BrowseTabScreen   from '../screens/tabs/BrowseTabScreen'
import ActivityTabScreen from '../screens/tabs/ActivityTabScreen'
import AccountTabScreen  from '../screens/tabs/AccountTabScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import { onBadgeRefresh } from '../lib/badgeEvents'

// ─── Post job wizard screens ──────────────────────────────────────────────────
import PostJobStep1JobType  from '../screens/postjob/PostJobStep1JobType'
import PostJobStep2Location from '../screens/postjob/PostJobStep2Location'
import PostJobStep3Details  from '../screens/postjob/PostJobStep3Details'
import PostJobStep4Budget   from '../screens/postjob/PostJobStep4Budget'
import PostJobStep5Review   from '../screens/postjob/PostJobStep5Review'
import { PostJobProvider }  from '../context/PostJobContext'
import { useUser }          from '../context/UserContext'

// ─── Shared screens pushed within tab stacks ──────────────────────────────────
import ManageTaskScreen     from '../screens/ManageTaskScreen'
import JobDetailScreen      from '../screens/JobDetailScreen'
import ChatScreen           from '../screens/ChatScreen'
import ServiceDetailScreen  from '../screens/ServiceDetailScreen'
import ServiceBookingDetailScreen from '../screens/ServiceBookingDetailScreen'
import BookingConfirmScreen from '../screens/BookingConfirmScreen'
import CreateServiceScreen  from '../screens/CreateServiceScreen'
import MyServicesScreen     from '../screens/MyServicesScreen'
import ProfileScreen        from '../screens/ProfileScreen'

import JobFeedScreen           from '../screens/JobFeedScreen'
import MyJobsScreen            from '../screens/MyJobsScreen'
import RequesterProfileScreen  from '../screens/RequesterProfileScreen'
import ProviderProfileScreen   from '../screens/ProviderProfileScreen'
import ReviewsListScreen       from '../screens/ReviewsListScreen'
import OnboardingScreen        from '../screens/OnboardingScreen'

import LocationPickerScreen from '../components/LocationPickerScreen'
import AreaTracerScreen     from '../components/AreaTracerScreen'
import JobMapScreen         from '../components/JobMapScreen'

// ─── Guest / unauthenticated screens ─────────────────────────────────────────
import LandingScreen          from '../screens/LandingScreen'
import LoginScreen            from '../screens/LoginScreen'
import GuestJobFeedScreen     from '../screens/GuestJobFeedScreen'
import GuestJobDetailScreen   from '../screens/GuestJobDetailScreen'

const GuestStack     = createNativeStackNavigator()
const OnboardingNav  = createNativeStackNavigator()
const Tab            = createBottomTabNavigator()
const HomeNav        = createNativeStackNavigator()
const JobsNav        = createNativeStackNavigator()
const BrowseNav      = createNativeStackNavigator()
const ActivityNav    = createNativeStackNavigator()
const AccountNav     = createNativeStackNavigator()

const STACK_OPTS = { headerShown: false, animation: 'slide_from_right', animationDuration: 220 }

// ─── Per-tab stack navigators ─────────────────────────────────────────────────
function HomeStackNav() {
  return (
    <HomeNav.Navigator screenOptions={STACK_OPTS}>
      <HomeNav.Screen name="Dashboard"          component={HomeTabScreen}        />
      <HomeNav.Screen name="PostJob"              component={PostJobStep1JobType}  />
      <HomeNav.Screen name="PostJobStep2Location" component={PostJobStep2Location} />
      <HomeNav.Screen name="PostJobStep3Details"  component={PostJobStep3Details}  />
      <HomeNav.Screen name="PostJobStep4Budget"   component={PostJobStep4Budget}   />
      <HomeNav.Screen name="PostJobStep5Review"   component={PostJobStep5Review}   />
      <HomeNav.Screen name="JobFeed"             component={JobFeedScreen}        />
      <HomeNav.Screen name="ManageTask"         component={ManageTaskScreen}     />
      <HomeNav.Screen name="JobDetail"     component={JobDetailScreen}     />
      <HomeNav.Screen name="Chat"          component={ChatScreen}          />
      <HomeNav.Screen name="ServiceDetail"       component={ServiceDetailScreen}      />
      <HomeNav.Screen name="ServiceBookingDetail" component={ServiceBookingDetailScreen} />
      <HomeNav.Screen name="BookingConfirm"      component={BookingConfirmScreen}     />
      <HomeNav.Screen name="RequesterProfile"    component={RequesterProfileScreen}   />
      <HomeNav.Screen name="ProviderProfile"     component={ProviderProfileScreen}    />
      <HomeNav.Screen name="ReviewsList"         component={ReviewsListScreen}        />
      <HomeNav.Screen name="LocationPicker"      component={LocationPickerScreen}     />
      <HomeNav.Screen name="AreaTracer"          component={AreaTracerScreen}         />
      <HomeNav.Screen name="JobMap"              component={JobMapScreen}             />
      <HomeNav.Screen name="Notifications"       component={NotificationsScreen}      />
    </HomeNav.Navigator>
  )
}

function JobsStackNav() {
  return (
    <JobsNav.Navigator screenOptions={STACK_OPTS}>
      <JobsNav.Screen name="JobsBoard"            component={JobsTabScreen}        />
      <JobsNav.Screen name="PostJob"              component={PostJobStep1JobType}  />
      <JobsNav.Screen name="PostJobStep2Location" component={PostJobStep2Location} />
      <JobsNav.Screen name="PostJobStep3Details"  component={PostJobStep3Details}  />
      <JobsNav.Screen name="PostJobStep4Budget"   component={PostJobStep4Budget}   />
      <JobsNav.Screen name="PostJobStep5Review"   component={PostJobStep5Review}   />
      <JobsNav.Screen name="JobDetail"            component={JobDetailScreen}      />
      <JobsNav.Screen name="ManageTask"           component={ManageTaskScreen}     />
      <JobsNav.Screen name="ServiceBookingDetail" component={ServiceBookingDetailScreen} />
      <JobsNav.Screen name="Chat"                 component={ChatScreen}           />
      <JobsNav.Screen name="RequesterProfile"     component={RequesterProfileScreen} />
      <JobsNav.Screen name="ProviderProfile"      component={ProviderProfileScreen}  />
      <JobsNav.Screen name="ReviewsList"          component={ReviewsListScreen}      />
      <JobsNav.Screen name="LocationPicker"       component={LocationPickerScreen}   />
      <JobsNav.Screen name="AreaTracer"           component={AreaTracerScreen}       />
      <JobsNav.Screen name="JobMap"               component={JobMapScreen}           />
      <JobsNav.Screen name="Notifications"        component={NotificationsScreen}    />
    </JobsNav.Navigator>
  )
}

function BrowseStackNav() {
  return (
    <BrowseNav.Navigator screenOptions={STACK_OPTS}>
      <BrowseNav.Screen name="BrowseMain"    component={BrowseTabScreen}     />
      <BrowseNav.Screen name="JobFeed"      component={JobFeedScreen}       />
      <BrowseNav.Screen name="JobDetail"     component={JobDetailScreen}     />
      <BrowseNav.Screen name="ManageTask"    component={ManageTaskScreen}    />
      <BrowseNav.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <BrowseNav.Screen name="ServiceBookingDetail" component={ServiceBookingDetailScreen} />
      <BrowseNav.Screen name="BookingConfirm" component={BookingConfirmScreen} />
      <BrowseNav.Screen name="MyServices"      component={MyServicesScreen}       />
      <BrowseNav.Screen name="CreateService"   component={CreateServiceScreen}    />
      <BrowseNav.Screen name="LocationPicker"  component={LocationPickerScreen}   />
      <BrowseNav.Screen name="Chat"            component={ChatScreen}             />
      <BrowseNav.Screen name="RequesterProfile" component={RequesterProfileScreen} />
      <BrowseNav.Screen name="ProviderProfile"  component={ProviderProfileScreen}  />
      <BrowseNav.Screen name="ReviewsList"      component={ReviewsListScreen}      />
      <BrowseNav.Screen name="JobMap"           component={JobMapScreen}           />
    </BrowseNav.Navigator>
  )
}

function ActivityStackNav() {
  return (
    <ActivityNav.Navigator screenOptions={STACK_OPTS}>
      <ActivityNav.Screen name="ActivityMain"  component={ActivityTabScreen}   />
      <ActivityNav.Screen name="ManageTask"    component={ManageTaskScreen}    />
      <ActivityNav.Screen name="PostJob"              component={PostJobStep1JobType}  />
      <ActivityNav.Screen name="PostJobStep2Location" component={PostJobStep2Location} />
      <ActivityNav.Screen name="PostJobStep3Details"  component={PostJobStep3Details}  />
      <ActivityNav.Screen name="PostJobStep4Budget"   component={PostJobStep4Budget}   />
      <ActivityNav.Screen name="PostJobStep5Review"   component={PostJobStep5Review}   />
      <ActivityNav.Screen name="MyJobs"        component={MyJobsScreen}        />
      <ActivityNav.Screen name="JobDetail"     component={JobDetailScreen}     />
      <ActivityNav.Screen name="Chat"          component={ChatScreen}          />
      <ActivityNav.Screen name="ServiceDetail"      component={ServiceDetailScreen}    />
      <ActivityNav.Screen name="ServiceBookingDetail" component={ServiceBookingDetailScreen} />
      <ActivityNav.Screen name="BookingConfirm"     component={BookingConfirmScreen}   />
      <ActivityNav.Screen name="LocationPicker"     component={LocationPickerScreen}   />
      <ActivityNav.Screen name="RequesterProfile"   component={RequesterProfileScreen} />
      <ActivityNav.Screen name="ProviderProfile"    component={ProviderProfileScreen}  />
      <ActivityNav.Screen name="ReviewsList"        component={ReviewsListScreen}      />
      <ActivityNav.Screen name="JobMap"             component={JobMapScreen}           />
      <ActivityNav.Screen name="Notifications"      component={NotificationsScreen}   />
    </ActivityNav.Navigator>
  )
}

function AccountStackNav() {
  return (
    <AccountNav.Navigator screenOptions={STACK_OPTS}>
      <AccountNav.Screen name="AccountMain"   component={AccountTabScreen}   />
      <AccountNav.Screen name="MyServices"    component={MyServicesScreen}   />
      <AccountNav.Screen name="CreateService" component={CreateServiceScreen} />
      <AccountNav.Screen name="Profile"       component={ProfileScreen}      />
      <AccountNav.Screen name="ServiceDetail"  component={ServiceDetailScreen}  />
      <AccountNav.Screen name="ServiceBookingDetail" component={ServiceBookingDetailScreen} />
      <AccountNav.Screen name="BookingConfirm" component={BookingConfirmScreen} />
      <AccountNav.Screen name="LocationPicker" component={LocationPickerScreen} />
      <AccountNav.Screen name="Chat"            component={ChatScreen}            />
      <AccountNav.Screen name="ProviderProfile" component={ProviderProfileScreen} />
      <AccountNav.Screen name="ReviewsList"     component={ReviewsListScreen}     />
    </AccountNav.Navigator>
  )
}

// ─── Custom tab bar ───────────────────────────────────────────────────────────
const TAB_DEFS = [
  { name: 'Home',     label: 'Home'     },
  { name: 'Jobs',     label: 'Jobs'     },
  { name: 'Browse',   label: 'Services' },
  { name: 'Activity', label: 'Activity' },
  { name: 'Account',  label: 'Account'  },
]

// Root screen of each tab's stack — tapping a tab returns here.
const TAB_ROOT = {
  Home:     'Dashboard',
  Jobs:     'JobsBoard',
  Browse:   'BrowseMain',
  Activity: 'ActivityMain',
  Account:  'AccountMain',
}

// Screens that keep the bottom tab bar: every tab root, plus job management.
// Everything else (detail / workflow screens) hides it.
const TAB_BAR_ROUTES = new Set([...Object.values(TAB_ROOT), 'ManageTask'])

function TabIcon({ name, active, avatarUrl }) {
  const inactive = colors.textMuted
  const c = active ? colors.primary : inactive
  switch (name) {
    case 'Home':     return <Text style={{ fontSize: 22, color: c, lineHeight: 26 }}>⌂</Text>
    case 'Jobs':     return <Text style={{ fontSize: 20, color: c, lineHeight: 26 }}>⚒</Text>
    case 'Browse':   return <Text style={{ fontSize: 20, color: c, lineHeight: 26 }}>⚙</Text>
    case 'Activity': return <Text style={{ fontSize: 20, color: c, lineHeight: 26 }}>≡</Text>
    case 'Account':
      if (avatarUrl) {
        return (
          <View style={[
            tabStyles.avatarThumb,
            active ? tabStyles.avatarThumbActive : tabStyles.avatarThumbInactive,
          ]}>
            <Image source={{ uri: avatarUrl }} style={tabStyles.avatarThumbImg} />
          </View>
        )
      }
      return <Text style={{ fontSize: 22, color: c, lineHeight: 26 }}>◯</Text>
    default: return null
  }
}

function CustomTabBar({ state, navigation, activityBadge, jobsBadge, servicesBadge, clearJobsBadge, clearServicesBadge }) {
  const insets = useSafeAreaInsets()
  const { avatarUrl } = useUser()

  // Hide tab bar on pushed detail/workflow screens, keep it on tab roots and
  // job management. getFocusedRouteNameFromRoute reliably reports the focused
  // nested screen (it returns undefined on a tab's root → keep the bar).
  const activeRoute = state.routes[state.index]
  const focusedRoute = getFocusedRouteNameFromRoute(activeRoute)
  if (focusedRoute && !TAB_BAR_ROUTES.has(focusedRoute)) return null

  return (
    <View style={[tabStyles.bar, { paddingBottom: insets.bottom, height: 60 + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const tab      = TAB_DEFS[index]
        const isFocused = state.index === index
        const badge = route.name === 'Activity' ? activityBadge
          : route.name === 'Jobs' ? jobsBadge
          : route.name === 'Browse' ? servicesBadge : 0

        return (
          <TouchableOpacity
            key={route.key}
            style={tabStyles.tab}
            onPress={() => {
              if (route.name === 'Jobs') clearJobsBadge?.()
              if (route.name === 'Browse') clearServicesBadge?.()
              // Always land on the tab's root screen (pops Notifications etc.)
              navigation.navigate(route.name, { screen: TAB_ROOT[route.name] })
            }}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isFocused }}>
            <View style={tabStyles.iconWrap}>
              <TabIcon name={tab.name} active={isFocused} avatarUrl={tab.name === 'Account' ? avatarUrl : null} />
              {badge > 0 && <View style={tabStyles.badge} />}
            </View>
            <Text style={[tabStyles.label, isFocused && tabStyles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 0.5,
    borderTopColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  iconWrap: { position: 'relative', marginBottom: 4 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e53935',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  label:       { fontSize: 11, color: '#999999', fontWeight: '500' },
  labelActive: { color: colors.primary, fontWeight: '700' },

  avatarThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
  },
  avatarThumbActive:   { borderWidth: 2,   borderColor: colors.primary },
  avatarThumbInactive: { borderWidth: 1.5, borderColor: '#ccc' },
  avatarThumbImg: { width: 26, height: 26 },
})

// ─── Authenticated tab navigator ──────────────────────────────────────────────
function AuthenticatedApp({ activityBadge, jobsBadge, servicesBadge, clearJobsBadge, clearServicesBadge }) {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          activityBadge={activityBadge}
          jobsBadge={jobsBadge}
          servicesBadge={servicesBadge}
          clearJobsBadge={clearJobsBadge}
          clearServicesBadge={clearServicesBadge}
        />
      )}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home"     component={HomeStackNav}     />
      <Tab.Screen name="Jobs"     component={JobsStackNav}     />
      <Tab.Screen name="Browse"   component={BrowseStackNav}   />
      <Tab.Screen name="Activity" component={ActivityStackNav} />
      <Tab.Screen name="Account"  component={AccountStackNav}  />
    </Tab.Navigator>
  )
}

// ─── Onboarding navigator ─────────────────────────────────────────────────────
function OnboardingApp({ profile, onComplete }) {
  return (
    <OnboardingNav.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
      <OnboardingNav.Screen name="Onboarding">
        {() => <OnboardingScreen profile={profile} onComplete={onComplete} />}
      </OnboardingNav.Screen>
    </OnboardingNav.Navigator>
  )
}

// ─── Guest stack ──────────────────────────────────────────────────────────────
function GuestApp() {
  return (
    <GuestStack.Navigator screenOptions={STACK_OPTS}>
      <GuestStack.Screen name="Landing"         component={LandingScreen}        />
      <GuestStack.Screen name="Login"           component={LoginScreen}          />
      <GuestStack.Screen name="GuestJobFeed"    component={GuestJobFeedScreen}   />
      <GuestStack.Screen name="GuestJobDetail"  component={GuestJobDetailScreen} />
      <GuestStack.Screen name="GuestPostJob"          component={PostJobStep1JobType}  />
      <GuestStack.Screen name="PostJobStep2Location" component={PostJobStep2Location} />
      <GuestStack.Screen name="PostJobStep3Details"  component={PostJobStep3Details}  />
      <GuestStack.Screen name="PostJobStep4Budget"   component={PostJobStep4Budget}   />
      <GuestStack.Screen name="PostJobStep5Review"   component={PostJobStep5Review}   />
      <GuestStack.Screen name="ServicesList"        component={BrowseTabScreen}      />
      <GuestStack.Screen name="ServiceDetail"   component={ServiceDetailScreen}  />
      <GuestStack.Screen name="ProviderProfile" component={ProviderProfileScreen} />
      <GuestStack.Screen name="ReviewsList"     component={ReviewsListScreen}     />
      <GuestStack.Screen name="BookingConfirm"  component={BookingConfirmScreen} />
      <GuestStack.Screen name="LocationPicker"  component={LocationPickerScreen} />
      <GuestStack.Screen name="AreaTracer"      component={AreaTracerScreen}     />
    </GuestStack.Navigator>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function AppNavigator() {
  const [session,          setSession]          = useState(null)
  const [profile,          setProfile]          = useState(null)
  const [loading,          setLoading]          = useState(true)
  const [showOnboarding,   setShowOnboarding]   = useState(false)
  const [activityBadge,    setActivityBadge]    = useState(0)
  const [jobsBadge,        setJobsBadge]        = useState(0)
  const [servicesBadge,    setServicesBadge]    = useState(0)

  const navigationRef = useNavigationContainerRef()
  const sessionRef = useRef(null)
  const profileRef = useRef(null)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { profileRef.current = profile }, [profile])

  // Tapping a push opens the notifications inbox (each row deep-links from there).
  useEffect(() => {
    const sub = addPushResponseListener(() => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Activity', { screen: 'Notifications' })
      }
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    // onAuthStateChange fires INITIAL_SESSION on subscribe with the restored
    // session, so it covers cold start — no separate getSession() needed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Token refresh: just keep biometric tokens current, nothing else.
      if (event === 'TOKEN_REFRESHED') {
        if (session) {
          const enabled = await isBiometricEnabled()
          if (enabled) await saveSession(session.access_token, session.refresh_token)
        }
        return
      }

      // Clear only tokens on sign-out — keep the enabled flag so the next
      // OTP login silently refreshes them and biometric works on cold start.
      if (event === 'SIGNED_OUT') {
        await clearSessionTokens()
        setSession(null)
        setProfile(null)
        setActivityBadge(0)
        setJobsBadge(0)
        setServicesBadge(0)
        setLoading(false)
        return
      }

      // INITIAL_SESSION (cold start), SIGNED_IN (just logged in), USER_UPDATED
      setSession(session)
      if (session) {
        // Only a brand-new sign-in can have a pending guest draft to flush.
        if (event === 'SIGNED_IN') {
          await postPendingJobIfAny(session.user.id)
          await postPendingBookingIfAny(session.user.id)
        }
        registerForPushNotifications() // fire-and-forget; reassigns this device to the current user
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && sessionRef.current?.user?.id) {
        fetchBadgeCounts(sessionRef.current.user.id, profileRef.current)
      }
    })
    // Screens (e.g. the notifications inbox after mark-read) can ask for a refresh
    const unsubscribeBadges = onBadgeRefresh(() => {
      if (sessionRef.current?.user?.id) {
        fetchBadgeCounts(sessionRef.current.user.id, profileRef.current)
      }
    })
    return () => {
      subscription?.unsubscribe()
      appStateSub.remove()
      unsubscribeBadges()
    }
  }, [])

  async function postPendingJobIfAny(userId) {
    try {
      const raw = await AsyncStorage.getItem('pendingJob')
      if (!raw) return
      const { _photos = [], ...job } = JSON.parse(raw)

      const { data: newJob, error } = await supabase
        .from('jobs')
        .insert({ ...job, requester_id: userId, status: 'open' })
        .select('id')
        .single()

      if (error) {
        // Keep the draft so the user can retry — don't silently lose their work.
        Alert.alert('Job not posted', `${error.message}\n\nYour details are saved — please try posting again from your jobs.`)
        return
      }

      await AsyncStorage.removeItem('pendingJob')

      if (_photos.length > 0) {
        const urls = await uploadJobPhotos(newJob.id, _photos)
        if (urls.length > 0) {
          await supabase.from('jobs').update({ photos: urls }).eq('id', newJob.id)
        }
      }

      Alert.alert('Job posted!', 'Your job has been posted successfully.')
    } catch (error) {
      console.log('Error posting pending job:', error)
    }
  }

  async function postPendingBookingIfAny(userId) {
    try {
      const raw = await AsyncStorage.getItem('pendingBooking')
      if (!raw) return
      const pending = JSON.parse(raw)
      const booking = pending.booking || pending
      const { error } = await supabase
        .from('bookings')
        .insert({ ...booking, requester_id: userId, status: booking.status || 'pending' })
      await AsyncStorage.removeItem('pendingBooking')
      if (!error) {
        Alert.alert(
          'Booking requested',
          `Your booking request has been sent to ${pending.providerName || 'the provider'}.`
        )
      } else {
        Alert.alert('Booking not sent', error.message)
      }
    } catch (error) {
      console.log('Error posting pending booking:', error)
    }
  }

  function handleOnboardingComplete() {
    setShowOnboarding(false)
    if (profile?.id) fetchBadgeCounts(profile.id, profile)
  }

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setShowOnboarding(data?.onboarding_completed === false)
    setLoading(false)
    updateLastSeen()
    fetchBadgeCounts(userId, data)
  }

  async function fetchBadgeCounts(userId, prof) {
    try {
      const role = prof?.primary_role || prof?.role || 'requester'
      let activityCount = 0

      if (role === 'requester' || role === 'both') {
        const { data: jobs } = await supabase
          .from('jobs').select('id').eq('requester_id', userId).eq('status', 'open')
        if (jobs?.length > 0) {
          const { count: c } = await supabase
            .from('bids')
            .select('id', { count: 'exact', head: true })
            .in('job_id', jobs.map(j => j.id))
            .eq('status', 'pending')
          activityCount += (c || 0)
        }
      }

      if (role === 'provider' || role === 'both') {
        const { count: c } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('provider_id', userId)
          .eq('status', 'pending')
        activityCount += (c || 0)
      }

      // Unread notifications (Q&A replies, etc.)
      try {
        const { count: notifCount } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('read', false)
        activityCount += (notifCount || 0)
      } catch { /* notifications table may not exist yet */ }

      setActivityBadge(activityCount)

      // Tab badges: jobs and services posted in the last 24 hours by others
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [{ count: newJobs }, { count: newServices }] = await Promise.all([
        supabase.from('jobs').select('id', { count: 'exact', head: true })
          .eq('status', 'open').gte('created_at', yesterday).neq('requester_id', userId),
        supabase.from('services').select('id', { count: 'exact', head: true })
          .eq('is_active', true).gte('created_at', yesterday).neq('provider_id', userId),
      ])
      setJobsBadge(newJobs || 0)
      setServicesBadge(newServices || 0)
    } catch (error) {
      console.log('Error fetching badge counts:', error)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <PostJobProvider>
      <NavigationContainer ref={navigationRef}>
        {session && showOnboarding
          ? <OnboardingApp profile={profile} onComplete={handleOnboardingComplete} />
          : session
            ? <AuthenticatedApp
                activityBadge={activityBadge}
                jobsBadge={jobsBadge}
                servicesBadge={servicesBadge}
                clearJobsBadge={() => setJobsBadge(0)}
                clearServicesBadge={() => setServicesBadge(0)}
              />
            : <GuestApp />
        }
      </NavigationContainer>
    </PostJobProvider>
  )
}
