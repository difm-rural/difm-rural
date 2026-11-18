import React from 'react'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { colors } from '../theme/tokens'

// Single place the app's icon set is chosen. Use semantic Ionicons names
// (https://icons.expo.fyi/Index — set "Ionicons"), e.g. "chevron-forward",
// "location-outline", "chatbubble-outline", "camera-outline", "star".
// Where Ionicons has no matching glyph (e.g. a tree), prefix a
// MaterialCommunityIcons name with "mci:", e.g. "mci:tree-outline".
// Swapping icon libraries later means changing only this file.
export default function Icon({ name, size = 22, color = colors.textPrimary, style }) {
  if (typeof name === 'string' && name.startsWith('mci:'))
    return <MaterialCommunityIcons name={name.slice(4)} size={size} color={color} style={style} />
  return <Ionicons name={name} size={size} color={color} style={style} />
}
