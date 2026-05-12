import React, { useRef } from 'react'
import { Animated, Pressable } from 'react-native'

export default function PressableCard({ style, children, onPress, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current

  return (
    <Pressable
      onPressIn={() => {
        Animated.spring(scale, { toValue: 0.97, damping: 20, stiffness: 300, useNativeDriver: true }).start()
      }}
      onPressOut={() => {
        Animated.spring(scale, { toValue: 1.0, damping: 20, stiffness: 300, useNativeDriver: true }).start()
      }}
      onPress={onPress}
      {...rest}>
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  )
}
