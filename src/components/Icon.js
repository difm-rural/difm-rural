import React from 'react'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme/tokens'

// Single place the app's icon set is chosen. Use semantic Ionicons names
// (https://icons.expo.fyi/Index — set "Ionicons"), e.g. "chevron-forward",
// "location-outline", "chatbubble-outline", "camera-outline", "star".
// Swapping icon libraries later means changing only this file.
export default function Icon({ name, size = 22, color = colors.textPrimary, style }) {
  return <Ionicons name={name} size={size} color={color} style={style} />
}
