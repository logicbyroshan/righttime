import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

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
import {
  checkCurrentWifiDiagnostic,
  requestDetectionPermissions,
  WifiDiagnosticReport,
} from '@/services/wifiMonitorService';
import {
  createOfficialBatch,
  saveOfficialRecords,
  findBatchByHash,
} from '@/db/officialRepo';
import {
  parseAndValidateOfficialCSV,
  parseCSVString,
  ParsedOfficialRow,
} from '@/services/csvParsing';
import {
  exportBackupAndShare,
  validateBackupString,
  restoreDatabaseFromPayload,
  computeDataChecksum,
  BackupPayload,
} from '@/services/backupService';

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
  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [wifiGraceSeconds, setWifiGraceSeconds] = useState('180');
  const [wifiCooldownMinutes, setWifiCooldownMinutes] = useState('15');
  const [reconciliationTolerance, setReconciliationTolerance] = useState('5');

  // Diagnostics State
  const [diagnosticReport, setDiagnosticReport] = useState<WifiDiagnosticReport | null>(null);
  const [checkingWifi, setCheckingWifi] = useState(false);

  // CSV Import State & Modal
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvContentRaw, setCsvContentRaw] = useState('');
  const [csvPreviewHeaders, setCsvPreviewHeaders] = useState<string[]>([]);
  const [csvValidationResult, setCsvValidationResult] = useState<{
    rows: ParsedOfficialRow[];
    totalRows: number;
    validRows: number;
    invalidRows: number;
  } | null>(null);
  const [dateColIndex, setDateColIndex] = useState(0);
  const [inColIndex, setInColIndex] = useState(1);
  const [outColIndex, setOutColIndex] = useState(2);
  const [isImportingCsv, setIsImportingCsv] = useState(false);

  // Backup & Restore State & Modal
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [restorePreviewPayload, setRestorePreviewPayload] = useState<BackupPayload | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

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
      setWifiEnabled(s.wifi_enabled !== '0');
      setWifiGraceSeconds(s.wifi_grace_seconds || '180');
      setWifiCooldownMinutes(s.wifi_cooldown_minutes || '15');
      setReconciliationTolerance(s.reconciliation_tolerance_minutes || '5');

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
    updateSettings({
      office_name: officeName.trim(),
      workday_start: workdayStart.trim(),
      workday_end: workdayEnd.trim(),
      backend_url: backendUrl.trim(),
      auth_token: authToken.trim(),
      wifi_ssid: wifiSsid.trim(),
      wifi_bssid: wifiBssid.trim(),
      wifi_enabled: wifiEnabled ? '1' : '0',
      wifi_grace_seconds: wifiGraceSeconds.trim(),
      wifi_cooldown_minutes: wifiCooldownMinutes.trim(),
      reconciliation_tolerance_minutes: reconciliationTolerance.trim() || '5',
    });
    Alert.alert('Saved', 'Configuration preferences saved successfully.');
    loadData();
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await performSync(backendUrl || 'http://10.0.2.2:8000', authToken || '');
      if (res.success) {
        Alert.alert('Sync Complete', `Synchronized ${res.appliedCount} changes with backend replica.`);
      } else {
        Alert.alert('Sync Warning', res.message || 'Synchronization failed.');
      }
    } catch (e: any) {
      Alert.alert('Sync Error', e.message);
    } finally {
      setSyncing(false);
      loadData();
    }
  };

  const handleCheckWifiDiagnostic = async () => {
    setCheckingWifi(true);
    try {
      const rep = await checkCurrentWifiDiagnostic();
      setDiagnosticReport(rep);
    } catch (e: any) {
      Alert.alert('Diagnostic Failed', e.message);
    } finally {
      setCheckingWifi(false);
    }
  };

  const handleRequestPermissions = async () => {
    const res = await requestDetectionPermissions();
    if (res.locationGranted && res.notificationsGranted) {
      Alert.alert('Permissions Granted', 'Location and Notification permissions are active.');
    } else {
      Alert.alert(
        'Permission Status',
        `Location: ${res.locationGranted ? 'Granted' : 'Denied'}\nNotifications: ${res.notificationsGranted ? 'Granted' : 'Denied'}`
      );
    }
    handleCheckWifiDiagnostic();
  };

  // --- CSV IMPORT LOGIC ---
  const handlePickCsvFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        const content = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const parsedRows = parseCSVString(content);
        if (parsedRows.length === 0) {
          Alert.alert('Empty File', 'The selected CSV file contains no data.');
          return;
        }

        const headers = parsedRows[0];
        setCsvFileName(file.name);
        setCsvContentRaw(content);
        setCsvPreviewHeaders(headers);

        // Auto-detect column indices
        let dIdx = 0, inIdx = 1, outIdx = 2;
        headers.forEach((h, idx) => {
          const lower = h.toLowerCase();
          if (lower.includes('date') || lower.includes('day')) dIdx = idx;
          if (lower.includes('in') || lower.includes('arrival') || lower.includes('start')) inIdx = idx;
          if (lower.includes('out') || lower.includes('departure') || lower.includes('end')) outIdx = idx;
        });

        setDateColIndex(dIdx);
        setInColIndex(inIdx);
        setOutColIndex(outIdx);

        // Validate preview
        const valRes = parseAndValidateOfficialCSV(
          content,
          { dateColIndex: dIdx, checkInColIndex: inIdx, checkOutColIndex: outIdx },
          true
        );
        setCsvValidationResult(valRes);
        setShowCsvImportModal(true);
      }
    } catch (e: any) {
      Alert.alert('Import Error', e.message || 'Could not read CSV file.');
    }
  };

  const handleCommitCsvImport = async () => {
    if (!csvValidationResult || !csvContentRaw) return;
    setIsImportingCsv(true);
    try {
      const fileHash = await computeDataChecksum(csvContentRaw);
      const existingBatch = findBatchByHash(fileHash);
      if (existingBatch) {
        Alert.alert(
          'Duplicate File Warning',
          `This file was previously imported on ${existingBatch.imported_at.substring(0, 10)}. Re-importing may add duplicate records.`
        );
      }

      const batch = createOfficialBatch({
        source_filename: csvFileName,
        file_hash: fileHash,
        row_count: csvValidationResult.validRows,
        notes: `Imported with ${csvValidationResult.validRows} valid rows and ${csvValidationResult.invalidRows} flagged rows`,
      });

      const recordsToSave = csvValidationResult.rows.map((r) => ({
        batch_id: batch.id,
        work_date: r.workDate || '2026-01-01',
        check_in_time: r.checkInISO,
        check_out_time: r.checkOutISO,
        break_duration_minutes: r.breakMinutes,
        total_duration_minutes: r.totalMinutes,
        source_description: `Imported from ${csvFileName}`,
        validation_status: r.isValid ? ('VALID' as const) : ('INVALID' as const),
        discrepancy_note: r.errors.join('; '),
      }));

      saveOfficialRecords(recordsToSave);

      Alert.alert(
        'Import Successful',
        `Imported ${csvValidationResult.validRows} official attendance records into batch "${csvFileName}".`
      );
      setShowCsvImportModal(false);
    } catch (e: any) {
      Alert.alert('Import Failed', e.message || 'Could not commit records.');
    } finally {
      setIsImportingCsv(false);
    }
  };

  // --- BACKUP & RESTORE LOGIC ---
  const handleCreateBackup = async () => {
    setIsExportingBackup(true);
    try {
      await exportBackupAndShare();
    } catch (e: any) {
      Alert.alert('Backup Error', e.message || 'Could not export backup.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  const handlePickBackupFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const file = result.assets[0];
        const content = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const val = await validateBackupString(content);
        if (!val.isValid || !val.parsedPayload) {
          Alert.alert(
            'Invalid or Corrupt Backup',
            val.error || 'The selected file is not a valid verified Personal Time Ledger backup.'
          );
          return;
        }

        setRestorePreviewPayload(val.parsedPayload);
      }
    } catch (e: any) {
      Alert.alert('Restore Error', e.message || 'Could not read backup file.');
    }
  };

  const handleConfirmRestore = async () => {
    if (!restorePreviewPayload) return;
    setIsRestoring(true);
    try {
      const res = await restoreDatabaseFromPayload(restorePreviewPayload);
      if (res.success) {
        Alert.alert(
          'Restore Successful',
          'Your personal time ledger data has been restored atomically. An emergency rollback copy of your previous data was preserved.'
        );
        setRestorePreviewPayload(null);
        loadData();
      }
    } catch (e: any) {
      Alert.alert('Restore Failed', e.message || 'Could not restore database.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleResetData = () => {
    Alert.alert(
      'Reset All Local Data',
      'Are you sure you want to erase all local attendance sessions, activities, and habits? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: () => {
            resetApplicationData();
            Alert.alert('Data Erased', 'Database has been reset to initial schema.');
            loadData();
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
          <Text style={[styles.title, { color: colors.text }]}>Settings & Administration</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Work schedule, Wi-Fi automation, backup & official reconciliation
          </Text>
        </View>

        {/* Schedule & Office Preferences */}
        <Card>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Workplace Preferences</Text>
          <Input
            label="Workplace / Office Name"
            placeholder="e.g. Headquarters"
            value={officeName}
            onChangeText={setOfficeName}
          />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Workday Start"
                placeholder="09:00"
                value={workdayStart}
                onChangeText={setWorkdayStart}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Workday End"
                placeholder="17:00"
                value={workdayEnd}
                onChangeText={setWorkdayEnd}
              />
            </View>
          </View>

          <Input
            label="Reconciliation Tolerance (Minutes)"
            placeholder="5"
            value={reconciliationTolerance}
            onChangeText={setReconciliationTolerance}
            keyboardType="numeric"
            helper="Tolerance threshold when comparing personal arrival/departure with official HR punches."
          />

          <Button
            title="Save Workplace Preferences"
            variant="primary"
            size="md"
            onPress={handleSavePreferences}
            style={{ marginTop: 8 }}
          />
        </Card>

        {/* Official Attendance Reconciliation Import */}
        <Card>
          <View style={styles.syncHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Official Attendance Import
            </Text>
            <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Import official attendance CSV files exported from your employer's HR or biometric system to compare against your personal ledger.
          </Text>

          <Button
            title="Import Official Attendance CSV"
            variant="outline"
            size="md"
            onPress={handlePickCsvFile}
            icon={<Ionicons name="cloud-upload-outline" size={18} color={colors.primary} />}
            style={{ marginTop: 8 }}
          />
        </Card>

        {/* Backup & Restore Card */}
        <Card>
          <View style={styles.syncHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Backup & Restore (Data Integrity)
            </Text>
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.success} />
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Export a versioned, SHA-256 verified snapshot of your complete ledger, or restore from a verified backup file.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Button
              title="Create Backup"
              variant="primary"
              size="sm"
              loading={isExportingBackup}
              onPress={handleCreateBackup}
              icon={<Ionicons name="archive-outline" size={16} color={colors.primaryContrast} />}
              style={{ flex: 1 }}
            />
            <Button
              title="Restore from File"
              variant="outline"
              size="sm"
              onPress={handlePickBackupFile}
              icon={<Ionicons name="refresh-circle-outline" size={16} color={colors.primary} />}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        {/* Backend Synchronization */}
        <Card>
          <View style={styles.syncHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Backend Replica Sync</Text>
            <Badge
              label={syncStatus.pendingCount > 0 ? `${syncStatus.pendingCount} PENDING` : 'SYNCED'}
              color={syncStatus.pendingCount > 0 ? colors.warning : colors.success}
            />
          </View>
          <Input
            label="Backend Server URL"
            placeholder="http://10.0.2.2:8000"
            value={backendUrl}
            onChangeText={setBackendUrl}
            helper="Use 10.0.2.2 for Android emulator, LAN IP for physical device."
          />
          <Input
            label="Personal Auth Token"
            placeholder="Token <your-token>"
            value={authToken}
            onChangeText={setAuthToken}
            secureTextEntry
            helper="Stored securely via Android EncryptedSharedPreferences."
          />

          <View style={styles.syncMetaRow}>
            <Text style={[styles.syncMetaLabel, { color: colors.textSecondary }]}>Last Synchronized:</Text>
            <Text style={[styles.syncMetaValue, { color: colors.text }]}>
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

        {/* Smart Wi-Fi Attendance Configuration */}
        <Card>
          <View style={styles.syncHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Smart Wi-Fi Attendance</Text>
            <Badge
              label={wifiEnabled ? 'ACTIVE' : 'DISABLED'}
              color={wifiEnabled ? colors.success : colors.textSecondary}
            />
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Detect office arrival and departure transitions using Wi-Fi connectivity and prompt for explicit user confirmation.
          </Text>

          <TouchableOpacity
            style={styles.toggleRow}
            activeOpacity={0.7}
            onPress={() => setWifiEnabled(!wifiEnabled)}>
            <Text style={[styles.toggleLabel, { color: colors.text }]}>Enable Wi-Fi Attendance Suggestions</Text>
            <Ionicons
              name={wifiEnabled ? 'checkbox' : 'square-outline'}
              size={22}
              color={wifiEnabled ? colors.primary : colors.textSecondary}
            />
          </TouchableOpacity>

          <Input
            label="Office Wi-Fi SSID (Network Name)"
            placeholder="e.g. Office_HQ or Company_WiFi"
            value={wifiSsid}
            onChangeText={setWifiSsid}
            helper="The Wi-Fi network name broadcast by your office routers."
          />

          <Input
            label="Router BSSID (Optional MAC Address)"
            placeholder="e.g. 00:14:22:01:23:45"
            value={wifiBssid}
            onChangeText={setWifiBssid}
            helper="Optional. Specific access point MAC address if you want to restrict matching to a single router."
          />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Grace Period (Seconds)"
                placeholder="180"
                value={wifiGraceSeconds}
                onChangeText={setWifiGraceSeconds}
                keyboardType="numeric"
                helper="Debounce window before suggesting departure."
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Cooldown (Minutes)"
                placeholder="15"
                value={wifiCooldownMinutes}
                onChangeText={setWifiCooldownMinutes}
                keyboardType="numeric"
                helper="Arrival prompt suppression after dismissal."
              />
            </View>
          </View>

          <Button
            title="Save Wi-Fi Configuration"
            variant="primary"
            size="md"
            onPress={handleSavePreferences}
            style={{ marginTop: 8 }}
          />
        </Card>

        {/* Wi-Fi Diagnostics & Permissions */}
        <Card>
          <View style={styles.syncHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Wi-Fi Diagnostics & Permissions</Text>
            <Ionicons name="hardware-chip-outline" size={20} color={colors.primary} />
          </View>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
            Android requires Location permission to expose connected Wi-Fi SSIDs to applications. Personal Time Ledger never accesses or transmits your GPS location.
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button
              title="Check Current Wi-Fi"
              variant="outline"
              size="sm"
              loading={checkingWifi}
              onPress={handleCheckWifiDiagnostic}
              icon={<Ionicons name="refresh-outline" size={16} color={colors.primary} />}
              style={{ flex: 1 }}
            />
            <Button
              title="Grant Permissions"
              variant="secondary"
              size="sm"
              onPress={handleRequestPermissions}
              icon={<Ionicons name="shield-checkmark-outline" size={16} color={colors.text} />}
              style={{ flex: 1 }}
            />
          </View>

          {diagnosticReport && (
            <View style={styles.diagnosticContainer}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Network Connected:</Text>
                <Text style={[styles.infoVal, { color: diagnosticReport.isConnected ? colors.success : colors.danger }]}>
                  {diagnosticReport.isConnected ? 'YES' : 'NO'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Wi-Fi Active:</Text>
                <Text style={[styles.infoVal, { color: diagnosticReport.isWifi ? colors.success : colors.warning }]}>
                  {diagnosticReport.isWifi ? 'YES' : 'NO'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Detected SSID:</Text>
                <Text style={[styles.infoVal, { color: colors.text }]}>
                  {diagnosticReport.currentSsid || '<unknown or restricted>'}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Office Matched:</Text>
                <Badge
                  label={diagnosticReport.isMatched ? 'MATCHED' : 'NO MATCH'}
                  color={diagnosticReport.isMatched ? colors.success : colors.warning}
                />
              </View>
            </View>
          )}
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

      {/* CSV IMPORT PREVIEW & CONFIRMATION MODAL */}
      <Modal visible={showCsvImportModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>CSV Import Preview</Text>
              <TouchableOpacity onPress={() => setShowCsvImportModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              File: <Text style={{ color: colors.text, fontWeight: '700' }}>{csvFileName}</Text>
            </Text>

            {csvValidationResult && (
              <View style={styles.valSummaryBox}>
                <Badge label={`Total: ${csvValidationResult.totalRows}`} color={colors.textSecondary} />
                <Badge label={`Valid: ${csvValidationResult.validRows}`} color={colors.success} />
                {csvValidationResult.invalidRows > 0 && (
                  <Badge label={`Flagged: ${csvValidationResult.invalidRows}`} color={colors.danger} />
                )}
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>
              Preview Rows
            </Text>
            <ScrollView style={styles.previewScroll}>
              {csvValidationResult?.rows.slice(0, 5).map((r) => (
                <View key={r.rowIndex} style={[styles.previewRow, { borderColor: colors.cardBorder }]}>
                  <Text style={[styles.previewRowText, { color: colors.text }]}>
                    #{r.rowIndex}: {r.workDate} | In: {r.checkInISO ? r.checkInISO.substring(11, 16) : 'None'} | Out: {r.checkOutISO ? r.checkOutISO.substring(11, 16) : 'None'}
                  </Text>
                  {r.errors.length > 0 && (
                    <Text style={{ fontSize: 10, color: colors.danger }}>{r.errors.join('; ')}</Text>
                  )}
                </View>
              ))}
            </ScrollView>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}
                onPress={() => setShowCsvImportModal(false)}>
                <Text style={[styles.dialogBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={handleCommitCsvImport}
                disabled={isImportingCsv}>
                {isImportingCsv ? (
                  <ActivityIndicator color={colors.primaryContrast} />
                ) : (
                  <Text style={[styles.dialogBtnText, { color: colors.primaryContrast, fontWeight: '700' }]}>
                    Commit Import Batch
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* RESTORE CONFIRMATION PREVIEW MODAL */}
      <Modal visible={restorePreviewPayload !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Verify & Confirm Restore</Text>
              <TouchableOpacity onPress={() => setRestorePreviewPayload(null)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Backup Version: {restorePreviewPayload?.backup_version} &bull; Created:{' '}
              {restorePreviewPayload?.created_at.substring(0, 10)}
            </Text>

            <View style={[styles.integrityBadge, { backgroundColor: colors.background }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: colors.success }}>
                SHA-256 Checksum Verified Authentic
              </Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>
              Records in Backup
            </Text>
            <View style={styles.countsGrid}>
              {restorePreviewPayload &&
                Object.entries(restorePreviewPayload.record_counts).map(([k, count]) => (
                  <View key={k} style={styles.countItem}>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>{k.replace(/_/g, ' ')}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{count}</Text>
                  </View>
                ))}
            </View>

            <Text style={[styles.warningText, { color: colors.warning }]}>
              Restoring will atomically replace current records. An emergency rollback backup of your active data will be created first.
            </Text>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}
                onPress={() => setRestorePreviewPayload(null)}>
                <Text style={[styles.dialogBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
                onPress={handleConfirmRestore}
                disabled={isRestoring}>
                {isRestoring ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={[styles.dialogBtnText, { color: '#ffffff', fontWeight: '700' }]}>
                    Yes, Restore Data
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    gap: Spacing.md,
  },
  header: {
    marginBottom: Spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 12,
  },
  syncHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 4,
  },
  syncMetaLabel: {
    fontSize: 12,
  },
  syncMetaValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  syncError: {
    fontSize: 11,
    marginTop: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  diagnosticContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
  },
  infoVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  dangerDesc: {
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginBottom: 10,
  },
  valSummaryBox: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  previewScroll: {
    maxHeight: 160,
    marginVertical: 8,
  },
  previewRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  previewRowText: {
    fontSize: 11,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  integrityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: Radius.md,
    marginVertical: 8,
  },
  countsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  countItem: {
    width: '47%',
    padding: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.sm,
  },
  warningText: {
    fontSize: 11,
    lineHeight: 15,
    marginVertical: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  dialogBtnText: {
    fontSize: 13,
  },
});
