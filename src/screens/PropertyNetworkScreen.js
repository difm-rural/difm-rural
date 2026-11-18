import React,{useCallback,useRef,useState} from 'react'
import {Alert,BackHandler,Image,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {LocalAction,LocalInvitePicker} from '../components/LocalProviderActions'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import {supabase} from '../lib/supabase'
import {fetchConnections} from '../lib/connections'
import {newJobId} from '../lib/draftId'
import {sendJobInvitation} from '../lib/invites'
import {colors} from '../theme/tokens'
import {loadInviteChoices,loadSavedProviders,providerInviteJobs,setProviderSaved} from '../../shared/trustedLocals'
import {loadPropertyMatches,matchLocality,propertyNeed} from '../../shared/propertyMatching'
import {
 PROPERTY_AREA_DESCRIPTIONS,PROPERTY_HUB_SIZE,PROPERTY_NODE_HEIGHT,PROPERTY_NODE_WIDTH,PROPERTY_SERVICE_STATES,propertyAreaStatus,filterPropertyProviders,discoverPropertyProviders,linkedPropertyProviders,loadPropertyNetwork,
 propertyAreas,propertyDiagramRatio,propertyJobCategory,propertyProviderName,propertyServiceTarget,propertySpokes,savePropertyService,setPropertyArea,setPropertyProvider,
} from '../../shared/propertyNetwork'

function AreaButton({area,selected,onPress,style,diagram=false}){
 const badges=propertyAreaStatus(area)
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
  accessibilityLabel={[area.label,...badges.map(badge=>badge.label)].join(', ')}
  style={[styles.areaButton,diagram?styles.diagramNode:styles.listNode,selected&&styles.selected,style]}>
  <Icon name={area.icon} size={22} color={selected?colors.white:colors.primary}/>
  <Text style={[styles.nodeLabel,diagram&&styles.diagramLabel,selected&&styles.selectedText]}>{area.label}</Text>
  {badges.map(badge=><Text key={badge.tone} style={[styles.badge,badge.tone==='linked'&&styles.linkedBadge,
   badge.tone==='gap'&&styles.gap,selected&&styles.selectedText]}>{badge.label}</Text>)}
 </TouchableOpacity>
}

function PropertyDiagram({areas,selected,onSelect,onOpenProperty}){
 const spots=propertySpokes(areas.length),ratio=propertyDiagramRatio(areas.length)
 const [size,setSize]=useState(0),hub=size*PROPERTY_HUB_SIZE/100
 return <View style={[styles.diagram,{aspectRatio:1/ratio}]} onLayout={event=>setSize(event.nativeEvent.layout.width)}>
  {size>0&&areas.map((area,index)=>{
   const point=spots[index],length=size*point.length/100,angle=point.angle*Math.PI/180
   return <View pointerEvents="none" key={area.id} style={{position:'absolute',
    left:size*.5 + length*.5*Math.cos(angle)-length/2,
    top:size*ratio*.5 + length*.5*Math.sin(angle)-1,
    width:length,height:2,transform:[{rotate:point.angle+'deg'}],
    flexDirection:'row',justifyContent:'space-between',
   }}>
    {area.hasProvider?<View style={{flex:1,height:3,backgroundColor:colors.primary}}/>
     :Array.from({length:9},(_,dash)=><View key={dash} style={{width:'7%',height:2,backgroundColor:'#72847a'}}/>)}
   </View>
  })}
  <TouchableOpacity style={[styles.centre,{width:hub,height:hub,borderRadius:hub/2,left:(size-hub)/2,top:(size*ratio-hub)/2}]} accessibilityRole="button" accessibilityLabel="My Property" onPress={onOpenProperty}><Icon name="home-outline" size={22} color={colors.white}/><Text style={styles.centreText}>My Property</Text></TouchableOpacity>
  {size>0&&areas.map((area,index)=>{
   const pt=spots[index],width=size*PROPERTY_NODE_WIDTH/100
   return <AreaButton key={area.id} diagram area={area} selected={area.id===selected} onPress={()=>onSelect(area.id)}
    style={{width,left:size*pt.x/100-width/2,top:size*ratio*pt.y/100-PROPERTY_NODE_HEIGHT/2}}/>
  })}
 </View>
}

export default function PropertyNetworkScreen({navigation,route}){
 const insets=useSafeAreaInsets()
 const [owner,setOwner]=useState(null)
 const [data,setData]=useState(null)
 const [error,setError]=useState('')
 const [feedback,setFeedback]=useState('')
 const [list,setList]=useState(false)
 const [selected,setSelected]=useState(route.params?.area || '')
 const [statusFor,setStatusFor]=useState('')
 const [matchKey,setMatchKey]=useState('')
 const [locality,setLocality]=useState('')
 const [region,setRegion]=useState('')
 const [widen,setWiden]=useState(false)
 const [matches,setMatches]=useState(null)
 const [matchBusy,setMatchBusy]=useState(false)
 const [matchError,setMatchError]=useState('')
 const matchRequest=useRef(0)
 const preferredLoaded=useRef(false)
 const [highlight,setHighlight]=useState(route.params?.area || '')
 const [serviceName,setServiceName]=useState('')
 const [providerSearch,setProviderSearch]=useState('')
 const [providerLimit,setProviderLimit]=useState(12)
 const [picker,setPicker]=useState('')
 const [groups,setGroups]=useState(null)
 const [providerError,setProviderError]=useState('')
 const [busy,setBusy]=useState(false)
 const [target,setTarget]=useState(null)
 const [choices,setChoices]=useState(null)
 const lock=useRef(false)
 const pickerRequest=useRef(0)
 const addingService=useRef(null)

 const load=useCallback(async()=>{
  try{
   const {data:auth,error:authError}=await supabase.auth.getUser()
   if(authError||!auth.user){setOwner(null);setData(null);throw new Error('Sign in again')}
   const id=auth.user.id
   const network=await loadPropertyNetwork(supabase,id)
   setOwner(id);setData(network)
   if(!preferredLoaded.current){
    preferredLoaded.current=true
    const {data:profile}=await supabase.from('profiles').select('region').eq('id',id).maybeSingle()
    setLocality(value=>value||matchLocality(profile?.region)||'')
   }
  }catch{setError('Could not load My Property Network. Try again.')}
 },[])
 useFocusEffect(useCallback(()=>{void load()},[load]))
 const areas=data?propertyAreas(data):[]
 const active=areas.filter(area=>area.active)
 const area=active.find(item=>item.id===selected)

 function selectArea(id){
  closeMatches()
  pickerRequest.current++
  setSelected(id);if(id)setHighlight(id);setPicker('');setStatusFor('');setServiceName('')
  navigation.setParams({area:id})
 }
 useFocusEffect(useCallback(()=>{
  if(!selected)return
  const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{selectArea('');return true})
  return ()=>subscription.remove()
 },[selected,navigation]))
 function browse({category,kind}){
  navigation.getParent()?.navigate('Browse',{screen:'BrowseMain',params:{category,kind}})
 }
 function post(person,category){
  setTarget(null)
  navigation.getParent()?.navigate('Jobs',{screen:'PostJob',params:person?{inviteProviderId:person.id,inviteProviderName:propertyProviderName(person)}:category?{prefill:{category}}:{}})
 }
 function closeMatches(){
  matchRequest.current++;setMatchKey('');setMatchBusy(false);setMatches(null)
 }
 async function findMatches(service,category){
  const request=++matchRequest.current
  setMatchKey(service.service_key);setMatches(null);setMatchError('')
  if(!matchLocality(locality)&&!(widen&&matchLocality(region))){setMatchBusy(false);return}
  setMatchBusy(true)
  try{
   const [saved,worked]=await Promise.all([loadSavedProviders(supabase,owner),fetchConnections(owner,'locals')])
   const result=await loadPropertyMatches(supabase,owner,propertyNeed(service,category),locality,widen?region:'',
    saved.map(person=>person.id),worked.flatMap(row=>row.person?[row.person.id]:[]))
   if(request===matchRequest.current)setMatches(result)
  }catch{if(request===matchRequest.current)setMatchError('Could not find providers. Try again.')}
  finally{if(request===matchRequest.current)setMatchBusy(false)}
 }
 async function mutate(action,message){
  if(lock.current)return false
  lock.current=true;setBusy(true);setError('');setFeedback('')
  try{await action();setFeedback(message);await load();return true}
  catch{setError('Could not save this change. Try again.');return false}
  finally{lock.current=false;setBusy(false)}
 }
 async function openPicker(service){
  const request=++pickerRequest.current
  setPicker(service.service_key);setGroups(null);setProviderError('');setProviderSearch('');setProviderLimit(12)
  try{
   const [saved,worked,discovered]=await Promise.all([
    loadSavedProviders(supabase,owner),fetchConnections(owner,'locals'),
    discoverPropertyProviders(supabase,owner,propertyServiceTarget(area,service).category,propertyServiceTarget(area,service).kind),
   ])
   if(request!==pickerRequest.current)return
   setGroups([{label:'Saved',people:saved},{label:'Worked together',people:worked.flatMap(row=>row.person?[row.person]:[])},
    {label:'Provider discovery',people:discovered}])
  }catch{if(request===pickerRequest.current)setProviderError('Could not load providers. Try again.')}
 }
 async function openInvite(person){
  if(lock.current)return
  lock.current=true;setBusy(true)
  try{setChoices(await loadInviteChoices(supabase,owner));setTarget(person)}
  catch{Alert.alert('Could not load open jobs','Check your connection and try again.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function invite(job){
  if(lock.current||!target)return
  lock.current=true;setBusy(true)
  try{
   const result=await sendJobInvitation(job.id,target.id,job.revision)
   if(result.error)throw result.error
   setTarget(null)
   Alert.alert('Invitation sent','The provider can view the job and make an offer.')
  }catch{Alert.alert('Invitation could not be sent','Check that the job is open and try again.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function addService(){
  const name=serviceName.trim()
  if(!name||!area)return
  const previous=addingService.current
  const key=previous?.area===area.id&&previous.name===name?previous.key:'custom-'+newJobId()
  addingService.current={area:area.id,name,key}
  const added=await mutate(()=>savePropertyService(supabase,owner,{area:area.id,service_key:key,name,status:null},true),'Service added.')
  if(added){addingService.current=null;setServiceName('')}
 }
 function profile(person){
  navigation.navigate('ProviderProfile',{providerId:person.id})
 }
 function openProperty(){
  Alert.alert('My Property','Map-based property setup is coming. You can manage your support areas in My Property Network.')
 }

 return <View style={[styles.screen,{paddingTop:insets.top}]}>
  <ScrollView style={area?{display:'none'}:undefined} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:insets.bottom+24}}>
   <LocalAction label="Back" icon="chevron-back" onPress={()=>navigation.goBack()}/>
   <Text accessibilityRole="header" style={styles.title}>My Property Network</Text>
   <Text style={styles.muted}>See who helps with your property and where you still need support.</Text>
   <View style={styles.row} accessibilityLabel="My Property">
    <Text style={[styles.nodeLabel,styles.viewButton]}>My Network</Text>
    <LocalAction label="My People" onPress={()=>navigation.navigate('Connections',{side:'locals',fromPropertyNetwork:true})}/>
   </View>
   {!area&&!!error&&<View><Text accessibilityRole="alert">{error}</Text><LocalAction label="Retry" onPress={()=>{setError('');void load()}}/></View>}
   {!area&&!!feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
   {!data&&!error&&<Loading label="Loading My Property Network…"/>}
   {data&&<>
    <View style={styles.row}>
     {['Diagram','List'].map(view=><TouchableOpacity key={view} accessibilityRole="button" accessibilityState={{selected:list===(view==='List')}}
      onPress={()=>setList(view==='List')} style={[styles.viewButton,list===(view==='List')&&styles.selected]}>
      <Text style={list===(view==='List')?styles.selectedText:styles.nodeLabel}>{view}</Text>
     </TouchableOpacity>)}
    </View>
    {list?<><LocalAction label="My Property" onPress={openProperty}/>
     {active.map(item=><AreaButton key={item.id} area={item} selected={item.id===highlight} onPress={()=>selectArea(item.id)}/>)}</>
     :<PropertyDiagram areas={active} selected={highlight} onSelect={selectArea} onOpenProperty={openProperty}/>}
    {!active.length&&<Text style={styles.muted}>Add a support area to get started.</Text>}
    <Text accessibilityRole="header" style={[styles.sectionTitle,styles.libraryHeading]}>Grow your network</Text>
    <Text style={styles.muted}>Add other areas where you may need help.</Text>
    {areas.filter(item=>!item.active).map(item=><TouchableOpacity key={item.id} style={styles.libraryTile}
     accessibilityRole="button" accessibilityLabel={'Add '+item.label} disabled={busy}
     onPress={()=>void mutate(()=>setPropertyArea(supabase,owner,item.id,true),item.label+' added.')}>
     <Icon name={item.icon} color={colors.primary} size={25}/>
     <View style={styles.libraryCopy}><Text style={styles.nodeLabel}>{item.label}</Text>
      <Text style={styles.muted}>{PROPERTY_AREA_DESCRIPTIONS[item.id]}</Text></View>
     <Icon name="add-circle-outline" color={colors.primary} size={24}/>
    </TouchableOpacity>)}
    {areas.every(item=>item.active)&&<Text style={styles.muted}>All support areas are in your network.</Text>}
   </>}
  </ScrollView>
  {area&&<ScrollView key={area.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:insets.bottom+24}}>
     <LocalAction label="Back to My Property Network" icon="chevron-back" onPress={()=>selectArea('')}/>
     <View style={styles.areaHeading}><Icon name={area.icon} size={32} color={colors.primary}/>
      <Text accessibilityRole="header" style={styles.title}>{area.label}</Text></View>
     <Text style={styles.muted}>{PROPERTY_AREA_DESCRIPTIONS[area.id]}</Text>
     {!!error&&<Text accessibilityRole="alert">{error}</Text>}
     {!!feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
     {area.services.map(service=>{
      const linked=linkedPropertyProviders(data,service)
      const category=propertyServiceTarget(area,service).category
      const postCategory=propertyJobCategory(area,service)
      return <View style={styles.service} key={service.service_key}>
       <Text accessibilityRole="header" style={styles.serviceTitle}>{service.name}</Text>
       <Text style={service.status==='needs_help'?styles.gap:styles.muted}>
        {service.status==='needs_help'?'Find help':service.status==='has_provider'&&linked.length?'Provider linked':PROPERTY_SERVICE_STATES[service.status]||'Not set up'}
       </Text>
       {!!linked.length&&<Text style={styles.muted}>{linked.map(propertyProviderName).join(', ')}</Text>}
       {(service.status==='needs_help'||matchKey===service.service_key)&&<LocalAction label={matchKey===service.service_key?'Close provider search':'Find local help'}
        onPress={()=>matchKey===service.service_key?closeMatches():findMatches(service,category)}/>}
       {matchKey===service.service_key&&<View style={styles.picker}>
        <Text accessibilityRole="header" style={styles.serviceTitle}>Find providers for {service.name}</Text>
        <Text style={styles.nodeLabel}>Town or locality</Text>
        <TextInput accessibilityLabel="Town or locality" style={styles.input} maxLength={70} value={locality} onChangeText={setLocality}/>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:widen}} style={styles.statusRow} onPress={()=>setWiden(value=>!value)}>
         <Icon name={widen?'checkbox-outline':'square-outline'} size={20} color={colors.primary}/>
         <Text style={styles.statusText}>Include a wider region</Text>
        </TouchableOpacity>
        {widen&&<><Text style={styles.nodeLabel}>Region</Text>
         <TextInput accessibilityLabel="Region" style={styles.input} maxLength={70} value={region} onChangeText={setRegion}/></>}
        <LocalAction label="Search providers" disabled={matchBusy||!(matchLocality(locality)||(widen&&matchLocality(region)))} onPress={()=>findMatches(service,category)}/>
        {matchBusy&&<Text accessibilityLiveRegion="polite">Finding providers…</Text>}
        {!!matchError&&<Text accessibilityRole="alert">{matchError}</Text>}
        {matches?.length===0&&<Text accessibilityLiveRegion="polite">No matching providers advertise services in the selected area. Try including a wider region.</Text>}
        {matches?.map(person=><View key={person.id} style={styles.service}>
         <View style={styles.row}>{person.avatar_url&&<Image source={{uri:person.avatar_url}} style={styles.matchAvatar}/>}
          <Text accessibilityRole="header" style={styles.serviceTitle}>{propertyProviderName(person)}</Text></View>
         <Text>{person.services.join(' · ')}</Text><Text style={styles.muted}>{person.reason}</Text>
         {!!person.rating&&<Text>{person.rating} out of 5 · {person.reviewCount} provider reviews</Text>}
         {(person.saved||person.worked)&&<Text>{[person.saved?'Saved':'',person.worked?'Worked together':''].filter(Boolean).join(' · ')}</Text>}
         <LocalAction label="View profile" onPress={()=>profile(person)}/>
         {!person.saved&&<LocalAction label="Save to My People" disabled={busy} onPress={async()=>{
          if(await mutate(()=>setProviderSaved(supabase,owner,person.id,true),'Saved to My People.'))
           setMatches(rows=>rows?.map(row=>row.id===person.id?{...row,saved:true}:row))
         }}/>}
         <LocalAction label={linked.some(row=>row.id===person.id)?'Added to Property Network':'Add to Property Network'}
          disabled={busy||linked.some(row=>row.id===person.id)} onPress={()=>void mutate(()=>setPropertyProvider(supabase,owner,service,person.id,true),'Provider linked.')}/>
         <LocalAction label="Invite to job" disabled={busy} onPress={()=>openInvite(person)}/>
        </View>)}
        <LocalAction label="Post a job" onPress={()=>post(null,postCategory)}/>
       </View>}
       <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:statusFor===service.service_key}}
        onPress={()=>{setPicker('');setStatusFor(statusFor===service.service_key?'':service.service_key)}} style={styles.disclosure}>
        <Text style={styles.actionText}>{statusFor===service.service_key?'Done':linked.length?'View or change provider':service.status?'Change support':'Set up'}</Text>
        <Icon name={statusFor===service.service_key?'chevron-up':'chevron-forward'} size={16} color={colors.primary}/>
       </TouchableOpacity>
       {statusFor===service.service_key&&<>
       <View accessibilityRole="radiogroup">{Object.entries(PROPERTY_SERVICE_STATES).map(([value,label])=>
        <TouchableOpacity key={value} accessibilityRole="radio" accessibilityState={{checked:value===service.status,disabled:busy}}
         disabled={busy} style={[styles.statusRow,value===service.status&&styles.statusSelected]}
         onPress={async()=>{
          if(value!==service.status&&!await mutate(()=>savePropertyService(supabase,owner,{...service,status:value}),'Support status saved.'))return
          if(value==='has_provider')void openPicker(service)
          else{pickerRequest.current++;setPicker('')}
         }}>
         <Icon name={value===service.status?'radio-button-on':'radio-button-off'} color={colors.primary} size={20}/>
         <Text style={styles.statusText}>{label}</Text>
        </TouchableOpacity>)}</View>
       {service.status==='needs_help'&&<LocalAction label="Post a job" onPress={()=>post(null,postCategory)}/>}
       {linked.map(person=><View key={person.id} style={styles.linked}>
        <LocalAction label={propertyProviderName(person)} onPress={()=>profile(person)}/>
        <View style={styles.row}><LocalAction label="Invite to job" disabled={busy} onPress={()=>openInvite(person)}/>
         <LocalAction label="Remove link" disabled={busy} onPress={()=>void mutate(()=>setPropertyProvider(supabase,owner,service,person.id,false),'Provider link removed.')}/></View>
       </View>)}
       {service.status==='has_provider'&&!linked.length&&<Text style={styles.muted}>No provider linked yet.</Text>}
       {service.status==='has_provider'&&<LocalAction label={picker===service.service_key?'Close provider chooser':'Link a provider'}
        icon="person-add-outline" disabled={busy} onPress={()=>picker===service.service_key?setPicker(''):openPicker(service)}/>}
       {picker===service.service_key&&<View style={styles.picker}>
        <Text style={styles.serviceTitle}>Choose a provider</Text>
        {groups&&<TextInput accessibilityLabel="Find by name or region" placeholder="Find by name or region"
         placeholderTextColor={colors.textSecondary} value={providerSearch} style={styles.input}
         onChangeText={value=>{setProviderSearch(value);setProviderLimit(12)}}/>}
        {providerError?<LocalAction label={providerError} onPress={()=>openPicker(service)}/>
         :!groups?<Text accessibilityLiveRegion="polite">Loading providers…</Text>
         :groups.map(group=>{
          const available=filterPropertyProviders(group.people,linked,providerSearch)
          return <View key={group.label} style={{marginTop:10}}>
           <Text accessibilityRole="header" style={styles.nodeLabel}>{group.label}</Text>
           {!available.length&&<Text style={styles.muted}>No providers to link here.</Text>}
           {available.slice(0,providerLimit).map(person=><View key={person.id} style={styles.row}>
            <LocalAction label={propertyProviderName(person)} onPress={()=>profile(person)}/>
            <LocalAction label="Link to service" disabled={busy} onPress={()=>void mutate(()=>setPropertyProvider(supabase,owner,service,person.id,true),'Provider linked.')}/>
           </View>)}
           {available.length>providerLimit&&<LocalAction label="Show more providers" onPress={()=>setProviderLimit(value=>value+12)}/>}
          </View>
         })}
        <LocalAction label="Browse more providers" onPress={()=>browse(propertyServiceTarget(area,service))}/>
       </View>}
       </>}
      </View>
     })}
     <Text style={styles.nodeLabel}>Custom service</Text>
     <TextInput accessibilityLabel="Custom service" style={styles.input} placeholder="e.g. Check the spring intake"
      placeholderTextColor={colors.textSecondary} value={serviceName} onChangeText={setServiceName} maxLength={80}/>
     <LocalAction label="Add service" icon="add" disabled={busy||!serviceName.trim()} onPress={addService}/>
     <LocalAction label="Remove support area" icon="remove-circle-outline" disabled={busy}
      onPress={async()=>{if(await mutate(()=>setPropertyArea(supabase,owner,area.id,false),area.label+' removed.'))selectArea('')}}/>
  </ScrollView>}
  <LocalInvitePicker person={target} jobs={target&&choices?providerInviteJobs(choices.jobs,choices.invites,target.id):[]}
   failed={!choices} busy={busy} onInvite={invite} onClose={()=>{if(!lock.current)setTarget(null)}} onPost={()=>post(target)}/>
 </View>
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:colors.background},
 title:{fontSize:26,fontWeight:'700',color:colors.textPrimary,marginBottom:6},
 sectionTitle:{fontSize:19,fontWeight:'700',color:colors.textPrimary},
 serviceTitle:{fontSize:16,fontWeight:'700',color:colors.textPrimary},
 muted:{color:colors.textSecondary,lineHeight:20},
 feedback:{color:colors.primaryDark,fontWeight:'700',marginBottom:8},
 row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
 viewButton:{padding:10,borderRadius:10,backgroundColor:colors.primaryLight},
 diagram:{alignSelf:'center',width:'100%',maxWidth:430,borderRadius:240,backgroundColor:colors.primaryLight,marginTop:12},
 centre:{position:'absolute',backgroundColor:colors.primaryDark,padding:6,justifyContent:'center',alignItems:'center'},
 centreText:{color:colors.white,textAlign:'center',fontWeight:'700'},
 areaButton:{backgroundColor:colors.white,borderRadius:14},
 diagramNode:{position:'absolute',minHeight:PROPERTY_NODE_HEIGHT,paddingHorizontal:3,paddingVertical:4,alignItems:'center',justifyContent:'center'},
 listNode:{gap:4,padding:12,marginTop:8},
 nodeLabel:{color:colors.textPrimary,fontWeight:'700'},
 selected:{backgroundColor:colors.primary},
 selectedText:{color:colors.white,fontWeight:'700'},
 disclosure:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:44,marginTop:5},
 service:{backgroundColor:colors.white,borderRadius:14,padding:14,marginTop:12},
 diagramLabel:{fontSize:12,textAlign:'center'},
 badge:{fontSize:11,fontWeight:'600',textAlign:'center',color:colors.textSecondary},
 linkedBadge:{color:colors.primaryDark},
 matchAvatar:{height:38,width:38,borderRadius:19},
 areaHeading:{flexDirection:'row',alignItems:'center',gap:10,marginTop:12},
 libraryHeading:{marginTop:20},
 libraryTile:{flexDirection:'row',alignItems:'center',padding:12,marginTop:8,gap:12,backgroundColor:colors.white,borderRadius:14},
 libraryCopy:{flex:1},
 actionText:{color:colors.primaryDark,fontWeight:'700'},
 statusRow:{minHeight:46,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,borderRadius:8},
 statusSelected:{backgroundColor:colors.primaryLight},
 statusText:{flex:1,color:colors.textPrimary},
 gap:{color:colors.jobInk,fontWeight:'700'},
 linked:{paddingLeft:12,marginBottom:8},
 picker:{padding:12,backgroundColor:colors.primaryLight,borderRadius:10},
 input:{marginTop:6,backgroundColor:colors.white,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:12,color:colors.textPrimary},
})
