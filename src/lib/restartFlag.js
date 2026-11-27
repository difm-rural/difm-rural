import AsyncStorage from '@react-native-async-storage/async-storage'

// Set just before the app restarts to apply an update, so the first screen
// can say "Restarting…" instead of a generic loading message. Read once, then
// cleared.
const KEY = 'rc:restarting-for-update'

export async function markRestartingForUpdate() {
  try { await AsyncStorage.setItem(KEY, '1') } catch { /* cosmetic only */ }
}

export async function takeRestartingFlag() {
  try {
    const value = await AsyncStorage.getItem(KEY)
    if (value) await AsyncStorage.removeItem(KEY)
    return value === '1'
  } catch {
    return false
  }
}
