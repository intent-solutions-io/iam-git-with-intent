# 029-DR-ADRC: Firebase Hosting + SaaS UI Shell

**Document ID:** 029-DR-ADRC
**Document Type:** Decision Record - Comprehensive
**Created:** 2025-12-16
**Status:** ACCEPTED
**Author:** Claude Code (Opus 4.5)

---

> **Filing Standard:** This document follows docs-filing v4
> - `029` = chronological sequence number
> - `DR` = Decision Record category
> - `ADRC` = Architecture Decision Record Comprehensive type

---

## Context

Phase 10 establishes the SaaS web UI for Git With Intent. After completing Cloud Run staging (Phase 9), we need a user-facing interface for authentication, tenant management, and run monitoring.

## Decision

### D1: React + Vite + TypeScript

**Decision:** Use React 18 with Vite for the web application.

**Rationale:**
- Modern, fast build tooling with excellent DX
- TypeScript for type safety
- React Router for SPA routing
- Firebase SDK integration is straightforward

**Stack:**
- React 18.2
- Vite 5.x
- TypeScript 5.3
- React Router 6.x
- Firebase 10.x

### D2: Firebase Hosting

**Decision:** Deploy to Firebase Hosting with SPA configuration.

**Configuration:**
```json
{
  "hosting": {
    "public": "apps/web/dist",
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

**Benefits:**
- Global CDN with edge caching
- Automatic SSL
- Simple deployment via Firebase CLI
- Integration with other Firebase services

### D3: GitHub OAuth via Firebase Auth

**Decision:** Use Firebase Authentication with GitHub provider.

**Flow:**
1. User clicks "Sign in with GitHub"
2. Firebase handles OAuth popup/redirect
3. User grants repo access to GWI
4. Firebase returns authenticated user
5. App fetches tenant memberships from Firestore

**Scopes requested:**
- `repo` - Repository access for conflict detection
- `read:org` - Organization membership information

### D4: Tenant Context Pattern

**Decision:** Use React Context + custom hook for multi-tenant state.

**Implementation:**
- `AuthContext` - Firebase user state
- `useTenant` hook - Tenant memberships and selection
- Firestore real-time subscriptions for live updates

**Data Flow:**
```
User → AuthContext → useTenant → TenantContext
                                      ↓
                              currentTenant
                                      ↓
                              Dashboard/Runs/Settings
```

### D5: Minimal CSS Utilities

**Decision:** Custom utility CSS for Phase 10, Tailwind CSS for production.

**Rationale:**
- Minimal dependencies for initial shell
- Utility-first approach matches Tailwind patterns
- Easy migration when Tailwind is added
- No build complexity for CSS

### D6: Page Structure

**Decision:** Minimal page set for core SaaS functionality.

**Pages:**
| Page | Path | Auth | Purpose |
|------|------|------|---------|
| Home | `/` | No | Landing page |
| Login | `/login` | No | GitHub OAuth |
| Dashboard | `/dashboard` | Yes | Tenant overview |
| Runs | `/runs` | Yes | Run list/details |
| Settings | `/settings` | Yes | Configuration |

## Consequences

### Positive
- Clean, modern UI foundation
- Type-safe frontend codebase
- Real-time Firestore updates
- Easy Firebase deployment

### Negative
- Bundle size warnings (Firebase SDK is large)
- No server-side rendering (SPA only)
- Custom CSS utilities need Tailwind migration

### Future Work
- Add Tailwind CSS for production styling
- Implement code splitting for bundle optimization
- Add error boundary components
- Add loading skeletons for better UX

## Implementation

### Directory Structure
```
apps/web/
├── src/
│   ├── components/
│   │   ├── Layout.tsx
│   │   └── ProtectedRoute.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── hooks/
│   │   └── useTenant.ts
│   ├── lib/
│   │   └── firebase.ts
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Runs.tsx
│   │   └── Settings.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

### Files Created
- `firebase.json` - Firebase Hosting configuration
- `apps/web/` - Complete web application
- 15 source files for UI shell

## Related Documents

- 027-DR-ADRC-staging-cloud-run-firestore-deployment.md - Firestore setup
- 025-DR-ADRC-github-app-webhook-tenant-linking.md - Tenant model
- Phase 11 (planned): End-to-end integration testing

---

*intent solutions io - confidential IP*
*Contact: jeremy@intentsolutions.io*
