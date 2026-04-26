import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('swap-alerts', {
      name: 'Swap Alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleNextSwapNotification(
  delaySeconds: number,
  pairLabel: string,
  amountUsd: number,
): Promise<string> {
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Next Swap Ready',
      body: `${pairLabel} — $${amountUsd.toFixed(2)}`,
      data: { type: 'swap-ready' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(delaySeconds)),
    },
  });
  return id;
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function sendSwapCompletedNotification(
  pairLabel: string,
  success: boolean,
  completedCount: number,
  totalCount: number,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: success ? 'Swap Completed' : 'Swap Failed',
      body: `${pairLabel} — ${completedCount}/${totalCount} done`,
      data: { type: 'swap-result' },
    },
    trigger: null,
  });
}

export async function sendSessionCompleteNotification(
  totalSwaps: number,
  totalGasSol: number,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily Session Complete',
      body: `${totalSwaps} swaps done. Gas: ${totalGasSol.toFixed(4)} SOL`,
      data: { type: 'session-complete' },
    },
    trigger: null,
  });
}
