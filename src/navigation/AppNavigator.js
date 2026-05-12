import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { colors } from '../theme/tokens'
import { updateLastSeen } from '../lib/preferences'
import LandingScreen from '../screens/LandingScreen'
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import GuestJobFeedScreen from '../screens/GuestJobFeedScreen'
import GuestJobDetailScreen from '../screens/GuestJobDetailScreen'
import PostTaskScreen from '../screens/PostTaskScreen'
import JobFeedScreen from '../screens/JobFeedScreen'
import MyJobsScreen from '../screens/MyJobsScreen'
import JobDetailScreen from '../screens/JobDetailScreen'
import ChatScreen from '../screens/ChatScreen'
import UnifiedDashboardScreen from '../screens/UnifiedDashboardScreen'
import ManageTaskScreen from '../screens/ManageTaskScreen'
import ProfileScreen from '../screens/ProfileScreen'

const Stack = createNativeStackNavigator()
const MainNav = createNativeStackNavigator()

export default function AppNavigator() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Tracks whether the guest post flow submitted a job so the dashboard
  // can redirect to MyJobs after login.
  const [guestJobPosted, setGuestJobPosted] = useState(false)

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
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setGuestJobPosted(false)
        setLoading(false)
      }
    })
  }, [])

  async function postPendingJobIfAny(userId) {
    try {
      const raw = await AsyncStorage.getItem('pendingJob')
      if (!raw) return
      const job = JSON.parse(raw)
      const { error } = await supabase.from('jobs').insert({
        ...job,
        requester_id: userId,
        status: 'open',
      })
      await AsyncStorage.removeItem('pendingJob')
      if (!error) {
        setGuestJobPosted(true)
        Alert.alert('Task Posted!', 'Your task has been posted successfully.')
      }
    } catch {
      // silently skip — the user can always re-post from the wizard
    }
  }

  async function fetchProfile(userId) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(data)
    setLoading(false)
    updateLastSeen()
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250 }}>
        {session ? (
          <>
            <Stack.Screen name="Main">
              {() => (
                <MainNav.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 250 }}>
                  <MainNav.Screen
                    name="Dashboard"
                    component={UnifiedDashboardScreen}
                    initialParams={{ guestPosted: guestJobPosted }}
                  />
                  <MainNav.Screen name="PostJob"    component={PostTaskScreen}    />
                  <MainNav.Screen name="ManageTask" component={ManageTaskScreen}  />
                  <MainNav.Screen name="MyJobs"     component={MyJobsScreen}      />
                  <MainNav.Screen name="JobDetail"  component={JobDetailScreen}   />
                  <MainNav.Screen name="JobFeed"    component={JobFeedScreen}     />
                  <MainNav.Screen name="Chat"       component={ChatScreen}        />
                  <MainNav.Screen name="Profile"    component={ProfileScreen}     />
                </MainNav.Navigator>
              )}
            </Stack.Screen>
          </>
        ) : (
          <>
            <Stack.Screen name="Landing"      component={LandingScreen}      />
            <Stack.Screen name="Login"        component={LoginScreen}        />
            <Stack.Screen name="Register"     component={RegisterScreen}     />
            <Stack.Screen name="GuestJobFeed" component={GuestJobFeedScreen} />
            <Stack.Screen name="GuestJobDetail" component={GuestJobDetailScreen} />
            <Stack.Screen name="GuestPostJob" component={PostTaskScreen}     />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
