/**
 * Firestore User Store Implementation
 *
 * Phase 12: Production-ready user store for self-serve onboarding.
 * Manages user profiles linked to Firebase Auth.
 *
 * Collection Structure:
 * - gwi_users/{userId} - User profile document
 *
 * @module @gwi/core/storage/firestore-user
 */

import type { Firestore, CollectionReference, DocumentReference } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';
import type { UserStore, User, UserPreferences } from './interfaces.js';
import {
  getFirestoreClient,
  COLLECTIONS,
  timestampToDate,
  dateToTimestamp,
} from './firestore-client.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface UserDoc {
  id: string;
  githubUserId: number;
  githubLogin: string;
  githubAvatarUrl?: string;
  displayName: string;
  email: string;
  preferences: {
    defaultTenantId?: string;
    notificationsEnabled: boolean;
    theme: string;
  };
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
  updatedAt: Timestamp;
}

// =============================================================================
// Conversion Functions
// =============================================================================

function userDocToModel(doc: UserDoc): User {
  return {
    id: doc.id,
    githubUserId: doc.githubUserId,
    githubLogin: doc.githubLogin,
    githubAvatarUrl: doc.githubAvatarUrl,
    displayName: doc.displayName,
    email: doc.email,
    preferences: doc.preferences as UserPreferences,
    createdAt: timestampToDate(doc.createdAt)!,
    lastLoginAt: timestampToDate(doc.lastLoginAt)!,
    updatedAt: timestampToDate(doc.updatedAt)!,
  };
}

function userModelToDoc(user: User): UserDoc {
  return {
    id: user.id,
    githubUserId: user.githubUserId,
    githubLogin: user.githubLogin,
    githubAvatarUrl: user.githubAvatarUrl,
    displayName: user.displayName,
    email: user.email,
    preferences: user.preferences,
    createdAt: dateToTimestamp(user.createdAt)!,
    lastLoginAt: dateToTimestamp(user.lastLoginAt)!,
    updatedAt: dateToTimestamp(user.updatedAt)!,
  };
}

// =============================================================================
// Firestore User Store Implementation
// =============================================================================

/**
 * Firestore-backed UserStore implementation
 *
 * Provides:
 * - User CRUD operations
 * - Lookup by GitHub ID
 * - Email lookup
 */
export class FirestoreUserStore implements UserStore {
  private db: Firestore;

  constructor(db?: Firestore) {
    this.db = db ?? getFirestoreClient();
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private usersRef(): CollectionReference {
    return this.db.collection(COLLECTIONS.USERS);
  }

  private userDoc(userId: string): DocumentReference {
    return this.usersRef().doc(userId);
  }

  // ---------------------------------------------------------------------------
  // UserStore Implementation
  // ---------------------------------------------------------------------------

  async createUser(user: Omit<User, 'createdAt' | 'updatedAt'>): Promise<User> {
    const now = new Date();

    // Check if user with this GitHub ID already exists
    const existingByGitHub = await this.getUserByGitHubId(user.githubUserId);
    if (existingByGitHub) {
      throw new Error(`User already exists with GitHub ID ${user.githubUserId}`);
    }

    // Check if user with this email already exists
    const existingByEmail = await this.getUserByEmail(user.email);
    if (existingByEmail) {
      throw new Error(`User already exists with email ${user.email}`);
    }

    const fullUser: User = {
      ...user,
      createdAt: now,
      updatedAt: now,
    };

    const doc = userModelToDoc(fullUser);
    await this.userDoc(user.id).set(doc);

    return fullUser;
  }

  async getUser(userId: string): Promise<User | null> {
    const snapshot = await this.userDoc(userId).get();

    if (!snapshot.exists) {
      return null;
    }

    return userDocToModel(snapshot.data() as UserDoc);
  }

  async getUserByGitHubId(githubUserId: number): Promise<User | null> {
    const query = this.usersRef().where('githubUserId', '==', githubUserId).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    return userDocToModel(snapshot.docs[0].data() as UserDoc);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const query = this.usersRef().where('email', '==', email).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    return userDocToModel(snapshot.docs[0].data() as UserDoc);
  }

  async updateUser(userId: string, update: Partial<User>): Promise<User> {
    const existing = await this.getUser(userId);
    if (!existing) {
      throw new Error(`User not found: ${userId}`);
    }

    const updated: User = {
      ...existing,
      ...update,
      id: existing.id, // Never change ID
      createdAt: existing.createdAt, // Never change createdAt
      updatedAt: new Date(),
    };

    const doc = userModelToDoc(updated);
    await this.userDoc(userId).set(doc, { merge: true });

    return updated;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.userDoc(userId).delete();
  }

  // ---------------------------------------------------------------------------
  // Extended Methods
  // ---------------------------------------------------------------------------

  /**
   * Update user's last login timestamp
   */
  async recordLogin(userId: string): Promise<void> {
    await this.userDoc(userId).update({
      lastLoginAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Update user preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<UserPreferences>
  ): Promise<User> {
    const existing = await this.getUser(userId);
    if (!existing) {
      throw new Error(`User not found: ${userId}`);
    }

    const updatedPreferences: UserPreferences = {
      ...existing.preferences,
      ...preferences,
    };

    return this.updateUser(userId, { preferences: updatedPreferences });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let userStoreInstance: FirestoreUserStore | null = null;

/**
 * Get the singleton UserStore instance
 */
export function getUserStore(): UserStore {
  if (!userStoreInstance) {
    userStoreInstance = new FirestoreUserStore();
  }
  return userStoreInstance;
}
