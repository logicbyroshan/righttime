import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

import {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  PeriodReport,
} from '@/db/reportsRepo';
import { setRecordReviewed } from '@/db/officialRepo';
import {
  getReconciliationData,
  buildEntityCSV,
  buildPDFOptions,
} from '@/services/reportExportHelpers';
import { exportCSVAndShare } from '@/services/csvService';
import { generateAndSharePDF } from '@/services/pdfService';
import { ReconciliationItem, ReconciliationSummary } from '@/db/types';

function formatHoursMinutes(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatDelta(diffSeconds: number): string {
  if (diffSeconds === 0) return '±0m vs prev';
  const sign = diffSeconds > 0 ? '+' : '-';
  const abs = Math.abs(diffSeconds);
  const hours = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  return `${sign}${hours > 0 ? `${hours}h ` : ''}${mins}m vs prev`;
}

export default function ReportsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'light' ? 'light' : 'dark'];

  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'reconciliation'>('daily');
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [reconciliationItems, setReconciliationItems] = useState<ReconciliationItem[]>([]);
  const [reconciliationSummary, setReconciliationSummary] = useState<ReconciliationSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // PDF Export Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfType, setPdfType] = useState<'ATTENDANCE_ONLY' | 'ATTENDANCE_WITH_ACTIVITIES' | 'RECONCILIATION'>('ATTENDANCE_ONLY');
  const [displayName, setDisplayName] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // CSV Export Modal State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Discrepancy Note Modal State
  const [editingNoteItem, setEditingNoteItem] = useState<ReconciliationItem | null>(null);
  const [noteText, setNoteText] = useState('');

  const loadData = useCallback(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const yearMonth = today.substring(0, 7);

      if (period === 'reconciliation') {
        const startOfMonth = `${yearMonth}-01`;
        const endOfMonth = today;
        const res = getReconciliationData(startOfMonth, endOfMonth);
        setReconciliationItems(res.items);
        setReconciliationSummary(res.summary);
      } else {
        let rep: PeriodReport;
        if (period === 'daily') {
          rep = getDailyReport(today);
        } else if (period === 'weekly') {
          rep = getWeeklyReport(today);
        } else {
          rep = getMonthlyReport(yearMonth);
        }
        setReport(rep);
      }
    } catch (e: any) {
      console.error('Error loading report:', e);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  }, [loadData]);

  // Handle PDF Generation
  const handleGeneratePDF = async () => {
    setIsExportingPdf(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const yearMonth = today.substring(0, 7);
      const startOfMonth = `${yearMonth}-01`;

      const options = buildPDFOptions(pdfType, startOfMonth, today, displayName);
      await generateAndSharePDF(options);
      setShowPdfModal(false);
    } catch (e: any) {
      Alert.alert('PDF Export Failed', e.message || 'Could not generate report.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Handle CSV Export
  const handleExportCSV = async (entityType: any) => {
    setIsExportingCsv(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const yearMonth = today.substring(0, 7);
      const startOfMonth = `${yearMonth}-01`;

      const { filename, csvContent } = buildEntityCSV(entityType, startOfMonth, today);
      await exportCSVAndShare(filename, csvContent);
      setShowCsvModal(false);
    } catch (e: any) {
      Alert.alert('CSV Export Failed', e.message || 'Could not export data.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Save Discrepancy Note & Toggle Reviewed
  const handleSaveNote = (isReviewed: boolean) => {
    if (!editingNoteItem?.officialRecordId) return;
    setRecordReviewed(editingNoteItem.officialRecordId, isReviewed, noteText.trim());
    setEditingNoteItem(null);
    setNoteText('');
    loadData();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        
        {/* Header & Action Buttons */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>Evidence Reports</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Attendance ledger, official comparison & exports
            </Text>
          </View>
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
              onPress={() => setShowCsvModal(true)}>
              <Ionicons name="document-text-outline" size={18} color={colors.text} />
              <Text style={[styles.iconButtonText, { color: colors.text }]}>CSV</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setShowPdfModal(true)}>
              <Ionicons name="download-outline" size={18} color={colors.primaryContrast} />
              <Text style={[styles.iconButtonText, { color: colors.primaryContrast }]}>PDF</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Period Selector Tabs */}
        <View style={[styles.selectorContainer, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
          {(['daily', 'weekly', 'monthly', 'reconciliation'] as const).map((p) => {
            const isSelected = period === p;
            const label = p === 'reconciliation' ? 'Official Comp' : p.charAt(0).toUpperCase() + p.slice(1);
            return (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                style={[
                  styles.selectorTab,
                  isSelected && { backgroundColor: colors.primary },
                ]}>
                <Text
                  style={[
                    styles.selectorText,
                    {
                      color: isSelected ? colors.primaryContrast : colors.textSecondary,
                      fontWeight: isSelected ? '700' : '500',
                    },
                  ]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* RECONCILIATION VIEW */}
        {period === 'reconciliation' ? (
          <View>
            {/* Reconciliation Summary Card */}
            <Card style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Reconciliation Summary</Text>
                <Badge
                  label={`Tolerance: ±${reconciliationSummary?.toleranceMinutes || 5}m`}
                  color={colors.primary}
                />
              </View>

              <View style={styles.statGrid}>
                <StatCard
                  label="Matched Days"
                  value={`${reconciliationSummary?.matchedDays || 0}`}
                  subValue="within tolerance"
                  accentColor={colors.success}
                />
                <StatCard
                  label="Discrepancies"
                  value={`${reconciliationSummary?.discrepancyDays || 0}`}
                  subValue="timing/missing"
                  accentColor={colors.danger}
                />
              </View>

              <View style={[styles.statGrid, { marginTop: 8 }]}>
                <StatCard
                  label="Reviewed"
                  value={`${reconciliationSummary?.reviewedDays || 0}`}
                  subValue="marked verified"
                  accentColor={colors.primary}
                />
                <StatCard
                  label="Missing Official"
                  value={`${reconciliationSummary?.missingOfficialDays || 0}`}
                  subValue="unrecorded by HR"
                  accentColor={colors.warning}
                />
              </View>

              {/* Formula sign explanation alert banner */}
              <View style={[styles.infoBanner, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                <Ionicons name="information-circle-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                <Text style={[styles.infoBannerText, { color: colors.textSecondary }]}>
                  <Text style={{ fontWeight: '700', color: colors.text }}>Convention: </Text>
                  Diff = Personal &minus; Official. Positive (+) means personal arrival/departure was later; negative (&minus;) means earlier.
                </Text>
              </View>
            </Card>

            {/* Daily Comparison Ledger */}
            <Text style={[styles.subheading, { color: colors.text }]}>Daily Comparison Audit</Text>
            {reconciliationItems.length === 0 ? (
              <EmptyState
                title="No Official Records Imported"
                description="Import your employer's attendance CSV file in the Settings tab to run automated discrepancy checks."
                icon="document-attach-outline"
              />
            ) : (
              reconciliationItems.map((item) => {
                let badgeColor: string = colors.textSecondary;
                if (item.status === 'MATCH') badgeColor = colors.success;
                else if (item.status.includes('DISCREPANCY')) badgeColor = colors.danger;
                else if (item.status.includes('MISSING')) badgeColor = colors.warning;
                else if (item.status === 'REVIEWED') badgeColor = colors.primary;

                const arrDiffStr =
                  item.arrivalDiffMinutes !== null
                    ? `${item.arrivalDiffMinutes > 0 ? '+' : ''}${item.arrivalDiffMinutes}m`
                    : '—';
                const depDiffStr =
                  item.departureDiffMinutes !== null
                    ? `${item.departureDiffMinutes > 0 ? '+' : ''}${item.departureDiffMinutes}m`
                    : '—';

                return (
                  <Card key={item.date} style={styles.reconCard}>
                    <View style={styles.reconCardHeader}>
                      <View>
                        <Text style={[styles.reconDate, { color: colors.text }]}>
                          {item.date} <Text style={{ fontSize: 13, color: colors.textSecondary }}>({item.weekday})</Text>
                        </Text>
                      </View>
                      <Badge label={item.status.replace(/_/g, ' ')} color={badgeColor} />
                    </View>

                    <View style={styles.reconRow}>
                      <View style={styles.reconCol}>
                        <Text style={[styles.reconColLabel, { color: colors.textSecondary }]}>Personal Ledger</Text>
                        <Text style={[styles.reconColVal, { color: colors.text }]}>
                          {item.personalArrival ? item.personalArrival.substring(11, 16) : '—'} &rarr;{' '}
                          {item.personalDeparture ? item.personalDeparture.substring(11, 16) : 'Open'}
                        </Text>
                        <Text style={[styles.reconColSub, { color: colors.textSecondary }]}>
                          Net: {item.personalNetMinutes}m
                        </Text>
                      </View>

                      <View style={styles.reconCol}>
                        <Text style={[styles.reconColLabel, { color: colors.textSecondary }]}>Official HR Punch</Text>
                        <Text style={[styles.reconColVal, { color: colors.text }]}>
                          {item.officialArrival ? item.officialArrival.substring(11, 16) : '—'} &rarr;{' '}
                          {item.officialDeparture ? item.officialDeparture.substring(11, 16) : '—'}
                        </Text>
                        <Text style={[styles.reconColSub, { color: colors.textSecondary }]}>
                          Net: {item.officialNetMinutes}m
                        </Text>
                      </View>
                    </View>

                    {/* Diff Pills */}
                    <View style={styles.diffPillRow}>
                      <View style={[styles.diffPill, { backgroundColor: colors.background }]}>
                        <Text style={[styles.diffPillLabel, { color: colors.textSecondary }]}>Arrival Diff: </Text>
                        <Text
                          style={[
                            styles.diffPillVal,
                            {
                              color:
                                item.arrivalDiffMinutes && Math.abs(item.arrivalDiffMinutes) > 5
                                  ? colors.danger
                                  : colors.text,
                            },
                          ]}>
                          {arrDiffStr}
                        </Text>
                      </View>

                      <View style={[styles.diffPill, { backgroundColor: colors.background }]}>
                        <Text style={[styles.diffPillLabel, { color: colors.textSecondary }]}>Departure Diff: </Text>
                        <Text
                          style={[
                            styles.diffPillVal,
                            {
                              color:
                                item.departureDiffMinutes && Math.abs(item.departureDiffMinutes) > 5
                                  ? colors.danger
                                  : colors.text,
                            },
                          ]}>
                          {depDiffStr}
                        </Text>
                      </View>
                    </View>

                    {/* Notes & Review status */}
                    {item.discrepancyNote ? (
                      <View style={[styles.noteBox, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
                        <Text style={[styles.noteText, { color: colors.textSecondary }]}>
                          <Text style={{ fontWeight: '700', color: colors.text }}>Review Note: </Text>
                          {item.discrepancyNote}
                        </Text>
                      </View>
                    ) : null}

                    {item.officialRecordId ? (
                      <TouchableOpacity
                        style={[styles.reviewBtn, { borderColor: colors.cardBorder }]}
                        onPress={() => {
                          setEditingNoteItem(item);
                          setNoteText(item.discrepancyNote || '');
                        }}>
                        <Ionicons
                          name={item.isReviewed ? 'checkmark-circle' : 'create-outline'}
                          size={14}
                          color={item.isReviewed ? colors.success : colors.primary}
                        />
                        <Text
                          style={[
                            styles.reviewBtnText,
                            { color: item.isReviewed ? colors.success : colors.primary },
                          ]}>
                          {item.isReviewed ? 'Reviewed (Edit Note)' : 'Add Note / Mark Reviewed'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </Card>
                );
              })
            )}
          </View>
        ) : (
          /* STANDARD ATTENDANCE / ACTIVITY / HABIT VIEW */
          <View>
            <Text style={[styles.intervalLabel, { color: colors.textSecondary }]}>
              {report?.startDate} to {report?.endDate}
            </Text>

            {/* Attendance Analytics */}
            <Card style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Attendance Overview</Text>
                {report && (
                  <Text style={[styles.trendLabel, { color: report.trends.netOfficeDiffSeconds >= 0 ? colors.success : colors.danger }]}>
                    {formatDelta(report.trends.netOfficeDiffSeconds)}
                  </Text>
                )}
              </View>

              <View style={styles.statGrid}>
                <StatCard
                  label="Net Office Time"
                  value={formatHoursMinutes(report?.attendance.netDurationSeconds || 0)}
                  subValue="excluding breaks"
                  accentColor={colors.primary}
                />
                <StatCard
                  label="Gross Elapsed"
                  value={formatHoursMinutes(report?.attendance.grossDurationSeconds || 0)}
                  subValue="total office hours"
                />
              </View>

              <View style={[styles.statGrid, { marginTop: 8 }]}>
                <StatCard
                  label="Total Breaks"
                  value={formatHoursMinutes(report?.attendance.breakDurationSeconds || 0)}
                  subValue="pause duration"
                  accentColor={colors.warning}
                />
                <StatCard
                  label="Sessions"
                  value={`${report?.attendance.sessionCount || 0}`}
                  subValue={`${report?.attendance.completedCount || 0} completed`}
                  accentColor={colors.success}
                />
              </View>
            </Card>

            {/* Activity Tracking */}
            <Card style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Activity Tracking</Text>
                {report && (
                  <Text style={[styles.trendLabel, { color: report.trends.activityDiffSeconds >= 0 ? colors.success : colors.danger }]}>
                    {formatDelta(report.trends.activityDiffSeconds)}
                  </Text>
                )}
              </View>

              <View style={styles.statGrid}>
                <StatCard
                  label="Total Active Time"
                  value={formatHoursMinutes(report?.activities.totalDurationSeconds || 0)}
                  subValue="across all categories"
                  accentColor={colors.accent}
                />
              </View>

              {report?.activities.byCategory.map((cat) => (
                <View key={cat.category} style={styles.catRow}>
                  <View style={styles.catHeader}>
                    <Text style={[styles.catName, { color: colors.text }]}>{cat.category}</Text>
                    <Text style={[styles.catTime, { color: colors.textSecondary }]}>
                      {formatHoursMinutes(cat.durationSeconds)} ({cat.percentage}%)
                    </Text>
                  </View>
                  <ProgressBar progress={cat.percentage / 100} color={colors.accent} height={6} />
                </View>
              ))}
            </Card>

            {/* Habit Consistency */}
            <Card style={styles.card}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Habit Consistency</Text>
                <Text style={[styles.trendLabel, { color: colors.success }]}>
                  {report?.habits.completionRate.toFixed(0)}% completion
                </Text>
              </View>

              <View style={styles.statGrid}>
                <StatCard
                  label="Completed"
                  value={`${report?.habits.completedCount || 0}`}
                  subValue="total checks in period"
                  accentColor={colors.success}
                />
                <StatCard
                  label="Active Habits"
                  value={`${report?.habits.totalHabits || 0}`}
                  subValue="routines tracked"
                />
              </View>
              <ProgressBar
                progress={(report?.habits.completionRate || 0) / 100}
                color={colors.success}
                height={8}
              />
            </Card>
          </View>
        )}

      </ScrollView>

      {/* PDF REPORT GENERATION MODAL */}
      <Modal visible={showPdfModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Generate PDF Evidence Report</Text>
              <TouchableOpacity onPress={() => setShowPdfModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Report Variant</Text>
            <View style={styles.radioGroup}>
              {[
                { type: 'ATTENDANCE_ONLY', label: 'Attendance Ledger Only' },
                { type: 'ATTENDANCE_WITH_ACTIVITIES', label: 'Attendance + Activities & Habits' },
                { type: 'RECONCILIATION', label: 'Official Comparison & Discrepancies' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.type}
                  style={[
                    styles.radioOption,
                    { borderColor: colors.cardBorder },
                    pdfType === opt.type && { borderColor: colors.primary, backgroundColor: colors.background },
                  ]}
                  onPress={() => setPdfType(opt.type as any)}>
                  <Ionicons
                    name={pdfType === opt.type ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={pdfType === opt.type ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.radioText, { color: colors.text }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: 12 }]}>
              Display Name (Optional)
            </Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.cardBorder }]}
              placeholder="Leave blank for anonymous personal record"
              placeholderTextColor={colors.textSecondary}
              value={displayName}
              onChangeText={setDisplayName}
            />

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary }]}
              onPress={handleGeneratePDF}
              disabled={isExportingPdf}>
              {isExportingPdf ? (
                <ActivityIndicator color={colors.primaryContrast} />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.primaryContrast }]}>
                  Compile & Share PDF
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* CSV EXPORT MODAL */}
      <Modal visible={showCsvModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Export CSV Data</Text>
              <TouchableOpacity onPress={() => setShowCsvModal(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Select Dataset</Text>
            {[
              { type: 'attendance_sessions', label: 'Attendance Sessions' },
              { type: 'attendance_events', label: 'Raw Attendance Punch Events' },
              { type: 'break_sessions', label: 'Break Sessions Log' },
              { type: 'activity_entries', label: 'Activity & Task Entries' },
              { type: 'habit_completions', label: 'Habit Daily Completions' },
              { type: 'official_attendance_records', label: 'Official HR Imported Records' },
              { type: 'reconciliation_results', label: 'Attendance Comparison Results' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.type}
                style={[styles.csvOption, { borderColor: colors.cardBorder }]}
                onPress={() => handleExportCSV(opt.type)}
                disabled={isExportingCsv}>
                <Ionicons name="document-text-outline" size={18} color={colors.primary} />
                <Text style={[styles.csvOptionText, { color: colors.text }]}>{opt.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      {/* DISCREPANCY NOTE EDIT MODAL */}
      <Modal visible={editingNoteItem !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Review Discrepancy</Text>
              <TouchableOpacity onPress={() => setEditingNoteItem(null)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
              Audit Note for {editingNoteItem?.date}
            </Text>
            <TextInput
              style={[styles.textArea, { color: colors.text, borderColor: colors.cardBorder }]}
              placeholder="e.g. Discussed 15m difference with HR; verified on biometric logs"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              value={noteText}
              onChangeText={setNoteText}
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.dialogBtn, { borderColor: colors.cardBorder, backgroundColor: colors.background }]}
                onPress={() => handleSaveNote(false)}>
                <Text style={[styles.dialogBtnText, { color: colors.text }]}>Save Note Only</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: colors.success, borderColor: colors.success }]}
                onPress={() => handleSaveNote(true)}>
                <Text style={[styles.dialogBtnText, { color: '#ffffff', fontWeight: '700' }]}>
                  Mark Verified
                </Text>
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
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '700',
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
  selectorContainer: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 4,
    marginBottom: Spacing.md,
  },
  selectorTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorText: {
    fontSize: 11,
  },
  intervalLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  subheading: {
    fontSize: 15,
    fontWeight: '700',
    marginVertical: 10,
  },
  trendLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  statGrid: {
    flexDirection: 'row',
    marginHorizontal: -Spacing.xs,
  },
  catRow: {
    marginVertical: 6,
  },
  catHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
  },
  catTime: {
    fontSize: 12,
  },
  infoBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: 12,
    alignItems: 'flex-start',
  },
  infoBannerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
  },
  reconCard: {
    marginBottom: Spacing.sm,
  },
  reconCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reconDate: {
    fontSize: 15,
    fontWeight: '700',
  },
  reconRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  reconCol: {
    flex: 1,
  },
  reconColLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  reconColVal: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  reconColSub: {
    fontSize: 11,
    marginTop: 1,
  },
  diffPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  diffPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  diffPillLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  diffPillVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  noteBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  noteText: {
    fontSize: 11,
    lineHeight: 15,
  },
  reviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 6,
    borderTopWidth: 1,
  },
  reviewBtnText: {
    fontSize: 11,
    fontWeight: '600',
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
    maxWidth: 420,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  radioGroup: {
    gap: 8,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  radioText: {
    fontSize: 13,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 13,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  submitButton: {
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  csvOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
  csvOptionText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  dialogBtnText: {
    fontSize: 12,
  },
});
