import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID = 'peek-inference';
const RUNNING_ID = 'peek-running';
const DONE_ID = 'peek-done';
const STOP_ACTION_ID = 'stop-inference';
const CATEGORY_ID = 'inference-running';

let channelReady = false;
let categoryReady = false;
let _cancelFn: (() => void) | null = null;
let _responseListener: Notifications.Subscription | null = null;

export function registerInferenceCancel(fn: () => void) {
  _cancelFn = fn;
}

export function unregisterInferenceCancel() {
  _cancelFn = null;
}

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

async function ensureCategory() {
  if (categoryReady) return;
  try {
    await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
      {
        identifier: STOP_ACTION_ID,
        buttonTitle: 'Stop',
        options: { isDestructive: true, opensAppToForeground: false },
      },
    ]);
    categoryReady = true;
    if (!_responseListener) {
      _responseListener = Notifications.addNotificationResponseReceivedListener(response => {
        if (response.actionIdentifier === STOP_ACTION_ID) {
          _cancelFn?.();
          clearInferenceNotifications();
        }
      });
    }
  } catch {}
}

export async function requestNotificationPermission() {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function showRunningNotification(label = 'Peek') {
  try {
    await ensureChannel();
    await ensureCategory();
    await Notifications.dismissNotificationAsync(RUNNING_ID);
    await Notifications.scheduleNotificationAsync({
      identifier: RUNNING_ID,
      content: {
        title: `${label} is working…`,
        body: 'Tap Stop to cancel the task.',
        sound: false,
        sticky: true,
        categoryIdentifier: CATEGORY_ID,
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
