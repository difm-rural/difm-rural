import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { GOOGLE_MAPS_API_KEY } from '../lib/constants'
import { colors } from '../theme/tokens'

export default function AddressAutocomplete({
  onSelect,
  defaultValue,
  value,
  placeholder,
  autoFocus,
}) {
  const [query, setQuery]             = useState(value !== undefined ? value : (defaultValue || ''))
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading]         = useState(false)
  const [showList, setShowList]       = useState(false)

  // Sync when parent updates defaultValue (e.g. after DB load)
  useEffect(() => {
    setQuery(defaultValue || '')
  }, [defaultValue])

  // Sync when controlled value changes externally (e.g. GPS reverse geocode)
  useEffect(() => {
    if (value !== undefined) setQuery(value)
  }, [value])

  async function fetchSuggestions(text) {
    setQuery(text)
    if (text.length < 3) {
      setSuggestions([])
      setShowList(false)
      return
    }
    setLoading(true)
    try {
      const response = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          },
          body: JSON.stringify({
            input: text,
            includedRegionCodes: ['nz'],
            languageCode: 'en',
          }),
        }
      )
      const data = await response.json()

      if (data.suggestions) {
        const predictions = data.suggestions
          .map(s => ({
            place_id:    s.placePrediction?.placeId,
            description: s.placePrediction?.text?.text,
          }))
          .filter(p => p.place_id && p.description)
        setSuggestions(predictions)
        setShowList(predictions.length > 0)
      } else {
        setSuggestions([])
        setShowList(false)
      }
    } catch {
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(prediction) {
    setQuery(prediction.description)
    setShowList(false)
    setSuggestions([])
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${prediction.place_id}`,
        {
          headers: {
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'location,formattedAddress,displayName',
          },
        }
      )
      const data = await response.json()

      onSelect({
        address:   prediction.description,
        latitude:  data.location?.latitude  || null,
        longitude: data.location?.longitude || null,
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
          <FlatList
            data={suggestions}
            keyExtractor={item => item.place_id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => (
              <TouchableOpacity
                style={[
                  styles.listRow,
                  index < suggestions.length - 1 && styles.listRowBorder,
                ]}
                onPress={() => handleSelect(item)}>
                <Text style={styles.listRowText} numberOfLines={2}>
                  {item.description}
                </Text>
              </TouchableOpacity>
            )}
          />
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
