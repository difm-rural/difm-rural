import React from 'react'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { colors } from '../theme/tokens'

export function openDateTimePicker({ value, mode = 'date', minimumDate, onSelect, onShow }) {
  if (Platform.OS === 'android') {
    DateTimePickerAndroid.open({
      value,
      mode,
      minimumDate,
      onChange: (event, selected) => {
        if (event.type === 'set' && selected) onSelect(selected)
      },
    })
    return
  }
  onShow()
}

export default function NativeDateTimePicker({ visible, value, mode = 'date', minimumDate, onSelect, onDone }) {
  if (!visible || Platform.OS !== 'ios') return null
  return (
    <View style={styles.picker}>
      <DateTimePicker
        value={value}
        mode={mode}
        minimumDate={minimumDate}
        display="spinner"
        onChange={(event, selected) => {
          if (event.type === 'set' && selected) onSelect(selected)
        }}
      />
      <TouchableOpacity style={styles.done} onPress={onDone} accessibilityRole="button">
        <Text style={styles.doneText}>Done</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  picker: { marginBottom: 10 },
  done: { alignSelf: 'flex-end', padding: 8 },
  doneText: { color: colors.primary, fontWeight: '700' },
})
