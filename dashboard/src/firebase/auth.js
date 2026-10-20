import { auth, db, isConfigured } from './config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';

/**
 * Sign in with email and password
 */
export async function loginWithEmail(email, password) {
  if (!isConfigured) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Register / Create new user with email and password
 */
export async function registerWithEmail(email, password) {
  if (!isConfigured) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
}

/**
 * Sign out the current user
 */
export async function logout() {
  if (!isConfigured) return;
  return signOut(auth);
}

/**
 * Listen for auth state changes
 */
export function onAuthChange(callback) {
  if (!isConfigured) return () => {};
  return onAuthStateChanged(auth, callback);
}

export { auth };
