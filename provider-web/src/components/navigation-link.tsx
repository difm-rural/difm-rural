'use client'
import NextLink from 'next/link'
import type {ComponentProps} from 'react'
import {useNavigationFeedback} from './navigation-feedback'
export default function NavigationLink({onNavigate,...props}:ComponentProps<typeof NextLink>){
 const {begin}=useNavigationFeedback()
 return <NextLink {...props} onNavigate={event=>{
  let cancelled=false
  onNavigate?.({preventDefault(){cancelled=true;event.preventDefault()}})
  if(!cancelled&&!props.download&&props.target!=='_blank')begin(props.href)
 }}/>
}
