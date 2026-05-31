import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { updateLastSeen } from '../lib/preferences'

// ─── Tab screens ──────────────────────────────────────────────────────────────
import HomeTabScreen     from '../screens/tabs/HomeTabScreen'
import BrowseTabScreen   from '../screens/tabs/BrowseTabScreen'
import ActivityTabScreen from '../screens/tabs/ActivityTabScreen'
import AccountTabScreen  from '../screens/tabs/AccountTabScreen'

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
import RegisterScreen         from '../screens/RegisterScreen'
import ForgotPasswordScreen   from '../screens/ForgotPasswordScreen'
import GuestJobFeedScreen     from '../screens/GuestJobFeedScreen'
import GuestJobDetailScreen   from '../screens/GuestJobDetailScreen'

const GuestStack     = createNativeStackNavigator()
const OnboardingNav  = createNativeStackNavigator()
const Tab            = createBottomTabNavigator()
const HomeNav        = createNativeStackNavigator()
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
      <HomeNav.Screen name="BookingConfirm"      component={BookingConfirmScreen}     />
      <HomeNav.Screen name="RequesterProfile"    component={RequesterProfileScreen}   />
      <HomeNav.Screen name="ProviderProfile"     component={ProviderProfileScreen}    />
      <HomeNav.Screen name="ReviewsList"         component={ReviewsListScreen}        />
      <HomeNav.Screen name="LocationPicker"      component={LocationPickerScreen}     />
      <HomeNav.Screen name="AreaTracer"          component={AreaTracerScreen}         />
      <HomeNav.Screen name="JobMap"              component={JobMapScreen}             />
    </HomeNav.Navigator>
  )
}

function BrowseStackNav() {
  return (
    <BrowseNav.Navigator screenOptions={STACK_OPTS}>
      <BrowseNav.Screen name="BrowseMain"    component={BrowseTabScreen}     />
      <BrowseNav.Screen name="JobFeed"      component={JobFeedScreen}       />
      <BrowseNav.Screen name="JobDetail"     component={JobDetailScreen}     />
      <BrowseNav.Screen name="ServiceDetail" component={ServiceDetailScreen} />
      <BrowseNav.Screen name="BookingConfirm" component={BookingConfirmScreen} />
      <BrowseNav.Screen name="CreateService"   component={CreateServiceScreen}    />
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
      <ActivityNav.Screen name="MyJobs"        component={MyJobsScreen}        />
      <ActivityNav.Screen name="JobDetail"     component={JobDetailScreen}     />
      <ActivityNav.Screen name="Chat"          component={ChatScreen}          />
      <ActivityNav.Screen name="ServiceDetail"      component={ServiceDetailScreen}    />
      <ActivityNav.Screen name="BookingConfirm"     component={BookingConfirmScreen}   />
      <ActivityNav.Screen name="RequesterProfile"   component={RequesterProfileScreen} />
      <ActivityNav.Screen name="ProviderProfile"    component={ProviderProfileScreen}  />
      <ActivityNav.Screen name="ReviewsList"        component={ReviewsListScreen}      />
      <ActivityNav.Screen name="JobMap"             component={JobMapScreen}           />
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
      <AccountNav.Screen name="ProviderProfile" component={ProviderProfileScreen} />
      <AccountNav.Screen name="ReviewsList"     component={ReviewsListScreen}     />
    </AccountNav.Navigator>
  )
}

// ─── Custom tab bar ───────────────────────────────────────────────────────────
const TAB_DEFS = [
  { name: 'Home',     label: 'Home'     },
  { name: 'Browse',   label: 'Services' },
  { name: 'Activity', label: 'Activity' },
  { name: 'Account',  label: 'Account'  },
]

function TabIcon({ name, active, avatarUrl }) {
  const inactive = colors.textMuted
  const c = active ? colors.primary : inactive
  switch (name) {
    case 'Home':     return <Text style={{ fontSize: 22, color: c, lineHeight: 26 }}>⌂</Text>
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

function CustomTabBar({ state, navigation, activityBadge, browseBadge, clearBrowseBadge }) {
  const insets = useSafeAreaInsets()
  const { avatarUrl } = useUser()

  // Hide tab bar when a nested stack screen is shown (e.g. PostJob, ManageTask, etc.)
  const activeRoute = state.routes[state.index]
  const nestedStackIndex = activeRoute?.state?.index ?? 0
  if (nestedStackIndex > 0) return null

  return (
    <View style={[tabStyles.bar, { paddingBottom: insets.bottom, height: 60 + insets.bottom }]}>
      {state.routes.map((route, index) => {
        const tab      = TAB_DEFS[index]
        const isFocused = state.index === index
        const badge = route.name === 'Activity' ? activityBadge
          : route.name === 'Browse' ? browseBadge : 0

        return (
          <TouchableOpacity
            key={route.key}
            style={tabStyles.tab}
            onPress={() => {
              if (route.name === 'Browse') clearBrowseBadge?.()
              if (!isFocused) navigation.navigate(route.name)
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
function AuthenticatedApp({ activityBadge, browseBadge, clearBrowseBadge }) {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomTabBar {...props} activityBadge={activityBadge} browseBadge={browseBadge} clearBrowseBadge={clearBrowseBadge} />
      )}
      screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home"     component={HomeStackNav}     />
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
      <GuestStack.Screen name="Register"        component={RegisterScreen}       />
      <GuestStack.Screen name="ForgotPassword"  component={ForgotPasswordScreen} />
      <GuestStack.Screen name="GuestJobFeed"    component={GuestJobFeedScreen}   />
      <GuestStack.Screen name="GuestJobDetail"  component={GuestJobDetailScreen} />
      <GuestStack.Screen name="GuestPostJob"          component={PostJobStep1JobType}  />
      <GuestStack.Screen name="PostJobStep2Location" component={PostJobStep2Location} />
      <GuestStack.Screen name="PostJobStep3Details"  component={PostJobStep3Details}  />
      <GuestStack.Screen name="PostJobStep4Budget"   component={PostJobStep4Budget}   />
      <GuestStack.Screen name="PostJobStep5Review"   component={PostJobStep5Review}   />
      <GuestStack.Screen name="ServicesList"        component={BrowseTabScreen}      />
      <GuestStack.Screen name="ServiceDetail"   component={ServiceDetailScreen}  />
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
  const [browseBadge,      setBrowseBadge]      = useState(0)

  const sessionRef = useRef(null)
  const profileRef = useRef(null)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { profileRef.current = profile }, [profile])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) {
        await postPendingJobIfAny(session.user.id)
        await postPendingBookingIfAny(session.user.id)
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setActivityBadge(0)
        setBrowseBadge(0)
        setLoading(false)
      }
    })

    const appStateSub = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && sessionRef.current?.user?.id) {
        fetchBadgeCounts(sessionRef.current.user.id, profileRef.current)
      }
    })
    return () => appStateSub.remove()
  }, [])

  async function postPendingJobIfAny(userId) {
    try {
      const raw = await AsyncStorage.getItem('pendingJob')
      if (!raw) return
      const job = JSON.parse(raw)
      const { error } = await supabase
        .from('jobs').insert({ ...job, requester_id: userId, status: 'open' })
      await AsyncStorage.removeItem('pendingJob')
      if (!error) Alert.alert('Job posted!', 'Your job has been posted successfully.')
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

      // Browse badge: jobs + services posted in the last 24 hours by others
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const [{ count: newJobs }, { count: newServices }] = await Promise.all([
        supabase.from('jobs').select('id', { count: 'exact', head: true })
          .eq('status', 'open').gte('created_at', yesterday).neq('requester_id', userId),
        supabase.from('services').select('id', { count: 'exact', head: true })
          .eq('is_active', true).gte('created_at', yesterday).neq('provider_id', userId),
      ])
      setBrowseBadge((newJobs || 0) + (newServices || 0))
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
      <NavigationContainer>
        {session && showOnboarding
          ? <OnboardingApp profile={profile} onComplete={handleOnboardingComplete} />
          : session
            ? <AuthenticatedApp activityBadge={activityBadge} browseBadge={browseBadge} clearBrowseBadge={() => setBrowseBadge(0)} />
            : <GuestApp />
        }
      </NavigationContainer>
    </PostJobProvider>
  )
}
