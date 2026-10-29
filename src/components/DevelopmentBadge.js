import React from 'react'
import {Text, StyleSheet} from 'react-native'
import {SHOW_DEVELOPMENT_BADGE} from '../../shared/releaseStage'
export default function DevelopmentBadge(){
  if (!SHOW_DEVELOPMENT_BADGE) return null
  return <Text accessibilityLabel="Development version" style={styles.badge}> Dev </Text>
}
const styles=StyleSheet.create({badge:{fontSize:10,fontWeight:'700',color:'#744b08',backgroundColor:'#fff0c2',letterSpacing:0.5}})
