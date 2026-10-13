import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { CommonActions, StackRouter, TabRouter } from '@react-navigation/routers'

// App JS is compiled by Metro. Import this dependency-free module as ESM
// without changing the Expo project's package type.
const source = await readFile(new URL('../src/lib/listingEnquiry.js', import.meta.url), 'utf8')
const { canResumeGuestAction, listingChatParams, parsePendingListingEnquiry, listingEnquiryNavigationState } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const now = 10000000
const service = { id: 'listing-1', provider_id: 'owner-1', title: 'Winter grazing', profile: { full_name: 'Sam' } }
const raw = JSON.stringify({ service, savedAt: now })

test('handoff waits for the current profile and completion or skipping of onboarding', () => {
  const session = { user: { id: 'tester-1' } }
  const profile = { id: 'tester-1' }
  assert.equal(canResumeGuestAction(null, null, false, false), false)
  assert.equal(canResumeGuestAction(session, null, false, false), false)
  assert.equal(canResumeGuestAction(session, { id: 'previous-user' }, false, false), false)
  assert.equal(canResumeGuestAction(session, profile, true, false), false)
  assert.equal(canResumeGuestAction(session, profile, false, true), false)
  assert.equal(canResumeGuestAction(session, profile, false, false), true)
})

test('an enquiry survives storage with its listing and intended recipient', () => {
  const pending = parsePendingListingEnquiry(raw, now + 120000)
  assert.deepEqual(pending.service, service)
  assert.deepEqual(pending.chatParams, {
    serviceId: 'listing-1', otherUserId: 'owner-1', jobTitle: 'Winter grazing', otherUserName: 'Sam',
  })
})

test('malformed, incomplete and expired intents are ignored', () => {
  for (const input of [null, 'bad json', '{}', 'null', JSON.stringify({ service, savedAt: '10000000' }),
    JSON.stringify({ service: { id: 'listing-1' }, savedAt: now })]) {
    assert.equal(parsePendingListingEnquiry(input, now), null)
  }
  assert.equal(parsePendingListingEnquiry(raw, now + 3600000), null)
  assert.equal(parsePendingListingEnquiry(raw, now - 1), null)
})

test('recipient is derived from the listing and missing names have a fallback', () => {
  const pending = parsePendingListingEnquiry(JSON.stringify({
    service, savedAt: now, chatParams: { otherUserId: 'another-owner' },
  }), now)
  assert.equal(pending.chatParams.otherUserId, service.provider_id)
  assert.equal(listingChatParams(service, null).otherUserName, 'Provider')
})

test('the real tab router selects Listings and retains every main tab', () => {
  const pending = parsePendingListingEnquiry(raw, now)
  const routeNames = ['Home', 'Jobs', 'Browse', 'Activity', 'Account']
  const router = TabRouter({ initialRouteName: 'Home' })
  const state = router.getRehydratedState(listingEnquiryNavigationState(pending), {
    routeNames, routeParamList: {}, routeGetIdList: {},
  })
  assert.equal(state.routes[state.index].name, 'Browse')
  assert.deepEqual(state.routes.map(route => route.name), routeNames)
})

test('the real stack router opens Chat, then Back returns to the listing and browse', () => {
  const pending = parsePendingListingEnquiry(raw, now)
  const options = {
    routeNames: ['BrowseMain', 'ServiceDetail', 'Chat'], routeParamList: {}, routeGetIdList: {},
  }
  const router = StackRouter({ initialRouteName: 'BrowseMain' })
  let state = router.getRehydratedState(listingEnquiryNavigationState(pending).routes[2].state, options)
  assert.equal(state.routes[state.index].name, 'Chat')
  assert.deepEqual(state.routes[state.index].params, pending.chatParams)
  state = router.getStateForAction(state, CommonActions.goBack(), options)
  assert.equal(state.routes[state.index].name, 'ServiceDetail')
  assert.deepEqual(state.routes[state.index].params.service, service)
  state = router.getStateForAction(state, CommonActions.goBack(), options)
  assert.equal(state.routes[state.index].name, 'BrowseMain')
  assert.equal(router.getStateForAction(state, CommonActions.goBack(), options), null)
})
