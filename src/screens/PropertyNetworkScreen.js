import React,{useCallback,useRef,useState} from 'react'
import {Alert,BackHandler,Image,Linking,ScrollView,Share,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native'
import {useFocusEffect} from '@react-navigation/native'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {LocalAction,LocalInvitePicker} from '../components/LocalProviderActions'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import {withScreenBoundary} from '../components/ErrorBoundary'
import {supabase} from '../lib/supabase'
import {fetchConnections} from '../lib/connections'
import {newJobId} from '../lib/draftId'
import {sendJobInvitation} from '../lib/invites'
import {colors} from '../theme/tokens'
import {loadInviteChoices,loadSavedProviders,providerInviteJobs,setProviderSaved} from '../../shared/trustedLocals'
import {NZ_REGIONS,loadPropertyMatches,matchLocality,propertyNeed,regionForLocality,regionFromText} from '../../shared/propertyMatching'
import {placesAutocomplete} from '../lib/maps'
import {
 PROPERTY_AREA_DESCRIPTIONS,PROPERTY_HUB_SIZE,PROPERTY_NODE_HEIGHT,PROPERTY_NODE_WIDTH,SUPPORT_AREAS,filterPropertyProviders,discoverPropertyProviders,linkedPropertyProviders,loadPropertyNetwork,
 propertyAreas,propertyDiagramRatio,propertyJobCategory,propertyProviderName,propertyServiceTarget,propertySpokes,savePropertyService,setPropertyArea,setPropertyProvider,
 PROPERTY_CONTACT_LIMITS,createPropertyContact,deletePropertyContact,linkedPropertyContacts,propertyContactEmailHref,propertyContactFields,
 propertyContactInviteText,propertyContactPhoneHref,propertyContactServices,replacePropertyContact,setPropertyContact,updatePropertyContact,
 propertyAreaProgress,propertyAreaWho,propertyBulkServices,propertyChoiceStatus,propertyGaps,propertyServiceChoice,propertySetupStarted,
 propertyStatusAfterUnlink,propertyWhoMeStatus,savePropertyAreas,savePropertyServices,normalizePropertyNetwork,PROPERTY_STATUS_LABELS,PROPERTY_STATUS_ICONS,propertyNodeStatus,propertyToneIcon,propertyBulkLabel,propertyBulkMessage,
} from '../../shared/propertyNetwork'

const PROPERTY_CHOICES=[['sorted',PROPERTY_STATUS_LABELS.sorted],['help',PROPERTY_STATUS_LABELS.help],['na',PROPERTY_STATUS_LABELS.na]]

// Add or edit a private contact: someone who is not on Rural Connections.
function ContactForm({initial,busy,onSave,onCancel,onDelete}){
 const [fields,setFields]=useState({name:initial?.name||'',phone:initial?.phone||'',email:initial?.email||'',note:initial?.note||''})
 const [errors,setErrors]=useState({})
 const field=(key,label,props)=><View key={key} style={{marginTop:8}}>
  <Text style={styles.nodeLabel}>{label}</Text>
  <TextInput accessibilityLabel={label} style={styles.input} value={fields[key]} maxLength={PROPERTY_CONTACT_LIMITS[key]}
   onChangeText={value=>setFields(current=>({...current,[key]:value}))} {...props}/>
  {!!errors[key]&&<Text accessibilityRole="alert" style={styles.gap}>{errors[key]}</Text>}
 </View>
 function save(){
  const result=propertyContactFields(fields)
  setErrors(result.errors)
  if(result.valid)onSave(result.value)
 }
 return <View style={styles.picker}>
  <Text accessibilityRole="header" style={styles.serviceTitle}>{initial?'Edit '+initial.name:'Add someone not on Rural Connections'}</Text>
  <Text style={styles.muted}>Only you can see these details.</Text>
  {field('name','Name',{autoCapitalize:'words',textContentType:'name'})}
  {field('phone','Phone (optional)',{keyboardType:'phone-pad',textContentType:'telephoneNumber'})}
  {field('email','Email (optional)',{keyboardType:'email-address',autoCapitalize:'none',autoCorrect:false,textContentType:'emailAddress'})}
  {field('note','Note (optional)',{multiline:true})}
  <View style={styles.row}>
   <LocalAction label={initial?'Save contact':'Save and link'} disabled={busy} onPress={save}/>
   <LocalAction label="Cancel" onPress={onCancel}/>
   {onDelete&&<LocalAction label="Delete contact" icon="trash-outline" disabled={busy} onPress={onDelete}/>}
  </View>
 </View>
}

const NODE_TONE={help:colors.jobInk,unset:colors.textSecondary,sorted:colors.primaryDark,linked:colors.primaryDark}
// A diagram node: tapping it opens the area's service checklist.
function AreaButton({area,selected,onPress,style}){
 const lines=propertyNodeStatus(area)
 return <TouchableOpacity accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
  accessibilityLabel={[area.label,...lines.map(line=>line.label)].join(', ')} accessibilityHint="Opens the service checklist"
  style={[styles.areaButton,styles.diagramNode,lines[0].tone==='help'&&styles.nodeHelp,selected&&styles.selected,style]}>
  <Icon name={area.icon} size={20} color={selected?colors.white:colors.primary}/>
  <Text numberOfLines={2} style={[styles.nodeLabel,styles.diagramLabel,selected&&styles.selectedText]}>{area.label}</Text>
  {lines.map(line=><View key={line.tone} style={styles.nodeLine}>
   <Icon name={line.icon} size={11} color={selected?colors.white:NODE_TONE[line.tone]}/>
   <Text numberOfLines={1} style={[styles.badge,{flexShrink:1,color:NODE_TONE[line.tone]},selected&&styles.selectedText]}>{line.label}</Text>
  </View>)}
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
   return <AreaButton key={area.id} area={area} selected={area.id===selected} onPress={()=>onSelect(area.id)}
    style={{width,left:size*pt.x/100-width/2,top:size*ratio*pt.y/100-PROPERTY_NODE_HEIGHT/2}}/>
  })}
 </View>
}

function PropertyNetworkScreen({navigation,route}){
 const insets=useSafeAreaInsets()
 const [owner,setOwner]=useState(null)
 const [data,setData]=useState(null)
 const [error,setError]=useState('')
 const [feedback,setFeedback]=useState('')
 const [list,setList]=useState(true)
 const [selected,setSelected]=useState(route.params?.area || '')
 const [setupOpen,setSetupOpen]=useState(false)
 const [skipped,setSkipped]=useState(false)
 const [picks,setPicks]=useState([])
 const [pickerMode,setPickerMode]=useState('provider')
 const [addingOpen,setAddingOpen]=useState(false)
 const [matchKey,setMatchKey]=useState('')
 const [locality,setLocality]=useState('')
 const [region,setRegion]=useState('')
 const [widen,setWiden]=useState(false)
 const [regionHint,setRegionHint]=useState('')
 const [searched,setSearched]=useState(null)
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
 const [contactForm,setContactForm]=useState(null)
 const [replacing,setReplacing]=useState(null)
 const lock=useRef(false)
 const pickerRequest=useRef(0)
 const addingService=useRef(null)
 const addingContact=useRef(null)

 const load=useCallback(async()=>{
  try{
   const {data:auth,error:authError}=await supabase.auth.getUser()
   if(authError||!auth.user){setOwner(null);setData(null);throw new Error('Sign in again')}
   const id=auth.user.id
   const network=await loadPropertyNetwork(supabase,id)
   setOwner(id);setData(normalizePropertyNetwork(network))
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
  setSelected(id);if(id)setHighlight(id);setPicker('');setServiceName('');setAddingOpen(false);setContactForm(null);setReplacing(null);setSetupOpen(false)
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
 // Turning on the wider region fills it in when the locality names exactly one
 // region, directly or in the address suggestions for that place.
 async function toggleWiden(){
  const next=!widen
  setWiden(next);setRegionHint('')
  if(!next||region)return
  const place=matchLocality(locality)
  const direct=regionFromText(locality)
  if(direct){setRegion(direct);setRegionHint('Region filled in from '+place+'.');return}
  if(!place){setRegionHint('Choose the wider region to search.');return}
  try{
   const found=regionForLocality(place,await placesAutocomplete(place))
   if(found){setRegion(value=>value||found);setRegionHint('Region filled in from '+place+'. Change it if that is wrong.');return}
  }catch{}
  setRegionHint('Choose the wider region to search.')
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
   if(request===matchRequest.current){setMatches(result);setSearched({locality:matchLocality(locality),region:widen?matchLocality(region):''})}
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
  if(added){addingService.current=null;setServiceName('');setAddingOpen(false)}
 }
 async function saveContact(service,value){
  const editing=contactForm?.contact
  if(editing){
   if(await mutate(()=>updatePropertyContact(supabase,owner,editing.id,value),'Contact saved.'))setContactForm(null)
   return
  }
  const previous=addingContact.current
  const id=previous?.name===value.name?previous.id:newJobId()
  addingContact.current={id,name:value.name}
  if(await mutate(async()=>{
   await createPropertyContact(supabase,owner,id,value)
   await setPropertyContact(supabase,owner,service,id,true)
  },value.name+' added.')){addingContact.current=null;setContactForm(null);setPicker('')}
 }
 function deleteContact(contact){
  const count=propertyContactServices(data,contact.id).length
  Alert.alert('Delete '+contact.name+'?',count>1?'They will be removed from '+count+' services.':'They will be removed from My Property Network.',[
   {text:'Cancel',style:'cancel'},
   {text:'Delete',style:'destructive',onPress:async()=>{if(await mutate(()=>deletePropertyContact(supabase,owner,contact.id),'Contact deleted.'))setContactForm(null)}},
  ])
 }
 async function inviteContact(contact){
  try{await Share.share({message:propertyContactInviteText(contact)})}catch{}
 }
 function openContactLink(url){
  Linking.openURL(url).catch(()=>Alert.alert('Could not open','Check this device can make calls or send email.'))
 }
 function startReplace(service,contact){
  setContactForm(null);setReplacing(contact);setPickerMode('provider');openPicker(service)
 }
 async function replaceContact(person){
  const contact=replacing,count=propertyContactServices(data,contact.id).length
  if(await mutate(()=>replacePropertyContact(supabase,contact.id,person.id),
   propertyProviderName(person)+' now covers '+(count===1?'this service':count+' services')+' instead of '+contact.name+'.')){
   setReplacing(null);setPicker('')
  }
 }
 function profile(person){
  navigation.navigate('ProviderProfile',{providerId:person.id})
 }
 function openProperty(){
  navigation.navigate('PropertyMap')
 }

 // ---- Simpler setup -------------------------------------------------------
 const started=data?propertySetupStarted(data):false
 const showSetup=!!data&&!area&&(setupOpen||(!started&&!skipped))
 const gaps=propertyGaps(areas)

 function openSetup(){
  setPicks(active.map(item=>item.id));setSetupOpen(true);setFeedback('')
 }
 async function saveSetup(){
  if(await mutate(()=>savePropertyAreas(supabase,owner,picks),started?'Property areas saved.':'Your network is set up.')){setSetupOpen(false);setSkipped(false);setList(true)}
 }
 // From the gaps list: open the area and start the local search for that service.
 function findHelp(item,service){
  selectArea(item.id)
  findMatches(service,propertyServiceTarget(item,service).category)
 }
 async function tapChoice(service,choice,assigned=0){
  const status=propertyChoiceStatus(service.status,choice,assigned)
  if(status===service.status)return // Sorted with someone assigned: nothing to change
  closeMatches();pickerRequest.current++;setPicker('');setContactForm(null);setReplacing(null)
  await mutate(()=>savePropertyService(supabase,owner,{...service,status}),
   status?service.name+': '+PROPERTY_CHOICES.find(([value])=>value===choice)[1]+'.':service.name+' cleared.')
 }
 function togglePicker(service,mode){
  setReplacing(null);setContactForm(null)
  if(picker===service.service_key&&pickerMode===mode){pickerRequest.current++;setPicker('');return}
  setPickerMode(mode)
  if(mode==='provider')openPicker(service)
  else{pickerRequest.current++;setPicker(service.service_key)}
 }
 // Removing the last provider or contact puts the service back to plain Sorted.
 // Removing a link deletes that association, so confirm it first.
 function confirmUnlink(name,service,remaining,action,message){
  Alert.alert('Remove '+name+' from '+service.name+'?',
   (remaining?'':service.name+' goes back to plain Sorted. ')+(name?'They stay in My People.':''),[
   {text:'Cancel',style:'cancel'},
   {text:'Remove',style:'destructive',onPress:()=>void unlink(service,remaining,action,message)},
  ])
 }
 function unlink(service,remaining,action,message){
  return mutate(async()=>{
   await action()
   const status=propertyStatusAfterUnlink(service.status,remaining)
   if(status!==service.status)await savePropertyService(supabase,owner,{...service,status:status??null})
  },message)
 }
 // Bulk actions only fill unanswered services: answers, Me and linked
 // providers or contacts are never overwritten, so no confirmation is needed.
 function bulk(item,status){
  const {updates,kept}=propertyBulkServices(item.services,status)
  if(!updates.length)return
  void mutate(()=>savePropertyServices(supabase,owner,updates),propertyBulkMessage(updates.length,kept,status))
 }
 function removeArea(item){
  Alert.alert('Remove '+item.label+' from your property?','Your answers are kept if you add it back.',[
   {text:'Cancel',style:'cancel'},
   {text:'Remove',style:'destructive',onPress:async()=>{if(await mutate(()=>setPropertyArea(supabase,owner,item.id,false),item.label+' removed from your property.'))selectArea('')}},
  ])
 }

 return <View style={[styles.screen,{paddingTop:insets.top}]}>
  {showSetup&&<View style={{flex:1}}>
   <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:16}}>
    {started&&<LocalAction label="Back" icon="chevron-back" onPress={()=>setSetupOpen(false)}/>}
    {!started&&<LocalAction label="Back" icon="chevron-back" onPress={()=>navigation.goBack()}/>}
    <Text style={styles.kicker}>MY PROPERTY NETWORK</Text>
    <Text accessibilityRole="header" style={styles.title}>What's on your property?</Text>
    <Text style={styles.muted}>{started?'Tick the parts of your property to show. Unticking one hides it; its answers and providers are kept if you add it back.'
     :"Tap everything that applies. We'll set up your network to match. You can change it any time."}</Text>
    {!!error&&<Text accessibilityRole="alert" style={styles.gap}>{error}</Text>}
    <View style={styles.tiles} accessibilityLabel="What's on your property">
     {SUPPORT_AREAS.map(item=>{
      const on=picks.includes(item.id)
      return <TouchableOpacity key={item.id} accessibilityRole="checkbox" accessibilityState={{checked:on}}
       accessibilityLabel={item.label+', '+PROPERTY_AREA_DESCRIPTIONS[item.id]} style={[styles.tile,on&&styles.tileOn]}
       onPress={()=>setPicks(current=>on?current.filter(id=>id!==item.id):[...current,item.id])}>
       <View style={styles.tileTop}><Text style={styles.tileLabel}>{item.label}</Text>
        <View style={[styles.check,on&&styles.checkOn]}>{on&&<Icon name="checkmark" size={13} color={colors.white}/>}</View></View>
       <Text style={styles.tileHint}>{PROPERTY_AREA_DESCRIPTIONS[item.id]}</Text>
      </TouchableOpacity>
     })}
    </View>
   </ScrollView>
   <View style={[styles.setupFooter,{paddingBottom:insets.bottom+16}]}>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:busy||!picks.length}} disabled={busy||!picks.length}
     style={[styles.primaryButton,(busy||!picks.length)&&styles.disabled]} onPress={()=>void saveSetup()}>
     <Text style={styles.primaryText}>{!picks.length?'Choose at least one':started?'Save property areas':'Set up my network ('+picks.length+' area'+(picks.length===1?'':'s')+')'}</Text>
    </TouchableOpacity>
    <TouchableOpacity accessibilityRole="button" style={styles.textButton} onPress={()=>{if(started)setSetupOpen(false);else setSkipped(true)}}>
     <Text style={styles.actionText}>{started?'Cancel':'Skip for now'}</Text>
    </TouchableOpacity>
   </View>
  </View>}
  {!showSetup&&<ScrollView style={area?{display:'none'}:undefined} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:insets.bottom+24}}>
   <LocalAction label="Back" icon="chevron-back" onPress={()=>navigation.goBack()}/>
   <Text accessibilityRole="header" style={styles.title}>My Property Network</Text>
   <Text style={styles.muted}>Who helps with your property, and what still needs someone.</Text>
   <View style={styles.row} accessibilityLabel="My Property">
    <Text style={[styles.nodeLabel,styles.viewButton]}>My Network</Text>
    <LocalAction label="My People" onPress={()=>navigation.navigate('Connections',{side:'locals',fromPropertyNetwork:true})}/>
   </View>
   {!area&&!!error&&<View><Text accessibilityRole="alert">{error}</Text><LocalAction label="Retry" onPress={()=>{setError('');void load()}}/></View>}
   {!area&&!!feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
   {!data&&!error&&<Loading label="Loading My Property Network…"/>}
   {data&&<>
    {gaps.length>0?<View style={styles.gaps}>
     <Text accessibilityRole="header" style={[styles.sectionTitle,{color:colors.jobInk}]}>Needs help ({gaps.length})</Text>
     {gaps.map(({area:item,service})=><View key={item.id+service.service_key} style={styles.gapRow}>
      <View style={{flex:1}}><Text style={styles.nodeLabel}>{service.name}</Text><Text style={styles.small}>{item.label}</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={'Find help with '+service.name} style={styles.smallPrimary} onPress={()=>findHelp(item,service)}>
       <Text style={styles.primaryText}>Find help</Text></TouchableOpacity>
     </View>)}
    </View>:active.length>0&&<Text style={[styles.muted,{marginTop:12}]}>Nothing needs help right now.</Text>}
    <View style={styles.partsHead}>
     <Text accessibilityRole="header" style={styles.sectionTitle}>Your property</Text>
     {active.length>0&&<View style={styles.switch} accessibilityLabel="Network view">
      {['List','Diagram'].map(view=><TouchableOpacity key={view} accessibilityRole="button" accessibilityState={{selected:list===(view==='List')}}
       onPress={()=>setList(view==='List')} style={[styles.switchButton,list===(view==='List')&&styles.switchOn]}>
       <Text style={list===(view==='List')?styles.nodeLabel:styles.muted}>{view}</Text>
      </TouchableOpacity>)}
     </View>}
    </View>
    {!active.length?<View style={styles.card}>
     <Text style={styles.muted}>Tell us what's on your property and we'll set up your network to match.</Text>
     <TouchableOpacity accessibilityRole="button" style={[styles.primaryButton,{marginTop:12}]} onPress={openSetup}>
      <Text style={styles.primaryText}>Choose what's on your property</Text></TouchableOpacity>
    </View>:list?<>
     {active.map(item=>{
      const progress=propertyAreaProgress(item,propertyAreaWho(data,item))
      const tone=progress.tone==='help'?styles.tagHelp:progress.tone==='done'?styles.tagDone:null
      return <TouchableOpacity key={item.id} accessibilityRole="button" accessibilityLabel={item.label+', '+progress.tag+', '+progress.summary}
       style={styles.card} onPress={()=>selectArea(item.id)}>
       <View style={styles.cardTop}><View style={styles.cardTitle}><Icon name={item.icon} size={20} color={colors.primary}/><Text style={styles.nodeLabel}>{item.label}</Text></View>
        <View style={[styles.statusTag,styles.tagRow,tone]}><Icon name={propertyToneIcon(progress.tone)} size={13} color={progress.tone==='help'?colors.jobInk:progress.tone==='done'?colors.primary:'#555555'}/>
         <Text style={[styles.tagText,progress.tone==='help'&&{color:colors.jobInk},progress.tone==='done'&&{color:colors.primary}]}>{progress.tag}</Text></View></View>
       <View style={styles.bar}>
        {progress.sorted>0&&<View style={[styles.barPart,{flex:progress.sorted,backgroundColor:colors.primary}]}/>}
        {progress.help>0&&<View style={[styles.barPart,{flex:progress.help,backgroundColor:colors.warning}]}/>}
        {progress.left>0&&<View style={[styles.barPart,{flex:progress.left,backgroundColor:'#dddddd'}]}/>}
       </View>
       <Text style={styles.small}>{progress.summary}</Text>
      </TouchableOpacity>
     })}
     <LocalAction label="My Property" icon="map-outline" onPress={openProperty}/>
    </>:<PropertyDiagram areas={active} selected={highlight} onSelect={selectArea} onOpenProperty={openProperty}/>}
    {active.length>0&&<>
     <TouchableOpacity accessibilityRole="button" style={styles.dashed} onPress={openSetup}>
      <Text style={styles.actionText}>+ Add another part of your property</Text></TouchableOpacity>
     <LocalAction label="Update what's on your property" onPress={openSetup}/>
    </>}
   </>}
  </ScrollView>}
  {area&&<ScrollView key={area.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16,paddingBottom:insets.bottom+24}}>
     <LocalAction label="Back to My Property Network" icon="chevron-back" onPress={()=>selectArea('')}/>
     <View style={styles.areaHeading}><Icon name={area.icon} size={32} color={colors.primary}/>
      <Text accessibilityRole="header" style={styles.title}>{area.label}</Text></View>
     <Text style={styles.muted}>One tap each. Tell us who does it if you like.</Text>
     {!!error&&<Text accessibilityRole="alert">{error}</Text>}
     {!!feedback&&<Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text>}
     {(()=>{
      const unset=area.services.filter(service=>!service.status).length,answered=area.services.length-unset
      if(!unset)return null
      return <><View style={[styles.row,{marginTop:10}]}>
       {[['sorted'],['irrelevant']].map(([status])=><TouchableOpacity key={status} accessibilityRole="button" accessibilityState={{disabled:busy}} disabled={busy}
        style={[styles.pill,status==='irrelevant'&&styles.pillQuiet,busy&&styles.disabled]} onPress={()=>bulk(area,status)}>
        <Text style={status==='irrelevant'?styles.nodeLabel:styles.actionText}>{propertyBulkLabel(status,answered)}</Text></TouchableOpacity>)}
      </View>
      {answered>0&&<Text style={[styles.small,{marginTop:4}]}>Only the {unset} still to check change. Your other answers and helpers stay.</Text>}</>
     })()}
     {area.services.map(service=>{
      const linked=linkedPropertyProviders(data,service)
      const contacts=linkedPropertyContacts(data,service)
      const covered=linked.length+contacts.length
      const choice=propertyServiceChoice(service.status)
      const replacingHere=replacing&&picker===service.service_key
      const category=propertyServiceTarget(area,service).category
      const postCategory=propertyJobCategory(area,service)
      const providerOpen=picker===service.service_key&&(pickerMode==='provider'||replacingHere)
      const contactOpen=picker===service.service_key&&pickerMode==='contact'&&!replacingHere
      return <View style={styles.service} key={service.service_key}>
       <View style={styles.cardTop}>
        <Text accessibilityRole="header" style={[styles.serviceTitle,{flexShrink:1}]}>{service.name}</Text>
        {(!choice||choice==='help')&&<View style={[styles.statusTag,styles.tagRow,choice&&styles.tagHelp]}>
         <Icon name={choice?PROPERTY_STATUS_ICONS.help:PROPERTY_STATUS_ICONS.unset} size={13} color={choice?colors.jobInk:'#555555'}/>
         <Text style={[styles.tagText,choice&&{color:colors.jobInk}]}>{choice?PROPERTY_STATUS_LABELS.help:PROPERTY_STATUS_LABELS.unset}</Text></View>}
       </View>
       <View style={styles.choices} accessibilityLabel={service.name+' status'}>
        {PROPERTY_CHOICES.map(([value,label])=><TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{selected:choice===value,disabled:busy}}
         disabled={busy} style={[styles.choice,choice===value&&styles['choice_'+value]]} onPress={()=>void tapChoice(service,value,covered)}>
         <View style={styles.choiceInner}>{choice===value&&<Icon name="checkmark" size={16} color={styles['choiceText_'+value].color}/>}
          <Text style={[styles.choiceText,choice===value&&styles['choiceText_'+value]]}>{label}</Text></View>
        </TouchableOpacity>)}
       </View>
       {choice==='sorted'&&<View style={{marginTop:10,gap:6}}>
        <Text style={styles.small}>Who does it? (optional)</Text>
        <View style={styles.row}>
         <TouchableOpacity accessibilityRole="button" accessibilityState={{selected:service.status==='self',disabled:busy}} disabled={busy}
          style={[styles.chip,service.status==='self'&&styles.chipOn]}
          onPress={()=>void mutate(()=>savePropertyService(supabase,owner,{...service,status:propertyWhoMeStatus(service.status)}),'Saved.')}>
          <Text style={styles.chipText}>{service.status==='self'?'Me ✓':'Me'}</Text></TouchableOpacity>
         <TouchableOpacity accessibilityRole="button" accessibilityState={{selected:linked.length>0,expanded:providerOpen}}
          style={[styles.chip,linked.length>0&&styles.chipOn]} onPress={()=>togglePicker(service,'provider')}>
          <Text style={styles.chipText}>{linked.length?linked.map(propertyProviderName).join(', ')+' ✓':'A provider…'}</Text></TouchableOpacity>
         <TouchableOpacity accessibilityRole="button" accessibilityState={{selected:contacts.length>0,expanded:contactOpen}}
          style={[styles.chip,contacts.length>0&&styles.chipOn]} onPress={()=>togglePicker(service,'contact')}>
          <Text style={styles.chipText}>{contacts.length?contacts.map(contact=>contact.name).join(', ')+' ✓':'Someone not on RC'}</Text></TouchableOpacity>
        </View>
        {linked.map(person=><View key={person.id} style={styles.linked}>
         <LocalAction label={propertyProviderName(person)} onPress={()=>profile(person)}/>
         <View style={styles.row}><LocalAction label="Invite to job" disabled={busy} onPress={()=>openInvite(person)}/>
          <LocalAction label="Remove link" disabled={busy} onPress={()=>confirmUnlink(propertyProviderName(person),service,covered-1,()=>setPropertyProvider(supabase,owner,service,person.id,false),'Provider link removed.')}/></View>
        </View>)}
        {contacts.map(contact=><View key={contact.id} style={styles.linked}>
         <Text style={styles.serviceTitle}>{contact.name}</Text>
         <Text style={styles.tag}>Not on Rural Connections</Text>
         {!!contact.phone&&<Text style={styles.muted}>{contact.phone}</Text>}
         {!!contact.email&&<Text style={styles.muted}>{contact.email}</Text>}
         {!!contact.note&&<Text style={styles.muted}>{contact.note}</Text>}
         <View style={styles.row}>
          {!!contact.phone&&<LocalAction label="Call" icon="call-outline" onPress={()=>openContactLink(propertyContactPhoneHref(contact.phone))}/>}
          {!!contact.email&&<LocalAction label="Email" icon="mail-outline" onPress={()=>openContactLink(propertyContactEmailHref(contact.email))}/>}
          <LocalAction label="Edit" icon="create-outline" disabled={busy} onPress={()=>setContactForm({serviceKey:service.service_key,contact})}/>
          <LocalAction label="Invite to Rural Connections" icon="share-outline" onPress={()=>inviteContact(contact)}/>
          <LocalAction label="Replace with member" icon="swap-horizontal-outline" disabled={busy} onPress={()=>startReplace(service,contact)}/>
          <LocalAction label="Remove link" disabled={busy} onPress={()=>confirmUnlink(contact.name,service,covered-1,()=>setPropertyContact(supabase,owner,service,contact.id,false),'Contact link removed.')}/>
         </View>
         {contactForm?.contact?.id===contact.id&&contactForm.serviceKey===service.service_key&&<ContactForm key={contact.id} initial={contact} busy={busy}
          onSave={value=>saveContact(service,value)} onCancel={()=>setContactForm(null)} onDelete={()=>deleteContact(contact)}/>}
        </View>)}
       </View>}
       {choice==='help'&&<View style={[styles.row,{marginTop:10}]}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:matchKey===service.service_key}} style={styles.smallPrimary}
         onPress={()=>matchKey===service.service_key?closeMatches():findMatches(service,category)}>
         <Text style={styles.primaryText}>{matchKey===service.service_key?'Close search':'Find local help'}</Text></TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" style={styles.postJob} onPress={()=>post(null,postCategory)}>
         <Text style={styles.gap}>Post a job</Text></TouchableOpacity>
       </View>}
       {matchKey===service.service_key&&<View style={[styles.picker,{marginTop:10}]}>
        <Text accessibilityRole="header" style={styles.serviceTitle}>Find providers for {service.name}</Text>
        <Text style={styles.nodeLabel}>Town or locality</Text>
        <TextInput accessibilityLabel="Town or locality" style={styles.input} maxLength={70} value={locality} onChangeText={setLocality}/>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:widen}} style={styles.statusRow} onPress={()=>void toggleWiden()}>
         <Icon name={widen?'checkbox-outline':'square-outline'} size={20} color={colors.primary}/>
         <Text style={styles.statusText}>Include a wider region</Text>
        </TouchableOpacity>
        {widen&&<><Text style={styles.nodeLabel}>Region</Text>
         {!!regionHint&&<Text style={styles.small}>{regionHint}</Text>}
         <View style={[styles.row,{marginTop:6}]} accessibilityLabel="Region">
          {NZ_REGIONS.map(item=><TouchableOpacity key={item} accessibilityRole="button" accessibilityState={{selected:region===item}}
           style={[styles.chip,region===item&&styles.chipOn]} onPress={()=>{setRegion(item);setRegionHint('')}}>
           <Text style={styles.chipText}>{item}</Text></TouchableOpacity>)}
         </View></>}
        <Text style={styles.small}>Results don't update as you type. Tap Search providers after changing the town or region.</Text>
        <LocalAction label="Search providers" disabled={matchBusy||!(matchLocality(locality)||(widen&&matchLocality(region)))} onPress={()=>findMatches(service,category)}/>
        {matchBusy&&<Text accessibilityLiveRegion="polite">Finding providers…</Text>}
        {!!matchError&&<Text accessibilityRole="alert">{matchError}</Text>}
        {matches?.length===0&&<Text accessibilityLiveRegion="polite">{searched?.region
         ?'No providers advertise '+service.name.toLowerCase()+' in '+[...new Set([searched.locality,searched.region].filter(Boolean))].join(' or ')+'. Try another region, or post a job so local providers can offer.'
         :'No providers advertise '+service.name.toLowerCase()+' in '+(searched?.locality||'this area')+'. Include a wider region to search further, or post a job.'}</Text>}
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
       {providerOpen&&<View style={[styles.picker,{marginTop:10}]}>
        <Text style={styles.serviceTitle}>{replacingHere?'Choose the member who replaces '+replacing.name:'Choose a provider'}</Text>
        {replacingHere&&<Text style={styles.muted}>They will be linked to every service {replacing.name} covers, and {replacing.name}'s private contact details will be deleted.</Text>}
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
            {replacingHere?<LocalAction label={'Replace '+replacing.name} disabled={busy} onPress={()=>void replaceContact(person)}/>
             :<LocalAction label="Link to service" disabled={busy} onPress={()=>void mutate(()=>setPropertyProvider(supabase,owner,service,person.id,true),'Provider linked.')}/>}
           </View>)}
           {available.length>providerLimit&&<LocalAction label="Show more providers" onPress={()=>setProviderLimit(value=>value+12)}/>}
          </View>
         })}
        {replacingHere?<LocalAction label="Cancel replacing" onPress={()=>{setReplacing(null);setPicker('')}}/>
         :<LocalAction label="Browse more providers" onPress={()=>browse(propertyServiceTarget(area,service))}/>}
       </View>}
       {contactOpen&&<View style={[styles.picker,{marginTop:10}]}>
        <Text accessibilityRole="header" style={styles.serviceTitle}>Not on Rural Connections</Text>
        {(data.contacts??[]).filter(contact=>!contacts.some(row=>row.id===contact.id)).map(contact=><View key={contact.id} style={styles.row}>
         <Text style={styles.statusText}>{contact.name}</Text>
         <LocalAction label="Link to service" disabled={busy} onPress={()=>void mutate(()=>setPropertyContact(supabase,owner,service,contact.id,true),contact.name+' linked.')}/>
        </View>)}
        {contactForm?.serviceKey===service.service_key&&!contactForm.contact
         ?<ContactForm busy={busy} onSave={value=>saveContact(service,value)} onCancel={()=>setContactForm(null)}/>
         :<LocalAction label="Add someone not on Rural Connections" icon="person-add-outline" onPress={()=>setContactForm({serviceKey:service.service_key})}/>}
       </View>}
      </View>
     })}
     {addingOpen?<View style={{marginTop:12}}>
      <Text style={styles.nodeLabel}>Another service for {area.label}</Text>
      <TextInput accessibilityLabel={'Another service for '+area.label} style={styles.input} placeholder="e.g. Check the spring intake" autoFocus
       placeholderTextColor={colors.textSecondary} value={serviceName} onChangeText={setServiceName} maxLength={80}/>
      <View style={styles.row}><LocalAction label="Add" icon="add" disabled={busy||!serviceName.trim()} onPress={addService}/>
       <LocalAction label="Cancel" onPress={()=>{setAddingOpen(false);setServiceName('')}}/></View>
     </View>:<TouchableOpacity accessibilityRole="button" style={styles.dashed} onPress={()=>setAddingOpen(true)}>
      <Text style={styles.actionText}>+ Add another service</Text></TouchableOpacity>}
     <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.remove} onPress={()=>removeArea(area)}>
      <Text style={styles.removeText}>Remove {area.label} from my property</Text></TouchableOpacity>
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
 service:{backgroundColor:colors.white,borderRadius:14,padding:14,marginTop:12},
 diagramLabel:{fontSize:12,textAlign:'center'},
 nodeLine:{flexDirection:'row',alignItems:'center',gap:2,maxWidth:'100%'},
 nodeHelp:{borderWidth:1.5,borderColor:colors.warning},
 badge:{fontSize:11,fontWeight:'600',textAlign:'center',color:colors.textSecondary},
 linkedBadge:{color:colors.primaryDark},
 matchAvatar:{height:38,width:38,borderRadius:19},
 areaHeading:{flexDirection:'row',alignItems:'center',gap:10,marginTop:12},
 actionText:{color:colors.primaryDark,fontWeight:'700'},
 statusRow:{minHeight:46,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:10,borderRadius:8},
 statusText:{flex:1,color:colors.textPrimary},
 gap:{color:colors.jobInk,fontWeight:'700'},
 linked:{paddingLeft:12,marginBottom:8},
 tag:{alignSelf:'flex-start',marginTop:4,paddingHorizontal:8,paddingVertical:2,borderRadius:10,backgroundColor:colors.primaryLight,color:colors.primaryDark,fontSize:12,fontWeight:'600'},
 picker:{padding:12,backgroundColor:colors.primaryLight,borderRadius:10},
 kicker:{fontSize:12,fontWeight:'700',color:colors.primary,letterSpacing:1.2,marginTop:8},
 tiles:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10,marginTop:16},
 tile:{width:'48.5%',minHeight:72,padding:12,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.white,gap:4},
 tileOn:{borderWidth:2,borderColor:colors.primary,backgroundColor:'#e8f1eb',padding:11},
 tileTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:8},
 tileLabel:{flex:1,fontSize:15,fontWeight:'700',color:colors.textPrimary},
 tileHint:{fontSize:12,lineHeight:16,color:colors.textSecondary},
 check:{width:20,height:20,borderRadius:10,borderWidth:1.5,borderColor:'#8a8a8a',alignItems:'center',justifyContent:'center'},
 checkOn:{borderWidth:0,backgroundColor:colors.primary},
 setupFooter:{paddingHorizontal:16,paddingTop:12,backgroundColor:colors.white,borderTopWidth:1,borderTopColor:colors.border,gap:6},
 primaryButton:{minHeight:50,borderRadius:10,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
 primaryText:{color:colors.white,fontWeight:'700',fontSize:15},
 smallPrimary:{minHeight:44,borderRadius:10,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:14},
 textButton:{minHeight:44,alignItems:'center',justifyContent:'center'},
 disabled:{opacity:.5},
 gaps:{marginTop:14,padding:14,borderRadius:16,backgroundColor:colors.jobFill,gap:8},
 gapRow:{flexDirection:'row',alignItems:'center',gap:10,padding:12,borderRadius:12,backgroundColor:colors.white},
 small:{fontSize:12,color:colors.textSecondary},
 partsHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:18,marginBottom:4},
 switch:{flexDirection:'row',backgroundColor:'#e7e7e7',borderRadius:8,padding:2},
 switchButton:{minHeight:36,paddingHorizontal:12,borderRadius:6,justifyContent:'center'},
 switchOn:{backgroundColor:colors.white},
 card:{marginTop:8,padding:14,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.white,gap:8},
 cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
 cardTitle:{flexDirection:'row',alignItems:'center',gap:8,flexShrink:1},
 statusTag:{fontSize:12,fontWeight:'700',borderRadius:999,paddingHorizontal:8,paddingVertical:3,backgroundColor:'#eeeeee',color:'#555555',overflow:'hidden'},
 tagHelp:{backgroundColor:colors.jobFill,color:colors.jobInk},
 tagRow:{flexDirection:'row',alignItems:'center',gap:4},
 tagText:{fontSize:12,fontWeight:'700',color:'#555555'},
 tagDone:{backgroundColor:colors.primaryLight,color:colors.primary},
 bar:{flexDirection:'row',gap:3,height:6},
 barPart:{borderRadius:3},
 dashed:{minHeight:44,marginTop:12,borderRadius:12,borderWidth:1,borderStyle:'dashed',borderColor:'#8f8f8f',alignItems:'center',justifyContent:'center'},
 pill:{minHeight:40,borderRadius:20,borderWidth:1,borderColor:colors.primary,backgroundColor:colors.white,paddingHorizontal:14,justifyContent:'center'},
 pillQuiet:{borderColor:'#8f8f8f'},
 choices:{flexDirection:'row',gap:6,marginTop:10},
 choice:{flex:1,minHeight:44,borderRadius:10,borderWidth:1,borderColor:'#c4c4c4',backgroundColor:colors.white,alignItems:'center',justifyContent:'center'},
 choice_sorted:{borderWidth:2,borderColor:colors.primary,backgroundColor:'#e8f1eb'},
 choice_help:{borderWidth:2,borderColor:colors.warning,backgroundColor:colors.jobFill},
 choice_na:{borderWidth:2,borderColor:'#757575',backgroundColor:'#eeeeee'},
 choiceInner:{flexDirection:'row',alignItems:'center',gap:4},
 choiceText:{fontSize:14,fontWeight:'600',color:'#333333'},
 choiceText_sorted:{color:'#1f4a37'},
 choiceText_help:{color:colors.jobInk},
 choiceText_na:{color:'#333333'},
 chip:{minHeight:40,borderRadius:20,borderWidth:1,borderColor:'#c4c4c4',backgroundColor:colors.white,paddingHorizontal:12,justifyContent:'center'},
 chipOn:{borderWidth:1.5,borderColor:colors.primary,backgroundColor:'#e8f1eb'},
 chipText:{fontSize:13,fontWeight:'600',color:'#333333'},
 postJob:{minHeight:44,borderRadius:10,borderWidth:1,borderColor:colors.jobLine,backgroundColor:colors.jobFill,paddingHorizontal:14,justifyContent:'center'},
 remove:{minHeight:44,marginTop:20,alignItems:'center',justifyContent:'center'},
 removeText:{color:'#a32d2d',fontWeight:'600'},
 input:{marginTop:6,backgroundColor:colors.white,borderWidth:1,borderColor:colors.border,borderRadius:8,padding:12,color:colors.textPrimary},
})

export default withScreenBoundary(PropertyNetworkScreen,'PropertyNetwork')
