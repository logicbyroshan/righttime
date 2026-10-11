import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export * from './csvParsing';

/**
 * Save CSV string to local document directory and present Share sheet
 */
export async function exportCSVAndShare(filename: string, csvContent: string): Promise<string> {
  const dir = FileSystem.documentDirectory || '';
  const filepath = `${dir}${filename}`;

  await FileSystem.writeAsStringAsync(filepath, csvContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(filepath, {
      mimeType: 'text/csv',
      dialogTitle: `Export ${filename}`,
      UTI: 'public.comma-separated-values-text',
    });
  }

  return filepath;
}
