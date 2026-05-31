import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
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

    const resized = await manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 400, height: 400 } }],
      { compress: 0.8, format: SaveFormat.JPEG }
    )

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

    return publicUrl
  } catch (err) {
    Alert.alert('Error', err.message || 'Could not upload photo.')
    return null
  }
}

export async function removeAvatar(userId) {
  await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
}
