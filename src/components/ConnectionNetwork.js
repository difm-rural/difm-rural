import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/tokens'
import { ConnectionAvatar } from './ConnectionAvatar'
import { categoryColor, primaryCategory } from '../lib/connections'

const GOLDEN = Math.PI * (3 - Math.sqrt(5)) // ~137.5° — phyllotaxis spacing
const MAX_NODES = 16
const MIN_NODE = 34
const MAX_NODE = 58

// Compute polar positions for each connection around the centre. Recency drives
// distance (recent = closer), strength drives node size, age drives line fade.
function layout(connections, size) {
  const cx = size / 2
  const cy = size / 2
  const nodes = connections.slice(0, MAX_NODES)
  const n = nodes.length

  const rInner = 72
  const rOuter = Math.max(rInner + 30, size / 2 - MAX_NODE / 2 - 22)

  const times = nodes.map(c => c.times_worked || 1)
  const maxTimes = Math.max(...times, 1)

  const ms = nodes.map(c => +new Date(c.last_engaged_at || 0))
  const newest = Math.max(...ms, 0)
  const oldest = Math.min(...ms, newest)

  return nodes.map((c, i) => {
    const radius = n <= 1 ? rInner : rInner + (rOuter - rInner) * Math.sqrt(i / (n - 1))
    const angle = i * GOLDEN - Math.PI / 2
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)

    const strength = maxTimes <= 1 ? 0.5 : ((c.times_worked || 1) - 1) / (maxTimes - 1)
    const dia = MIN_NODE + (MAX_NODE - MIN_NODE) * Math.sqrt(strength)

    const recency = newest === oldest ? 1 : (+new Date(c.last_engaged_at || 0) - oldest) / (newest - oldest)

    const category = primaryCategory(c.categories)

    return {
      conn: c,
      x,
      y,
      dia,
      category,
      color: categoryColor(category),
      lineLength: Math.hypot(x - cx, y - cy),
      lineAngle: angle,
      lineThickness: 1.5 + 3 * strength,
      lineOpacity: 0.22 + 0.5 * recency,
    }
  })
}

export default function ConnectionNetwork({ center, connections, onSelect, size }) {
  const cx = size / 2
  const cy = size / 2
  const nodes = useMemo(() => layout(connections, size), [connections, size])
  const rOuter = Math.max(102, size / 2 - MAX_NODE / 2 - 22)

  return (
    <View style={[styles.canvas, { width: size, height: size }]}>
      {/* Faint guide rings */}
      {[0.4, 0.7, 1].map(f => {
        const r = rOuter * f
        return (
          <View
            key={f}
            pointerEvents="none"
            style={[styles.ring, { left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: r }]}
          />
        )
      })}

      {/* Connecting lines (drawn under the nodes) */}
      {nodes.map((node, i) => (
        <View
          key={`line-${i}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx,
            top: cy - node.lineThickness / 2,
            width: node.lineLength,
            height: node.lineThickness,
            borderRadius: node.lineThickness / 2,
            backgroundColor: node.color,
            opacity: node.lineOpacity,
            transformOrigin: 'left center',
            transform: [{ rotateZ: `${node.lineAngle}rad` }],
          }}
        />
      ))}

      {/* Centre — you */}
      <View style={[styles.center, { left: cx - 34, top: cy - 34 }]} pointerEvents="none">
        <View style={styles.centerRing}>
          <ConnectionAvatar name={center?.name} avatarUrl={center?.avatarUrl} size={56} />
        </View>
        <View style={styles.youPill}><Text style={styles.youPillText}>You</Text></View>
      </View>

      {/* Provider nodes */}
      {nodes.map((node, i) => {
        const name = node.conn.provider?.full_name || 'Provider'
        const boxW = Math.max(node.dia + 10, 74)
        return (
          <TouchableOpacity
            key={node.conn.provider_id || i}
            activeOpacity={0.75}
            onPress={() => onSelect(node.conn)}
            style={{ position: 'absolute', left: node.x - boxW / 2, top: node.y - node.dia / 2, width: boxW, alignItems: 'center' }}
            accessibilityRole="button"
            accessibilityLabel={`${name}, worked together ${node.conn.times_worked || 1} times`}>
            <View style={[styles.nodeRing, { borderColor: node.color, borderRadius: node.dia / 2 }]}>
              <ConnectionAvatar name={name} avatarUrl={node.conn.provider?.avatar_url} size={node.dia - 6} />
            </View>
            <Text style={styles.nodeLabel} numberOfLines={1}>{name.split(' ')[0]}</Text>
            {!!node.category && (
              <Text style={[styles.nodeCat, { color: node.color }]} numberOfLines={1}>{node.category}</Text>
            )}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  canvas: { alignSelf: 'center', position: 'relative' },

  ring: { position: 'absolute', borderWidth: 1, borderColor: colors.border },

  center: { position: 'absolute', width: 68, alignItems: 'center' },
  centerRing: {
    borderWidth: 3,
    borderColor: colors.primary,
    borderRadius: 34,
    padding: 0,
  },
  youPill: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  youPillText: { color: colors.white, fontSize: 11, fontWeight: '700' },

  nodeRing: { borderWidth: 3, backgroundColor: colors.white },
  nodeLabel: { fontSize: 11, fontWeight: '600', color: colors.textPrimary, marginTop: 4, maxWidth: 74, textAlign: 'center' },
  nodeCat: { fontSize: 10, fontWeight: '600', marginTop: 1, maxWidth: 74, textAlign: 'center' },
})
