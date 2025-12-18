# Welcome Email Templates

> **Document**: 117-DR-TPLT-welcome-email-templates.md
> **Created**: 2025-12-18 03:30 CST
> **Phase**: 33 (Post-GA Ops & Customer Onboarding)
> **Status**: Living document

## 1. Overview

Email templates for customer onboarding and engagement.

## 2. Welcome Email

### 2.1 Subject Line
```
Welcome to Git With Intent! Here's how to get started
```

### 2.2 Body Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Git With Intent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { width: 120px; }
    h1 { color: #1a1a1a; font-size: 24px; }
    .cta { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .step { padding: 15px; margin: 10px 0; background: #f8f9fa; border-radius: 8px; }
    .step-number { display: inline-block; width: 24px; height: 24px; background: #2563eb; color: white; text-align: center; border-radius: 50%; margin-right: 10px; font-size: 14px; line-height: 24px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <img src="https://gitwithintent.dev/logo.png" alt="Git With Intent" class="logo">
    <h1>Welcome to Git With Intent!</h1>
  </div>

  <p>Hi {{user.displayName}},</p>

  <p>Thank you for signing up for Git With Intent! We're excited to help you automate your PR workflows with AI.</p>

  <p>Your workspace <strong>{{tenant.displayName}}</strong> is ready. Here's how to get started:</p>

  <div class="step">
    <span class="step-number">1</span>
    <strong>Install the GitHub App</strong>
    <p>Connect Git With Intent to your GitHub organization.</p>
    <a href="{{installUrl}}" class="cta">Install GitHub App</a>
  </div>

  <div class="step">
    <span class="step-number">2</span>
    <strong>Connect Your First Repository</strong>
    <p>Select the repositories you want to automate.</p>
  </div>

  <div class="step">
    <span class="step-number">3</span>
    <strong>Create Your First Issue</strong>
    <p>Create a GitHub issue with the <code>gwi:autopilot</code> label and watch the magic happen!</p>
  </div>

  <p style="text-align: center;">
    <a href="{{dashboardUrl}}" class="cta">Go to Dashboard</a>
  </p>

  <p>Need help? Check out our <a href="https://docs.gitwithintent.dev">documentation</a> or reply to this email.</p>

  <div class="footer">
    <p>Happy coding!</p>
    <p>The Git With Intent Team</p>
    <p style="font-size: 12px; color: #999;">
      You received this email because you signed up for Git With Intent.<br>
      <a href="{{unsubscribeUrl}}">Unsubscribe</a> from marketing emails.
    </p>
  </div>
</body>
</html>
```

### 2.3 Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{user.displayName}}` | User's display name | John |
| `{{user.email}}` | User's email | john@example.com |
| `{{tenant.displayName}}` | Workspace name | Acme Corp |
| `{{tenant.id}}` | Tenant ID | tenant-abc123 |
| `{{installUrl}}` | GitHub App install URL | https://github.com/apps/git-with-intent |
| `{{dashboardUrl}}` | Dashboard URL | https://app.gitwithintent.dev/dashboard?tenant=... |
| `{{unsubscribeUrl}}` | Unsubscribe link | https://app.gitwithintent.dev/unsubscribe?token=... |

## 3. Onboarding Complete Email

### 3.1 Subject Line
```
🎉 You're all set up! Your first run is ready
```

### 3.2 Body Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Onboarding Complete</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    h1 { color: #1a1a1a; font-size: 24px; }
    .success-badge { display: inline-block; background: #10b981; color: white; padding: 8px 16px; border-radius: 20px; font-size: 14px; }
    .cta { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .tip { padding: 15px; margin: 15px 0; background: #f0f9ff; border-left: 4px solid #2563eb; border-radius: 4px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <span class="success-badge">✓ Onboarding Complete</span>
    <h1>You're all set up!</h1>
  </div>

  <p>Hi {{user.displayName}},</p>

  <p>Great news! Your Git With Intent setup is complete. You've connected <strong>{{repoCount}} repositories</strong> and you're ready to start automating.</p>

  <div class="tip">
    <strong>Pro tip:</strong> Try creating an issue with a clear description of what you want to change. The more specific you are, the better the results!
  </div>

  <h3>What's Next?</h3>
  <ul>
    <li><a href="{{dashboardUrl}}">View your dashboard</a> to monitor runs</li>
    <li><a href="https://docs.gitwithintent.dev/best-practices">Read best practices</a> for writing effective issues</li>
    <li><a href="{{settingsUrl}}">Configure policies</a> to match your workflow</li>
  </ul>

  <p style="text-align: center;">
    <a href="{{dashboardUrl}}" class="cta">Go to Dashboard</a>
  </p>

  <div class="footer">
    <p>Happy automating!</p>
    <p>The Git With Intent Team</p>
  </div>
</body>
</html>
```

## 4. First Run Complete Email

### 4.1 Subject Line
```
Your first PR is ready for review! 🚀
```

### 4.2 Body Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>First Run Complete</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; font-size: 24px; }
    .pr-card { padding: 20px; margin: 20px 0; background: #f8f9fa; border-radius: 8px; border: 1px solid #e5e7eb; }
    .pr-title { font-size: 18px; font-weight: 600; color: #1a1a1a; }
    .pr-meta { font-size: 14px; color: #6b7280; margin-top: 8px; }
    .cta { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 5px; }
    .cta-secondary { background: #f3f4f6; color: #374151; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <h1>Your first PR is ready! 🎉</h1>

  <p>Hi {{user.displayName}},</p>

  <p>Git With Intent has completed your first automated run. A pull request is ready for your review:</p>

  <div class="pr-card">
    <div class="pr-title">{{pr.title}}</div>
    <div class="pr-meta">
      {{repo.fullName}} • {{pr.additions}} additions, {{pr.deletions}} deletions
    </div>
  </div>

  <p style="text-align: center;">
    <a href="{{pr.url}}" class="cta">Review PR on GitHub</a>
    <a href="{{runUrl}}" class="cta cta-secondary">View Run Details</a>
  </p>

  <p>This PR includes:</p>
  <ul>
    {{#each pr.files}}
    <li>{{this.filename}} ({{this.status}})</li>
    {{/each}}
  </ul>

  <div class="footer">
    <p>Questions? Reply to this email or check our <a href="https://docs.gitwithintent.dev">documentation</a>.</p>
    <p>The Git With Intent Team</p>
  </div>
</body>
</html>
```

## 5. Getting Started Guide Email

### 5.1 Subject Line
```
📖 Your getting started guide for Git With Intent
```

### 5.2 Body Template

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Getting Started Guide</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    h1 { color: #1a1a1a; font-size: 24px; }
    h2 { color: #374151; font-size: 18px; margin-top: 30px; }
    .code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
    .example { padding: 15px; margin: 15px 0; background: #f8f9fa; border-radius: 8px; }
    .example-title { font-weight: 600; margin-bottom: 10px; }
    .cta { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666; }
  </style>
</head>
<body>
  <h1>Getting Started with Git With Intent</h1>

  <p>Hi {{user.displayName}},</p>

  <p>Here's everything you need to know to get the most out of Git With Intent.</p>

  <h2>How It Works</h2>
  <ol>
    <li>Create a GitHub issue describing what you want to change</li>
    <li>Add the <span class="code">gwi:autopilot</span> label</li>
    <li>Git With Intent analyzes your codebase and creates a PR</li>
    <li>Review and merge!</li>
  </ol>

  <h2>Writing Great Issues</h2>
  <p>The key to great results is clear, specific issues:</p>

  <div class="example">
    <div class="example-title">✅ Good Example</div>
    <p><strong>Title:</strong> Add email validation to signup form</p>
    <p><strong>Body:</strong> Add client-side email validation to the signup form in src/components/SignupForm.tsx. Should validate format and show an error message below the input field if invalid.</p>
  </div>

  <div class="example">
    <div class="example-title">❌ Avoid</div>
    <p><strong>Title:</strong> Fix signup</p>
    <p><strong>Body:</strong> The signup is broken, please fix.</p>
  </div>

  <h2>Labels</h2>
  <ul>
    <li><span class="code">gwi:autopilot</span> - Full automation (triage → PR)</li>
    <li><span class="code">gwi:triage</span> - Just analyze, don't create PR</li>
    <li><span class="code">gwi:review</span> - Review an existing PR</li>
  </ul>

  <h2>Need Help?</h2>
  <ul>
    <li><a href="https://docs.gitwithintent.dev">Documentation</a></li>
    <li><a href="https://docs.gitwithintent.dev/faq">FAQ</a></li>
    <li>Email: support@gitwithintent.dev</li>
  </ul>

  <p style="text-align: center;">
    <a href="{{dashboardUrl}}" class="cta">Go to Dashboard</a>
  </p>

  <div class="footer">
    <p>Happy coding!</p>
    <p>The Git With Intent Team</p>
  </div>
</body>
</html>
```

## 6. Email Trigger Conditions

| Email | Trigger | Delay |
|-------|---------|-------|
| Welcome | User signup + workspace creation | Immediate |
| Onboarding Complete | All required steps completed | Immediate |
| First Run Complete | First successful run with PR | Immediate |
| Getting Started Guide | Welcome email sent | 24 hours |

## 7. Implementation Notes

- Use a transactional email service (SendGrid, Postmark, etc.)
- Track email opens and clicks for engagement metrics
- Include unsubscribe links for marketing emails
- Welcome and transactional emails don't require unsubscribe

## 8. Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2025-12-18 | Claude Code | Initial email templates |
