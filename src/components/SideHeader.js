import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../theme/tokens'
import Icon from './Icon'

// The amber (jobs) / blue (listings) market-side cue, shared across tab
// headers, flow headers (post a job, create a listing) and detail screens so
// the two sides read the same everywhere: a 5px full-bleed strip + icon + caps
// label, matching the Jobs/Listings tab headers.
//
//   kind     'job' | 'listing'
//   tone     'light' (default) → ink label for light headers;
//            'dark'            → on-dark label for coloured (green) headers.
//   topInset number | null — render a safe-area band (bg) above the strip; omit
//            when the parent already pads for the notch.
//   right    optional node rendered at the end of the label row.
//   pad      horizontal padding of the label row (default 20, matching tabs).
const KINDS = {
  job:     { icon: 'briefcase', strip: colors.jobIcon,     ink: colors.jobInk,     onDark: colors.jobIconOnDark,     fill: colors.jobFill,     tag: 'Job' },
  listing: { icon: 'pricetag',  strip: colors.listingIcon, ink: colors.listingInk, onDark: colors.listingIconOnDark, fill: colors.listingFill, tag: 'Listing' },
}

export default function SideHeader({ kind = 'job', label, tone = 'light', topInset = null, bg = colors.background, right = null, pad = 20, style }) {
  const c = KINDS[kind] || KINDS.job
  const labelColor = tone === 'dark' ? c.onDark : c.ink
  return (
    <View style={style}>
      {topInset != null ? (
        <View style={{ paddingTop: topInset, backgroundColor: bg }}>
          <View style={[styles.strip, { backgroundColor: c.strip }]} />
        </View>
      ) : (
        <View style={[styles.strip, { backgroundColor: c.strip }]} />
      )}
      <View style={[styles.row, { paddingHorizontal: pad }]}>
        <View style={styles.side}>
          <Icon name={c.icon} size={14} color={labelColor} />
          <Text style={[styles.label, { color: labelColor }]} accessibilityRole="header">{label}</Text>
        </View>
        {right}
      </View>
    </View>
  )
}

// Small inline pill matching the card side-tags (JobCard/ServiceListCard) — for
// the message-thread header, where a full strip would be too heavy.
export function KindTag({ kind = 'job', style }) {
  const c = KINDS[kind] || KINDS.job
  return (
    <View style={[styles.tag, { backgroundColor: c.fill }, style]}>
      <Text style={[styles.tagText, { color: c.ink }]}>{c.tag}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  strip:   { height: 5, width: '100%' },
  row:     { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, paddingTop: 12 },
  side:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label:   { fontSize: 12, letterSpacing: 1.5, fontWeight: '700', textTransform: 'uppercase' },
  tag:     { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagText: { fontSize: 11, fontWeight: '700' },
})
