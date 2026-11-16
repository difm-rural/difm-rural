import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { AVATAR_MAX, shrinkPhoto } from './shrinkPhoto'
import { supabase } from './supabase'

export async function pickAndUploadAvatar(userId, useCamera) {
  try {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow access to continue.')
      return null
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.9 })

    if (result.canceled) return null

    // Square crop from the picker, scaled to at most 512px, always JPEG.
    const resized = await shrinkPhoto(result.assets[0], AVATAR_MAX, { jpeg: true })

    const response    = await fetch(resized.uri)
    const blob        = await response.blob()
    const arrayBuffer = await new Response(blob).arrayBuffer()

    const fileName = `avatar_${userId}_${Date.now()}.jpg`
    const filePath = `${userId}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) {
      Alert.alert('Upload failed', uploadError.message)
      return null
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath)

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', userId)

    if (profileError) {
      Alert.alert('Error saving photo', profileError.message)
      return null
    }

    // Remove the user's previous avatars so old files don't orphan in storage.
    try {
      const { data: existing } = await supabase.storage.from('avatars').list(userId)
      const stale = (existing || [])
        .filter(f => f.name !== fileName)
        .map(f => `${userId}/${f.name}`)
      if (stale.length > 0) await supabase.storage.from('avatars').remove(stale)
    } catch { /* best-effort cleanup — never block on it */ }

    return publicUrl
  } catch (err) {
    Alert.alert('Error', err.message || 'Could not upload photo.')
    return null
  }
}

export async function removeAvatar(userId) {
  await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
}
