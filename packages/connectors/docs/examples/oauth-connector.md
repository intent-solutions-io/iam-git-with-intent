# Example: OAuth 2.0 Connector

This example demonstrates how to build a connector with OAuth 2.0 authentication, including token refresh and scope management.

## Overview

We'll build a connector for Google Calendar that:
- Uses OAuth 2.0 for authentication
- Automatically refreshes expired tokens
- Syncs calendar events with pagination
- Handles Google-specific API patterns

## Complete Implementation

```typescript
// google-calendar-connector.ts
import {
  BaseConnector,
  IConnector,
  ConnectorConfig,
  AuthResult,
  HealthStatus,
  HealthCheck,
  SyncOptions,
  ConnectorRecord,
  WebhookEvent,
  WebhookResult,
  ConnectorMetadata,
  OAuth2Auth,
  AuthenticationError
} from '@gwi/connectors';
import { z } from 'zod';

// Configuration Schema
const GoogleCalendarConfigSchema = z.object({
  tenantId: z.string().min(1),
  auth: z.object({
    type: z.literal('oauth2'),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    redirectUri: z.string().url(),
    refreshToken: z.string().optional(),
    accessToken: z.string().optional(),
    expiresAt: z.string().datetime().optional()
  }),
  calendarIds: z.array(z.string()).optional(),
  syncDaysBack: z.number().default(30),
  syncDaysForward: z.number().default(90)
});

type GoogleCalendarConfig = z.infer<typeof GoogleCalendarConfigSchema>;

// Google Calendar API types
interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string; responseStatus: string }>;
  organizer?: { email: string; displayName?: string };
  location?: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  created: string;
  updated: string;
  htmlLink: string;
}

interface GoogleCalendarListResponse {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

interface GoogleCalendarList {
  items: Array<{ id: string; summary: string; primary?: boolean }>;
}

export class GoogleCalendarConnector extends BaseConnector implements IConnector {
  readonly name = 'google-calendar';
  readonly version = '1.0.0';
  readonly configSchema = GoogleCalendarConfigSchema;

  private auth!: OAuth2Auth;
  private config!: GoogleCalendarConfig;
  private baseUrl = 'https://www.googleapis.com/calendar/v3';

  // ============================================================
  // AUTHENTICATION (OAuth 2.0)
  // ============================================================

  async authenticate(config: ConnectorConfig): Promise<AuthResult> {
    // Validate configuration
    const validated = this.configSchema.parse(config) as GoogleCalendarConfig;
    this.config = validated;

    // Check for OAuth2 auth type
    if (validated.auth.type !== 'oauth2') {
      return {
        success: false,
        error: 'Google Calendar requires OAuth2 authentication'
      };
    }

    // Initialize OAuth2 auth strategy
    this.auth = new OAuth2Auth({
      clientId: validated.auth.clientId,
      clientSecret: validated.auth.clientSecret,
      redirectUri: validated.auth.redirectUri,
      tokenUrl: 'https://oauth2.googleapis.com/token',
      accessToken: validated.auth.accessToken,
      refreshToken: validated.auth.refreshToken,
      expiresAt: validated.auth.expiresAt,
      scopes: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly'
      ]
    });

    try {
      // Refresh token if needed
      await this.auth.refreshIfNeeded();

      // Test connection
      const response = await this.httpClient.get(
        `${this.baseUrl}/users/me/calendarList`,
        { headers: await this.getAuthHeaders() }
      );

      const calendars = response.data as GoogleCalendarList;

      this.log('info', 'Authentication successful', {
        calendarCount: calendars.items.length
      });

      return {
        success: true,
        token: await this.auth.getAccessToken(),
        expiresAt: this.auth.getExpiresAt(),
        refreshToken: this.auth.getRefreshToken(),
        metadata: {
          calendars: calendars.items.map(c => ({
            id: c.id,
            name: c.summary,
            primary: c.primary
          }))
        }
      };
    } catch (error: any) {
      if (error.statusCode === 401) {
        return {
          success: false,
          error: 'Invalid or expired OAuth credentials. Please re-authorize.'
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    // Refresh token if expired
    await this.auth.refreshIfNeeded();

    return this.auth.getHeaders();
  }

  // ============================================================
  // HEALTH CHECK
  // ============================================================

  async healthCheck(): Promise<HealthStatus> {
    const checks: HealthCheck[] = [];

    // Check 1: Token validity
    checks.push(await this.checkTokenValidity());

    // Check 2: API reachability
    checks.push(await this.checkAPIReachability());

    // Check 3: Calendar access
    checks.push(await this.checkCalendarAccess());

    const healthy = checks.every(c => c.status !== 'fail');

    return {
      healthy,
      timestamp: new Date().toISOString(),
      connector: this.name,
      checks,
      error: healthy ? undefined : 'One or more health checks failed'
    };
  }

  private async checkTokenValidity(): Promise<HealthCheck> {
    const start = Date.now();

    if (this.auth.isExpired()) {
      try {
        await this.auth.refreshIfNeeded();
        return {
          name: 'token_valid',
          status: 'pass',
          durationMs: Date.now() - start,
          metadata: { refreshed: true }
        };
      } catch (error: any) {
        return {
          name: 'token_valid',
          status: 'fail',
          durationMs: Date.now() - start,
          error: 'Failed to refresh token: ' + error.message
        };
      }
    }

    return {
      name: 'token_valid',
      status: 'pass',
      durationMs: Date.now() - start
    };
  }

  private async checkAPIReachability(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await this.httpClient.get(
        `${this.baseUrl}/users/me/calendarList`,
        {
          headers: await this.getAuthHeaders(),
          timeout: 5000
        }
      );

      return {
        name: 'api_reachable',
        status: 'pass',
        durationMs: Date.now() - start
      };
    } catch (error: any) {
      return {
        name: 'api_reachable',
        status: 'fail',
        durationMs: Date.now() - start,
        error: error.message
      };
    }
  }

  private async checkCalendarAccess(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      // Try to access primary calendar
      await this.httpClient.get(
        `${this.baseUrl}/calendars/primary`,
        { headers: await this.getAuthHeaders() }
      );

      return {
        name: 'calendar_access',
        status: 'pass',
        durationMs: Date.now() - start
      };
    } catch (error: any) {
      if (error.statusCode === 403) {
        return {
          name: 'calendar_access',
          status: 'fail',
          durationMs: Date.now() - start,
          error: 'Insufficient permissions. Grant calendar.readonly scope.'
        };
      }

      return {
        name: 'calendar_access',
        status: 'fail',
        durationMs: Date.now() - start,
        error: error.message
      };
    }
  }

  // ============================================================
  // SYNC
  // ============================================================

  async *sync(options: SyncOptions): AsyncIterator<ConnectorRecord> {
    this.log('info', 'Starting Google Calendar sync', { options });

    await this.onBeforeSync(options);

    const startTime = Date.now();
    let totalRecords = 0;

    try {
      // Determine calendars to sync
      const calendarIds = this.config.calendarIds || await this.getPrimaryCalendarId();

      // Calculate time range
      const timeMin = options.incremental?.startCursor ||
        this.getTimeMin(this.config.syncDaysBack);
      const timeMax = this.getTimeMax(this.config.syncDaysForward);

      // Sync each calendar
      for (const calendarId of calendarIds) {
        this.log('info', 'Syncing calendar', { calendarId });

        for await (const record of this.syncCalendarEvents(calendarId, timeMin, timeMax)) {
          totalRecords++;
          yield record;

          if (options.limit && totalRecords >= options.limit) {
            return;
          }
        }
      }

      await this.onAfterSync({
        recordsProcessed: totalRecords,
        durationMs: Date.now() - startTime,
        cursor: new Date().toISOString()
      });

    } catch (error: any) {
      await this.onError(error, { options });
      throw error;
    }
  }

  private async *syncCalendarEvents(
    calendarId: string,
    timeMin: string,
    timeMax: string
  ): AsyncIterator<ConnectorRecord> {
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
      pageCount++;

      const response = await this.retryRequest(async () => {
        return await this.fetchEventsPage(calendarId, timeMin, timeMax, pageToken);
      });

      for (const event of response.items) {
        yield this.transformEvent(event, calendarId);
      }

      pageToken = response.nextPageToken;

      this.log('debug', 'Fetched events page', {
        calendarId,
        pageCount,
        eventsCount: response.items.length,
        hasMore: !!pageToken
      });

    } while (pageToken);
  }

  private async fetchEventsPage(
    calendarId: string,
    timeMin: string,
    timeMax: string,
    pageToken?: string
  ): Promise<GoogleCalendarListResponse> {
    const params: Record<string, string> = {
      timeMin,
      timeMax,
      maxResults: '250',
      singleEvents: 'true',
      orderBy: 'startTime'
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const response = await this.httpClient.get<GoogleCalendarListResponse>(
      `${this.baseUrl}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        headers: await this.getAuthHeaders(),
        params
      }
    );

    return response.data;
  }

  private async getPrimaryCalendarId(): Promise<string[]> {
    const response = await this.httpClient.get<GoogleCalendarList>(
      `${this.baseUrl}/users/me/calendarList`,
      { headers: await this.getAuthHeaders() }
    );

    const primary = response.data.items.find(c => c.primary);
    return primary ? [primary.id] : ['primary'];
  }

  private transformEvent(event: GoogleCalendarEvent, calendarId: string): ConnectorRecord {
    return {
      id: `event-${event.id}`,
      type: 'calendar_event',
      source: this.name,
      createdAt: event.created,
      updatedAt: event.updated,
      data: {
        eventId: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start.dateTime || event.start.date,
        end: event.end.dateTime || event.end.date,
        isAllDay: !event.start.dateTime,
        location: event.location,
        status: event.status,
        organizer: event.organizer,
        attendees: event.attendees?.map(a => ({
          email: a.email,
          status: a.responseStatus
        })),
        calendarId
      },
      metadata: {
        url: event.htmlLink,
        syncedAt: new Date().toISOString()
      }
    };
  }

  private getTimeMin(daysBack: number): string {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    return date.toISOString();
  }

  private getTimeMax(daysForward: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysForward);
    return date.toISOString();
  }

  // ============================================================
  // WEBHOOKS (Push Notifications)
  // ============================================================

  async processWebhook(event: WebhookEvent): Promise<WebhookResult> {
    const startTime = Date.now();

    // Google Calendar uses push notifications
    // Headers include: X-Goog-Channel-ID, X-Goog-Resource-ID

    const channelId = event.headers['x-goog-channel-id'];
    const resourceState = event.headers['x-goog-resource-state'];

    this.log('info', 'Processing calendar push notification', {
      channelId,
      resourceState
    });

    if (resourceState === 'sync') {
      // Initial sync notification - just acknowledge
      return {
        success: true,
        durationMs: Date.now() - startTime,
        recordsProcessed: 0,
        metadata: { type: 'sync' }
      };
    }

    if (resourceState === 'exists' || resourceState === 'update') {
      // Calendar changed - fetch updated events
      const calendarId = event.payload.calendarId || 'primary';

      try {
        const records = [];
        const since = new Date(Date.now() - 60000).toISOString(); // Last minute

        for await (const record of this.syncCalendarEvents(
          calendarId,
          since,
          this.getTimeMax(90)
        )) {
          records.push(record);
        }

        await this.storage.saveRecords(records);

        return {
          success: true,
          durationMs: Date.now() - startTime,
          recordsProcessed: records.length
        };
      } catch (error: any) {
        return {
          success: false,
          durationMs: Date.now() - startTime,
          error: error.message
        };
      }
    }

    return {
      success: true,
      durationMs: Date.now() - startTime,
      recordsProcessed: 0
    };
  }

  // ============================================================
  // METADATA
  // ============================================================

  getMetadata(): ConnectorMetadata {
    return {
      name: this.name,
      version: this.version,
      recordTypes: ['calendar_event'],
      authMethods: ['oauth2'],
      supportsIncremental: true,
      supportsWebhooks: true,
      rateLimits: {
        requestsPerSecond: 10,
        requestsPerHour: 100000
      },
      capabilities: [
        'sync',
        'webhooks',
        'incremental',
        'pagination',
        'oauth2'
      ],
      documentationUrl: 'https://developers.google.com/calendar/api'
    };
  }
}
```

## OAuth 2.0 Flow

### Initial Authorization

```typescript
import { OAuth2Auth } from '@gwi/connectors';

// Generate authorization URL
const auth = new OAuth2Auth({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: 'https://app.example.com/oauth/callback',
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly'
  ]
});

// Step 1: Redirect user to authorization URL
const authUrl = auth.getAuthorizationUrl({
  state: 'random-state-string',
  access_type: 'offline',  // Required for refresh token
  prompt: 'consent'
});

console.log('Redirect user to:', authUrl);

// Step 2: Handle callback (in your OAuth callback route)
app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  // Verify state matches
  if (state !== expectedState) {
    return res.status(400).send('Invalid state');
  }

  // Exchange code for tokens
  const tokens = await auth.exchangeCode(code as string);

  // Store tokens securely
  await secretManager.storeSecret(
    `google-calendar-tokens-${tenantId}`,
    JSON.stringify(tokens)
  );

  res.redirect('/dashboard');
});
```

### Token Refresh

The `OAuth2Auth` class handles token refresh automatically:

```typescript
class OAuth2Auth {
  async refreshIfNeeded(): Promise<void> {
    if (!this.isExpired()) {
      return;  // Token still valid
    }

    if (!this.refreshToken) {
      throw new AuthenticationError(
        'Token expired and no refresh token available',
        'oauth2'
      );
    }

    // Refresh the token
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      })
    });

    const data = await response.json();

    this.accessToken = data.access_token;
    this.expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

    // Some providers rotate refresh tokens
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token;
    }
  }

  isExpired(): boolean {
    if (!this.expiresAt) return true;

    // Consider expired 5 minutes before actual expiry
    const expiryTime = new Date(this.expiresAt).getTime();
    const buffer = 5 * 60 * 1000;  // 5 minutes

    return Date.now() > (expiryTime - buffer);
  }
}
```

## Usage

### Configure Connector

```typescript
import { ConnectorRegistry } from '@gwi/connectors';
import { GoogleCalendarConnector } from './google-calendar-connector';

const registry = new ConnectorRegistry();
registry.register('google-calendar', (config) => new GoogleCalendarConnector());

// Get connector with OAuth tokens
const connector = await registry.get('google-calendar', {
  tenantId: 'my-org',
  config: {
    tenantId: 'my-org',
    auth: {
      type: 'oauth2',
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: 'https://app.example.com/oauth/callback',
      refreshToken: storedRefreshToken,
      accessToken: storedAccessToken,
      expiresAt: storedExpiresAt
    },
    syncDaysBack: 7,
    syncDaysForward: 30
  }
});
```

### Sync Events

```typescript
// Sync all events
for await (const record of connector.sync({})) {
  console.log(`Event: ${record.data.summary}`);
  console.log(`  Start: ${record.data.start}`);
  console.log(`  Location: ${record.data.location || 'N/A'}`);
}
```

### Incremental Sync

```typescript
// Sync only events updated since last sync
for await (const record of connector.sync({
  incremental: {
    cursorField: 'updated',
    startCursor: lastSyncTime
  }
})) {
  console.log(`Updated event: ${record.data.summary}`);
}
```

## Key Patterns

1. **OAuth 2.0 Flow:** Complete authorization code exchange
2. **Automatic Token Refresh:** Transparently refresh expired tokens
3. **Scope Management:** Request minimal necessary permissions
4. **Page Token Pagination:** Google's pagination pattern
5. **Push Notifications:** Handle Google's webhook format

---

**Next Example:** [GraphQL Connector](./graphql-connector.md)
