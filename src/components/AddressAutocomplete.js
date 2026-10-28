import React, { useEffect, useRef, useState } from 'react'
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
  inline = false,
  onSelectingChange,
}) {
  const [query, setQuery]             = useState(value !== undefined ? value : (defaultValue || ''))
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading]         = useState(false)
  const [showList, setShowList]       = useState(false)
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const request = useRef(0), debounce = useRef(null)
  useEffect(() => () => { request.current++; clearTimeout(debounce.current); onSelectingChange?.(false) }, [onSelectingChange])

  // Sync when parent updates defaultValue (e.g. after DB load)
  useEffect(() => {
    if (value === undefined) setQuery(defaultValue || '')
  }, [defaultValue, value])

  // Sync when controlled value changes externally (e.g. GPS reverse geocode)
  useEffect(() => {
    if (value !== undefined) setQuery(value)
  }, [value])

  function fetchSuggestions(text) {
    const id = ++request.current
    clearTimeout(debounce.current)
    setQuery(text)
    onChangeText?.(text)
    setError(''); setSuggestions([]); setShowList(false)
    if (text.length < 3) {
      setSuggestions([])
      setShowList(false)
      setLoading(false); return
    }
    setLoading(true)
    debounce.current = setTimeout(async () => {
      try {
        const predictions = await placesAutocomplete(text)
        if (id !== request.current) return
        setSuggestions(predictions); setShowList(predictions.length > 0)
        if (!predictions.length) setError('No addresses found. Try a nearby town or enter the location manually.')
      } catch {
        if (id === request.current) setError('Could not load address suggestions. Check your connection and try again, or enter the location manually.')
      } finally { if (id === request.current) setLoading(false) }
    }, 300)
  }

  async function handleSelect(prediction) {
    if (selecting) return
    const id = ++request.current
    clearTimeout(debounce.current)
    setSelecting(true); onSelectingChange?.(true); setLoading(true); setError('')
    setQuery(prediction.description)
    onChangeText?.(prediction.description)
    setShowList(false)
    setSuggestions([])
    try {
      const data = await placeDetails(prediction.place_id)
      if (id !== request.current) return

      onSelect({
        address:   prediction.description,
        latitude:  data.latitude ?? null,
        longitude: data.longitude ?? null,
      })
    } catch {
      if (id === request.current) { setError('Could not locate this address. Choose it again to add a map pin, or continue with the location text only.'); onSelect({ address: prediction.description, latitude: null, longitude: null }) }
    } finally { if (id === request.current) { setSelecting(false); onSelectingChange?.(false); setLoading(false) } }
  }

  return (
    <View style={[styles.container, inline && styles.inlineContainer]}>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          placeholder={placeholder || 'Start typing your address...'}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={fetchSuggestions}
          autoCorrect={false}
          editable={!selecting}
          autoFocus={autoFocus}
          returnKeyType="search"
          accessibilityLabel="Address search"
        />
        {loading && (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
        )}
      </View>

      {showList && suggestions.length > 0 && (
        <View style={[styles.list, inline && styles.inlineList]}>
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
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { zIndex: 999, elevation: 999 },
  inlineContainer: { zIndex: 0, elevation: 0 },
  inlineList: { position: 'relative', top: 0, marginTop: 6, maxHeight: undefined, elevation: 0, shadowOpacity: 0 },
  error: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
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
