import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_SWAP_TASK = 'background-swap-check';

TaskManager.defineTask(BACKGROUND_SWAP_TASK, async () => {
  try {
    // Background fetch is limited on mobile - we use it mainly
    // to check if there's a pending session and send a notification
    // Actual swaps require Seed Vault interaction (biometric)
    // so they must happen in foreground
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask(): Promise<void> {
  try {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SWAP_TASK, {
      minimumInterval: 60 * 15, // 15 minutes minimum on Android
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (err) {
    console.warn('Background task registration failed:', err);
  }
}

export async function unregisterBackgroundTask(): Promise<void> {
  try {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SWAP_TASK);
  } catch {
    // Task might not be registered
  }
}

export async function getBackgroundTaskStatus(): Promise<BackgroundFetch.BackgroundFetchStatus | null> {
  try {
    return await BackgroundFetch.getStatusAsync();
  } catch {
    return null;
  }
}
