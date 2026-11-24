import React,{useCallback,useState} from 'react'
import {Text,TouchableOpacity,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {LocalAction} from './LocalProviderActions'
import {supabase} from '../lib/supabase'
import {jobStatusLabel} from '../lib/lifecycle'
import {loadPropertyJobs,propertyJobChoices,propertyLinkedJobs,propertyJobDate,setPropertyJob} from '../../shared/propertyNetworkJobs'
import {colors,spacing,touchTarget} from '../theme/tokens'

function JobAction({label,onPress,disabled=false}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
  style={{minHeight:touchTarget.minHeight,justifyContent:'center',paddingVertical:spacing.sm}}>
  <Text style={{color:colors.primary,fontWeight:'600',flexShrink:1}}>{label}</Text>
 </TouchableOpacity>
}

export default function PropertyAreaJobs({owner,area,navigation}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[open,setOpen]=useState(false),[limit,setLimit]=useState(20)
 const load=useCallback(async()=>{setError('');try{setData(await loadPropertyJobs(supabase,owner))}catch{setError('Could not load linked jobs. Try again.')}},[owner])
 useFocusEffect(useCallback(()=>{let active=true;setData(null);setError('');loadPropertyJobs(supabase,owner).then(rows=>{if(active)setData(rows)}).catch(()=>{if(active)setError('Could not load linked jobs. Try again.')});return()=>{active=false}},[owner]))
 async function change(job,linked){if(busy)return;setBusy(true);setError('');try{await setPropertyJob(supabase,owner,area,job,linked);await load();if(linked)setOpen(false)}catch{setError('Could not update this job link. Try again.')}finally{setBusy(false)}}
 const linked=data?propertyLinkedJobs(data.jobs,data.links,area):[],choices=data?propertyJobChoices(data.jobs,data.links,area):[]
 return <View style={{marginVertical:spacing.lg,gap:spacing.sm}}>
  <Text accessibilityRole="header" style={{fontSize:18,fontWeight:'700',color:colors.textPrimary}}>Jobs for this area</Text>
  <Text>Link jobs you posted to this area. Job details and history stay in Jobs.</Text>
  {!!error&&<><Text accessibilityRole="alert">{error}</Text><LocalAction label="Retry jobs" onPress={load}/></>}
  {!data&&!error&&<Text>Loading jobs…</Text>}
  {data&&!linked.length&&<Text>No jobs linked to this area yet.</Text>}
  {linked.map(job=><View key={job.id}>
   <JobAction label={job.title} onPress={()=>navigation.navigate('JobDetail',{job})}/>
   <Text>{jobStatusLabel(job.status)} · {propertyJobDate(job)}{job.provider?' · '+job.provider:''}</Text>
   <JobAction label={'Remove job link: '+job.title} disabled={busy} onPress={()=>change(job,false)}/>
  </View>)}
  {data&&<LocalAction label={open?'Close job selection':'Link an existing job'} onPress={()=>setOpen(value=>!value)}/>}
  {open&&<View><Text>Choose one of your active or completed jobs. No category is assigned automatically.</Text>
   {!choices.length&&<Text>No more active or completed jobs to link.</Text>}
   {choices.slice(0,limit).map(job=><View key={job.id}><JobAction label={'Link '+job.title} disabled={busy} onPress={()=>change(job,true)}/><Text>{jobStatusLabel(job.status)} · {propertyJobDate(job)}{job.provider?' · '+job.provider:''}</Text></View>)}
   {choices.length>limit&&<LocalAction label="Show more jobs" onPress={()=>setLimit(value=>value+20)}/>}
  </View>}
 </View>
}
