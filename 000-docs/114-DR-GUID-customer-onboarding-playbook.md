# Customer Onboarding Playbook

> **Document**: 114-DR-GUID-customer-onboarding-playbook.md
> **Created**: 2025-12-18 03:00 CST
> **Phase**: 33 (Post-GA Ops & Customer Onboarding)
> **Status**: Living document

## 1. Overview

This playbook guides customers through Git With Intent (GWI) setup from GitHub App installation to first successful run.

### 1.1 Onboarding Journey

```
GitHub App Install → Org Setup → SSO Config → First Repo → First Run → Success
     (5 min)         (2 min)     (15 min)     (2 min)     (5 min)
```

**Total Time**: ~30 minutes for full enterprise setup, ~10 minutes for basic setup

## 2. Playbook: Basic Installation

### 2.1 Prerequisites
- [ ] GitHub organization with admin access
- [ ] At least one repository to connect
- [ ] Email for account creation

### 2.2 Step 1: Install GitHub App

1. Go to [github.com/apps/git-with-intent](https://github.com/apps/git-with-intent)
2. Click "Install"
3. Select organization
4. Choose repositories:
   - "All repositories" for org-wide access
   - "Only select repositories" for specific repos
5. Click "Install & Authorize"

**Expected Result**: Redirect to GWI dashboard with new org created

### 2.3 Step 2: Verify Installation

1. Check GWI dashboard shows your organization
2. Verify connected repositories appear
3. Check webhook status (green checkmark)

**Troubleshooting**:
- No org visible? Check GitHub App installation in org settings
- Webhook errors? Verify firewall allows GitHub webhooks

### 2.4 Step 3: First Run

1. Create a GitHub issue in connected repo
2. Label it with `gwi:autopilot` (or configured trigger)
3. Watch the dashboard for run progress
4. Review generated PR

**Expected Time**: ~2 minutes for simple issues

## 3. Playbook: Enterprise SSO Setup

### 3.1 Prerequisites
- [ ] Identity Provider (Okta, Azure AD, Google Workspace, etc.)
- [ ] Admin access to IdP
- [ ] GWI org owner role

### 3.2 OIDC SSO Setup

1. **In GWI Dashboard** → Settings → Identity → SSO
2. Select "OIDC" provider type
3. Note the callback URL: `https://api.gitwithintent.dev/v1/sso/oidc/callback`

4. **In Your IdP** (example: Okta):
   - Create new OIDC application
   - Set redirect URI to callback URL from step 3
   - Copy Client ID and Client Secret
   - Note the Issuer URL (e.g., `https://your-domain.okta.com`)

5. **Back in GWI Dashboard**:
   - Enter Client ID
   - Enter Client Secret (stored securely)
   - Enter Issuer URL
   - Configure allowed domains (e.g., `@yourcompany.com`)
   - Save

6. **Test SSO**:
   - Open incognito window
   - Go to GWI login
   - Click "Sign in with SSO"
   - Enter your org name
   - Complete IdP authentication
   - Verify you're logged in

### 3.3 SAML SSO Setup

1. **In GWI Dashboard** → Settings → Identity → SSO
2. Select "SAML" provider type
3. Download SP Metadata (or note ACS URL and Entity ID)

4. **In Your IdP** (example: Azure AD):
   - Create new SAML application
   - Upload SP metadata or configure manually:
     - ACS URL: `https://api.gitwithintent.dev/v1/sso/saml/acs`
     - Entity ID: `https://gitwithintent.dev/sp`
   - Configure attribute mapping:
     - email → user.email
     - name → user.displayName
     - groups → user.groups (optional)
   - Download IdP metadata

5. **Back in GWI Dashboard**:
   - Upload IdP metadata (or enter manually)
   - Configure certificate validation
   - Save

6. **Test SAML SSO**: Same as OIDC test flow

### 3.4 SCIM Provisioning Setup

1. **In GWI Dashboard** → Settings → Identity → SCIM
2. Enable SCIM provisioning
3. Generate SCIM token (copy immediately - shown once)
4. Note SCIM base URL: `https://api.gitwithintent.dev/v1/scim/v2`

5. **In Your IdP**:
   - Configure SCIM provisioning
   - Enter base URL and token
   - Enable user provisioning
   - Enable group provisioning (optional)
   - Configure attribute mapping

6. **Test SCIM**:
   - Assign a test user in IdP
   - Verify user appears in GWI within 5 minutes
   - Test deprovisioning (remove user from IdP group)
   - Verify user is deactivated in GWI

## 4. Playbook: Policy Configuration

### 4.1 Default Policies

GWI ships with sensible defaults:

| Policy | Default | Description |
|--------|---------|-------------|
| Auto-merge | Disabled | Require explicit approval |
| Risk threshold | Medium | Block high-risk auto-actions |
| Branch protection | Respect | Honor GitHub branch protection |
| Human review | Required | Always require human approval |

### 4.2 Configuring Policies

1. **In GWI Dashboard** → Settings → Policies
2. For each policy:
   - Review current value
   - Adjust based on your risk tolerance
   - Test in a non-production repo first

### 4.3 Recommended Enterprise Settings

```yaml
# Conservative enterprise settings
auto_merge: false
risk_threshold: low  # Only allow low-risk auto-actions
human_review: always
approval_required: 2  # Two approvals for merges
allowed_file_patterns:
  - "*.md"
  - "*.json"
  - "!package-lock.json"
blocked_operations:
  - "delete_branch"
  - "force_push"
```

## 5. Playbook: First Successful Run

### 5.1 Create Test Issue

1. Go to connected repository
2. Create new issue with title: "Test: Add README section"
3. Body:
   ```
   Add a "Getting Started" section to the README.md file.

   Include:
   - Installation instructions
   - Quick start example
   ```
4. Add label: `gwi:autopilot`

### 5.2 Monitor Run Progress

1. Open GWI dashboard
2. Navigate to Runs
3. Watch progress:
   - Triage (analyzing issue)
   - Planning (generating changes)
   - Executing (applying changes)
   - Review (creating PR)

### 5.3 Review Results

1. Check created PR
2. Review generated changes
3. Check evidence bundle (linked in PR)
4. Approve or request changes

### 5.4 Success Criteria

- [ ] Run completed without errors
- [ ] PR created with relevant changes
- [ ] Evidence bundle attached
- [ ] Changes match issue intent

## 6. Troubleshooting

### 6.1 Installation Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Org not created | Webhook failed | Check GitHub App webhooks |
| No repos visible | Permission issue | Re-install app with correct perms |
| Webhook errors | Firewall | Allow GitHub webhook IPs |

### 6.2 SSO Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Login fails | Config mismatch | Verify callback URLs match |
| User not provisioned | SCIM disabled | Enable SCIM or manual invite |
| Wrong role assigned | Mapping error | Check role mapping rules |

### 6.3 Run Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Run stuck | Rate limit | Wait or upgrade plan |
| No PR created | Policy block | Check policy settings |
| Wrong changes | Ambiguous issue | Add more detail to issue |

## 7. Support

- **Documentation**: [docs.gitwithintent.dev](https://docs.gitwithintent.dev)
- **Support Email**: support@gitwithintent.dev
- **Status Page**: [status.gitwithintent.dev](https://status.gitwithintent.dev)

## 8. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Initial onboarding playbook |
