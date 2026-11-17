import React, { useEffect, useRef, useState } from 'react'
import { Image, Text, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import Button from './Button'
import { jobPrimaryPhotoRequest } from '../lib/jobPrimaryPhoto'

export default function JobPrimaryPhotoDraft({photo,onPhoto,onSuggestion,onManual,required,allowSuggestion=true,disabled=false}) {
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState(null)
  const generation=useRef(0)
  const work=useRef(false)
  useEffect(()=>()=>{generation.current++},[])
  function change(asset){
    generation.current++;work.current=false;setBusy(false);setError('');setResult(null);onPhoto(asset)
  }
  async function pick(camera){
    try{
      const permission=await (camera?ImagePicker.requestCameraPermissionsAsync():ImagePicker.requestMediaLibraryPermissionsAsync())
      if(!permission.granted){setError('Allow photo access or continue without a photo.');return}
      const options={mediaTypes:['images'],exif:false}
      const picked=await (camera?ImagePicker.launchCameraAsync(options):ImagePicker.launchImageLibraryAsync(options))
      if(!picked.canceled){
        if(picked.assets[0].fileSize>8*1024*1024){setError('Choose an image under 8 MB.');return}
        change(picked.assets[0])
      }
    }catch{setError('Could not open the photo picker.')}
  }
  async function suggest(){
    if(work.current||!photo)return
    work.current=true
    const version=++generation.current
    setBusy(true);setError('');setResult(null)
    try{
      const value=await jobPrimaryPhotoRequest('draft-job-from-photo',photo)
      if(version===generation.current)setResult(value)
    }catch(cause){if(version===generation.current)setError(cause.message)}
    finally{if(version===generation.current){work.current=false;setBusy(false)}}
  }
  return <View style={{gap:8,marginBottom:12}}>
    {photo&&<Image source={{uri:photo.uri}} style={{width:'100%',height:160}} resizeMode="contain" accessibilityLabel="Selected primary job photo"/>}
    <Button title="Take a photo" variant="secondary" disabled={disabled} onPress={()=>pick(true)}/>
    <Button title={photo?'Replace photo':'Choose a photo'} variant="secondary" disabled={disabled} onPress={()=>pick(false)}/>
    {photo&&<Button title="Remove photo" variant="secondary" disabled={disabled} onPress={()=>change(null)}/>}
    {required&&<Button title="Continue without a photo" variant="secondary" disabled={disabled} onPress={()=>{change(null);onManual()}}/>}
    {photo&&allowSuggestion&&<>
      <Text>Suggest a job sends this photo for AI analysis. People who can view your posted job can see the photo.</Text>
      <Button title={busy?'Analysing photo…':'Suggest a job'} disabled={disabled||busy} onPress={suggest}/>
    </>}
    {!!error&&<Text accessibilityRole="alert">{error}</Text>}
    {result&&(result.status==='unusable'?<Text>Could not identify the work. You can enter the job details yourself.</Text>:<>
      {!!result.question&&<Text>{result.question} Add your answer to the job description.</Text>}
      <Text>{result.title}</Text><Text>{result.description}</Text>{!!result.category&&<Text>{result.category}</Text>}
      <Button title="Use suggestion in empty fields" onPress={()=>{onSuggestion(result);setResult(null)}}/>
    </>)}
  </View>
}
