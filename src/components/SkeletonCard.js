import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View } from 'react-native'

function SkeletonRect({ style }) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return <Animated.View style={[styles.rect, style, { opacity }]} />
}

export default function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <SkeletonRect style={styles.badge} />
        <SkeletonRect style={styles.price} />
      </View>
      <SkeletonRect style={styles.title} />
      <SkeletonRect style={styles.desc} />
      <SkeletonRect style={styles.descShort} />
      <SkeletonRect style={styles.footer} />
    </View>
  )
}

// A short list of skeleton cards — previews the shape of content while it
// loads, which reads as more intentional than a bare spinner.
export function SkeletonList({ count = 3, style }) {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  rect: { backgroundColor: '#d1d5db', borderRadius: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  badge: { width: 80, height: 22, borderRadius: 11 },
  price: { width: 70, height: 22 },
  title: { height: 20, width: '70%', marginBottom: 10 },
  desc: { height: 14, width: '100%', marginBottom: 6 },
  descShort: { height: 14, width: '60%', marginBottom: 14 },
  footer: { height: 14, width: '40%' },
})
