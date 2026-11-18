import React,{useCallback,useRef,useState} from 'react'
import {Alert,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native'
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
import {loadInviteChoices,loadSavedProviders,providerInviteJobs} from '../../shared/trustedLocals'
import {
 PROPERTY_SERVICE_STATES,filterPropertyProviders,discoverPropertyProviders,linkedPropertyProviders,loadPropertyNetwork,
 propertyAreas,propertyProviderName,propertyServiceCategory,propertySpokes,savePropertyService,setPropertyArea,setPropertyProvider,
} from '../../shared/propertyNetwork'

function AreaButton({area,selected,onPress,style,diagram=false}){
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
  accessibilityLabel={area.label+(area.hasProvider?', providers linked':'')+(area.needsHelp?', needs support':'')}
  style={[styles.areaButton,diagram?styles.diagramNode:styles.listNode,selected&&styles.selected,style]}>
  <Icon name={area.icon} size={18} color={selected?colors.white:colors.primary}/>
  <Text style={[styles.nodeLabel,selected&&styles.selectedText]}>{area.label}{diagram&&area.needsHelp?' !':''}</Text>
  {!diagram&&<Text style={selected?styles.selectedText:styles.muted}>{area.hasProvider?'Providers linked':'No providers linked'}{area.needsHelp?' · Needs support':''}</Text>}
 </TouchableOpacity>
}

function PropertyDiagram({areas,selected,onSelect}){
 const spots=propertySpokes(areas.length)
 const [size,setSize]=useState(0)
 return <View style={styles.diagram} onLayout={event=>setSize(event.nativeEvent.layout.width)}>
  {size>0&&areas.map((area,index)=>{
   const point=spots[index],length=size*.36,angle=point.angle*Math.PI/180
   return <View pointerEvents="none" key={area.id} style={{position:'absolute',
    left:size*.5 + length*.5*Math.cos(angle)-length/2,
    top:size*.5 + length*.5*Math.sin(angle)-1,
    width:length,height:2,transform:[{rotate:point.angle+'deg'}],
    flexDirection:'row',justifyContent:'space-between',
   }}>
    {area.hasProvider?<View style={{flex:1,height:3,backgroundColor:colors.primary}}/>
     :Array.from({length:9},(_,dash)=><View key={dash} style={{width:'7%',height:2,backgroundColor:'#72847a'}}/>)}
   </View>
  })}
  <View style={styles.centre}><Text style={styles.centreText}>My Property</Text></View>
  {size>0&&areas.map((area,index)=>{
   const pt=spots[index],width=size*.22
   return <AreaButton key={area.id} diagram area={area} selected={area.id===selected} onPress={()=>onSelect(area.id)}
    style={{width,left:size*pt.x/100-width/2,top:size*pt.y/100-25}}/>
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
 const [manage,setManage]=useState(false)
 const [selected,setSelected]=useState(route.params?.area || '')
 const [statusFor,setStatusFor]=useState('')
 const [serviceName,setServiceName]=useState('')
 const [providerSearch,setProviderSearch]=useState('')
 const [providerLimit,setProviderLimit]=useState(12)
 const [picker,setPicker]=useState('')
 const [groups,setGroups]=useState(null)
 const [providerError,setProviderError]=useState('')
 const [busy,setBusy]=useState(false)
 const [target,setTarget]=useState(null)
 const [choices,setChoices]=useState(null)
 const scroll=useRef(null)
 const serviceOffset=useRef(0)
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
  }catch{setError('Could not load My Property Network. Try again.')}
 },[])
 useFocusEffect(useCallback(()=>{void load()},[load]))
 const areas=data?propertyAreas(data):[]
 const active=areas.filter(area=>area.active)
 const area=active.find(item=>item.id===selected)||active[0]

 function selectArea(id){
  pickerRequest.current++
  setSelected(id);setPicker('');setStatusFor('');setServiceName('')
  navigation.setParams({area:id})
  requestAnimationFrame(()=>scroll.current?.scrollTo({y:serviceOffset.current,animated:false}))
 }
 function browse(category){
  navigation.getParent()?.navigate('Browse',{screen:'BrowseMain',params:{category}})
 }
 function post(person){
  setTarget(null)
  navigation.getParent()?.navigate('Jobs',{screen:'PostJob',params:person?{inviteProviderId:person.id,inviteProviderName:propertyProviderName(person)}:{}})
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
    discoverPropertyProviders(supabase,owner,propertyServiceCategory(area,service)),
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

 return <View style={[styles.screen,{paddingTop:insets.top}]}>
  <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:insets.bottom+24}}>
   <LocalAction label="Back" icon="chevron-back" onPress={()=>navigation.goBack()}/>
   <Text accessibilityRole="header" style={styles.title}>My Property Network</Text>
   <Text style={styles.muted}>See who helps with your property and where you still need support.</Text>
   <LocalAction label="My Locals" onPress={()=>navigation.navigate('Connections',{side:'locals'})}/>
   {!!error&&<View><Text accessibilityRole="alert">{error}</Text><LocalAction label="Retry" onPress={()=>{setError('');void load()}}/></View>}
   {!!feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
   {!data&&!error&&<Loading label="Loading My Property Network…"/>}
   {data&&<>
    <View style={styles.row}>
     {['Diagram','List'].map(view=><TouchableOpacity key={view} accessibilityRole="button" accessibilityState={{selected:list===(view==='List')}}
      onPress={()=>setList(view==='List')} style={[styles.viewButton,list===(view==='List')&&styles.selected]}>
      <Text style={list===(view==='List')?styles.selectedText:styles.nodeLabel}>{view}</Text>
     </TouchableOpacity>)}
    </View>
    {active.length===0?<Text style={styles.muted}>Add a support area to get started.</Text>
     :list?active.map(item=><AreaButton key={item.id} area={item} selected={item.id===area?.id} onPress={()=>selectArea(item.id)}/>)
     :<><PropertyDiagram areas={active} selected={area?.id} onSelect={selectArea}/>
       <Text style={styles.legend}>Solid lines show linked providers. ! marks an area needing support.</Text></>}
    <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:manage}}
     onPress={()=>setManage(value=>!value)} style={styles.disclosure}>
     <Text style={styles.sectionTitle}>Manage support areas</Text>
     <Icon name={manage?'chevron-up':'chevron-down'} size={18} color={colors.primary}/>
    </TouchableOpacity>
    {manage&&areas.map(item=><LocalAction key={item.id} label={(item.active?'Hide ':'Add ')+item.label}
     icon={item.active?'checkmark-circle-outline':'add-circle-outline'} disabled={busy}
     onPress={()=>void mutate(()=>setPropertyArea(supabase,owner,item.id,!item.active),item.active?'Support area hidden.':'Support area added.')}/>)}
    {area&&<View onLayout={event=>{serviceOffset.current=event.nativeEvent.layout.y}} style={{marginTop:14}}>
     <Text accessibilityRole="header" style={styles.sectionTitle}>{area.label}</Text>
     <Text style={styles.muted}>Choose what support you need for each service.</Text>
     {area.services.map(service=>{
      const linked=linkedPropertyProviders(data,service)
      return <View style={styles.service} key={service.service_key}>
       <Text accessibilityRole="header" style={styles.serviceTitle}>{service.name}</Text>
       <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:statusFor===service.service_key}}
        onPress={()=>setStatusFor(statusFor===service.service_key?'':service.service_key)} style={styles.disclosure}>
        <Text style={styles.nodeLabel}>{PROPERTY_SERVICE_STATES[service.status] || 'Choose a status'}</Text>
        <Icon name="chevron-down" size={16} color={colors.primary}/>
       </TouchableOpacity>
       {statusFor===service.service_key&&Object.entries(PROPERTY_SERVICE_STATES).map(([value,label])=>
        <LocalAction key={value} label={label} icon={value===service.status?'checkmark':''} disabled={busy}
         onPress={async()=>{if(await mutate(()=>savePropertyService(supabase,owner,{...service,status:value}),'Support status saved.'))setStatusFor('')}}/>)}
       {service.status==='needs_help'&&<View style={styles.row}>
        <Text style={styles.gap}>Needs support</Text>
        <LocalAction label="Find local help" onPress={()=>browse(propertyServiceCategory(area,service))}/>
        <LocalAction label="Post a job" onPress={()=>post(null)}/>
       </View>}
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
        <LocalAction label="Browse more providers" onPress={()=>browse(propertyServiceCategory(area,service))}/>
       </View>}
      </View>
     })}
     <Text style={styles.nodeLabel}>Custom service</Text>
     <TextInput accessibilityLabel="Custom service" style={styles.input} placeholder="e.g. Check the spring intake"
      placeholderTextColor={colors.textSecondary} value={serviceName} onChangeText={setServiceName} maxLength={80}/>
     <LocalAction label="Add service" icon="add" disabled={busy||!serviceName.trim()} onPress={addService}/>
    </View>}
   </>}
  </ScrollView>
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
 diagram:{alignSelf:'center',width:'100%',maxWidth:430,aspectRatio:1,borderRadius:240,backgroundColor:colors.primaryLight,marginTop:12},
 centre:{position:'absolute',left:'38%',top:'38%',width:'24%',height:'24%',borderRadius:80,backgroundColor:colors.primaryDark,padding:6,justifyContent:'center'},
 centreText:{color:colors.white,textAlign:'center',fontWeight:'700'},
 areaButton:{backgroundColor:colors.white,borderRadius:10},
 diagramNode:{position:'absolute',minHeight:50,paddingHorizontal:3,paddingVertical:4,alignItems:'center',justifyContent:'center'},
 listNode:{gap:4,padding:12,marginTop:8},
 nodeLabel:{color:colors.textPrimary,fontWeight:'700'},
 selected:{backgroundColor:colors.primary},
 selectedText:{color:colors.white,fontWeight:'700'},
 legend:{textAlign:'center',color:colors.textSecondary,marginTop:8,fontSize:13},
 disclosure:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:44,marginTop:5},
 service:{borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:colors.border,paddingVertical:14},
 gap:{color:colors.jobInk,fontWeight:'700'},
 linked:{paddingLeft:12,marginBottom:8},
 picker:{padding:12,backgroundColor:colors.primaryLight,borderRadius:10},
 input:{marginTop:6,backgroundColor:colors.white,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:12,color:colors.textPrimary},
})
