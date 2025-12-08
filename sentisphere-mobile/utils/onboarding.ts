/**
 * Onboarding utilities for managing terms acceptance state.
 * Uses SecureStore on native platforms and localStorage on web.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const TERMS_ACCEPTED_KEY = 'sentisphere_terms_accepted';
const TERMS_VERSION = '1.0'; // Bump this to re-show terms after major changes

/**
 * Check if the user has already accepted the current version of terms.
 */
export async function hasAcceptedTerms(): Promise<boolean> {
    try {
        let storedVersion: string | null = null;

        if (Platform.OS === 'web') {
            storedVersion = typeof window !== 'undefined'
                ? window.localStorage?.getItem(TERMS_ACCEPTED_KEY) ?? null
                : null;
        } else {
            storedVersion = await SecureStore.getItemAsync(TERMS_ACCEPTED_KEY);
        }

        // Return true only if the stored version matches current version
        return storedVersion === TERMS_VERSION;
    } catch {
        return false;
    }
}

/**
 * Mark terms as accepted (stores current version).
 */
export async function setTermsAccepted(): Promise<void> {
    try {
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                window.localStorage?.setItem(TERMS_ACCEPTED_KEY, TERMS_VERSION);
            }
        } else {
            await SecureStore.setItemAsync(TERMS_ACCEPTED_KEY, TERMS_VERSION);
        }
    } catch (e) {
        console.error('[Onboarding] Failed to save terms acceptance:', e);
    }
}

/**
 * Clear terms acceptance (for testing or when terms need to be re-shown).
 */
export async function clearTermsAccepted(): Promise<void> {
    try {
        if (Platform.OS === 'web') {
            if (typeof window !== 'undefined') {
                window.localStorage?.removeItem(TERMS_ACCEPTED_KEY);
            }
        } else {
            await SecureStore.deleteItemAsync(TERMS_ACCEPTED_KEY);
        }
    } catch (e) {
        console.error('[Onboarding] Failed to clear terms acceptance:', e);
    }
}

/**
 * Get the current terms version.
 */
export function getTermsVersion(): string {
    return TERMS_VERSION;
}
