# Git With Intent - Web Dashboard

Production-ready React web dashboard for the Git With Intent platform.

## Quick Start

```bash
# Development server
npm run dev                    # http://localhost:3000

# Build for production
npm run build                  # Output: dist/

# Type checking
npm run typecheck

# Deploy to Firebase
./deploy.sh staging            # Staging environment
./deploy.sh production         # Production environment
```

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript 5
- **Authentication**: Firebase Auth (GitHub, Google, Email/Password)
- **Database**: Firestore (real-time sync)
- **Routing**: React Router v6
- **Styling**: Custom CSS utilities
- **Hosting**: Firebase Hosting
- **Monorepo**: Turbo (integrated with workspace)

## Project Structure

```
apps/web/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── Layout.tsx       # App shell (header, sidebar, footer)
│   │   ├── Sidebar.tsx      # Navigation sidebar
│   │   ├── ProtectedRoute.tsx  # Auth guard with RBAC
│   │   └── OnboardingWizard.tsx
│   ├── contexts/            # React contexts
│   │   └── AuthContext.tsx  # Firebase Auth provider
│   ├── hooks/               # Custom hooks
│   │   └── useTenant.tsx    # Multi-tenant management
│   ├── pages/               # Page components (31 total)
│   │   ├── Home.tsx
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Runs.tsx
│   │   └── [27+ more]
│   ├── lib/                 # Utilities
│   │   ├── firebase.ts      # Firebase config
│   │   └── api.ts           # API client
│   ├── App.tsx              # Root component + routing
│   ├── main.tsx             # Entry point
│   └── index.css            # Global styles
├── dist/                    # Build output (ignored by git)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── deploy.sh                # Firebase deployment script
└── .env.example             # Environment template
```

## Environment Setup

Create `.env.local` with your Firebase credentials:

```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123

# Optional: Use Firebase emulators for local development
VITE_USE_EMULATORS=false
```

Get these values from:
1. Firebase Console → Project Settings
2. Your Apps → Web App → Config

## Key Features

### Authentication (F1.s3)

Multi-provider authentication with Firebase:

```tsx
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, signInWithGitHub, signInWithGoogle, signInWithEmail } = useAuth();

  return (
    <div>
      <button onClick={signInWithGitHub}>Sign in with GitHub</button>
      <button onClick={signInWithGoogle}>Sign in with Google</button>
    </div>
  );
}
```

**Supported providers**:
- GitHub OAuth (with `repo` and `read:org` scopes)
- Google OAuth
- Email/Password
- Password reset

### Multi-Tenant Support (F1.s4)

Organization and personal account management:

```tsx
import { useTenant } from '@/hooks/useTenant';

function Dashboard() {
  const { tenants, currentTenant, selectTenant } = useTenant();

  return (
    <div>
      <select onChange={(e) => selectTenant(e.target.value)}>
        {tenants.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </div>
  );
}
```

**Features**:
- Real-time tenant sync (Firestore)
- Role attachment (OWNER, ADMIN, DEVELOPER, VIEWER)
- Organization/personal account types

### Protected Routes & RBAC (F1.s5)

Role-based access control for routes:

```tsx
import { ProtectedRoute } from '@/components/ProtectedRoute';

// Simple authentication check
<ProtectedRoute>
  <Dashboard />
</ProtectedRoute>

// RBAC enforcement
<ProtectedRoute requireRole="ADMIN">
  <AdminPanel />
</ProtectedRoute>
```

**Role hierarchy**:
- VIEWER (0) - Read-only access
- DEVELOPER (1) - Can create runs
- ADMIN (2) - Can manage settings
- OWNER (3) - Full access

### Responsive Layout (F1.s4)

Mobile-first responsive design:

```tsx
import { Layout } from '@/components/Layout';

// Desktop: Persistent sidebar (left)
// Mobile: Drawer sidebar (toggle button)
// Header: Fixed with tenant selector + user menu
// Footer: Copyright + links
```

**Breakpoints**:
- Mobile: < 768px (drawer sidebar)
- Tablet: 768px - 1024px
- Desktop: > 1024px (persistent sidebar)

## Available Routes

### Public Routes

- `/` - Landing page
- `/login` - Authentication
- `/signup` - User registration
- `/features` - Product features
- `/install` - Installation guide
- `/how-it-works` - Product overview
- `/security` - Security policies
- `/pricing` - Pricing tiers
- `/docs` - Documentation

### Protected Routes

- `/dashboard` - Tenant overview
- `/runs` - Run history
- `/runs/:runId` - Run details
- `/queue` - Job queue
- `/candidates` - Candidate PRs
- `/templates` - Workflow templates
- `/instances` - Template instances
- `/marketplace` - Connector marketplace
- `/usage` - Usage & billing
- `/upgrade` - Plan upgrades
- `/settings` - Account settings

### Admin Routes (Require ADMIN or OWNER role)

- `/admin/connectors` - Connector management
- `/admin/policy` - Policy editor
- `/admin/secrets` - Secret management
- `/admin/ops` - Operations dashboard

## Development Workflow

### Adding a New Page

1. Create page component:

```tsx
// src/pages/MyNewPage.tsx
export function MyNewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">My New Page</h1>
    </div>
  );
}
```

2. Add route in `App.tsx`:

```tsx
import { MyNewPage } from './pages/MyNewPage';

<Route
  path="/my-new-page"
  element={
    <ProtectedRoute>
      <MyNewPage />
    </ProtectedRoute>
  }
/>
```

3. Add to sidebar navigation (optional):

```tsx
// src/components/Sidebar.tsx
const NAV_ITEMS = [
  // ...
  { path: '/my-new-page', label: 'My New Page', icon: 'icon' },
];
```

### Using Firestore

```tsx
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Real-time listener
const q = query(collection(db, 'gwi_runs'), where('tenantId', '==', tenantId));
const unsubscribe = onSnapshot(q, (snapshot) => {
  const runs = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  setRuns(runs);
});

// Cleanup
return () => unsubscribe();
```

### Calling the API

```tsx
import { fetchRuns } from '@/lib/api';

const runs = await fetchRuns(tenantId);
```

## Build Output

Production build creates:

```
dist/
├── index.html               # 599 bytes
└── assets/
    ├── index-[hash].js      # 873 KB (206 KB gzipped)
    ├── index-[hash].js.map  # 3.6 MB (source maps)
    └── index-[hash].css     # 5.3 KB
```

**Total bundle size**: ~873 KB (206 KB gzipped)

**Optimization opportunities**:
- Code splitting (React.lazy for routes)
- Manual chunks (separate Firebase from React)
- Tree shaking (named imports)

## Deployment

### Firebase Hosting

```bash
# Deploy to staging
./deploy.sh staging

# Deploy to production
./deploy.sh production
```

**Deployment steps**:
1. Build app (`npm run build`)
2. Deploy to Firebase Hosting (`firebase deploy --only hosting`)
3. Verify at deployment URL

### CI/CD Integration

Add to GitHub Actions:

```yaml
- name: Build web app
  run: npm run build

- name: Deploy to Firebase
  uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    repoToken: '${{ secrets.GITHUB_TOKEN }}'
    firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
    projectId: your-project-id
```

## Performance

### Current Metrics

| Metric | Value | Target |
|--------|-------|--------|
| Build time | ~7s | < 10s |
| Bundle size | 873 KB | < 500 KB |
| Gzipped | 206 KB | < 200 KB |
| Load time | TBD | < 2s |

### Optimization Checklist

- [ ] Code splitting (lazy load routes)
- [ ] Manual chunks (vendor splitting)
- [ ] Image optimization
- [ ] Font subsetting
- [ ] Service worker (PWA)

## Security

### Authentication

- Firebase Auth handles OAuth securely
- Session tokens in localStorage (Firebase default)
- HTTPS-only in production

### RBAC

- Frontend role checks (ProtectedRoute)
- **TODO**: Backend validation (Firestore rules)

### Firestore Rules (TODO)

```javascript
// firestore.rules
match /gwi_tenants/{tenantId} {
  allow read: if request.auth != null &&
    exists(/databases/$(database)/documents/gwi_memberships/$(request.auth.uid + '_' + tenantId));
}
```

## Testing

### Current Status

- [ ] Unit tests (Vitest + React Testing Library)
- [ ] Integration tests
- [ ] E2E tests (Playwright)

### Recommended Setup

```bash
npm install --save-dev vitest @testing-library/react @testing-library/user-event
```

```tsx
// src/__tests__/components/ProtectedRoute.test.tsx
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '@/components/ProtectedRoute';

test('redirects to login when unauthenticated', () => {
  render(<ProtectedRoute><div>Protected</div></ProtectedRoute>);
  expect(screen.queryByText('Protected')).not.toBeInTheDocument();
});
```

## Troubleshooting

### Build fails with TypeScript errors

```bash
# Check for errors
npm run typecheck

# Common issues:
# - Missing imports
# - Type mismatches
# - Unused variables (enable noUnusedLocals in tsconfig.json)
```

### Firebase auth not working

1. Check `.env.local` has correct credentials
2. Verify Firebase project is active
3. Check OAuth providers are enabled in Firebase Console
4. For GitHub: Verify OAuth app is configured

### Sidebar not showing

The sidebar only shows on authenticated routes. Public routes (/, /login, /signup, etc.) don't have a sidebar.

### CORS errors when calling API

Add your domain to API CORS allowlist:

```typescript
// In API server
const corsOptions = {
  origin: ['http://localhost:3000', 'https://gitwithintent.com'],
};
```

## Resources

- [React Docs](https://react.dev/)
- [Vite Docs](https://vitejs.dev/)
- [Firebase Auth Docs](https://firebase.google.com/docs/auth)
- [Firestore Docs](https://firebase.google.com/docs/firestore)
- [React Router Docs](https://reactrouter.com/)

## Support

For issues or questions:
- GitHub Issues: https://github.com/intent-solutions/git-with-intent/issues
- Documentation: `/docs` route in the app
- Epic tracking: Use `bd` (beads) CLI

---

**Epic F1 Status**: ✅ Complete
**Documentation**: See `000-docs/160-DR-IMPL-epic-f1-web-dashboard-foundation.md`
**Last Updated**: 2025-12-27
