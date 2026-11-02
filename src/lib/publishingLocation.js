import {Alert} from 'react-native'
import {publishingLocationWarning} from '../../shared/publishingLocation'
import {createPublicAreaCache,lookupPublicArea} from '../../shared/publicJobArea'
import {MAPS_PROXY_URL} from './constants'
import {supabase} from './supabase'
const resolve=createPublicAreaCache(area=>lookupPublicArea(MAPS_PROXY_URL,area))
export async function confirmPublishingLocation(location,userId,onChange){
  let warning
  try{
    if(!userId)return true
    const {data,error}=await supabase.from('profiles').select('latitude,longitude,region').eq('id',userId).maybeSingle()
    if(error)return true
    warning=await publishingLocationWarning(location,data,resolve)
  }catch{return true} // An unavailable check must not invent a distance or block publishing.
  if(!warning)return true
  const useLocation=await new Promise(resolve=>Alert.alert('Check the location',warning.message,[
    {text:'Change location',style:'cancel',onPress:()=>resolve(false)},
    {text:'Use this location',onPress:()=>resolve(true)},
  ],{cancelable:true,onDismiss:()=>resolve(false)}))
  if(!useLocation)onChange()
  return useLocation
}
