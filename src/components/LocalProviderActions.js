import React, {useState} from 'react'
import {Alert, Clipboard, Modal, ScrollView, Share, Text, TouchableOpacity, View} from 'react-native'
import {providerProfileUrl, PROVIDER_SHARE_MESSAGE} from '../../shared/trustedLocals'
import {colors} from '../theme/tokens'
import Icon from './Icon'

export function LocalAction({label,icon,onPress,disabled=false}){
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
  onPress={onPress} style={{flexDirection:'row',alignItems:'center',gap:5,paddingVertical:10,paddingRight:12}}>
  {icon&&<Icon name={icon} size={17} color={colors.primary}/>}
  <Text style={{color:colors.primary,fontWeight:'600'}}>{label}</Text>
 </TouchableOpacity>
}

export function LocalShare({providerId}){
 const [copy,setCopy]=useState(false)
 const url=providerProfileUrl(providerId)
 function copyLink(){
  try{Clipboard.setString(url);Alert.alert('Profile link copied')}
  catch{setCopy(true)}
 }
 async function share(){
  try{await Share.share({message:PROVIDER_SHARE_MESSAGE+'\n'+url})}
  catch{setCopy(true)}
 }
 return <View>
  <View style={{flexDirection:'row',flexWrap:'wrap'}}>
   <LocalAction label="Share profile" icon="share-outline" onPress={share}/>
   <LocalAction label="Copy link" onPress={copyLink}/>
  </View>
  {copy&&<Text selectable style={{color:colors.textPrimary,paddingBottom:10}} accessibilityLabel="Public profile link">{url}</Text>}
 </View>
}

export function LocalInvitePicker({person,jobs,failed,busy,onInvite,onPost,onClose}){
 return <Modal visible={!!person} transparent animationType="fade" onRequestClose={onClose}>
  <View style={{flex:1,backgroundColor:'rgba(0,0,0,.35)',justifyContent:'center',padding:20}}>
   <View accessibilityViewIsModal style={{backgroundColor:colors.white,borderRadius:12,padding:18,maxHeight:'80%'}}>
    <Text accessibilityRole="header" style={{fontSize:20,fontWeight:'700',color:colors.textPrimary}}>Invite to job</Text>
    <ScrollView>
     {failed?<Text accessibilityRole="alert">Could not load open jobs. Refresh My People and try again.</Text>
      :jobs.length===0?<Text>No eligible open jobs for this provider.</Text>
      :jobs.map(job=><LocalAction key={job.id} disabled={busy} label={job.title+(job.revision?' · Invite again':'')} onPress={()=>{
       Alert.alert('Send job invitation?', 'This provider can view the job and make an offer.', [
        {text:'Cancel',style:'cancel'},{text:'Send invitation',onPress:()=>onInvite(job)},
       ])
      }}/>)}
    </ScrollView>
    <LocalAction label="Post a job" disabled={busy} onPress={onPost}/>
    <LocalAction label="Close" disabled={busy} onPress={onClose}/>
   </View>
  </View>
 </Modal>
}
