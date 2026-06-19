import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'peek-inference';
const RUNNING_ID = 'peek-running';
const DONE_ID = 'peek-done';

let channelReady = false;

async function ensureChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'AI Tasks',
    importance: Notifications.AndroidImportance.LOW,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
  });
  channelReady = true;
}

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function showRunningNotification(label = 'Peek') {
  try {
    await ensureChannel();
    await Notifications.dismissNotificationAsync(RUNNING_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: RUNNING_ID,
      content: {
        title: `${label} is working…`,
        body: 'Your AI task is running in the background. Tap to return.',
        sound: false,
        sticky: true,
      },
      trigger: null,
    });
  } catch {}
}

export async function showDoneNotification(label = 'Peek') {
  try {
    await ensureChannel();
    await Notifications.dismissNotificationAsync(RUNNING_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: DONE_ID,
      content: {
        title: `${label} finished`,
        body: 'Your result is ready. Tap to view.',
        sound: false,
      },
      trigger: null,
    });
  } catch {}
}

export async function clearInferenceNotifications() {
  try {
    await Notifications.dismissNotificationAsync(RUNNING_ID);
    await Notifications.dismissNotificationAsync(DONE_ID);
  } catch {}
}
