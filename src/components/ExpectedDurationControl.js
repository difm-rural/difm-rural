import React,{useState} from 'react'
import {Modal,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native'
import {GRAZING_WEEKS,durationLabel} from '../../shared/bookingDuration'
import {colors} from '../theme/tokens'
export default function ExpectedDurationControl({grazing,unit,value,onChange}){
 const [open,setOpen]=useState(false)
 return <View>
  <Text style={styles.label}>Expected duration{grazing?'':` (${unit}s, optional)`}</Text>
  {grazing?<>
   <TouchableOpacity style={styles.input} accessibilityRole="button" accessibilityLabel="Choose expected duration" onPress={()=>setOpen(true)}>
    <Text style={styles.text}>{value?durationLabel(value,'week'):'Not sure yet'} ▾</Text>
   </TouchableOpacity>
   <Modal visible={open} transparent animationType="slide" onRequestClose={()=>setOpen(false)}>
    <View style={styles.overlay}><View style={styles.sheet} accessibilityViewIsModal>
     <Text style={styles.label}>Expected duration</Text>
     {[...GRAZING_WEEKS.map(v=>({value:String(v),label:durationLabel(v,'week')})),{value:'',label:'Not sure yet'}].map(option=><TouchableOpacity key={option.value} style={styles.choice} accessibilityRole="radio" accessibilityState={{selected:value===option.value}} onPress={()=>{onChange(option.value);setOpen(false)}}><Text style={styles.text}>{option.label}</Text></TouchableOpacity>)}
     <TouchableOpacity style={styles.choice} accessibilityRole="button" onPress={()=>setOpen(false)}><Text style={styles.text}>Cancel</Text></TouchableOpacity>
    </View></View>
   </Modal>
  </>:<TextInput accessibilityLabel="Expected duration" style={styles.input} value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder="Not sure yet"/>}
  <Text style={styles.hint}>Optional request, not a binding agreement. Leave unspecified if unsure.</Text>
 </View>
}
const styles=StyleSheet.create({label:{fontWeight:'700',fontSize:15,color:colors.textPrimary,marginBottom:8},text:{fontSize:16,color:colors.textPrimary},input:{borderWidth:1,borderColor:colors.border,borderRadius:10,padding:13,minHeight:48,color:colors.textPrimary},hint:{fontSize:13,lineHeight:19,color:colors.textSecondary,marginTop:8},overlay:{flex:1,justifyContent:'flex-end',backgroundColor:'#0006'},sheet:{backgroundColor:colors.white,padding:24,paddingBottom:32,borderTopLeftRadius:18,borderTopRightRadius:18},choice:{minHeight:48,justifyContent:'center',paddingVertical:10}})
