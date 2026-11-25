import assert from 'node:assert/strict'
import test from 'node:test'
import {openBooking} from './support/booking-confirm-screen.mjs'
import {guestIntentDestination} from '../src/lib/guestIntent.js'

const listing = {id: 'listing', title: 'Local service', kind: 'service', provider_id: 'provider',
  pricing_type: 'fixed', rate: 100, is_active: true, availability_updated_at: '2026-11-26T01:00:00Z',
  lead_time_type: 'next_day'}

test('mobile request review displays timing before submission and disables new requests when paused', async () => {
  const available = openBooking({service: {...listing, availability_status: 'limited'}})
  assert.match(available.texts(), /Estimated lead time: Next day/)
  assert.match(available.texts(), /Confirm the date with the provider/)
  const paused = openBooking({service: {...listing, availability_status: 'paused'}})
  assert.match(paused.texts(), /temporarily paused for new requests/)
  const submit = paused.find('Button', button => button.title === 'Send booking request')
  assert.ok(submit?.props.disabled)
  await submit.props.onPress()
  assert.equal(paused.log.writes.length, 0)
})

test('sign-in handoff opens paused listing details with no booking side effect', async () => {
  const client = {from(table) {
    assert.equal(table, 'services_public')
    return {select: () => ({eq: () => ({maybeSingle: async () => ({
      data: {...listing, availability_status: 'paused'},
    })})})}
  }}
  const [tab, destination] = await guestIntentDestination(client, {action: 'booking', id: listing.id})
  assert.equal(tab, 'Browse')
  assert.equal(destination.screen, 'ServiceDetail')
})

test('a quote form opened before the pause handles the database rejection without a success screen', async () => {
  const screen = openBooking({service: {...listing, pricing_type: 'quote_required'},
    fail: {code: 'P0A01', message: 'Database pause response'}})
  screen.find('AddressAutocomplete').props.onChangeText('Testtown')
  await screen.press('Request a quote')
  assert.equal(screen.log.writes.length, 1)
  assert.equal(screen.log.alerts.at(-1)[0], 'Requests paused')
  assert.ok(screen.find('Button', button => button.title === 'Request a quote').props.disabled)
  assert.equal(screen.log.navigation.length, 0)
})
