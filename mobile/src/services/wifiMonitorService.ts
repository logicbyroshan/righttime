import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { getSettings } from '../db/settingsRepo';
import { getActiveSession } from '../db/attendanceRepo';
import {
  createPendingSuggestion,
  cancelDepartureIfConnected,
  reconcileSuggestionsWithSessionState,
} from '../db/suggestionsRepo';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export interface WifiDiagnosticReport {
  isConnected: boolean;
  isWifi: boolean;
  currentSsid: string | null;
  currentBssid: string | null;
  configuredSsid: string;
  configuredBssid: string;
  isMatched: boolean;
  locationPermission: string;
  notificationPermission: string;
  activeSession: boolean;
  statusExplanation: string;
}

let departureTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectDetectedAt: string | null = null;
let netInfoUnsubscribe: (() => void) | null = null;

export {
  normalizeSsid,
  normalizeBssid,
  evaluateNetworkMatch,
} from './wifiMatching';
import { normalizeSsid, normalizeBssid, evaluateNetworkMatch } from './wifiMatching';

/**
 * Request necessary permissions (Location for SSID detection on Android, and Notifications).
 */
export async function requestDetectionPermissions(): Promise<{
  locationGranted: boolean;
  notificationsGranted: boolean;
}> {
  let locationGranted = false;
  let notificationsGranted = false;

  try {
    const locStatus = await Location.requestForegroundPermissionsAsync();
    locationGranted = locStatus.granted;
  } catch (e) {
    // Ignore error
  }

  try {
    const notifStatus = await Notifications.requestPermissionsAsync();
    notificationsGranted = notifStatus.granted;
  } catch (e) {
    // Ignore error
  }

  return { locationGranted, notificationsGranted };
}

/**
 * Sends an Android local notification for arrival or departure.
 */
async function sendAttendanceNotification(
  title: string,
  body: string,
  data: { eventType: 'ARRIVAL' | 'DEPARTURE'; detectedAt: string }
) {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted) {
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // deliver immediately
    });
  } catch (e) {
    // Notification failure is non-fatal; prompt will still appear in app
  }
}

/**
 * Handles network connectivity changes reported by Android.
 */
export async function handleConnectivityChange(state: NetInfoState): Promise<void> {
  const settings = getSettings();

  // If Wi-Fi suggestions are disabled by user, do nothing
  if (settings.wifi_enabled === '0') {
    return;
  }

  // Reconcile pending suggestions with current attendance session first
  reconcileSuggestionsWithSessionState();

  const isConnected = state.isConnected ?? false;
  const isWifi = state.type === NetInfoStateType.wifi;

  let currentSsid: string | null = null;
  let currentBssid: string | null = null;

  if (isWifi && state.details) {
    const details = state.details as { ssid?: string; bssid?: string };
    currentSsid = details.ssid || null;
    currentBssid = details.bssid || null;
  }

  const matchResult = evaluateNetworkMatch(
    currentSsid,
    currentBssid,
    settings.wifi_ssid,
    settings.wifi_bssid
  );

  const active = getActiveSession();

  // CASE 1: Connected to Office Wi-Fi
  if (isConnected && isWifi && matchResult.matched) {
    // If a departure grace period timer was running, cancel it immediately!
    if (departureTimer) {
      clearTimeout(departureTimer);
      departureTimer = null;
      disconnectDetectedAt = null;
    }

    // If a pending departure suggestion was already created, cancel it
    cancelDepartureIfConnected();

    // Check if user is already checked in
    if (!active.session) {
      // Check arrival cooldown
      const cooldownMinutes = parseInt(settings.wifi_cooldown_minutes, 10) || 15;
      if (settings.wifi_last_dismissed_arrival) {
        const dismissedAt = new Date(settings.wifi_last_dismissed_arrival).getTime();
        const elapsedMinutes = (Date.now() - dismissedAt) / (60 * 1000);
        if (elapsedMinutes < cooldownMinutes) {
          // Within cooldown period after user dismissed arrival prompt; do not annoy
          return;
        }
      }

      const now = new Date().toISOString();
      createPendingSuggestion(
        'ARRIVAL',
        now,
        'WIFI_AUTO',
        1,
        `Detected office network ${normalizeSsid(currentSsid)}`
      );

      await sendAttendanceNotification(
        'Office Wi-Fi Detected',
        `Connected to ${settings.office_name || 'Office'}. Tap to confirm arrival.`,
        { eventType: 'ARRIVAL', detectedAt: now }
      );
    }
  }
  // CASE 2: Disconnected from Office Wi-Fi while attendance session is active
  else if (active.session && (!isWifi || !matchResult.matched)) {
    // If grace period timer is not already ticking, start it
    if (!departureTimer) {
      const graceSeconds = parseInt(settings.wifi_grace_seconds, 10) || 180;
      disconnectDetectedAt = new Date().toISOString();

      departureTimer = setTimeout(async () => {
        departureTimer = null;
        const currentDisconnectTime = disconnectDetectedAt || new Date().toISOString();
        disconnectDetectedAt = null;

        // Verify still disconnected after grace period before suggesting departure
        const latestState = await NetInfo.fetch();
        const latestSettings = getSettings();
        const latestActive = getActiveSession();

        if (!latestActive.session) {
          return; // Session was already closed
        }

        let latestSsid: string | null = null;
        let latestBssid: string | null = null;
        if (latestState.type === NetInfoStateType.wifi && latestState.details) {
          const det = latestState.details as { ssid?: string; bssid?: string };
          latestSsid = det.ssid || null;
          latestBssid = det.bssid || null;
        }

        const latestMatch = evaluateNetworkMatch(
          latestSsid,
          latestBssid,
          latestSettings.wifi_ssid,
          latestSettings.wifi_bssid
        );

        if (!latestMatch.matched) {
          createPendingSuggestion(
            'DEPARTURE',
            currentDisconnectTime,
            'WIFI_AUTO',
            0,
            `Disconnected from office Wi-Fi (grace period ${graceSeconds}s elapsed)`
          );

          await sendAttendanceNotification(
            'Office Wi-Fi Disconnected',
            `Disconnected from ${latestSettings.office_name || 'Office'}. Did you leave?`,
            { eventType: 'DEPARTURE', detectedAt: currentDisconnectTime }
          );
        }
      }, graceSeconds * 1000);
    }
  }
}

/**
 * Initializes Wi-Fi connectivity monitoring subscriber.
 */
export function startWifiMonitoring(): () => void {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
  }

  // Initial fetch and handle
  NetInfo.fetch().then((state) => {
    handleConnectivityChange(state).catch(() => {});
  });

  // Listen to network changes
  netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    handleConnectivityChange(state).catch(() => {});
  });

  return () => {
    if (netInfoUnsubscribe) {
      netInfoUnsubscribe();
      netInfoUnsubscribe = null;
    }
    if (departureTimer) {
      clearTimeout(departureTimer);
      departureTimer = null;
    }
  };
}

/**
 * Diagnostic helper that checks current Wi-Fi status, permissions, and matching logic.
 */
export async function checkCurrentWifiDiagnostic(): Promise<WifiDiagnosticReport> {
  const state = await NetInfo.fetch();
  const settings = getSettings();
  const active = getActiveSession();

  let locPerm = 'undetermined';
  try {
    const loc = await Location.getForegroundPermissionsAsync();
    locPerm = loc.status;
  } catch (e) {
    locPerm = 'error';
  }

  let notifPerm = 'undetermined';
  try {
    const notif = await Notifications.getPermissionsAsync();
    notifPerm = notif.status;
  } catch (e) {
    notifPerm = 'error';
  }

  const isConnected = state.isConnected ?? false;
  const isWifi = state.type === NetInfoStateType.wifi;

  let currentSsid: string | null = null;
  let currentBssid: string | null = null;

  if (isWifi && state.details) {
    const details = state.details as { ssid?: string; bssid?: string };
    currentSsid = details.ssid || null;
    currentBssid = details.bssid || null;
  }

  const matchResult = evaluateNetworkMatch(
    currentSsid,
    currentBssid,
    settings.wifi_ssid,
    settings.wifi_bssid
  );

  return {
    isConnected,
    isWifi,
    currentSsid,
    currentBssid,
    configuredSsid: settings.wifi_ssid,
    configuredBssid: settings.wifi_bssid,
    isMatched: matchResult.matched,
    locationPermission: locPerm,
    notificationPermission: notifPerm,
    activeSession: !!active.session,
    statusExplanation: matchResult.reason,
  };
}
