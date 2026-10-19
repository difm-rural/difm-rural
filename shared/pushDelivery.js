export const ANDROID_NOTIFICATION_CHANNEL = 'activity-alerts-v1'

export async function schedulePhoneAlertTest(notificationApi, platform) {
  const permission = await notificationApi.getPermissionsAsync()
  if (permission.status !== 'granted') throw new Error('Allow notifications for Rural Connections in your phone settings, then try again.')
  if (platform === 'android') {
    const channel = await notificationApi.getNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL)
    if (!channel) throw new Error('Restart the app to register Messages and activity alerts, then try again.')
    if (channel.importance < notificationApi.AndroidImportance.DEFAULT || channel.sound === null) {
      throw new Error('The Messages and activity notification category is silent or blocked. Set that category to Alert and choose a sound in your phone settings.')
    }
  }
  await notificationApi.scheduleNotificationAsync({
    content: {
      title: 'Rural Connections', body: 'Your phone alert test worked.', sound: 'default',
      ...(platform === 'android' ? { priority: notificationApi.AndroidNotificationPriority.HIGH } : {}),
    },
    trigger: {
      type: notificationApi.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false,
      ...(platform === 'android' ? { channelId: ANDROID_NOTIFICATION_CHANNEL } : {}),
    },
  })
}

export function pushMessageForDevice(device, record, title) {
  return {
    to: device.token,
    sound: 'default',
    title,
    body: record.body,
    data: record.metadata ?? {},
    priority: record.type === 'new_message' ? 'high' : 'default',
    // Older installations haven't created this channel yet. Preserve their
    // existing delivery until the updated app registers its channel ID.
    ...(device.platform === 'android' && device.channel_id ? { channelId: device.channel_id } : {}),
  }
}
