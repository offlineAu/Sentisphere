import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const DELETED_JOURNALS_KEY = 'deleted_journal_ids';

/**
 * Get the list of soft-deleted journal IDs from local storage.
 * These entries won't appear in the UI but remain in the backend for data collection.
 */
export async function getDeletedJournalIds(): Promise<Set<string>> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = (window as any)?.localStorage?.getItem(DELETED_JOURNALS_KEY) || null;
    } else {
      raw = await SecureStore.getItemAsync(DELETED_JOURNALS_KEY);
    }
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/**
 * Add a journal ID to the soft-deleted list.
 */
export async function addDeletedJournalId(journalId: string): Promise<void> {
  try {
    const existing = await getDeletedJournalIds();
    existing.add(journalId);
    const data = JSON.stringify(Array.from(existing));
    if (Platform.OS === 'web') {
      (window as any)?.localStorage?.setItem(DELETED_JOURNALS_KEY, data);
    } else {
      await SecureStore.setItemAsync(DELETED_JOURNALS_KEY, data);
    }
  } catch {
    // Silently fail - worst case the entry reappears
  }
}

/**
 * Check if a journal ID has been soft-deleted.
 */
export async function isJournalDeleted(journalId: string): Promise<boolean> {
  const deleted = await getDeletedJournalIds();
  return deleted.has(journalId);
}

/**
 * Remove a journal ID from the soft-deleted list (restore).
 */
export async function removeDeletedJournalId(journalId: string): Promise<void> {
  try {
    const existing = await getDeletedJournalIds();
    existing.delete(journalId);
    const data = JSON.stringify(Array.from(existing));
    if (Platform.OS === 'web') {
      (window as any)?.localStorage?.setItem(DELETED_JOURNALS_KEY, data);
    } else {
      await SecureStore.setItemAsync(DELETED_JOURNALS_KEY, data);
    }
  } catch {
    // Silently fail
  }
}
