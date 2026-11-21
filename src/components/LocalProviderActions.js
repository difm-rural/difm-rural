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

// Share or copy a provider's public profile link. Returns false when the
// device could not do it, so the caller can show the link to copy by hand.
export async function shareProviderProfile(providerId){
 try{await Share.share({message:PROVIDER_SHARE_MESSAGE+'\n'+providerProfileUrl(providerId)});return true}
 catch{return false}
}
export function copyProviderLink(providerId){
 try{Clipboard.setString(providerProfileUrl(providerId));Alert.alert('Profile link copied');return true}
 catch{return false}
}

export function LocalShare({providerId}){
 const [copy,setCopy]=useState(false)
 const url=providerProfileUrl(providerId)
 return <View>
  <View style={{flexDirection:'row',flexWrap:'wrap'}}>
   <LocalAction label="Share profile" icon="share-outline" onPress={async()=>{if(!await shareProviderProfile(providerId))setCopy(true)}}/>
   <LocalAction label="Copy link" onPress={()=>{if(!copyProviderLink(providerId))setCopy(true)}}/>
  </View>
  {copy&&<Text selectable style={{color:colors.textPrimary,paddingBottom:10}} accessibilityLabel="Public profile link">{url}</Text>}
 </View>
}

// Compact "More" menu for a provider's secondary actions.
// actions: [{label, icon, onPress, destructive?, disabled?}]
export function LocalMoreMenu({title,actions}){
 const [open,setOpen]=useState(false)
 return <>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel={'More actions for '+title} hitSlop={{top:8,bottom:8,left:8,right:8}}
   onPress={()=>setOpen(true)} style={{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'}}>
   <Icon name="ellipsis-horizontal" size={22} color={colors.primary}/>
  </TouchableOpacity>
  <Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}>
   <TouchableOpacity accessible={false} activeOpacity={1} onPress={()=>setOpen(false)}
    style={{flex:1,backgroundColor:'rgba(0,0,0,.35)',justifyContent:'flex-end'}}>
    <View accessibilityViewIsModal style={{backgroundColor:colors.white,borderTopLeftRadius:16,borderTopRightRadius:16,padding:18,paddingBottom:28}}>
     <Text accessibilityRole="header" numberOfLines={2} style={{fontSize:17,fontWeight:'700',color:colors.textPrimary,marginBottom:4}}>{title}</Text>
     {actions.map(action=><TouchableOpacity key={action.label} accessibilityRole="button" accessibilityState={{disabled:!!action.disabled}}
      disabled={action.disabled} onPress={()=>{setOpen(false);action.onPress()}}
      style={{flexDirection:'row',alignItems:'center',gap:10,minHeight:48,opacity:action.disabled?.5:1}}>
      {action.icon&&<Icon name={action.icon} size={19} color={action.destructive?colors.danger:colors.primary}/>}
      <Text style={{fontSize:15,fontWeight:'600',color:action.destructive?colors.danger:colors.textPrimary}}>{action.label}</Text>
     </TouchableOpacity>)}
     <TouchableOpacity accessibilityRole="button" onPress={()=>setOpen(false)} style={{minHeight:48,justifyContent:'center'}}>
      <Text style={{fontSize:15,fontWeight:'600',color:colors.textSecondary}}>Cancel</Text>
     </TouchableOpacity>
    </View>
   </TouchableOpacity>
  </Modal>
 </>
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
