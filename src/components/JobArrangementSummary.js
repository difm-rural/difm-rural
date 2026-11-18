import React from 'react'
import {Text,View} from 'react-native'
import {agreedJobDetails} from '../../shared/agreedJobDetails'
import {colors} from '../theme/tokens'

export function JobArrangementSummary({arrival,duration}){
 const details=agreedJobDetails(arrival,duration)
 if(!details.arrival&&!details.duration)return null
 return <View style={{backgroundColor:colors.white,padding:16,borderRadius:12,gap:6,marginBottom:12}}>
  <Text accessibilityRole="header" style={{color:colors.textPrimary,fontSize:18,fontWeight:'700'}}>Agreed arrangements</Text>
  {details.arrival&&<Text style={{color:colors.textPrimary}}>Arrival: {details.arrival}</Text>}
  {details.duration&&<Text style={{color:colors.textPrimary}}>Estimated duration: {details.duration}</Text>}
 </View>
}

export function JobStatusNotice({children}){
 return <Text accessibilityLiveRegion="polite" style={{color:colors.white,backgroundColor:colors.primary,
   borderRadius:8,padding:10,marginTop:6,fontWeight:'700'}}>{children}</Text>
}
