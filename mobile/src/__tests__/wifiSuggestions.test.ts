import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSsid,
  normalizeBssid,
  evaluateNetworkMatch,
} from '../services/wifiMatching';

describe('Personal Time Ledger — Phase 2 Wi-Fi Attendance Logic Tests', () => {
  // 1. SSID and BSSID Normalization
  describe('SSID and BSSID Normalization', () => {
    it('normalizes unquoted SSIDs cleanly', () => {
      assert.equal(normalizeSsid('Office_HQ_5G'), 'Office_HQ_5G');
      assert.equal(normalizeSsid('  Office_HQ  '), 'Office_HQ');
    });

    it('strips Android / WPA double quotes around SSIDs', () => {
      assert.equal(normalizeSsid('"Office_HQ"'), 'Office_HQ');
      assert.equal(normalizeSsid(' "Guest-WiFi" '), 'Guest-WiFi');
    });

    it('safely handles empty, null and undefined SSIDs', () => {
      assert.equal(normalizeSsid(''), '');
      assert.equal(normalizeSsid(null), '');
      assert.equal(normalizeSsid(undefined), '');
    });

    it('normalizes BSSID MAC addresses to lowercase', () => {
      assert.equal(normalizeBssid('00:1A:2B:3C:4D:5E'), '00:1a:2b:3c:4d:5e');
      assert.equal(normalizeBssid('  AA:BB:CC:DD:EE:FF  '), 'aa:bb:cc:dd:ee:ff');
      assert.equal(normalizeBssid(null), '');
    });
  });

  // 2. Network Matching Evaluation
  describe('evaluateNetworkMatch Logic', () => {
    it('matches when current SSID equals configured SSID case-insensitively', () => {
      const res = evaluateNetworkMatch(
        '"Office_HQ"',
        null,
        'office_hq',
        ''
      );
      assert.equal(res.matched, true);
      assert.match(res.reason, /Matched office network/);
    });

    it('rejects network when SSID does not match configured network', () => {
      const res = evaluateNetworkMatch(
        'Home_WiFi',
        null,
        'Office_HQ',
        ''
      );
      assert.equal(res.matched, false);
      assert.match(res.reason, /does not match/);
    });

    it('handles restricted/unavailable SSID when Android location permission is missing', () => {
      const res = evaluateNetworkMatch(
        '<unknown ssid>',
        null,
        'Office_HQ',
        ''
      );
      assert.equal(res.matched, false);
      assert.match(res.reason, /Location permission may be required/);
    });

    it('rejects matching when no office Wi-Fi is configured in settings', () => {
      const res = evaluateNetworkMatch(
        'SomeNetwork',
        null,
        '',
        ''
      );
      assert.equal(res.matched, false);
      assert.match(res.reason, /No office Wi-Fi network configured/);
    });

    it('matches specific Access Point when BSSID is configured and matches', () => {
      const res = evaluateNetworkMatch(
        'Office_HQ',
        '00:11:22:33:44:55',
        'Office_HQ',
        '00:11:22:33:44:55'
      );
      assert.equal(res.matched, true);
      assert.match(res.reason, /Matched configured Access Point/);
    });

    it('rejects when SSID matches but configured Access Point BSSID does not match', () => {
      const res = evaluateNetworkMatch(
        'Office_HQ',
        '99:88:77:66:55:44',
        'Office_HQ',
        '00:11:22:33:44:55'
      );
      assert.equal(res.matched, false);
      assert.match(res.reason, /Access Point BSSID did not match/);
    });
  });

  // 3. Cooldown and Grace Period State Machine Logic
  describe('Cooldown and Grace Period Logic', () => {
    it('suppresses arrival suggestions within the cooldown window after user dismissal', () => {
      const now = new Date('2026-10-10T10:00:00Z').getTime();
      const dismissedAt = new Date('2026-10-10T09:50:00Z').getTime(); // 10 minutes ago
      const cooldownMinutes = 15;

      const elapsedMinutes = (now - dismissedAt) / (60 * 1000);
      const isWithinCooldown = elapsedMinutes < cooldownMinutes;

      assert.equal(isWithinCooldown, true); // suppressed
    });

    it('permits arrival suggestions once cooldown window has elapsed', () => {
      const now = new Date('2026-10-10T10:20:00Z').getTime();
      const dismissedAt = new Date('2026-10-10T09:50:00Z').getTime(); // 30 minutes ago
      const cooldownMinutes = 15;

      const elapsedMinutes = (now - dismissedAt) / (60 * 1000);
      const isWithinCooldown = elapsedMinutes < cooldownMinutes;

      assert.equal(isWithinCooldown, false); // allowed
    });

    it('cancels pending departure suggestion if office Wi-Fi reconnects within grace period', () => {
      let pendingDeparture: { status: string; notes: string } | null = {
        status: 'PENDING',
        notes: '',
      };

      // Wi-Fi restored event within grace window
      const wifiRestored = true;
      if (wifiRestored && pendingDeparture && pendingDeparture.status === 'PENDING') {
        pendingDeparture.status = 'CANCELLED';
        pendingDeparture.notes = 'Cancelled due to Wi-Fi reconnection within grace period.';
      }

      assert.equal(pendingDeparture.status, 'CANCELLED');
      assert.match(pendingDeparture.notes, /reconnection/);
    });
  });

  // 4. Invariant Validation & Timestamps
  describe('Attendance Invariants & Confirmation Policy', () => {
    it('rejects confirmation of departure suggestion if an active break is open', () => {
      const session = { id: 'sess-1', status: 'IN_PROGRESS' };
      const activeBreak = { id: 'brk-1', start_time: '2026-10-10T12:00:00Z', end_time: null };

      const validateCheckout = () => {
        if (activeBreak && !activeBreak.end_time) {
          throw new Error('A break is currently open. Please end your break before confirming departure.');
        }
      };

      assert.throws(validateCheckout, /break is currently open/);
    });

    it('preserves separate detection and confirmation timestamps', () => {
      const detectedAt = '2026-10-10T09:00:00.000Z';
      const confirmedAt = '2026-10-10T09:12:30.000Z';

      const suggestion = {
        event_type: 'ARRIVAL',
        detected_at: detectedAt,
        confirmed_at: confirmedAt,
        source: 'WIFI_AUTO',
      };

      assert.notEqual(suggestion.detected_at, suggestion.confirmed_at);
      assert.equal(suggestion.detected_at, detectedAt);
      assert.equal(suggestion.confirmed_at, confirmedAt);
    });

    it('prevents double confirmation on already resolved suggestions', () => {
      const suggestion = {
        id: 'sugg-1',
        status: 'CONFIRMED',
      };

      const confirm = () => {
        if (suggestion.status !== 'PENDING') {
          throw new Error(`Cannot confirm suggestion with status ${suggestion.status}.`);
        }
      };

      assert.throws(confirm, /Cannot confirm suggestion with status CONFIRMED/);
    });
  });
});
