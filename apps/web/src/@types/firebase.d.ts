/**
 * Type declarations for Firebase modules
 *
 * Minimal stubs to satisfy TypeScript compiler.
 * The firebase package types are missing from node_modules.
 */

declare module 'firebase/app' {
  export interface FirebaseOptions {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
    measurementId?: string;
  }

  export interface FirebaseApp {
    name: string;
    options: FirebaseOptions;
  }

  export function initializeApp(options: FirebaseOptions, name?: string): FirebaseApp;
  export function getApp(name?: string): FirebaseApp;
  export function getApps(): FirebaseApp[];
}

declare module 'firebase/auth' {
  import type { FirebaseApp } from 'firebase/app';

  export interface User {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    displayName: string | null;
    photoURL: string | null;
    phoneNumber: string | null;
    isAnonymous: boolean;
    metadata: {
      creationTime?: string;
      lastSignInTime?: string;
    };
    getIdToken(forceRefresh?: boolean): Promise<string>;
    getIdTokenResult(forceRefresh?: boolean): Promise<IdTokenResult>;
  }

  export interface IdTokenResult {
    token: string;
    expirationTime: string;
    authTime: string;
    issuedAtTime: string;
    signInProvider: string | null;
    claims: Record<string, unknown>;
  }

  export interface Auth {
    currentUser: User | null;
    languageCode: string | null;
    tenantId: string | null;
  }

  export interface UserCredential {
    user: User;
    providerId: string | null;
    operationType: 'signIn' | 'link' | 'reauthenticate';
  }

  export interface AuthProvider {
    providerId: string;
  }

  export class GoogleAuthProvider implements AuthProvider {
    static PROVIDER_ID: string;
    static GOOGLE_SIGN_IN_METHOD: string;
    providerId: string;
    addScope(scope: string): GoogleAuthProvider;
    setCustomParameters(customOAuthParameters: object): GoogleAuthProvider;
  }

  export class GithubAuthProvider implements AuthProvider {
    static PROVIDER_ID: string;
    static GITHUB_SIGN_IN_METHOD: string;
    providerId: string;
    addScope(scope: string): GithubAuthProvider;
    setCustomParameters(customOAuthParameters: object): GithubAuthProvider;
  }

  export type Unsubscribe = () => void;
  export type NextOrObserver<T> = ((value: T) => void) | { next: (value: T) => void };

  export function getAuth(app?: FirebaseApp): Auth;
  export function connectAuthEmulator(auth: Auth, url: string, options?: { disableWarnings: boolean }): void;
  export function onAuthStateChanged(auth: Auth, nextOrObserver: NextOrObserver<User | null>): Unsubscribe;
  export function signInWithPopup(auth: Auth, provider: AuthProvider): Promise<UserCredential>;
  export function signInWithRedirect(auth: Auth, provider: AuthProvider): Promise<void>;
  export function signOut(auth: Auth): Promise<void>;
  export function getRedirectResult(auth: Auth): Promise<UserCredential | null>;
  export function createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential>;
  export function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<UserCredential>;
  export function sendPasswordResetEmail(auth: Auth, email: string): Promise<void>;
}

declare module 'firebase/firestore' {
  import type { FirebaseApp } from 'firebase/app';

  export interface Firestore {
    app: FirebaseApp;
    type: 'firestore' | 'firestore-lite';
  }

  export interface DocumentData {
    [field: string]: unknown;
  }

  export interface QueryDocumentSnapshot<T = DocumentData> {
    id: string;
    ref: DocumentReference<T>;
    data(): T;
    exists(): boolean;
    get(fieldPath: string): unknown;
  }

  export interface DocumentSnapshot<T = DocumentData> {
    id: string;
    ref: DocumentReference<T>;
    data(): T | undefined;
    exists(): boolean;
    get(fieldPath: string): unknown;
  }

  export interface DocumentReference<T = DocumentData> {
    id: string;
    path: string;
    parent: CollectionReference<T>;
  }

  export interface CollectionReference<T = DocumentData> extends Query<T> {
    id: string;
    path: string;
    parent: DocumentReference | null;
  }

  export interface Query<_T = DocumentData> {
    firestore: Firestore;
    type: 'query' | 'collection';
  }

  export interface QuerySnapshot<T = DocumentData> {
    docs: QueryDocumentSnapshot<T>[];
    size: number;
    empty: boolean;
    forEach(callback: (result: QueryDocumentSnapshot<T>) => void): void;
  }

  export type WhereFilterOp = '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'array-contains-any' | 'in' | 'not-in';
  export type OrderByDirection = 'desc' | 'asc';

  export interface QueryConstraint {
    type: string;
  }

  export type Unsubscribe = () => void;

  export function getFirestore(app?: FirebaseApp): Firestore;
  export function connectFirestoreEmulator(firestore: Firestore, host: string, port: number): void;
  export function collection(firestore: Firestore, path: string, ...pathSegments: string[]): CollectionReference;
  export function doc(firestore: Firestore, path: string, ...pathSegments: string[]): DocumentReference;
  export function doc<T>(reference: CollectionReference<T>, path?: string, ...pathSegments: string[]): DocumentReference<T>;
  export function getDoc<T>(reference: DocumentReference<T>): Promise<DocumentSnapshot<T>>;
  export function getDocs<T>(query: Query<T>): Promise<QuerySnapshot<T>>;
  export function setDoc<T>(reference: DocumentReference<T>, data: T, options?: { merge?: boolean }): Promise<void>;
  export function updateDoc<T>(reference: DocumentReference<T>, data: Partial<T>): Promise<void>;
  export function deleteDoc(reference: DocumentReference): Promise<void>;
  export function addDoc<T>(reference: CollectionReference<T>, data: T): Promise<DocumentReference<T>>;
  export function query<T>(query: Query<T>, ...queryConstraints: QueryConstraint[]): Query<T>;
  export function where(fieldPath: string, opStr: WhereFilterOp, value: unknown): QueryConstraint;
  export function orderBy(fieldPath: string, directionStr?: OrderByDirection): QueryConstraint;
  export function limit(limit: number): QueryConstraint;
  export function startAfter(...fieldValues: unknown[]): QueryConstraint;
  export function endBefore(...fieldValues: unknown[]): QueryConstraint;
  export function onSnapshot<T>(
    reference: DocumentReference<T>,
    observer: { next?: (snapshot: DocumentSnapshot<T>) => void; error?: (error: Error) => void }
  ): Unsubscribe;
  export function onSnapshot<T>(
    query: Query<T>,
    observer: { next?: (snapshot: QuerySnapshot<T>) => void; error?: (error: Error) => void }
  ): Unsubscribe;
  export function onSnapshot<T>(
    reference: DocumentReference<T>,
    onNext: (snapshot: DocumentSnapshot<T>) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
  export function onSnapshot<T>(
    query: Query<T>,
    onNext: (snapshot: QuerySnapshot<T>) => void,
    onError?: (error: Error) => void
  ): Unsubscribe;
  export function serverTimestamp(): unknown;

  export class Timestamp {
    constructor(seconds: number, nanoseconds: number);
    static now(): Timestamp;
    static fromDate(date: Date): Timestamp;
    seconds: number;
    nanoseconds: number;
    toDate(): Date;
    toMillis(): number;
  }
}
