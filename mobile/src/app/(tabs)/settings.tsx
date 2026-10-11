import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

import {
  getSettings,
  updateSettings,
  resetApplicationData,
} from '@/db/settingsRepo';
import { getSyncQueueStatus, performSync, SyncStatus } from '@/db/syncRepo';
import { UserSettings } from '@/db/types';

export default function SettingsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const [settings, setSettings] = useState<UserSettings>(getSettings());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncQueueStatus());
  const [syncing, setSyncing] = useState(false);

  // Form Fields
  const [officeName, setOfficeName] = useState('');
  const [workdayStart, setWorkdayStart] = useState('');
  const [workdayEnd, setWorkdayEnd] = useState('');
  const [backendUrl, setBackendUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiBssid, setWifiBssid] = useState('');

  const loadData = useCallback(() => {
    try {
      const s = getSettings();
      setSettings(s);
      setOfficeName(s.office_name);
      setWorkdayStart(s.workday_start);
      setWorkdayEnd(s.workday_end);
      setBackendUrl(s.backend_url);
      setAuthToken(s.auth_token);
      setWifiSsid(s.wifi_ssid);
      setWifiBssid(s.wifi_bssid);

      const q = getSyncQueueStatus();
      setSyncStatus(q);
    } catch (e: any) {
      console.error('Error loading settings:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleSavePreferences = () => {
    try {
      updateSettings({
        office_name: officeName.trim(),
        workday_start: workdayStart.trim(),
        workday_end: workdayEnd.trim(),
        backend_url: backendUrl.trim(),
        auth_token: authToken.trim(),
        wifi_ssid: wifiSsid.trim(),
        wifi_bssid: wifiBssid.trim(),
      });
      loadData();
      Alert.alert('Settings Saved', 'Preferences updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await performSync(backendUrl.trim(), authToken.trim());
      loadData();
      if (res.success) {
        Alert.alert('Sync Successful', res.message);
      } else {
        Alert.alert('Sync Notice', res.message);
      }
    } catch (e: any) {
      Alert.alert('Sync Failure', e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Application Data',
      'This will erase all local SQLite database records, history, habits, and preferences. This action CANNOT be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Permanently Erase',
          style: 'destructive',
          onPress: () => {
            resetApplicationData();
            loadData();
            Alert.alert('Reset Complete', 'Local database has been re-initialized.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Settings & Sync</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Workday configuration, server synchronization, and Phase 2 prep
          </Text>
        </View>

        {/* Workday & Office Configuration */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Workday Preferences</Text>
          <Input
            label="Office / Workplace Name"
            placeholder="e.g. Headquarters, Client Office"
            value={officeName}
            onChangeText={setOfficeName}
          />
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Input
                label="Target Start Time"
                placeholder="09:00"
                value={workdayStart}
                onChangeText={setWorkdayStart}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Target End Time"
                placeholder="17:00"
                value={workdayEnd}
                onChangeText={setWorkdayEnd}
              />
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Local Timezone:</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{settings.timezone}</Text>
          </View>
          <Button
            title="Save Preferences"
            variant="primary"
            size="md"
            onPress={handleSavePreferences}
            style={{ marginTop: 12 }}
          />
        </Card>

        {/* Backend & Synchronization */}
        <Card>
          <View style={styles.syncHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Django Backend Sync</Text>
            <Badge
              label={syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} PENDING` : 'UP TO DATE'}
              color={syncStatus.pendingCount > 0 ? colors.warning : colors.success}
            />
          </View>

          <Input
            label="Backend API Base URL"
            placeholder="http://10.0.2.2:8000 (Android Emulator) or LAN IP"
            value={backendUrl}
            onChangeText={setBackendUrl}
            helper="Use 10.0.2.2 for Android Studio emulator, or your LAN IP for physical device."
          />

          <Input
            label="Personal Auth Token"
            placeholder="Django DRF Token (from /api/v1/auth/token/)"
            value={authToken}
            secureTextEntry
            onChangeText={setAuthToken}
          />

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Last Synced:</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>
              {settings.last_sync_time
                ? new Date(settings.last_sync_time).toLocaleString()
                : 'Never'}
            </Text>
          </View>

          {syncStatus.lastError ? (
            <Text style={[styles.syncError, { color: colors.danger }]}>
              Last Error: {syncStatus.lastError}
            </Text>
          ) : null}

          <Button
            title="Synchronize Now"
            variant="outline"
            size="md"
            loading={syncing}
            onPress={handleManualSync}
            icon={<Ionicons name="sync-outline" size={18} color={colors.primary} />}
            style={{ marginTop: 12 }}
          />
        </Card>

        {/* Phase 2: Wi-Fi Detection Configuration (Clearly marked Inactive) */}
        <Card style={styles.phase2Card}>
          <View style={styles.phase2Header}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              Office Wi-Fi (Phase 2 Prep)
            </Text>
            <Badge label="NOT YET ACTIVE" color={colors.textSecondary} bgColor="#33415540" />
          </View>
          <Text style={[styles.phase2Desc, { color: colors.textMuted }]}>
            Phase 1 stores configuration fields for your office Wi-Fi network. Background network
            monitoring and geofence punch reminders will activate in Phase 2.
          </Text>

          <Input
            label="Office Wi-Fi SSID"
            placeholder="e.g. Office_Guest_5G"
            value={wifiSsid}
            onChangeText={setWifiSsid}
          />
          <Input
            label="Router BSSID (Optional MAC)"
            placeholder="e.g. 00:14:22:01:23:45"
            value={wifiBssid}
            onChangeText={setWifiBssid}
          />
          <Button
            title="Save Wi-Fi Configuration"
            variant="secondary"
            size="sm"
            onPress={handleSavePreferences}
            style={{ marginTop: 8 }}
          />
        </Card>

        {/* Destructive Actions */}
        <Card style={styles.dangerCard}>
          <Text style={[styles.dangerTitle, { color: colors.danger }]}>Data Management</Text>
          <Text style={[styles.dangerDesc, { color: colors.textSecondary }]}>
            Erase local SQLite database for development testing and reset all state machines.
          </Text>
          <Button
            title="Reset All Local Data"
            variant="danger"
            size="md"
            onPress={handleResetData}
            icon={<Ionicons name="trash-outline" size={18} color="#FFFFFF" />}
            style={{ marginTop: 10 }}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  header: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B30',
  },
  infoLabel: {
    fontSize: 13,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  syncHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  syncError: {
    fontSize: 11,
    marginTop: 6,
  },
  phase2Card: {
    opacity: 0.9,
    borderStyle: 'dashed',
  },
  phase2Header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  phase2Desc: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  dangerCard: {
    borderColor: '#EF444440',
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dangerDesc: {
    fontSize: 12,
    marginTop: 4,
  },
});
