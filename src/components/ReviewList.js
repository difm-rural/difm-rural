import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens'
import StarRating from './StarRating'

// A list of review rows (stars + comment). Renders `emptyText` when there are
// none, or nothing if no empty text is given.
export default function ReviewList({ reviews = [], emptyText }) {
  if (!reviews.length) {
    return emptyText ? <Text style={styles.empty}>{emptyText}</Text> : null
  }
  return (
    <>
      {reviews.map((r, i) => (
        <View key={i} style={styles.row}>
          <StarRating rating={r.rating} style={styles.stars} />
          {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}
        </View>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#f2f2f2' },
  stars: { marginBottom: 4 },
  comment: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  empty: { fontSize: 14, color: colors.textMuted, paddingHorizontal: 16, paddingBottom: 14 },
})
