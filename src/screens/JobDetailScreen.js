import {JobArrangementSummary,JobStatusNotice} from '../components/JobArrangementSummary'
import {JobPrivateGallery} from '../components/JobPrimaryImage'
import {jobMapTarget} from '../../shared/jobMapTarget'
import {formatOfferAvailability} from '../../shared/offers'
import {formatDate as nzDate,formatMoney as nzMoney} from '../../shared/formatting.js'
import {toLocalIsoDate} from '../../shared/dates'
import {offerDefaultDay, requestedLabel} from '../../shared/requestedDate'
import { localDate } from '../lib/quickPickDates'
import { useIsFocused } from '@react-navigation/native'
import { respondToJobInvitation } from '../lib/invites'
import { ACTIVE_JOB_INVITATIONS } from '../../shared/jobInvitations'
import React, { useEffect, useRef, useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import DateChips from '../components/DateChips'
import NativeDateTimePicker, { openDateTimePicker } from '../components/NativeDateTimePicker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { jobStatusLabel } from '../lib/lifecycle'
import { jobNextMove } from '../lib/nextMove'
import { markJobComplete, acceptBid } from '../lib/jobActions'
import { HOURLY_OFFER_GUIDANCE, initialOfferLines, updateOfferPricingDescription, editOfferPriceDescription, OFFER_PRICING_TYPES, OFFER_MATERIALS_OPTIONS, OFFER_MATERIALS_LABELS, formatOfferAmount, offerStatusLabel } from '../lib/offers'
import { jobReviewStatus } from '../../shared/jobReviewStatus'
import ReceivedReview from '../components/ReceivedReview'
import Icon from '../components/Icon'
import SideHeader from '../components/SideHeader'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { colors, spacing, radius, touchTarget, typography } from '../theme/tokens'
import PressableCard from '../components/PressableCard'
import ReviewModal from '../components/ReviewModal'
import { trackEvent } from '../lib/analytics'
import { addToWatchlist, removeFromWatchlist } from '../lib/watchlist'
import { loadReview, saveReview } from '../lib/reviews'
import { fetchProviderStats } from '../lib/providerStats'
import { staticMapUrl, staticMapPolygonUrl } from '../lib/maps'
import { coarseSuburb, stripPlusCode } from '../lib/location'
import { canProvide } from '../lib/roles'
import { useUser } from '../context/UserContext'
import { recordJobProviderView } from '../lib/listingPerformance'
import WorkScheduleCard from '../components/WorkScheduleCard'
import NextMoveBanner from '../components/NextMoveBanner'
import ArrivalWindowModal from '../components/ArrivalWindowModal'
import JobPaymentHandoff from '../components/JobPaymentHandoff'
import { paymentAcknowledgementAvailable } from '../../shared/paymentAcknowledgement'
import MarkCompleteSheet from '../components/MarkCompleteSheet'
import ConfirmJobSheet from '../components/ConfirmJobSheet'
import {
  addWorkToPhoneCalendar,
  fetchWorkSchedule,
  saveArrivalWindow,
  arrivalErrorMessage,
  sendRunningLate,
} from '../lib/workSchedule'

const MATERIALS_LABELS = {
  none:      'No materials needed',
  requester: 'Requester supplies materials',
  provider:  'Provider to supply materials',
}
const ACCESS_LABELS = {
  park_and_walk:  'Park and walk in',
  '4wd_required': '4WD required',
  dogs_on_property: 'Dogs on property',
  livestock_nearby: 'Livestock nearby',
  electric_fences: 'Electric fences',
  contact_before_arrival: 'Contact before arrival',
}

function jobStaticMapUrl(job) {
  if (job.area_polygon?.length >= 3) {
    return staticMapPolygonUrl(job.area_polygon, { zoom: 13, width: 700, height: 200 })
  }
  return staticMapUrl(parseFloat(job.latitude), parseFloat(job.longitude), { zoom: 13, width: 700, height: 200 })
}

function jobBudget(job) {
  return job.price_type === 'fixed' ? `${nzMoney(job.price)}`
    : job.price_type === 'unpaid' ? 'Free / in-kind'
    : 'Open to offers'
}

function jobLocation(job) {
  return stripPlusCode(job.location_name) || job.location_area || "Location shared once you're accepted"
}

// When the requester asked for the job — every schedule type:
// "Sat 15 Nov" | "15–18 Nov" | "Flexible" | "As soon as possible" (+ " (passed)").
function jobRequested(job) {
  return requestedLabel(job, toLocalIsoDate(new Date()))
}

export default function JobDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets()
  const { job: initialJob } = route.params
  // When the owner drilled in here from Manage job (to review offers / Q&A),
  // hide the "Manage job" shortcut so Back returns straight to Manage rather
  // than stacking another management screen.
  const fromManage = route.params?.fromManage === true
  const { refreshProfile } = useUser()
  const [job, setJob] = useState(initialJob)
  const [bids, setBids] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const submittingBidRef = useRef(false)
  const [offerFeedback, setOfferFeedback] = useState('')
  const [alreadyBid, setAlreadyBid] = useState(false)
  const [myBid, setMyBid] = useState(null)
  const [requesterProfile, setRequesterProfile] = useState(null)
  const focused = useIsFocused()
  const [verifiedJobId, setVerifiedJobId] = useState(null)
  const [jobUnavailable, setJobUnavailable] = useState(false)
  const [myInvite, setMyInvite] = useState(null)
  const [isWatched, setIsWatched] = useState(false)
  const [requesterReview, setRequesterReview] = useState(undefined)
  const [reviewVisible, setReviewVisible] = useState(false)
  const [savingReview, setSavingReview] = useState(false)
  const [receivedReview, setReceivedReview] = useState(undefined)
  const savingReviewRef = useRef(false)
  const savingArrivalRef = useRef(false)
  const completingRef = useRef(false)
  const acceptingOfferRef = useRef(false)
  const [acceptingBidId, setAcceptingBidId] = useState(null)

  // Requester-side: review the provider after provider-led completion.
  const [providerReview, setProviderReview] = useState(undefined)
  const [providerReviewVisible, setProviderReviewVisible] = useState(false)
  const [savingProviderReview, setSavingProviderReview] = useState(false)
  const [workSchedule, setWorkSchedule] = useState(null)
  const justConfirmed = useRef(null)
  const [arrivalModalVisible, setArrivalModalVisible] = useState(false)
  const [confirmJobVisible, setConfirmJobVisible] = useState(false)
  const [completeVisible, setCompleteVisible] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [savingArrival, setSavingArrival] = useState(false)

  // Bid form state (Features 3 & 4)
  const [editingBid,        setEditingBid]        = useState(false)
  const [lineItems,         setLineItems]         = useState(initialOfferLines)
  const [bidMessage,        setBidMessage]        = useState('')
  const [availableFrom,     setAvailableFrom]     = useState(null)
  const [showDatePicker,    setShowDatePicker]    = useState(false)
  const offerDateDefaulted = useRef(false)

  const [estimatedDuration, setEstimatedDuration] = useState('')
  const [bidPricingType,    setBidPricingType]    = useState('fixed')
  const [bidMaterials,      setBidMaterials]      = useState('included')

  function availabilityPickerOptions() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return { value: availableFrom || today, minimumDate: today, onSelect: setAvailableFrom }
  }

  function openAvailabilityDatePicker() {
    openDateTimePicker({ ...availabilityPickerOptions(), onShow: () => setShowDatePicker(true) })
  }

  // Q&A state (Feature 2)
  const [questions,    setQuestions]    = useState([])
  const [askText,      setAskText]      = useState('')
  const [showAskInput, setShowAskInput] = useState(false)
  const [answeringId,  setAnsweringId]  = useState(null)
  const [answerText,   setAnswerText]   = useState('')
  const [submittingQ,  setSubmittingQ]  = useState(false)

  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const openJobScrollRef = useRef(null)
  const questionFocusPending = useRef(false)
  const bidMessageRef = useRef(null)

  useEffect(() => { if (focused) fetchData() }, [initialJob.id, focused])

  useEffect(() => {
    if (job.status !== 'completed' || !currentUser?.id || myBid?.status !== 'accepted') return
    fetchRequesterReview()
    fetchReceivedReview(job.requester_id, 'requester')
  }, [job.status, currentUser?.id, myBid?.id, myBid?.status])

  useEffect(() => {
    const isOwner = currentUser?.id === job.requester_id
    if (!isOwner || job.status !== 'completed' || !currentUser?.id) return
    fetchProviderReview()
    const providerId = bids.find(bid => bid.status === 'accepted')?.provider_id
    if (providerId) fetchReceivedReview(providerId, 'provider')
  }, [job.status, currentUser?.id, bids])

  async function fetchData() {
    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUser(user)

    // Read through jobs_public so the exact address stays masked for viewers who
    // aren't the owner or the accepted provider (can_see_job_location decides).
    const { data: latestJob } = await supabase.from('jobs_public').select('*').eq('id', initialJob.id).single()
    if (!latestJob) { setJobUnavailable(true); setMyInvite(null); return }
    setJobUnavailable(false)
    const currentJob = latestJob
    setJob(currentJob)
    setVerifiedJobId(currentJob.id)

    trackEvent('job_viewed', { job_id: currentJob.id, category: currentJob.category })
    recordJobProviderView(currentJob.id)

    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(profileData)
    const schedule = await fetchWorkSchedule({ jobId: currentJob.id })
    const confirmed = justConfirmed.current
    setWorkSchedule(schedule || (confirmed?.jobId === currentJob.id ? confirmed.arrival : null))
    if (schedule && confirmed?.jobId === currentJob.id) justConfirmed.current = null

    const { data: bidsData } = await supabase
      .from('bids')
      .select('*, line_items, available_from, estimated_duration')
      .eq('job_id', currentJob.id)
      .order('created_at', { ascending: false })

    if (bidsData && bidsData.length > 0) {
      const providerIds = [...new Set(bidsData.map(b => b.provider_id))]
      const [{ data: providerProfiles }, stats] = await Promise.all([
        supabase.from('profiles_public').select('id, full_name, avatar_url').in('id', providerIds),
        fetchProviderStats(providerIds),
      ])
      setBids(bidsData.map(bid => ({
        ...bid,
        profiles: providerProfiles?.find(p => p.id === bid.provider_id),
        stats: stats[bid.provider_id] || { ratingAvg: 0, ratingCount: 0, jobsDone: 0 },
      })))
    } else {
      setBids([])
    }

    const existingBid = bidsData?.find(b => b.provider_id === user.id)
    if (existingBid) {
      setAlreadyBid(true)
      setMyBid(existingBid)
      setLineItems(initialOfferLines(existingBid))
      setBidMessage(existingBid.message || '')
      setEstimatedDuration(existingBid.estimated_duration || '')
      setBidPricingType(existingBid.pricing_type || 'fixed')
      setBidMaterials(existingBid.materials || 'included')
      setAvailableFrom(localDate(existingBid.available_from))
    } else {
      setAlreadyBid(false)
      setMyBid(null)
      // New offer: start "Available from" on the requested (first) date when it
      // is today or later. Once only, so clearing or changing it sticks.
      if (!offerDateDefaulted.current) {
        offerDateDefaulted.current = true
        const requestedDay = offerDefaultDay(currentJob, toLocalIsoDate(new Date()))
        if (requestedDay) setAvailableFrom(current => current || localDate(requestedDay))
      }
    }

    const { data: reqProfile } = await supabase
      .from('profiles_public').select('id, full_name, avatar_url').eq('id', currentJob.requester_id).single()
    setRequesterProfile(reqProfile)

    // Invited-provider context: show the "you were invited" banner, and mark the
    // invite seen so the requester can tell it's been opened.
    if (currentJob.status === 'open' && currentJob.requester_id !== user.id) {
      const { data: inv } = await supabase
        .from('job_invites')
        .select('id, status, revision')
        .in('status', ACTIVE_JOB_INVITATIONS)
        .eq('job_id', currentJob.id)
        .eq('provider_id', user.id)
        .maybeSingle()
      setMyInvite(inv || null)
      if (inv && inv.status === 'pending') {
        respondToJobInvitation(inv, 'view').then(() => {})
      }
    } else {
      setMyInvite(null)
    }

    const { data: watchData } = await supabase
      .from('watchlist').select('id').eq('user_id', user.id).eq('job_id', currentJob.id).maybeSingle()
    setIsWatched(!!watchData)

    // Q&A fetch (Feature 2)
    try {
      const { data: qs } = await supabase
        .from('job_questions').select('*').eq('job_id', currentJob.id).order('created_at', { ascending: true })
      if (qs?.length > 0) {
        const askerIds = [...new Set(qs.map(q => q.asker_id).filter(Boolean))]
        const { data: askerProfiles } = await supabase.from('profiles_public').select('id, full_name').in('id', askerIds)
        setQuestions(qs.map(q => ({
          ...q,
          askerName: askerProfiles?.find(p => p.id === q.asker_id)?.full_name || 'Provider',
        })))
      } else {
        setQuestions(qs || [])
      }
    } catch { /* table may not exist yet */ }
  }

  async function fetchRequesterReview() {
    try {
      const review = await loadReview({ jobId: job.id, reviewerId: currentUser.id, reviewerRole: 'provider' })
      setRequesterReview(review)
    } catch { }
  }

  // The requester's review of me (the provider), shown on the completed job.
  async function fetchReceivedReview(participantId, role) {
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('rating, comment')
        .eq('job_id', job.id)
        .eq('reviewee_id', currentUser.id)
        .eq('reviewer_id', participantId)
        .eq('reviewer_role', role)
        .maybeSingle()
      setReceivedReview(error ? undefined : data || null)
    } catch { }
  }

  async function fetchProviderReview() {
    try {
      const review = await loadReview({ jobId: job.id, reviewerId: currentUser.id, reviewerRole: 'requester' })
      setProviderReview(review)
    } catch { }
  }

  async function handleSubmitProviderReview({ rating, comment }) {
    const accepted = bids.find(b => b.status === 'accepted')
    if (!currentUser?.id || !accepted?.provider_id) return
    if (savingReviewRef.current) return
    savingReviewRef.current = true
    setSavingProviderReview(true)
    try {
      const review = await saveReview({
        jobId: job.id, reviewerId: currentUser.id, revieweeId: accepted.provider_id,
        reviewerRole: 'requester', revieweeRole: 'provider', rating, comment,
      })
      setProviderReview(review)
      setProviderReviewVisible(false)
      Alert.alert('Review saved', 'Thanks for your feedback.')
    } catch (error) {
      Alert.alert('Could not save review', error.message)
    } finally {
      savingReviewRef.current = false
      setSavingProviderReview(false)
    }
  }

  async function handleWatchToggle() {
    if (!currentUser) return
    if (isWatched) {
      setIsWatched(false)
      await removeFromWatchlist(currentUser.id, job.id)
      Alert.alert('Removed from saved jobs')
    } else {
      setIsWatched(true)
      await addToWatchlist(currentUser.id, job.id)
      Alert.alert('Job saved')
    }
  }

  function getBidTotal() {
    return lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)
  }

  function updateLineItem(index, field, value) {
    setLineItems(prev => prev.map((li, i) => {
      if (i !== index) return li
      return field === 'label' ? editOfferPriceDescription(li, value) : { ...li, amount: value }
    }))
  }

  function changeBidPricingType(pricingType) {
    setBidPricingType(pricingType)
    setLineItems(prev => updateOfferPricingDescription(prev, pricingType))
  }

  function removeLineItem(index) {
    setLineItems(prev => prev.filter((_, i) => i !== index))
  }

  function addLineItem() {
    setLineItems(prev => [...prev, { label: '', amount: '' }])
  }

  function buildLineItemsPayload() {
    return lineItems
      .filter(li => li.amount || (!li.automaticLabel && li.label))
      .map(li => ({ label: li.label, amount: parseFloat(li.amount) || 0 }))
  }

  function handleEnableProviding() {
    Alert.alert(
      'Enable providing?',
      'This lets you make offers on jobs and advertise your own listings. You can still request help as usual.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Enable',
          onPress: async () => {
            const { error } = await supabase
              .from('profiles')
              .update({ primary_role: 'both', role: 'provider' })
              .eq('id', currentUser.id)
            if (error) { Alert.alert('Could not enable', error.message); return }
            await refreshProfile()   // update the tabs
            await fetchData()        // refresh this screen's profile → reveals the offer form
          },
        },
      ]
    )
  }

  async function handlePlaceBid() {
    const total = getBidTotal()
    if (!total || total <= 0) { Alert.alert('Missing Amount', 'Please enter an offer amount'); return }
    // Claim the submit synchronously — setState is async, so without this a fast
    // double-tap can insert two offers (same bug that duplicated posted jobs).
    if (submittingBidRef.current) return
    submittingBidRef.current = true
    setLoading(true)
    setOfferFeedback('')
    try {
      const { data, error } = await supabase.from('bids').insert({
        job_id:             job.id,
        provider_id:        currentUser.id,
        amount:             total,
        message:            bidMessage,
        status:             'pending',
        line_items:         buildLineItemsPayload(),
        available_from:     toLocalIsoDate(availableFrom),
        estimated_duration: estimatedDuration || null,
        pricing_type:       bidPricingType,
        materials:          job.materials_type === 'provider' ? bidMaterials : null,
      }).select('id, amount, status, message, line_items, available_from, estimated_duration, pricing_type, materials').single()
      if (error || !data) {
        Alert.alert('Could not send offer', error?.message || 'Your details are kept. Please try again.')
      } else {
        trackEvent('bid_placed', { job_id: job.id, amount: total })
        setMyBid(data)
        setOfferFeedback('Offer sent.')
        setAlreadyBid(true)
        setEditingBid(false)
        void fetchData().catch(() => {})
      }
    } catch (e) {
      Alert.alert("Couldn't send offer", e?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      submittingBidRef.current = false
    }
  }

  async function handleUpdateBid() {
    if (!myBid || submittingBidRef.current) return
    const total = getBidTotal()
    if (!total || total <= 0) { Alert.alert('Missing Amount', 'Please enter an offer amount'); return }
    submittingBidRef.current = true
    setLoading(true)
    try {
      const { data, error } = await supabase.from('bids').update({
        amount:             total,
        message:            bidMessage,
        line_items:         buildLineItemsPayload(),
        available_from:     toLocalIsoDate(availableFrom),
        estimated_duration: estimatedDuration || null,
        pricing_type:       bidPricingType,
        materials:          job.materials_type === 'provider' ? bidMaterials : null,
      }).eq('id', myBid.id).eq('status', 'pending').select('id').maybeSingle()
      if (error || !data) {
        Alert.alert('Could not update offer', error?.message || 'This offer has changed. Check the job before trying again.')
      } else {
        Alert.alert('Offer updated', 'Your changes have been saved.')
        setEditingBid(false)
        fetchData()
      }
    } catch (e) {
      Alert.alert("Couldn't send offer", e?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      submittingBidRef.current = false
    }
  }

  async function handleAskQuestion() {
    if (!askText.trim()) return
    setSubmittingQ(true)
    try {
      const { error } = await supabase.from('job_questions').insert({
        job_id:   job.id,
        asker_id: currentUser.id,
        question: askText.trim(),
      })
      if (error) { Alert.alert('Error', error.message); return }
      // The job owner is notified by a database trigger.
      setAskText('')
      setShowAskInput(false)
      fetchData()
    } finally {
      setSubmittingQ(false)
    }
  }

  async function handleAnswerQuestion(questionId) {
    if (!answerText.trim()) return
    setSubmittingQ(true)
    try {
      const { error } = await supabase.from('job_questions').update({
        answer:      answerText.trim(),
        answered_at: new Date().toISOString(),
      }).eq('id', questionId)
      if (error) { Alert.alert('Error', error.message); return }
      // The asker is notified by a database trigger.
      setAnsweringId(null)
      setAnswerText('')
      fetchData()
    } finally {
      setSubmittingQ(false)
    }
  }

  async function handleAcceptBid(bid) {
    if (acceptingOfferRef.current) return
    Alert.alert('Accept Offer', `Accept offer of ${nzMoney(bid.amount)} from ${bid.profiles?.full_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          if (acceptingOfferRef.current) return
          acceptingOfferRef.current = true
          setAcceptingBidId(bid.id)
          try {
            const { error } = await acceptBid(job, bid)
            if (error) {
              Alert.alert('Could not accept offer', error.message)
              if (error.code === 'stale') fetchData()
              return
            }
            trackEvent('bid_accepted', { job_id: job.id, provider_id: bid.provider_id })
            setJob(current => ({ ...current, status: 'accepted' }))
            setBids(current => current.map(offer => offer.id === bid.id ? { ...offer, status: 'accepted' } : offer))
            setOfferFeedback('Offer accepted.')
            void fetchData().catch(() => {})
          } catch (error) {
            Alert.alert('Could not accept offer', error?.message || 'Please try again.')
          } finally {
            acceptingOfferRef.current = false
            setAcceptingBidId(null)
          }
        },
      },
    ])
  }

  async function handleSubmitRequesterReview({ rating, comment }) {
    if (!currentUser?.id || !job.requester_id) return
    if (savingReviewRef.current) return
    savingReviewRef.current = true
    setSavingReview(true)
    try {
      const review = await saveReview({
        jobId: job.id, reviewerId: currentUser.id, revieweeId: job.requester_id,
        reviewerRole: 'provider', revieweeRole: 'requester', rating, comment,
      })
      setRequesterReview(review)
      setReviewVisible(false)
      Alert.alert('Review saved', 'Thanks for leaving feedback.')
    } catch (error) {
      Alert.alert('Could not save review', error.message)
    } finally {
      savingReviewRef.current = false
      setSavingReview(false)
    }
  }

  function handleDeclineInvite() {
    if (!myInvite) return
    Alert.alert(
      'Decline this invitation?',
      "It'll be removed from your invites. You can still be invited again later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            const { error } = await respondToJobInvitation(myInvite, 'decline')
            if (error) { Alert.alert('Could not decline', error.message); return }
            navigation.goBack()
          },
        },
      ]
    )
  }

  const isJobOwner        = currentUser?.id === job.requester_id
  const requesterOpen = isJobOwner && job.status === 'open'
  const requesterAccepted = isJobOwner && job.status === 'accepted'
  const compactRequesterDetails = requesterOpen || requesterAccepted

  useEffect(() => {
    if (!requesterAccepted || offerFeedback !== 'Offer accepted.') return
    const timer = setTimeout(() => setOfferFeedback(''), 4000)
    return () => clearTimeout(timer)
  }, [requesterAccepted, offerFeedback])
  const unansweredQuestions = questions.filter(question => !question.answer)
  const answeredQuestions = questions.filter(question => !!question.answer)
  const focusQuestions = route.params?.focusQuestions === true

  // The first unanswered question is the first scroll content below the title.
  // Re-arm on return from Manage, but never steal scroll after posting an answer.
  useEffect(() => {
    questionFocusPending.current = focused && focusQuestions
  }, [focused, focusQuestions, job.id])
  useEffect(() => {
    if (!requesterOpen || !unansweredQuestions.length || !questionFocusPending.current) return
    openJobScrollRef.current?.scrollTo({ y: 0, animated: false })
    questionFocusPending.current = false
  }, [focused, focusQuestions, requesterOpen, unansweredQuestions.length])

  const canProvideJobs    = canProvide(profile)
  const canBid            = !isJobOwner && job.status === 'open' && canProvideJobs
  // Requester-only account looking at an open job they don't own: offer needs
  // them to enable providing first.
  const needsProviderOptIn = !isJobOwner && job.status === 'open' && !!profile && !canProvideJobs
  const isAcceptedProvider = !isJobOwner && myBid?.status === 'accepted'
  // Confirmed once the provider has set BOTH the arrival time and how to be paid.
  const jobConfirmed = isAcceptedProvider && !!workSchedule?.arrival_start_at
  // Hidden-location job seen by anyone who isn't the owner or the accepted
  // provider: show the suburb only and no navigation, so location stays discreet.
  const discreetHouseSit = job.hide_exact_location && !isJobOwner && !isAcceptedProvider
  // jobs_public gives non-participants a locality and ~1 km coordinates only.
  const approximateLocation = job.location_exact === false && !isJobOwner && !isAcceptedProvider

  const headerJSX = (
    <View>
    <SideHeader kind="job" label="JOB" topInset={insets.top} />
    <View style={[styles.header, { paddingTop: 6 }]}>
      <View style={styles.headerTopRow}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button" accessibilityLabel="Go back">
          <Icon name="chevron-back" size={18} color={colors.primary} /><Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        {!isAcceptedProvider && currentUser && !isJobOwner && (
          <TouchableOpacity style={[styles.watchBtn, isWatched && styles.watchBtnActive]}
            onPress={handleWatchToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={isWatched ? 'Remove saved job' : 'Save job'}>
            <Icon name={isWatched ? 'bookmark' : 'bookmark-outline'} size={18} color={isWatched ? colors.primary : colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
      <Text style={[styles.headerTitle, requesterAccepted && styles.acceptedTitle]} numberOfLines={requesterAccepted ? 3 : undefined} accessibilityLabel={requesterAccepted ? job.title : undefined} accessibilityRole="header">{job.title}</Text>
      {job.status==='completed'&&(isAcceptedProvider||isJobOwner)&&<JobStatusNotice>Job completed.</JobStatusNotice>}
      {((offerFeedback==='Offer sent.'&&job.status==='open')||(offerFeedback==='Offer accepted.'&&job.status==='accepted'))&&<JobStatusNotice>{offerFeedback}</JobStatusNotice>}
    </View>
    </View>
  )

  // ─── Provider accepted view ───────────────────────────────────────────────────
  if (jobUnavailable || (initialJob.visibility === 'invite_only' && verifiedJobId !== initialJob.id)) {
    return <View style={styles.container}>{headerJSX}<Text style={styles.title}>{jobUnavailable ? 'This job is unavailable.' : 'Loading job…'}</Text></View>
  }

  if (isAcceptedProvider) {
    const requesterFirstName = requesterProfile?.full_name?.split(' ')[0] || 'the requester'
    const otherBidCount = Math.max(0, bids.length - 1)
    const budgetText = jobBudget(job)
    const isCompleted = job.status === 'completed'
    const isCancelled = job.status === 'cancelled'

    function handleChat() {
      navigation.navigate('Chat', {
        jobId: job.id, jobTitle: job.title,
        otherUserId: job.requester_id,
        otherUserName: requesterProfile?.full_name || 'Requester',
      })
    }

    function handleMarkComplete() {
      setCompleteError('')
      setCompleteVisible(true)
    }

    async function completeJob() {
      if (completingRef.current) return
      completingRef.current = true
      setCompleting(true); setCompleteError('')
      try {
        const { error } = await markJobComplete(job.id)
        if (error) {
          setCompleteError(error.message || 'Could not update. Please try again.')
          if (error.code === 'stale') fetchData()
          return
        }
        trackEvent('job_marked_complete', { job_id: job.id })
        setCompleteVisible(false)
        setJob(prev => ({ ...prev, status: 'completed' }))
      } catch (e) {
        setCompleteError(e?.message || 'Could not update. Please try again.')
      } finally {
        completingRef.current = false
        setCompleting(false)
      }
    }

    async function handleSaveArrivalWindow(start, end, expectedComplete) {
      if (savingArrivalRef.current) return
      savingArrivalRef.current = true
      setSavingArrival(true)
      try {
        const { data, error } = await saveArrivalWindow({ jobId: job.id, start, end, expectedComplete })
        if (error) {
          Alert.alert("Couldn't save arrival time", arrivalErrorMessage(error))
          return
        }
        setWorkSchedule(data)
        setArrivalModalVisible(false)
        Alert.alert('Arrival time saved', `${requesterFirstName} has been notified.`)
      } catch (e) {
        Alert.alert("Couldn't save arrival time", e?.message || 'Something went wrong. Please try again.')
      } finally {
        savingArrivalRef.current = false
        setSavingArrival(false)
      }
    }

    function handleRunningLate() {
      Alert.alert('How late are you running?', `${requesterFirstName} will be notified immediately.`, [
        { text: '15 minutes', onPress: () => submitLateNotice(15) },
        { text: '30 minutes', onPress: () => submitLateNotice(30) },
        { text: 'Cancel', style: 'cancel' },
      ])
    }

    async function submitLateNotice(minutes) {
      try {
        const { error } = await sendRunningLate({ jobId: job.id, minutes })
        if (error) {
          Alert.alert('Notice not sent', error.message || 'Please try again.')
          return
        }
        Alert.alert('Update sent', `${requesterFirstName} has been told you are about ${minutes} minutes late.`)
      } catch (e) {
        Alert.alert('Notice not sent', e?.message || 'Please try again.')
      }
    }

    const offerDate = localDate(myBid?.available_from)
    const arrivalSuggestion = offerDate && offerDate > new Date()
      ? myBid.available_from
      : job.scheduled_date || job.date_from

    // Header label: whose turn + what's next ("Waiting on you to confirm") rather
    // than the bare status; completed / cancelled keep their status word.
    const providerMove = jobNextMove(job, 'provider', {
      otherName: requesterProfile?.full_name,
      hasArrival: !!workSchedule?.arrival_start_at,
      arrivalAt: workSchedule?.arrival_start_at,
    })

    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {headerJSX}
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={Platform.OS === 'android'}>
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

          <JobPrivateGallery key={job.id} jobId={job.id} revision={focused} style={{width:'100%',height:200}}/>
          {!isCancelled&&<JobArrangementSummary arrival={workSchedule?.arrival_start_at} duration={myBid?.estimated_duration}/>}
          <View style={styles.acceptedCard}>
            <View style={styles.acceptedCardHeader}>
              <Text style={styles.category}>Category: {job.category}</Text>
              <View style={[styles.acceptedBadge, isCancelled && styles.cancelledBadge]}>
                <Text style={[styles.acceptedBadgeText, isCancelled && styles.cancelledBadgeText]}>
                  {providerMove?.badge || jobStatusLabel(job.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.title}>{job.title}</Text>
            <Text style={styles.location}><Icon name="location-outline" size={13} color={colors.textMuted} /> Location: {jobLocation(job)}</Text>
            {isCancelled ? (
              <View style={styles.cancelBox}>
                <Text style={styles.cancelBoxTitle}>This job was cancelled by the requester</Text>
                {job.cancellation_reason ? (
                  <Text style={styles.cancelBoxText}>Reason: {job.cancellation_reason}</Text>
                ) : null}
                {job.cancellation_note ? (
                  <Text style={styles.cancelBoxNote}>“{job.cancellation_note}”</Text>
                ) : null}
              </View>
            ) : (
              <View style={styles.infoBoxGreen}>
                <Text style={styles.infoBoxGreenText}>
                  {isCompleted
                    ? `This job is complete. You can now review ${requesterFirstName}.`
                    : `This job has been awarded to you for ${nzMoney(myBid.amount)}. Use chat to confirm timing and details with ${requesterFirstName}.`}
                </Text>
              </View>
            )}
          </View>

          {(!isCompleted && !isCancelled) ? (
            <TouchableOpacity style={styles.chatBanner} onPress={handleChat} activeOpacity={0.85}
              accessibilityRole="button" accessibilityLabel={`Chat with ${requesterFirstName}`}>
              <Icon name="chatbubble-ellipses-outline" size={26} color={colors.white} style={styles.chatBannerIcon} />
              <View style={styles.chatBannerContent}>
                <Text style={styles.chatBannerTitle}>Chat with {requesterFirstName}</Text>
                <Text style={styles.chatBannerSubtitle}>Confirm timing and details</Text>
              </View>
              <Icon name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          ) : null}

          {(!isCompleted && !isCancelled) ? (
            jobConfirmed ? (
              <WorkScheduleCard
                schedule={workSchedule}
                canSetWindow
                onSetWindow={() => setArrivalModalVisible(true)}
                onAddCalendar={() => addWorkToPhoneCalendar({
                  title: job.title,
                  schedule: workSchedule,
                  location: jobLocation(job),
                  otherPartyName: requesterProfile?.full_name,
                })}
                onRunningLate={handleRunningLate}
              />
            ) : (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Confirm the job</Text>
                <Text style={styles.confirmBody}>Set your arrival time and how you&apos;d like to be paid — {requesterFirstName} will be notified.</Text>
                <Button title="Confirm job" onPress={() => setConfirmJobVisible(true)} accessibilityLabel="Confirm the job" />
              </View>
            )
          ) : null}

          {isCompleted && <>
            {jobReviewStatus(requesterReview === undefined ? undefined : !!requesterReview, receivedReview === undefined ? undefined : !!receivedReview, 'Requester').filter(Boolean).map(label => <Text key={label} style={styles.detailLabel}>{label}</Text>)}
            <ReceivedReview review={receivedReview} fromLabel="requester" />
          </>}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Job details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Category</Text>
              <Text style={styles.detailValue}>{job.category}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>Location: {jobLocation(job)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Budget</Text>
              <Text style={styles.detailValue}>{budgetText}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Your offer</Text>
              <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '700' }]}>{formatOfferAmount(myBid.amount, myBid.pricing_type)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Requested</Text>
              <Text style={styles.detailValue}>{jobRequested(job)}</Text>
            </View>
            {job.description ? (
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.detailLabel}>Details</Text>
                <Text style={[styles.detailValue, { flex: 1 }]} numberOfLines={4}>{job.description}</Text>
              </View>
            ) : null}
          </View>

          {isAcceptedProvider && ['accepted', 'in_progress', 'awaiting_completion', 'completed'].includes(job.status) && myBid?.id ? (
            <JobPaymentHandoff
              bidId={myBid.id}
              method={myBid.payment_method || null}
              sortedAt={myBid.payment_sorted_at || null}
              sortedBy={myBid.payment_sorted_by || null}
              requesterId={job.requester_id}
              providerId={currentUser?.id}
              canUpdate={paymentAcknowledgementAvailable(job.status, myBid.status, isAcceptedProvider)}
              canEditMethod={jobConfirmed && ['accepted', 'in_progress'].includes(job.status)}
              onChanged={fetchData}
            />
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            {jobMapTarget(job) && (
              <Button
                icon="navigate-outline"
                title={jobMapTarget(job)?.kind==='address'?'Navigate to job':'View job pin'}
                onPress={() => navigation.navigate('JobMap', { job, requesterName: requesterProfile?.full_name || 'Requester' })}
                style={{ marginBottom: 10 }}
              />
            )}
            {(!isCompleted && !isCancelled) ? (
              <Button
                icon="checkmark"
                title="Mark as completed"
                onPress={handleMarkComplete}
                style={{ marginBottom: 10 }}
                accessibilityLabel="Mark job as completed"
              />
            ) : null}
            {isCompleted ? (
              <Button
                title={requesterReview ? `Edit review (${requesterReview.rating}/5)` : 'Review requester'}
                onPress={() => setReviewVisible(true)}
                style={{ marginBottom: 10 }}
                accessibilityLabel={requesterReview ? 'Edit requester review' : 'Review requester'}
              />
            ) : null}
            <Button
              variant="secondary"
              title="View requester profile"
              onPress={() => navigation.navigate('RequesterProfile', { requesterId: job.requester_id })}
            />
          </View>

          {!isCancelled && (
            <View style={styles.infoBoxBlue}>
              <Text style={styles.infoBoxBlueText}>
                {otherBidCount > 0
                  ? `${otherBidCount} other offer${otherBidCount !== 1 ? 's were' : ' was'} not accepted. Your offer was selected.`
                  : `Your offer was accepted.`}
              </Text>
            </View>
          )}
          <View style={{ height: insets.bottom + 24 }} />
        </ScrollView>
        <ReviewModal
          visible={reviewVisible}
          title={requesterReview ? 'Edit requester review' : 'Review requester'}
          subtitle={`How was working with ${requesterProfile?.full_name || requesterFirstName}?`}
          initialRating={requesterReview?.rating || 0}
          initialComment={requesterReview?.comment || ''}
          saving={savingReview}
          onClose={() => setReviewVisible(false)}
          onSubmit={handleSubmitRequesterReview}
        />
        <ArrivalWindowModal
          visible={arrivalModalVisible}
          schedule={workSchedule}
          suggestedDate={arrivalSuggestion}
          job={job}
          offerDay={myBid?.available_from}
          saving={savingArrival}
          onClose={() => setArrivalModalVisible(false)}
          onSave={handleSaveArrivalWindow}
        />
        <MarkCompleteSheet
          visible={completeVisible}
          otherFirstName={requesterFirstName}
          busy={completing}
          error={completeError}
          onClose={() => { if (!completing) setCompleteVisible(false) }}
          onConfirm={completeJob}
        />
        <ConfirmJobSheet
          visible={confirmJobVisible}
          bidId={myBid?.id}
          jobTitle={job.title}
          requesterFirst={requesterFirstName}
          job={job}
          availableFrom={myBid?.available_from}
          amount={myBid?.amount}
          pricingType={myBid?.pricing_type}
          onClose={() => setConfirmJobVisible(false)}
          onConfirmed={arrival => {
            justConfirmed.current = { jobId: job.id, arrival }
            setWorkSchedule(arrival)
            setConfirmJobVisible(false)
            fetchData()
            Alert.alert('Job confirmed', `${requesterFirstName} has been notified.`)
          }}
        />
        </KeyboardAvoidingView>
      </View>
    )
  }

  // ─── Normal view (requester + open provider) ──────────────────────────────────
  const bidTotal = getBidTotal()
  const acceptedBid = bids.find(b => b.status === 'accepted')
  const acceptedNextMove = requesterAccepted ? jobNextMove(job, 'requester', {
    otherName: acceptedBid?.profiles?.full_name,
    hasArrival: !!workSchedule?.arrival_start_at,
    arrivalAt: workSchedule?.arrival_start_at,
  }) : null
  const acceptedProviderName = acceptedBid?.profiles?.full_name || 'the provider'

  const bidFormJSX = (
    <>
      <View style={styles.privacyNote}>
        <Icon name="lock-closed-outline" size={14} color={colors.primary} />
        <Text style={styles.privacyNoteText}>
          Your offer is private — only you and the requester see it. Other offers stay private too, so send your best availability and approach.
        </Text>
      </View>

      <Text style={styles.offerLabel}>How is your price based?</Text>
      <View style={styles.offerSegRow}>
        {OFFER_PRICING_TYPES.map(o => (
          <TouchableOpacity
            key={o.id}
            style={[styles.offerSeg, bidPricingType === o.id && styles.offerSegActive]}
            onPress={() => changeBidPricingType(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: bidPricingType === o.id }}>
            <Text style={[styles.offerSegText, bidPricingType === o.id && styles.offerSegTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {bidPricingType === 'hourly' && <Text style={styles.offersHint}>{HOURLY_OFFER_GUIDANCE}</Text>}
      {lineItems.map((li, idx) => (
        <View key={idx} style={styles.lineItemRow}>
          <TextInput
            style={[styles.input, styles.lineItemLabel]}
            placeholder="e.g. Labour"
            value={li.label}
            onChangeText={v => updateLineItem(idx, 'label', v)}
            accessibilityLabel={`Line item ${idx + 1} description`}
          />
          <TextInput
            style={[styles.input, styles.lineItemAmount]}
            placeholder="$0"
            value={li.amount}
            onChangeText={v => updateLineItem(idx, 'amount', v)}
            keyboardType="numeric"
            accessibilityLabel={`Line item ${idx + 1} amount`}
          />
          {lineItems.length > 1 && (
            <TouchableOpacity onPress={() => removeLineItem(idx)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Remove line item">
              <Icon name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      ))}
      <TouchableOpacity onPress={addLineItem} style={styles.addLineItemBtn}>
        <Text style={styles.addLineItemText}>+ Add line item</Text>
      </TouchableOpacity>
      {lineItems.length > 1 && (
        <View style={styles.bidTotalRow}>
          <Text style={styles.bidTotalLabel}>Offer total</Text>
          <Text style={styles.bidTotalAmount}>{nzMoney(bidTotal.toFixed(2))}</Text>
        </View>
      )}

      {job.materials_type === 'provider' && (
        <>
          <Text style={styles.offerLabel}>This job needs you to supply materials — how are they priced?</Text>
          <View style={styles.offerSegRow}>
            {OFFER_MATERIALS_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.id}
                style={[styles.offerSeg, bidMaterials === o.id && styles.offerSegActive]}
                onPress={() => setBidMaterials(o.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: bidMaterials === o.id }}>
                <Text style={[styles.offerSegText, bidMaterials === o.id && styles.offerSegTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TextInput
        ref={bidMessageRef}
        style={[styles.input, styles.multiline]}
        placeholder="Add a message (optional)"
        value={bidMessage}
        onChangeText={setBidMessage}
        multiline numberOfLines={3}
        textAlignVertical="top"
        autoCapitalize="sentences"
        returnKeyType="done"
        accessibilityLabel="Message to requester, optional"
      />

      <DateChips value={availableFrom} requestedLabel={jobRequested(job)} onSelect={setAvailableFrom} onOpen={openAvailabilityDatePicker} />
      <TouchableOpacity style={styles.availabilityBtn} onPress={openAvailabilityDatePicker}
        accessibilityRole="button" accessibilityLabel="Set availability date">
        <Text style={styles.availabilityBtnText}>
          <Icon name="calendar-outline" size={14} color={colors.textSecondary} /> {availableFrom
            ? `Available from ${formatOfferAvailability(toLocalIsoDate(availableFrom))}`
            : 'Set availability date (optional)'}
        </Text>
        {availableFrom && (
          <TouchableOpacity onPress={() => setAvailableFrom(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      <NativeDateTimePicker
        visible={showDatePicker}
        {...availabilityPickerOptions()}
        onDone={() => setShowDatePicker(false)}
      />

      <TextInput
        style={styles.input}
        placeholder="Estimated duration (e.g. 1 day, 3 hours) — optional"
        value={estimatedDuration}
        onChangeText={setEstimatedDuration}
        accessibilityLabel="Estimated duration"
      />

      <Button
        title={editingBid ? 'Update Offer' : 'Submit Offer'}
        onPress={editingBid ? handleUpdateBid : handlePlaceBid}
        loading={loading}
        accessibilityLabel={editingBid ? 'Update offer' : 'Submit offer'}
      />
      {editingBid && (
        <TouchableOpacity style={styles.cancelEditBtn} onPress={() => setEditingBid(false)}>
          <Text style={styles.cancelEditBtnText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </>
  )

  const renderQuestion = q => (

              <View key={q.id} style={styles.questionCard}>
                <View style={styles.questionRow}>
                  <Text style={styles.questionAsker}>{q.askerName}</Text>
                  <Text style={styles.questionDate}>
                    {nzDate(new Date(q.created_at))}
                  </Text>
                </View>
                <Text style={styles.questionText}>{q.question}</Text>
                {q.answer ? (
                  <View style={styles.answerBlock}>
                    <Text style={styles.answerLabel}>Answer:</Text>
                    <Text style={styles.answerText}>{q.answer}</Text>
                  </View>
                ) : isJobOwner ? (
                  answeringId === q.id ? (
                    <View style={styles.answerInputBlock}>
                      <TextInput
                        style={[styles.input, styles.multiline]}
                        placeholder="Type your answer..."
                        value={answerText}
                        onChangeText={setAnswerText}
                        multiline numberOfLines={3}
                        textAlignVertical="top"
                        autoFocus
                        accessibilityLabel="Answer"
                      />
                      <View style={styles.qaActionRow}>
                        <Button
                          size="sm"
                          title="Post answer"
                          onPress={() => handleAnswerQuestion(q.id)}
                          loading={submittingQ}
                        />
                        <TouchableOpacity onPress={() => { setAnsweringId(null); setAnswerText('') }}>
                          <Text style={styles.cancelEditBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => { setAnsweringId(q.id); setAnswerText('') }}
                      style={requesterOpen ? styles.requesterAnswerBtn : styles.answerBtn}
                      accessibilityRole="button" accessibilityLabel={`Answer this question: ${q.question}`}>
                      <Text style={requesterOpen ? styles.requesterAnswerBtnText : styles.answerBtnText}>Answer this question</Text>
                    </TouchableOpacity>
                  )
                ) : (
                  <Text style={styles.pendingAnswerText}>Awaiting answer from requester</Text>
                )}
              </View>
  )
  const questionsJSX = (
    <>
        {/* Feature 2: Q&A section */}
        {job.status === 'open' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Questions & Answers</Text>
            {questions.length === 0 && (
              <EmptyState
                compact
                icon="chatbubbles-outline"
                title="No questions yet"
                body="Questions about this job will show up here."
              />
            )}
            {(requesterOpen ? unansweredQuestions : questions).map(renderQuestion)}
            {!isJobOwner && currentUser && (
              showAskInput ? (
                <View>
                  <TextInput
                    style={[styles.input, styles.multiline]}
                    placeholder="Ask the requester a question about this job..."
                    value={askText}
                    onChangeText={setAskText}
                    multiline numberOfLines={3}
                    textAlignVertical="top"
                    autoFocus
                    accessibilityLabel="Your question"
                  />
                  <View style={styles.qaActionRow}>
                    <Button
                      size="sm"
                      title="Post question"
                      onPress={handleAskQuestion}
                      loading={submittingQ}
                      disabled={!askText.trim()}
                    />
                    <TouchableOpacity onPress={() => { setShowAskInput(false); setAskText('') }}>
                      <Text style={styles.cancelEditBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Button
                  variant="secondary"
                  icon="help-circle-outline"
                  title="Ask a question"
                  onPress={() => setShowAskInput(true)}
                  style={{ marginTop: 8 }}
                />
              )
            )}
          </View>
        )}

    </>
  )
  const offerDetails = bid => (
    <>
                {bid.line_items?.length > 1 && (
                  <View style={styles.lineItemsBreakdown}>
                    {bid.line_items.map((li, i) => (
                      <View key={i} style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>{li.label}</Text>
                        <Text style={styles.breakdownAmount}>{nzMoney((li.amount || 0).toFixed(2))}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {bid.message ? <Text style={styles.bidMessage}>{bid.message}</Text> : null}
                {bid.available_from && (
                  <Text style={styles.bidMeta}><Icon name="calendar-outline" size={12} color={colors.textMuted} /> Available: {formatOfferAvailability(bid.available_from)}</Text>
                )}
                {!requesterAccepted && bid.estimated_duration && (
                  <Text style={styles.bidMeta}><Icon name="time-outline" size={12} color={colors.textMuted} /> Est. duration: {bid.estimated_duration}</Text>
                )}
                {bid.materials && (
                  <Text style={styles.bidMeta}><Icon name="construct-outline" size={12} color={colors.textMuted} /> {OFFER_MATERIALS_LABELS[bid.materials] || bid.materials}</Text>
                )}
                {!requesterAccepted && <Text style={styles.bidStatus}>Status: {bid.status.toUpperCase()}</Text>}
    </>
  )
  const offersJSX = (
    <>
        {/* Bids list for job owner */}
        {isJobOwner && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {requesterAccepted ? 'Your provider' : bids.length === 0 ? 'Offers' : `${bids.length} Offer${bids.length > 1 ? 's' : ''} Received`}
            </Text>
            {!requesterAccepted && bids.length > 0 && (
              <Text style={styles.offersHint}>Private to you. Choose the right fit — reputation, location, availability and price.</Text>
            )}
            {!requesterAccepted && bids.length === 0 && (
              <EmptyState
                compact
                icon="pricetag-outline"
                title="No offers yet"
                body="When providers make an offer on your job, it'll appear here."
              />
            )}
            {(requesterAccepted ? bids.filter(bid => bid.status === 'accepted') : bids).map(bid => (
              <PressableCard key={bid.id} style={styles.bidCard}>
                <View style={requesterAccepted ? styles.acceptedProviderHeader : styles.bidHeader}>
                  <TouchableOpacity
                    style={styles.bidProvider}
                    onPress={() => navigation.navigate('ProviderProfile', { providerId: bid.provider_id })}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${bid.profiles?.full_name || 'provider'}'s profile`}>
                    {bid.profiles?.avatar_url ? (
                      <Image source={{ uri: bid.profiles.avatar_url }} style={styles.bidAvatar} />
                    ) : (
                      <View style={styles.bidAvatarFallback}>
                        <Text style={styles.bidAvatarInitials}>
                          {(bid.profiles?.full_name || '?').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bidName} numberOfLines={requesterAccepted ? undefined : 1}>{bid.profiles?.full_name || 'Provider'}</Text>
                      <Text style={styles.bidProviderMeta} numberOfLines={requesterAccepted ? undefined : 1}>
                        {bid.stats?.ratingCount > 0
                          ? `★ ${bid.stats.ratingAvg.toFixed(1)} (${bid.stats.ratingCount})`
                          : 'New provider'}
                        {requesterAccepted || bid.stats?.jobsDone > 0 ? ` · ${bid.stats?.jobsDone || 0} done` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.bidAmount}>{requesterAccepted ? 'Agreed price: ' : ''}{formatOfferAmount(bid.amount, bid.pricing_type)}</Text>
                </View>
                {!requesterAccepted && offerDetails(bid)}
                {bid.status === 'pending' && job.status === 'open' && (
                  <Button
                    icon="checkmark"
                    title={acceptingBidId === bid.id ? 'Saving…' : 'Accept This Offer'}
                    disabled={!!acceptingBidId}
                    onPress={() => handleAcceptBid(bid)}
                    style={{ marginTop: 4 }}
                    accessibilityLabel={`Accept offer from ${bid.profiles?.full_name}`}
                  />
                )}
                {bid.status === 'accepted' && (
                  <>
                    <Button
                      variant={requesterAccepted ? 'primary' : 'secondary'}
                      icon="chatbubble-ellipses-outline"
                      title="Chat with Provider"
                      onPress={() => navigation.navigate('Chat', {
                        jobId: job.id, jobTitle: job.title,
                        otherUserId: bid.provider_id,
                        otherUserName: bid.profiles?.full_name || 'Provider',
                      })}
                      style={{ marginTop: 6 }}
                      accessibilityLabel={`Chat with ${bid.profiles?.full_name}`}
                    />
                    <Button
                      variant="secondary"
                      title="View provider profile"
                      onPress={() => navigation.navigate('ProviderProfile', { providerId: bid.provider_id })}
                      style={{ marginTop: 6 }}
                      accessibilityLabel={`View ${bid.profiles?.full_name}'s profile`}
                    />
                  </>
                )}
              </PressableCard>
            ))}
          </View>
        )}
    </>
  )
  const jobDetailsJSX = (
    <>
        {/* Job card */}
        <View style={styles.card}>
          {!compactRequesterDetails && <View style={styles.cardHeader}>
            <Text style={styles.category}>Category: {job.category}</Text>
            <Text style={styles.price}>
              {jobBudget(job)}
            </Text>
          </View>}
          {!compactRequesterDetails && <Text style={styles.title} accessibilityRole="header">{job.title}</Text>}
          <Text style={styles.description}>{job.description}</Text>

          {/* Feature 1: materials/access */}
          {job.materials_type && (
            <View style={styles.accessRow}>
              <Icon name="construct-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.accessText}>{MATERIALS_LABELS[job.materials_type] || job.materials_type}</Text>
            </View>
          )}
          {job.access_conditions?.length > 0 && (
            <View style={styles.accessRow}>
              <Icon name="car-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.accessText}>{job.access_conditions.map(c => ACCESS_LABELS[c] || c).join(', ')}</Text>
            </View>
          )}
          {job.location_note && !requesterAccepted ? (
            <View style={styles.accessRow}>
              <Icon name="document-text-outline" size={14} color={colors.textSecondary} />
              <Text style={styles.accessText}>{job.location_note}</Text>
            </View>
          ) : null}

          <JobPrivateGallery key={job.id} jobId={job.id} revision={focused} style={{width:'100%',height:200}}/>
          {job.photos?.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoStrip} style={styles.photoStripWrap}>
              {job.photos.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={styles.photoStripImg} />
              ))}
            </ScrollView>
          )}

          {!!jobMapTarget(job) && !discreetHouseSit && (
            <TouchableOpacity style={styles.mapThumbWrap}
              onPress={() => navigation.navigate('JobMap', { job, requesterName: requesterProfile?.full_name || 'Requester' })}
              activeOpacity={0.9} accessibilityRole="button" accessibilityLabel="View job location pin on map">
              <Image source={{ uri: jobStaticMapUrl(job) }} style={styles.mapThumbImg} resizeMode="cover" />
              {job.area_hectares ? (
                <View style={styles.mapAreaBadge}>
                  <Text style={styles.mapAreaBadgeText}>{job.area_hectares} ha</Text>
                </View>
              ) : null}
              <View style={styles.mapTapHint}>
                <Text style={styles.mapTapHintText}>Tap to navigate <Icon name="arrow-forward" size={12} color={colors.white} /></Text>
              </View>
            </TouchableOpacity>
          )}

          <Text style={styles.location}><Icon name="location-outline" size={13} color={colors.textMuted} /> Location: {discreetHouseSit ? (coarseSuburb(job.location_area || job.location_name) || job.location_area || 'Area shared privately') : jobLocation(job)}</Text>
          {(discreetHouseSit || approximateLocation || (job.hide_exact_location && !job.location_name)) ? (
            <Text style={styles.locationNote}><Icon name="lock-closed-outline" size={12} color={colors.textMuted} /> Exact address is shared once your offer is accepted.</Text>
          ) : null}
          {job.location_note ? <Text style={styles.locationNote}><Icon name="document-text-outline" size={12} color={colors.textMuted} /> {job.location_note}</Text> : null}
          <Text style={styles.locationNote}><Icon name="calendar-outline" size={12} color={colors.textMuted} /> Requested: {jobRequested(job)}</Text>
          {!requesterAccepted && <Text style={styles.status}>Status: {job.status.toUpperCase()}</Text>}
        </View>

    </>
  )

  const paymentJSX = acceptedBid ? (
            <JobPaymentHandoff
              bidId={acceptedBid.id}
              method={acceptedBid.payment_method}
              sortedAt={acceptedBid.payment_sorted_at}
              sortedBy={acceptedBid.payment_sorted_by}
              requesterId={job.requester_id}
              providerId={acceptedBid.provider_id}
              canUpdate={paymentAcknowledgementAvailable(job.status, acceptedBid.status, isJobOwner)}
              onChanged={fetchData}
            />
  ) : null

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {headerJSX}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} enabled={Platform.OS === 'android'}>
      <ScrollView ref={openJobScrollRef} style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets={true}>

        {myInvite && (
          <View style={styles.invitedBanner}>
            <Icon name="mail-open-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.invitedBannerTitle}>{myInvite.status === 'accepted' ? 'Invitation accepted' : 'Invitation received'}</Text>
              <Text style={styles.invitedBannerSub}>
                {(requesterProfile?.full_name?.split(' ')[0] || 'The requester')} invited you directly. You can make an offer below.
              </Text>
            </View>
            {myInvite.status !== 'accepted' && <TouchableOpacity accessibilityRole="button" onPress={async () => {
              const { error } = await respondToJobInvitation(myInvite, 'accept')
              if (error) Alert.alert('Could not accept invitation', error.message)
              else setMyInvite({ ...myInvite, status: 'accepted' })
            }}><Text style={styles.declineLink}>Accept</Text></TouchableOpacity>}
            <TouchableOpacity
              onPress={handleDeclineInvite}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Decline this invitation">
              <Text style={styles.declineLink}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}

        {compactRequesterDetails ? <>
          {requesterOpen && unansweredQuestions.length > 0 && questionsJSX}
          {requesterAccepted && <NextMoveBanner nextMove={{ ...acceptedNextMove,
            label: acceptedNextMove?.label || 'Provider accepted',
            detail: `Provider accepted. ${acceptedNextMove?.detail || ''}`.trim(),
          }} style={{ marginBottom: spacing.md }} />}
          {offersJSX}
          {requesterAccepted && <>
            <JobArrangementSummary arrival={workSchedule?.arrival_start_at} duration={acceptedBid?.estimated_duration} />
            {paymentJSX}
          </>}
          <View style={styles.section}>
            <TouchableOpacity style={styles.detailsToggle} accessibilityRole="button" accessibilityLabel="Job details"
              accessibilityState={{ expanded: detailsExpanded }} onPress={() => setDetailsExpanded(value => !value)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailsTitle}>Job details</Text>
                <Text style={styles.locationNote}>{job.category}{' \u00b7 '}{jobBudget(job)}</Text>
              </View>
              <Icon name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {detailsExpanded && <>
              {jobDetailsJSX}
              {requesterAccepted && acceptedBid && offerDetails(acceptedBid)}
              {requesterOpen && answeredQuestions.length > 0 && <View>
                <Text style={styles.sectionTitle}>Answered questions</Text>
                {answeredQuestions.map(renderQuestion)}
              </View>}
            </>}
          </View>
        </> : jobDetailsJSX}

        {/* Owner shortcut to the management screen (edit / share / cancel / delete).
            Hidden when we arrived from Manage, so Back just returns there. */}
        {isJobOwner && !fromManage && (
          <Button
            icon="settings-outline"
            title="Manage job"
            onPress={() => navigation.navigate('ManageTask', { job, bidCount: bids.length })}
            style={{ marginBottom: 16 }}
            accessibilityLabel="Manage this job"
          />
        )}

        {isJobOwner && acceptedBid && ['in_progress', 'awaiting_completion', 'completed'].includes(job.status) && (
          <>
            <JobArrangementSummary arrival={workSchedule?.arrival_start_at}
              duration={acceptedBid.estimated_duration}/>
            {paymentJSX}
          </>
        )}

        {/* Requester: completed — leave / edit the provider review */}
        {isJobOwner && job.status === 'completed' && acceptedBid && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            {jobReviewStatus(providerReview === undefined ? undefined : !!providerReview, receivedReview === undefined ? undefined : !!receivedReview, 'Provider').filter(Boolean).map(label => <Text key={label} style={styles.detailLabel}>{label}</Text>)}
            <ReceivedReview review={receivedReview} fromLabel="provider" />
            <Button
              title={providerReview ? `Edit review (${providerReview.rating}/5)` : `Review ${acceptedProviderName}`}
              onPress={() => setProviderReviewVisible(true)}
              accessibilityLabel={providerReview ? 'Edit provider review' : 'Review provider'}
            />
          </View>
        )}

        {!requesterOpen && questionsJSX}

        {/* Features 3 & 4: Bid section for providers */}
        {canBid && (
          <View style={styles.section}>
            {alreadyBid && !editingBid ? (
              <>
                <Text style={styles.sectionTitle}>Your offer</Text>
                <View style={styles.myBidSummary}>
                  <Text style={styles.myBidAmount}>{formatOfferAmount(Number(myBid?.amount || 0).toFixed(2), myBid?.pricing_type)}</Text>
                  {myBid?.line_items?.length > 1 && (
                    <View style={styles.lineItemsBreakdown}>
                      {myBid.line_items.map((li, i) => (
                        <View key={i} style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel}>{li.label}</Text>
                          <Text style={styles.breakdownAmount}>{nzMoney((li.amount || 0).toFixed(2))}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {myBid?.message ? <Text style={styles.myBidMessage}>{myBid.message}</Text> : null}
                  {myBid?.available_from && (
                    <Text style={styles.myBidMeta}><Icon name="calendar-outline" size={12} color={colors.textMuted} /> Available from: {formatOfferAvailability(myBid.available_from)}</Text>
                  )}
                  {myBid?.estimated_duration && (
                    <Text style={styles.myBidMeta}><Icon name="time-outline" size={12} color={colors.textMuted} /> Est. duration: {myBid.estimated_duration}</Text>
                  )}
                  {myBid?.materials && (
                    <Text style={styles.myBidMeta}><Icon name="construct-outline" size={12} color={colors.textMuted} /> {OFFER_MATERIALS_LABELS[myBid.materials] || myBid.materials}</Text>
                  )}
                  <Text style={styles.myBidStatus}>{offerStatusLabel(myBid?.status)}</Text>
                </View>
                {myBid?.status === 'pending' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    title="Edit offer"
                    onPress={() => setEditingBid(true)}
                    style={{ marginTop: 4 }}
                    accessibilityLabel="Edit your offer"
                  />
                )}
              </>
            ) : (
              <>
                <Text style={styles.sectionTitle}>{editingBid ? 'Edit your offer' : 'Make an Offer'}</Text>
                {bidFormJSX}
              </>
            )}
          </View>
        )}

        {/* Requester-only account: prompt to enable providing before offering */}
        {needsProviderOptIn && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Make an offer</Text>
            <Text style={styles.optInBody}>
              Offering on jobs is a provider feature. Enable providing on your account to make an offer — you can still request help as usual.
            </Text>
            <Button
              title="Enable providing"
              icon="briefcase-outline"
              onPress={handleEnableProviding}
              style={{ marginTop: 12 }}
              accessibilityLabel="Enable providing to make an offer"
            />
          </View>
        )}

        {!compactRequesterDetails && offersJSX}
        <View style={{ height: insets.bottom + 24 }} />
      </ScrollView>
      </KeyboardAvoidingView>
      <ReviewModal
        visible={providerReviewVisible}
        title={providerReview ? 'Edit provider review' : 'Review provider'}
        subtitle={`How was working with ${acceptedProviderName}?`}
        initialRating={providerReview?.rating || 0}
        initialComment={providerReview?.comment || ''}
        saving={savingProviderReview}
        onClose={() => setProviderReviewVisible(false)}
        onSubmit={handleSubmitProviderReview}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },

  header: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  backBtn:     { minHeight: 36, justifyContent: 'center', flexDirection: 'row', alignItems: 'center' },
  backBtnText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  kicker:      { fontSize: 13, fontWeight: '700', color: colors.accent, marginBottom: 8 },
  headerTitle: { fontSize: 34, lineHeight: 38, fontWeight: '700', color: colors.textPrimary },

  watchBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center', opacity: 0.55 },
  watchBtnActive: { backgroundColor: '#ede7f6', opacity: 1 },
  watchBtnText:   { fontSize: 18 },

  invitedBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.primaryLight, borderRadius: 12, padding: 14, marginBottom: 16 },
  invitedBannerTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  invitedBannerSub:   { fontSize: 12.5, color: colors.textSecondary, marginTop: 3, lineHeight: 18 },
  declineLink:        { fontSize: 13, fontWeight: '700', color: colors.danger },

  card: { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  cardHeader:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  category:    { backgroundColor: colors.primaryLight, color: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontSize: 13, fontWeight: '600' },
  price:       { fontWeight: 'bold', color: colors.primary, fontSize: 15 },
  title:       { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
  description: { color: colors.textSecondary, fontSize: 15, marginBottom: 10, lineHeight: 24 },
  location:    { color: colors.textMuted, fontSize: 14, marginBottom: 6 },
  status:      { color: colors.textMuted, fontSize: 13 },

  // Feature 1: materials/access
  accessRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5 },
  accessIcon: { fontSize: 14 },
  accessText: { fontSize: 13, color: colors.textSecondary, flex: 1, lineHeight: 18 },

  section:      { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 14 },
  confirmBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: -4, marginBottom: 14 },
  optInBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },

  input:     { backgroundColor: colors.background, borderRadius: 8, padding: 14, fontSize: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  multiline: { height: 90, textAlignVertical: 'top' },

  // Feature 4: line items
  lineItemRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  lineItemLabel:   { flex: 1, marginBottom: 0 },
  lineItemAmount:  { width: 90, marginBottom: 0 },
  removeItemBtn:   { color: colors.textMuted, fontSize: 18, paddingHorizontal: 4 },
  addLineItemBtn:  { paddingVertical: 6, marginBottom: 4 },
  addLineItemText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  bidTotalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#e8e8e8', marginBottom: 10 },
  bidTotalLabel:   { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  bidTotalAmount:  { fontSize: 16, fontWeight: '700', color: colors.primary },

  // Offer pricing/materials segmented controls
  offerLabel:        { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, marginTop: 4 },
  offerSegRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  offerSeg:          { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.white },
  offerSegActive:    { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  offerSegText:      { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  offerSegTextActive:{ color: colors.primary },
  privacyNote:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: colors.primaryLight, borderRadius: 8, padding: 10, marginBottom: 14 },
  privacyNoteText:   { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 17 },
  offersHint:        { fontSize: 12, color: colors.textMuted, marginTop: -8, marginBottom: 12, lineHeight: 17 },

  availabilityBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.background, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  availabilityBtnText: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  clearDateBtn:        { color: colors.textMuted, fontSize: 16 },

  // Feature 3: editable bids
  myBidSummary: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10 },
  myBidAmount:  { fontSize: 18, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  myBidMessage: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  myBidMeta:    { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  myBidStatus:  { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  cancelEditBtn:   { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelEditBtnText: { color: colors.textMuted, fontSize: 14 },

  // Line items breakdown (bid display)
  lineItemsBreakdown: { marginVertical: 6, paddingVertical: 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e8e8e8' },
  breakdownRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  breakdownLabel:     { fontSize: 13, color: colors.textSecondary },
  breakdownAmount:    { fontSize: 13, color: colors.textPrimary, fontWeight: '600' },

  // Bids list
  bidCard:    { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  bidHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  bidProvider: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  bidAvatar:   { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: '#eee' },
  bidAvatarFallback: { width: 38, height: 38, borderRadius: 19, marginRight: 10, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  bidAvatarInitials: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  bidProviderMeta:   { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  bidName:    { fontWeight: 'bold', fontSize: 16, color: colors.textPrimary },
  bidAmount:  { fontWeight: 'bold', fontSize: 16, color: colors.primary },
  bidMessage: { color: colors.textSecondary, fontSize: 14, marginBottom: 6 },
  bidMeta:    { fontSize: 13, color: colors.textMuted, marginBottom: 2 },
  bidStatus:  { color: colors.textMuted, fontSize: 13, marginBottom: 8, marginTop: 4 },

  // Photos
  photoStripWrap: { marginBottom: 10, marginHorizontal: -4 },
  photoStrip:     { gap: 8, paddingHorizontal: 4, paddingVertical: 2 },
  photoStripImg:  { width: 100, height: 100, borderRadius: 8, backgroundColor: '#f0f0f0' },

  // Map thumbnail
  mapThumbWrap:      { borderRadius: 10, overflow: 'hidden', marginBottom: 10, position: 'relative', height: 130 },
  mapThumbImg:       { width: '100%', height: 130, backgroundColor: '#e0e0e0' },
  mapAreaBadge:      { position: 'absolute', top: 8, left: 8, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  mapAreaBadgeText:  { fontSize: 11, fontWeight: '700', color: colors.white },
  mapTapHint:        { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 6, alignItems: 'center' },
  mapTapHintText:    { fontSize: 12, fontWeight: '600', color: colors.white },
  locationNote:      { color: colors.textMuted, fontSize: 13, marginBottom: 6, lineHeight: 18 },

  acceptedTitle: { fontSize: typography.sizeXxl, lineHeight: spacing.xxxl },
  acceptedProviderHeader: { gap: spacing.sm, marginBottom: spacing.sm },
  detailsToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: touchTarget.minHeight },
  detailsTitle: { color: colors.textPrimary, fontSize: typography.sizeLg, fontWeight: '700', marginBottom: spacing.sm },
  requesterAnswerBtn: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, minHeight: touchTarget.minHeight, justifyContent: 'center', alignItems: 'center' },
  requesterAnswerBtnText: { color: colors.white, fontSize: typography.sizeSm, fontWeight: '700' },

  // Feature 2: Q&A
  questionCard:    { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e8e8e8' },
  questionRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  questionAsker:   { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  questionDate:    { fontSize: 12, color: colors.textMuted },
  questionText:    { fontSize: 14, color: '#333', lineHeight: 20, marginBottom: 8 },
  answerBlock:     { backgroundColor: '#f0faf5', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: colors.primary },
  answerLabel:     { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  answerText:      { fontSize: 14, color: '#333', lineHeight: 20 },
  pendingAnswerText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic' },
  answerBtn:         { paddingVertical: 6 },
  answerBtnText:     { fontSize: 13, color: colors.primary, fontWeight: '600' },
  answerInputBlock:  { marginTop: 8 },
  qaActionRow:       { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 8 },

  // Provider accepted view
  acceptedCard:       { backgroundColor: colors.white, borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: colors.primary },
  acceptedCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  acceptedBadge:      { backgroundColor: colors.primaryLight, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
  acceptedBadgeText:  { fontSize: 12, fontWeight: '700', color: colors.primary },
  infoBoxGreen:       { backgroundColor: colors.primaryLight, borderRadius: 8, padding: 12, marginTop: 10 },
  infoBoxGreenText:   { fontSize: 14, color: colors.primary, lineHeight: 20 },

  cancelledBadge:     { backgroundColor: '#fee2e2' },
  cancelledBadgeText: { color: '#991b1b' },
  cancelBox:          { backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#fecaca' },
  cancelBoxTitle:     { fontSize: 14, fontWeight: '700', color: '#991b1b', marginBottom: 4 },
  cancelBoxText:      { fontSize: 14, color: '#7f1d1d', lineHeight: 20, marginTop: 2 },
  cancelBoxNote:      { fontSize: 14, color: '#7f1d1d', lineHeight: 20, marginTop: 4, fontStyle: 'italic' },

  chatBanner:         { backgroundColor: colors.primary, borderRadius: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 18, minHeight: 72 },
  chatBannerIcon:     { fontSize: 26, marginRight: 14 },
  chatBannerContent:  { flex: 1 },
  chatBannerTitle:    { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 2 },
  chatBannerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  chatBannerArrow:    { fontSize: 30, color: 'rgba(255,255,255,0.7)', fontWeight: '300', marginLeft: 8 },

  detailRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f2f2f2' },
  detailLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600', flex: 0, marginRight: 12 },
  detailValue: { fontSize: 13, color: colors.textPrimary, fontWeight: '500', textAlign: 'right', flex: 1 },


  awaitingBox:     { backgroundColor: '#fef3c7', borderRadius: 10, padding: 14, marginBottom: 10 },
  awaitingBoxText: { fontSize: 14, color: '#92400e', lineHeight: 20, textAlign: 'center', fontWeight: '600' },

  infoBoxBlue:     { backgroundColor: colors.infoLight, borderRadius: 10, padding: 14, marginBottom: 16 },
  infoBoxBlueText: { fontSize: 14, color: colors.info, lineHeight: 20 },
})
