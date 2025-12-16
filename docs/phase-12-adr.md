# ADR-012: Beta Tenant Onboarding and Self-Serve Flows

**Status:** Accepted
**Date:** 2025-12-16
**Phase:** 12
**Author:** Claude (AI Assistant) with Jeremy

## Context

Phase 11 established production-ready security, RBAC, and plan enforcement. Phase 12 focuses on enabling self-serve onboarding for beta users without requiring manual intervention. The platform needs:

1. **Signup Flow**: Users need to create accounts and workspaces without assistance
2. **Member Invitations**: Workspace owners need to invite team members
3. **GitHub App Integration**: Seamless connection between GitHub orgs and GWI tenants
4. **Beta Gating**: Controlled access during the beta period with invite codes

## Decision

### 1. Signup and Tenant Creation API

New endpoints for self-serve onboarding:

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /signup` | None | Create user account |
| `POST /tenants` | Required | Create workspace |
| `GET /tenants` | Required | List user's workspaces |
| `GET /me` | Required | Get current user with memberships |

**Signup Flow:**
1. User authenticates with GitHub OAuth (Firebase Auth)
2. Frontend calls `POST /signup` to register in GWI system
3. User creates workspace via `POST /tenants`
4. User is automatically added as OWNER

### 2. Member Invitations API

| Endpoint | Permission | Description |
|----------|------------|-------------|
| `POST /tenants/:id/invites` | ADMIN+ | Create invitation |
| `GET /tenants/:id/invites` | ADMIN+ | List pending invites |
| `GET /tenants/:id/members` | VIEWER+ | List active members |
| `POST /invites/:token/accept` | Auth | Accept invitation |
| `DELETE /tenants/:id/invites/:id` | ADMIN+ | Cancel invitation |

**Invite Flow:**
1. Admin creates invite with email and role
2. System generates unique invite token
3. Invitee receives link (email integration TBD)
4. Invitee signs in and accepts
5. Membership status changes from `invited` to `active`

### 3. GitHub App Installation Flow

| Endpoint | Description |
|----------|-------------|
| `GET /github/install` | Redirect to GitHub App installation |
| `GET /github/callback` | Handle post-installation redirect |

**Flow:**
1. User clicks "Connect GitHub" in onboarding
2. Redirected to GitHub App installation
3. User authorizes for their org
4. GitHub webhook creates tenant via `installation.created`
5. User redirected back to dashboard

### 4. Beta Program Configuration

```typescript
interface BetaConfig {
  enabled: boolean;
  accessMode: 'open' | 'invite_only' | 'closed';
  validInviteCodes?: string[];
  betaFeatures: BetaFeature[];
  maxBetaUsers: number;
  betaEndsAt?: Date;
}
```

**Default codes:** `GWIBETA2025`, `EARLYBIRD`, `FOUNDER50`

### 5. Frontend Implementation

New React pages:

| Page | Route | Purpose |
|------|-------|---------|
| Onboarding | `/onboarding` | User sync + workspace creation |
| InviteAccept | `/invite/:token` | Accept invitation |

**API Client** (`apps/web/src/lib/api.ts`):
- Type-safe fetch wrapper with Firebase Auth integration
- Automatic token injection
- Error handling with `ApiError` class

## Consequences

### Positive

1. **Self-Serve**: Users can onboard without manual intervention
2. **Team Collaboration**: Easy member invitations with role assignment
3. **GitHub Integration**: Seamless org connection through App installation
4. **Beta Control**: Invite codes allow controlled rollout
5. **Type Safety**: Shared types between API and frontend

### Negative

1. **Email Not Integrated**: Invitations require manual link sharing
2. **No Waitlist**: Users with invalid codes are blocked (no waitlist capture)
3. **Token Storage**: Invite tokens stored in membership ID (not ideal for production)

### Neutral

1. **Firebase Auth Required**: Existing accounts needed before GWI signup
2. **GitHub Optional**: Users can create workspaces without GitHub connection

## Implementation

### Files Created

| File | Purpose |
|------|---------|
| `packages/core/src/storage/firestore-user.ts` | User store implementation |
| `apps/web/src/lib/api.ts` | Frontend API client |
| `apps/web/src/pages/Onboarding.tsx` | Onboarding flow |
| `apps/web/src/pages/InviteAccept.tsx` | Invite acceptance |

### Files Modified

| File | Changes |
|------|---------|
| `packages/core/src/storage/interfaces.ts` | Added `getUserByEmail` to UserStore |
| `packages/core/src/storage/index.ts` | Export getUserStore |
| `packages/core/src/storage/inmemory.ts` | Added email lookup to InMemoryUserStore |
| `packages/core/src/security/index.ts` | Added beta config and validation |
| `apps/api/src/index.ts` | Signup, invites, GitHub callback endpoints |
| `apps/web/src/App.tsx` | New routes |

## Verification

1. Core builds: `npm run build -w @gwi/core` passes
2. API builds: `npm run build -w @gwi/api` passes
3. Web builds: `npm run build -w @gwi/web` passes
4. New endpoints documented in API header comments
5. Beta validation functions exported from `@gwi/core`

## References

- [ADR-011: Production Readiness](./phase-11-adr.md)
- [Firebase Auth Documentation](https://firebase.google.com/docs/auth)
- [GitHub App Installation Flow](https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app)
