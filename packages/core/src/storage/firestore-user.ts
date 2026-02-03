/**
 * Firestore User Store Implementation
 *
 * Phase 12: Production-ready user store for self-serve onboarding.
 * Manages user profiles linked to Firebase Auth.
 *
 * Collection Structure:
 * - gwi_users/{userId} - User profile document
 *
 * Refactored to use BaseFirestoreRepository.
 *
 * @module @gwi/core/storage/firestore-user
 */

import type { Firestore, DocumentData } from 'firebase-admin/firestore';
import {
  BaseFirestoreRepository,
  COLLECTIONS,
  Timestamp,
  timestampToDate,
  dateToTimestamp,
} from './base-firestore-repository.js';
import type { UserStore, User, UserPreferences } from './interfaces.js';

// =============================================================================
// Firestore Document Types
// =============================================================================

interface UserDoc extends DocumentData {
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

function userDocToModel(doc: UserDoc, id: string): User {
  return {
    id,
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
export class FirestoreUserStore
  extends BaseFirestoreRepository<User, UserDoc>
  implements UserStore
{
  constructor(db?: Firestore) {
    super(db, {
      collection: COLLECTIONS.USERS,
      idPrefix: 'usr',
      timestampFields: ['createdAt', 'lastLoginAt', 'updatedAt'],
      docToModel: userDocToModel,
      modelToDoc: userModelToDoc,
    });
  }

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

    const doc = this.toDocument(fullUser);
    await this.getDocRef(user.id).set(doc);

    return fullUser;
  }

  async getUser(userId: string): Promise<User | null> {
    return this.getDocument(userId);
  }

  async getUserByGitHubId(githubUserId: number): Promise<User | null> {
    return this.findByField('githubUserId', githubUserId);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.findByField('email', email);
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

    const doc = this.toDocument(updated);
    await this.getDocRef(userId).set(doc, { merge: true });

    return updated;
  }

  async deleteUser(userId: string): Promise<void> {
    await this.deleteDocument(userId);
  }

  /**
   * Update user's last login timestamp
   */
  async recordLogin(userId: string): Promise<void> {
    await this.getDocRef(userId).update({
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
