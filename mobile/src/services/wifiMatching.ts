/**
 * Pure evaluation and normalization helpers for Wi-Fi attendance detection.
 * Separated from native platform bindings so this domain logic can be tested
 * in standard Node.js test environments without React Native bundle transforms.
 */

/**
 * Normalizes an SSID string: trims whitespace and strips enclosing double quotes
 * that Android/WPA supplicants frequently add around SSIDs.
 */
export function normalizeSsid(ssid?: string | null): string {
  if (!ssid) return '';
  let cleaned = ssid.trim();
  if (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  }
  return cleaned.trim();
}

/**
 * Normalizes a BSSID MAC address: lowers case and trims whitespace.
 */
export function normalizeBssid(bssid?: string | null): string {
  if (!bssid) return '';
  return bssid.trim().toLowerCase();
}

/**
 * Pure evaluation function for network matching against configured office settings.
 */
export function evaluateNetworkMatch(
  currentSsid: string | null,
  currentBssid: string | null,
  configuredSsid: string,
  configuredBssid: string
): { matched: boolean; reason: string } {
  const normCurrentSsid = normalizeSsid(currentSsid);
  const normConfigSsid = normalizeSsid(configuredSsid);
  const normCurrentBssid = normalizeBssid(currentBssid);
  const normConfigBssid = normalizeBssid(configuredBssid);

  if (!normConfigSsid && !normConfigBssid) {
    return { matched: false, reason: 'No office Wi-Fi network configured in Settings.' };
  }

  if (normCurrentSsid === '<unknown ssid>' || !normCurrentSsid) {
    return {
      matched: false,
      reason:
        'SSID is unavailable or restricted by Android. Location permission may be required to view Wi-Fi name.',
    };
  }

  // If BSSID is configured, match both or fallback to SSID
  if (normConfigBssid) {
    if (normCurrentBssid && normCurrentBssid === normConfigBssid) {
      return { matched: true, reason: 'Matched configured Access Point (BSSID).' };
    }
    // If BSSID didn't match but SSID matched, note AP mismatch
    if (normConfigSsid && normCurrentSsid.toLowerCase() === normConfigSsid.toLowerCase()) {
      return {
        matched: false,
        reason: `SSID '${normCurrentSsid}' matched, but Access Point BSSID did not match configured '${normConfigBssid}'.`,
      };
    }
    return { matched: false, reason: 'Network does not match configured office BSSID or SSID.' };
  }

  // SSID-only matching
  if (normConfigSsid) {
    if (normCurrentSsid.toLowerCase() === normConfigSsid.toLowerCase()) {
      return { matched: true, reason: `Matched office network '${normConfigSsid}'.` };
    }
    return {
      matched: false,
      reason: `Connected to '${normCurrentSsid}', which does not match office network '${normConfigSsid}'.`,
    };
  }

  return { matched: false, reason: 'Network mismatch.' };
}
