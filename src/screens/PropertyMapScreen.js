import React,{useEffect,useRef,useState} from 'react'
import {Linking,Platform,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native'
import MapView,{Marker,Polygon,Polyline,UrlTile} from 'react-native-maps'
import {useSafeAreaInsets} from 'react-native-safe-area-context'
import {LocalAction} from '../components/LocalProviderActions'
import {supabase} from '../lib/supabase'
import {newJobId} from '../lib/draftId'
import {colors} from '../theme/tokens'
import {loadPropertyNetwork,propertyAreas,setPropertyArea} from '../../shared/propertyNetwork'
import {
 EMPTY_PROPERTY,FEATURE_TYPES,FIELD_LABELS,PROPERTY_TYPES,LINZ_ATTRIBUTION,LINZ_ATTRIBUTION_URL,LINZ_COPYRIGHT,LINZ_COPYRIGHT_URL,
 drawPropertyPoint,drivewayMetres,linzTiles,loadPropertyMap,mapPointInput,mapSuggestions,propertyAreaHa,savePropertyMap,validMapPoint,
} from '../../shared/propertyMap'

const imageryKey=process.env.EXPO_PUBLIC_LINZ_BASEMAPS_KEY
function region(camera){
 const longitudeDelta=360/2**camera.zoom
 return {...camera,longitudeDelta,latitudeDelta:longitudeDelta*Math.cos(camera.latitude*Math.PI/180)}
}

export default function PropertyMapScreen({navigation}){
 const insets=useSafeAreaInsets()
 const [owner,setOwner]=useState(null),[profile,setProfile]=useState(EMPTY_PROPERTY),[revision,setRevision]=useState(0)
 const [error,setError]=useState(''),[feedback,setFeedback]=useState(''),[busy,setBusy]=useState(false)
 const [tool,setTool]=useState('pan'),[vertex,setVertex]=useState(null),[coordinate,setCoordinate]=useState('')
 const [query,setQuery]=useState(''),[matches,setMatches]=useState([]),[searching,setSearching]=useState(false)
 const [active,setActive]=useState(null),[showCoordinates,setShowCoordinates]=useState(false)
 const [featureOpen,setFeatureOpen]=useState(null)
 const map=useRef(null),undo=useRef([]),driveway=useRef('')
 const lock=useRef(false),searchLock=useRef(false)

 useEffect(()=>{
  let mounted=true
  async function load(){
   const {data:{user}}=await supabase.auth.getUser()
   if(!user)throw new Error('Sign in to open My Property Map.')
   const saved=await loadPropertyMap(supabase,user.id)
   if(!mounted)return
   setProfile(saved.profile);setRevision(saved.revision);setOwner(user.id)
   try{
    const network=await loadPropertyNetwork(supabase,user.id)
    if(mounted)setActive(propertyAreas(network).filter(item=>item.active).map(item=>item.id))
   }catch{/* Profile editing remains available. */}
  }
  load().catch(()=>{if(mounted)setError('Could not load your private property. Reopen the map to try again.')})
  return ()=>{mounted=false}
 },[])

 function change(next){
  if(next===profile||lock.current)return
  undo.current=[...undo.current.slice(-29),profile]
  setProfile(next);setError('');setFeedback('')
 }
 function choose(next){
  setTool(next);setVertex(null);driveway.current=''
 }
 function place(point,camera=null){
  if(lock.current||!owner)return
  const id=tool==='driveway'&&!vertex?(driveway.current ||= newJobId()):newJobId()
  const next=drawPropertyPoint(profile,tool,point,id,vertex)
  change(camera?{...next,camera}:next)
  if(camera)map.current?.animateToRegion(region(camera),250)
  setVertex(null)
  if(tool==='pin')choose('pan')
 }
 function movePoint(index,point,feature){
  choose(feature?.kind||'boundary')
  setVertex({index,featureId:feature?.id})
  setCoordinate(point.latitude+', '+point.longitude)
 }
 function setCamera(camera,animate=false){
  if(lock.current||!validMapPoint(camera))return
  setProfile(current=>({...current,camera}))
  if(animate)map.current?.animateToRegion(region(camera),250)
 }
 async function search(){
  if(searchLock.current||query.trim().length<3)return
  searchLock.current=true;setSearching(true);setMatches([]);setError('')
  try{
   const {data,error}=await supabase.functions.invoke('property-address-search',{body:{query:query.trim()},timeout:12000})
   if(error)throw error
   const found=(data?.matches||[]).filter(item=>validMapPoint(item)&&typeof item.label==='string')
   setMatches(found)
   if(!found.length)setFeedback('No matching addresses or localities.')
  }catch{setError('Address search is unavailable. Try again or use coordinates.')}
  finally{searchLock.current=false;setSearching(false)}
 }
 async function save(){
  if(lock.current||!owner)return
  lock.current=true;setBusy(true);setError('');setFeedback('')
  try{setRevision(await savePropertyMap(supabase,owner,profile,revision));undo.current=[];setFeedback('Property saved.')}
  catch(error){setError(error.message||'Could not save your property. Your draft is kept.')}
  finally{lock.current=false;setBusy(false)}
 }
 async function addArea(area){
  if(lock.current)return
  lock.current=true;setBusy(true)
  try{await setPropertyArea(supabase,owner,area,true);setActive(current=>[...(current||[]),area]);setFeedback('Support area added to My Property Network.')}
  catch{setError('Could not add the support area. Try again.')}
  finally{lock.current=false;setBusy(false)}
 }
 const area=propertyAreaHa(profile.boundary)
 const suggestions=mapSuggestions(profile)
 return <ScrollView keyboardShouldPersistTaps="handled" style={styles.screen}
  contentContainerStyle={{padding:16,paddingTop:insets.top+12,paddingBottom:insets.bottom+20}}>
  <LocalAction label="Back to My Property Network" icon="chevron-back" onPress={()=>navigation.goBack()}/>
  <Text accessibilityRole="header" style={styles.title}>My Property Map</Text>
  <Text style={styles.muted}>Private to you. Outlines and measurements are approximate.</Text>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {!!feedback&&<Text accessibilityLiveRegion="polite" style={styles.heading}>{feedback}</Text>}
  {!owner&&!error&&<Text>Loading your property…</Text>}
  {owner&&<>
   <TextInput style={styles.input} accessibilityLabel="Find an address or locality" placeholder="Find an address or locality"
    placeholderTextColor={colors.textSecondary} value={query} onChangeText={setQuery} maxLength={100} onSubmitEditing={search}/>
   <LocalAction label={searching?'Searching…':'Search'} disabled={searching||query.trim().length<3} onPress={search}/>
   {matches.map((item,index)=><LocalAction key={index} label={item.label} onPress={()=>{
    setCamera({latitude:item.latitude,longitude:item.longitude,zoom:16},true);setMatches([])
   }}/>)}
   {imageryKey?<View style={styles.map}>
    <MapView ref={map} style={StyleSheet.absoluteFill} mapType={Platform.OS==='ios'?'standard':'none'} initialRegion={region(profile.camera)}
     onPress={event=>place(event.nativeEvent.coordinate)}
     onRegionChangeComplete={event=>setCamera({latitude:event.latitude,longitude:event.longitude,zoom:Math.max(4,Math.min(20,Math.log2(360/event.longitudeDelta)))})}
     minZoomLevel={4} maxZoomLevel={20} rotateEnabled={false} pitchEnabled={false}
     showsBuildings={false} showsPointsOfInterest={false} showsTraffic={false}>
     <UrlTile urlTemplate={linzTiles(imageryKey)} maximumZ={20} shouldReplaceMapContent/>
     {profile.pin&&<Marker coordinate={profile.pin} title="My Property"/>}
     {profile.boundary.length>=3?<Polygon coordinates={profile.boundary} strokeColor="#57e29b" fillColor="rgba(28,110,73,.26)" strokeWidth={3}/>
      :profile.boundary.length>1?<Polyline coordinates={profile.boundary} strokeColor="#57e29b" strokeWidth={3}/>:null}
     {profile.boundary.map((point,index)=><Marker key={index} coordinate={point} onPress={event=>{event.stopPropagation();movePoint(index,point)}}><Text style={styles.marker}>{index+1}</Text></Marker>)}
     {profile.features.map(feature=>feature.kind==='driveway'
      ?<React.Fragment key={feature.id}>
       {feature.points.length>1&&<Polyline coordinates={feature.points} strokeWidth={4} strokeColor="#ffcf63"/>}
       {feature.points.map((point,index)=><Marker key={index} coordinate={point} onPress={event=>{event.stopPropagation();movePoint(index,point,feature)}}><Text style={styles.marker}>{index+1}</Text></Marker>)}
      </React.Fragment>
      :<Marker key={feature.id} coordinate={feature.points[0]} onPress={event=>{event.stopPropagation();movePoint(0,feature.points[0],feature)}}>
       <Text style={styles.marker}>{FEATURE_TYPES[feature.kind].icon}</Text>
      </Marker>)}
    </MapView>
   </View>:<Text style={styles.muted}>LINZ imagery is unavailable. Use the coordinate editor below.</Text>}
   {imageryKey&&<View style={styles.row}>
    <LocalAction label={LINZ_COPYRIGHT} onPress={()=>void Linking.openURL(LINZ_COPYRIGHT_URL)}/>
    <LocalAction label={LINZ_ATTRIBUTION} onPress={()=>void Linking.openURL(LINZ_ATTRIBUTION_URL)}/>
   </View>}
   <View style={styles.row}>
    {[['pan','Pan'],['pin','Place pin'],['boundary','Draw boundary'],...Object.entries(FEATURE_TYPES).map(([kind,value])=>[kind,value.icon+' '+value.label])].map(([id,label])=>
     <TouchableTool key={id} label={label} selected={tool===id&&!vertex} onPress={()=>choose(id)}/>)}
   </View>
   <Text style={styles.muted}>{vertex?'Choose a new position for the selected point.':tool==='pan'?'Pan the map or choose a drawing tool.':tool==='boundary'||tool==='driveway'?'Add each point, then choose Pan.':'Tap or enter coordinates to place the selected feature.'}</Text>
   <View style={styles.row}>
    <LocalAction label="Undo edit" disabled={busy||!undo.current.length} onPress={()=>{
     const previous=undo.current.pop()
     if(previous){setProfile(previous);map.current?.animateToRegion(region(previous.camera),250)}
     choose('pan')
    }}/>
    {!!profile.boundary.length&&<LocalAction label="Remove boundary" disabled={busy} onPress={()=>{change({...profile,boundary:[]});choose('boundary')}}/>}
    {profile.pin&&<LocalAction label="Remove pin" disabled={busy} onPress={()=>change({...profile,pin:null})}/>}
   </View>
   <LocalAction label={showCoordinates?'Hide coordinate editor':'Enter or edit coordinates'} onPress={()=>setShowCoordinates(value=>!value)}/>
   {(showCoordinates||!imageryKey)&&<>
    <TextInput style={styles.input} accessibilityLabel="Latitude, longitude" placeholder="-41.2, 173.8"
     placeholderTextColor={colors.textSecondary} value={coordinate} onChangeText={setCoordinate}/>
    <LocalAction label="Apply coordinates" disabled={busy||tool==='pan'||!mapPointInput(coordinate)} onPress={()=>{const point=mapPointInput(coordinate);if(point){place(point,{...point,zoom:Math.max(16,profile.camera.zoom)})}}}/>
    {profile.boundary.map((point,index)=><LocalAction key={index} label={'Move boundary point '+(index+1)} onPress={()=>movePoint(index,point)}/>)}
   </>}
   {profile.boundary.length>=3&&<View style={styles.row}><Text>Measured area: {area.toFixed(2)} ha</Text>
    <LocalAction label="Use measured area" disabled={busy} onPress={()=>change({...profile,areaHa:area.toFixed(2)})}/></View>}
   {!!profile.features.length&&<Text style={styles.heading}>Mapped features</Text>}
   {profile.features.map(feature=><View key={feature.id}>
    <LocalAction label={FEATURE_TYPES[feature.kind].icon+' '+(feature.name||FEATURE_TYPES[feature.kind].label)+(feature.kind==='driveway'?' · '+Math.round(drivewayMetres(feature.points))+' m':'')}
     onPress={()=>setFeatureOpen(featureOpen===feature.id?null:feature.id)}/>
    {featureOpen===feature.id&&<>
     <TextInput style={styles.input} accessibilityLabel="Feature name" value={feature.name} maxLength={120} editable={!busy}
      onChangeText={name=>change({...profile,features:profile.features.map(item=>item.id===feature.id?{...item,name}:item)})}/>
     {feature.points.map((point,index)=><LocalAction key={index} label={'Move point '+(index+1)} onPress={()=>{setShowCoordinates(true);movePoint(index,point,feature)}}/>)}
     <LocalAction label="Delete feature" disabled={busy} onPress={()=>{change({...profile,features:profile.features.filter(item=>item.id!==feature.id)});choose('pan')}}/>
    </>}
   </View>)}
   <Text accessibilityRole="header" style={styles.heading}>Property details</Text>
   {Object.entries(FIELD_LABELS).map(([field,label])=><View key={field}>
    <Text style={styles.label}>{label}</Text>
    {field==='propertyType'?<View style={styles.row}>{['',...PROPERTY_TYPES].map(type=><TouchableTool key={type} label={type||'Unspecified'}
      selected={profile.propertyType===type} onPress={()=>change({...profile,propertyType:type})}/>)}</View>
     :<TextInput style={styles.input} accessibilityLabel={label} value={profile[field]} editable={!busy}
      keyboardType={field==='areaHa'?'decimal-pad':field==='paddocks'?'number-pad':'default'} maxLength={field==='paddocks'?6:field==='areaHa'?16:120}
      onChangeText={value=>change({...profile,[field]:value})}/>}
   </View>)}
   {!!suggestions.length&&<Text style={styles.heading}>Suggested support</Text>}
   {suggestions.map(suggestion=><View key={suggestion.area} style={styles.row}><Text>{suggestion.service}</Text>
    {active&&!active.includes(suggestion.area)&&<LocalAction label="Add support area" disabled={busy} onPress={()=>addArea(suggestion.area)}/>}</View>)}
   <View style={styles.row}>
    <LocalAction label={busy?'Saving…':'Save property'} disabled={busy} onPress={save}/>
    <LocalAction label="Cancel" disabled={busy} onPress={()=>navigation.goBack()}/>
   </View>
  </>}
 </ScrollView>
}

function TouchableTool({label,selected,onPress}){
 return <Text accessibilityRole="button" accessibilityState={{selected}} onPress={onPress}
  style={[styles.tool,selected&&styles.selected]}>{label}</Text>
}

const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:colors.background},title:{fontSize:26,fontWeight:'700',color:colors.textPrimary},
 heading:{fontSize:18,fontWeight:'700',marginTop:16,marginBottom:8,color:colors.primaryDark},
 label:{fontWeight:'600',marginTop:8,color:colors.textPrimary},muted:{color:colors.textSecondary,lineHeight:20,marginVertical:5},
 map:{height:360,borderRadius:12,overflow:'hidden'},row:{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:8},
 input:{backgroundColor:colors.white,borderWidth:1,borderColor:colors.border,borderRadius:8,minHeight:44,padding:10,marginTop:6,color:colors.textPrimary},
 marker:{backgroundColor:colors.primaryDark,color:colors.white,padding:5,borderRadius:10,fontWeight:'700'},
 tool:{padding:12,borderRadius:8,backgroundColor:colors.primaryLight,color:colors.primaryDark},selected:{backgroundColor:colors.primaryDark,color:colors.white},
 error:{color:colors.danger,marginVertical:8},
})
