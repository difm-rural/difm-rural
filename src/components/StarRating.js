import React from 'react'
import { Text } from 'react-native'
import { colors } from '../theme/tokens'

// Presentational star rating, e.g. ★★★★☆ for 4. `style` can tweak size/margins.
export default function StarRating({ rating = 0, style }) {
  const r = Math.max(0, Math.min(5, Math.round(rating || 0)))
  return (
    <Text style={[{ fontSize: 13, color: colors.amber }, style]}>
      {'★'.repeat(r)}{'☆'.repeat(5 - r)}
    </Text>
  )
}
