import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { placesAutocomplete, placeDetails } from '../lib/maps'
import { colors } from '../theme/tokens'

export default function AddressAutocomplete({
  onSelect,
  defaultValue,
  value,
  placeholder,
  autoFocus,
  onChangeText,
}) {
  const [query, setQuery]             = useState(value !== undefined ? value : (defaultValue || ''))
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading]         = useState(false)
  const [showList, setShowList]       = useState(false)

  // Sync when parent updates defaultValue (e.g. after DB load)
  useEffect(() => {
    if (value === undefined) setQuery(defaultValue || '')
  }, [defaultValue, value])

  // Sync when controlled value changes externally (e.g. GPS reverse geocode)
  useEffect(() => {
    if (value !== undefined) setQuery(value)
  }, [value])

  async function fetchSuggestions(text) {
    setQuery(text)
    onChangeText?.(text)
    if (text.length < 3) {
      setSuggestions([])
      setShowList(false)
      return
    }
    setLoading(true)
    try {
      const predictions = await placesAutocomplete(text)
      setSuggestions(predictions)
      setShowList(predictions.length > 0)
    } catch {
      setSuggestions([])
      setShowList(false)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(prediction) {
    setQuery(prediction.description)
    setShowList(false)
    setSuggestions([])
    try {
      const data = await placeDetails(prediction.place_id)

      onSelect({
        address:   prediction.description,
        latitude:  data.latitude  || null,
        longitude: data.longitude || null,
      })
    } catch {
      onSelect({ address: prediction.description })
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          placeholder={placeholder || 'Start typing your address...'}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={fetchSuggestions}
          autoCorrect={false}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel="Address search"
        />
        {loading && (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
        )}
      </View>

      {showList && suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((item, index) => (
            <TouchableOpacity
              key={item.place_id}
              style={[
                styles.listRow,
                index < suggestions.length - 1 && styles.listRowBorder,
              ]}
              onPress={() => handleSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={`Use address ${item.description}`}>
              <Text style={styles.listRowText} numberOfLines={2}>
                {item.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { zIndex: 999, elevation: 999 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    paddingVertical: 12,
  },
  list: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 1000,
    elevation: 1000,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    maxHeight: 220,
    overflow: 'hidden',
  },
  listRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  listRowText:   { fontSize: 14, color: colors.textPrimary, lineHeight: 19 },
})
