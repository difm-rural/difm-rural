import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const source = await readFile(new URL('../shared/pushDelivery.js', import.meta.url), 'utf8')
const { pushMessageForDevice, schedulePhoneAlertTest, ANDROID_NOTIFICATION_CHANNEL } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const record = { type: 'new_message', body: 'New message', metadata: { booking_id: 'booking' } }

test('updated Android devices receive high-priority messages on their registered alert channel', () => {
  const message = pushMessageForDevice({ token: 'test-token', platform: 'android', channel_id: ANDROID_NOTIFICATION_CHANNEL }, record, 'New message')
  assert.equal(message.channelId, ANDROID_NOTIFICATION_CHANNEL)
  assert.equal(message.priority, 'high')
  assert.equal(message.sound, 'default')
  assert.deepEqual(message.data, record.metadata)
})
test('old Android installations are not routed to a channel they have never created', () => {
  const message = pushMessageForDevice({ token: 'test-token', platform: 'android' }, record, 'New message')
  assert.equal('channelId' in message, false)
})
test('iOS keeps its normal sound behaviour without Android channel settings', () => {
  const message = pushMessageForDevice({ token: 'test-token', platform: 'ios', channel_id: ANDROID_NOTIFICATION_CHANNEL }, record, 'New message')
  assert.equal('channelId' in message, false)
  assert.equal(message.sound, 'default')
})

test('local Android diagnostic uses the real alert channel with sound and a delayed trigger', async () => {
  let scheduled
  const api = {
    AndroidImportance: { DEFAULT: 3 }, AndroidNotificationPriority: { HIGH: 'high' },
    SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
    async getPermissionsAsync() { return { status: 'granted' } },
    async getNotificationChannelAsync(id) { assert.equal(id, ANDROID_NOTIFICATION_CHANNEL); return { importance: 4, sound: 'default' } },
    async scheduleNotificationAsync(notification) { scheduled = notification },
  }
  await schedulePhoneAlertTest(api, 'android')
  assert.equal(scheduled.content.sound, 'default')
  assert.equal(scheduled.content.priority, 'high')
  assert.equal(scheduled.trigger.channelId, ANDROID_NOTIFICATION_CHANNEL)
  assert.equal(scheduled.trigger.seconds, 5)
  api.getNotificationChannelAsync = async () => ({ importance: 4, sound: null })
  await assert.rejects(schedulePhoneAlertTest(api, 'android'), /silent or blocked/)
  api.getPermissionsAsync = async () => ({ status: 'denied' })
  await assert.rejects(schedulePhoneAlertTest(api, 'android'), /Allow notifications/)
})
