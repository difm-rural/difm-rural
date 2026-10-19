import React, { useEffect, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import ReputationCard from './ReputationCard'

// Keep the participant's identity and reputation together at the start of a
// listing conversation, without taking space away from the latest messages.
export default function EnquiryPersonCard({ serviceId, personId }) {
  const navigation = useNavigation()
  const [person, setPerson] = useState(null)
  useEffect(() => {
    let active = true
    setPerson(null)
    async function load() {
      const [profileResult, listingResult] = await Promise.all([
        supabase.from('profiles_public').select('id, full_name, display_name, created_at').eq('id', personId).single(),
        supabase.from('services').select('provider_id').eq('id', serviceId).single(),
      ])
      if (profileResult.error || listingResult.error || !profileResult.data || !listingResult.data) return
      const role = listingResult.data.provider_id === personId ? 'provider' : 'requester'
      const { data, error } = await supabase.from('reviews').select('rating, comment, created_at')
        .eq('reviewee_id', personId).eq('reviewee_role', role).order('created_at', { ascending: false })
      if (!active) return
      const rows = error ? null : data || []
      setPerson({ ...profileResult.data, role, rows })
    }
    load().catch(() => {})
    return () => { active = false }
  }, [serviceId, personId])
  if (!person) return null
  // A failed review request must not be presented as a zero-review history.
  if (!person.rows) return null
  const count = person.rows.length
  return <ReputationCard label={person.role === 'provider' ? 'Provider' : 'Requester'}
    name={person.full_name || person.display_name || 'Name unavailable'} memberSince={person.created_at}
    onPressReviews={() => navigation.navigate('ReviewsList', {
      revieweeId: personId, revieweeName: person.full_name || person.display_name,
      revieweeRole: person.role,
    })}
    ratingCount={count} ratingAvg={count ? person.rows.reduce((sum, r) => sum + (r.rating || 0), 0) / count : 0}
    reviews={person.rows.filter(r => r.comment).slice(0, 3)} />
}
