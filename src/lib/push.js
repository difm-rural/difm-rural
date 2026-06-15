import { Platform } from 'react-native'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { supabase } from './supabase'

// Show notifications even while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   false,
  }),
})

function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId ??
    null
  )
}

async function getExpoToken() {
  const projectId = getProjectId()
  const resp = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
  return resp.data
}

// Asks permission, fetches the Expo push token, and stores it for this user.
// Safe to call on every login — upsert-on-token reassigns the device to the
// current user, so a shared phone only pushes to whoever logged in last.
export async function registerForPushNotifications() {
  try {
    if (!Device.isDevice) return null // emulators without Play services can't receive push

    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (existing !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status
    }
    if (status !== 'granted') return null

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#2d6a4f',
      })
    }

    const token = await getExpoToken()
    if (!token) return null

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('device_push_tokens').upsert(
        { user_id: user.id, token, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      )
    }
    return token
  } catch (e) {
    console.log('push register error:', e?.message || e)
    return null
  }
}

// Best-effort removal of this device's token. Must run while still signed in
// (RLS), so call it before supabase.auth.signOut() if you want it removed.
export async function unregisterPushNotifications() {
  try {
    const token = await getExpoToken()
    if (token) await supabase.from('device_push_tokens').delete().eq('token', token)
  } catch { /* best effort */ }
}

// Fires when the user taps a push (app backgrounded or cold-started).
export function addPushResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback)
}
