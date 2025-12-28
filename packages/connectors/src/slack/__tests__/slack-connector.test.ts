import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlackConnector } from '../slack-connector.js';
import { SLACK_CONNECTOR_METADATA } from '../types.js';
import type { SyncOptions, WebhookEvent } from '../../interfaces/types.js';
import { ConsoleLogger, NoOpMetrics } from '../../core/base-connector.js';

// Mock axios
const mockPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mockPost
    }))
  }
}));

describe('SlackConnector', () => {
  let connector: SlackConnector;
  let logger: ConsoleLogger;
  let metrics: NoOpMetrics;

  beforeEach(() => {
    logger = new ConsoleLogger({ test: true });
    metrics = new NoOpMetrics();
    connector = new SlackConnector(logger, metrics);

    // Reset mocks
    mockPost.mockReset();

    // Setup default mock responses
    mockPost.mockImplementation((endpoint: string, data?: any) => {
      // auth.test - authentication
      if (endpoint === '/auth.test') {
        return Promise.resolve({
          data: {
            ok: true,
            data: {
              url: 'https://test.slack.com/',
              team: 'Test Team',
              user: 'test_bot',
              team_id: 'T123456',
              user_id: 'U123456',
              bot_id: 'B123456'
            }
          }
        });
      }

      // api.test - health check
      if (endpoint === '/api.test') {
        return Promise.resolve({
          data: { ok: true }
        });
      }

      // users.info - user details
      if (endpoint === '/users.info') {
        return Promise.resolve({
          data: {
            ok: true,
            data: {
              user: {
                id: data.user || 'U123456',
                teamId: 'T123456',
                name: 'test_bot',
                deleted: false,
                realName: 'Test Bot',
                profile: {
                  email: 'bot@test.slack.com',
                  displayName: 'Test Bot',
                  realName: 'Test Bot'
                },
                isBot: true,
                updated: 1234567890
              }
            }
          }
        });
      }

      // conversations.info - channel details
      if (endpoint === '/conversations.info') {
        return Promise.resolve({
          data: {
            ok: true,
            data: {
              channel: {
                id: data.channel || 'C123456',
                name: 'test-channel',
                isChannel: true,
                isGroup: false,
                isIm: false,
                isMpim: false,
                isPrivate: false,
                created: 1234567890,
                isArchived: false,
                isGeneral: false,
                unlinked: 0,
                nameNormalized: 'test-channel',
                isShared: false,
                isOrgShared: false,
                isPendingExtShared: false,
                isExtShared: false,
                creator: 'U123456',
                topic: {
                  value: 'Test topic',
                  creator: 'U123456',
                  lastSet: 1234567890
                },
                purpose: {
                  value: 'Test purpose',
                  creator: 'U123456',
                  lastSet: 1234567890
                },
                numMembers: 5
              }
            }
          }
        });
      }

      // conversations.list - list channels
      if (endpoint === '/conversations.list') {
        return Promise.resolve({
          data: {
            ok: true,
            channels: [
              {
                id: 'C123456',
                name: 'general',
                isChannel: true,
                isGroup: false,
                isIm: false,
                isMpim: false,
                isPrivate: false,
                created: 1234567890,
                isArchived: false,
                isGeneral: true,
                unlinked: 0,
                nameNormalized: 'general',
                isShared: false,
                isOrgShared: false,
                isPendingExtShared: false,
                isExtShared: false
              }
            ],
            response_metadata: {}
          }
        });
      }

      // users.list - list users
      if (endpoint === '/users.list') {
        return Promise.resolve({
          data: {
            ok: true,
            members: [
              {
                id: 'U123456',
                teamId: 'T123456',
                name: 'test_user',
                deleted: false,
                realName: 'Test User',
                profile: {
                  email: 'test@example.com',
                  displayName: 'Test User',
                  realName: 'Test User'
                },
                updated: 1234567890
              }
            ],
            response_metadata: {}
          }
        });
      }

      // conversations.history - message history
      if (endpoint === '/conversations.history') {
        return Promise.resolve({
          data: {
            ok: true,
            messages: [
              {
                type: 'message',
                user: 'U123456',
                text: 'Test message',
                ts: '1234567890.123456'
              }
            ],
            has_more: false,
            response_metadata: {}
          }
        });
      }

      // chat.postMessage - send message
      if (endpoint === '/chat.postMessage') {
        return Promise.resolve({
          data: {
            ok: true,
            channel: data.channel,
            ts: '1234567890.123456',
            message: {
              type: 'message',
              text: data.text,
              user: 'U123456',
              ts: '1234567890.123456'
            }
          }
        });
      }

      // reactions.add - add reaction
      if (endpoint === '/reactions.add') {
        return Promise.resolve({
          data: { ok: true }
        });
      }

      // files.upload - upload file
      if (endpoint === '/files.upload') {
        return Promise.resolve({
          data: {
            ok: true,
            data: {
              file: {
                id: 'F123456',
                permalink: 'https://test.slack.com/files/F123456'
              }
            }
          }
        });
      }

      return Promise.reject(new Error(`Unmocked endpoint: ${endpoint}`));
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('metadata', () => {
    it('should return correct connector name', () => {
      expect(connector.name).toBe('slack');
    });

    it('should return correct version', () => {
      expect(connector.version).toBe('1.0.0');
    });

    it('should return full metadata', () => {
      const metadata = connector.getMetadata();
      expect(metadata.name).toBe('slack');
      expect(metadata.recordTypes).toContain('message');
      expect(metadata.recordTypes).toContain('channel');
      expect(metadata.recordTypes).toContain('user');
      expect(metadata.authMethods).toContain('bearer');
      expect(metadata.authMethods).toContain('oauth2');
      expect(metadata.supportsWebhooks).toBe(true);
      expect(metadata.supportsIncremental).toBe(true);
    });
  });

  describe('authenticate', () => {
    it('should authenticate with bot token', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'xoxb-test123'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.team).toBe('Test Team');
      expect(result.metadata?.user).toBe('test_bot');
      expect(result.metadata?.authType).toBe('bearer');
    });

    it('should authenticate with OAuth', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'oauth2' as const,
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://example.com/callback',
          accessToken: 'xoxb-access-token-123'
        }
      };

      const result = await connector.authenticate(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.authType).toBe('oauth2');
    });

    it('should throw on missing OAuth access token', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'oauth2' as const,
          clientId: 'client-id',
          clientSecret: 'client-secret',
          redirectUri: 'https://example.com/callback'
        }
      };

      await expect(connector.authenticate(config)).rejects.toThrow('OAuth requires accessToken');
    });

    it('should throw on invalid bot token format', async () => {
      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'invalid-token' // Should start with xoxb-
        }
      };

      await expect(connector.authenticate(config)).rejects.toThrow();
    });

    it('should throw on API error', async () => {
      mockPost.mockResolvedValueOnce({
        data: {
          ok: false,
          error: 'invalid_auth'
        }
      });

      const config = {
        tenantId: 'test-tenant',
        auth: {
          type: 'bearer' as const,
          token: 'xoxb-test123'
        }
      };

      await expect(connector.authenticate(config)).rejects.toThrow('invalid_auth');
    });
  });

  describe('healthCheck', () => {
    it('should pass health check when authenticated', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const health = await connector.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.connector).toBe('slack');
      expect(health.checks).toHaveLength(3);
      expect(health.checks.find(c => c.name === 'api_connectivity')?.status).toBe('pass');
      expect(health.checks.find(c => c.name === 'authentication')?.status).toBe('pass');
      expect(health.checks.find(c => c.name === 'bot_info')?.status).toBe('pass');
    });

    it('should fail health check when not authenticated', async () => {
      const health = await connector.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.checks.find(c => c.name === 'api_connectivity')?.status).toBe('fail');
    });
  });

  describe('postMessage', () => {
    it('should post a message to a channel', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const result = await connector.postMessage('C123456', 'Hello, Slack!');

      expect(result.channel).toBe('C123456');
      expect(result.ts).toBeDefined();
      expect(result.message.text).toBe('Hello, Slack!');
    });

    it('should post a threaded message', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const result = await connector.postMessage('C123456', 'Reply', {
        threadTs: '1234567890.123456'
      });

      expect(result.channel).toBe('C123456');
      expect(mockPost).toHaveBeenCalledWith(
        '/chat.postMessage',
        expect.objectContaining({
          thread_ts: '1234567890.123456'
        })
      );
    });

    it('should throw when not authenticated', async () => {
      await expect(connector.postMessage('C123456', 'Hello'))
        .rejects.toThrow('Not authenticated');
    });
  });

  describe('getChannel', () => {
    it('should get channel details', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const channel = await connector.getChannel('C123456');

      expect(channel.id).toBe('C123456');
      expect(channel.name).toBe('test-channel');
      expect(channel.isChannel).toBe(true);
    });
  });

  describe('getUser', () => {
    it('should get user details', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const user = await connector.getUser('U123456');

      expect(user.id).toBeDefined();
      expect(user.name).toBe('test_bot');
      expect(user.isBot).toBe(true);
    });
  });

  describe('addReaction', () => {
    it('should add a reaction to a message', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      await expect(
        connector.addReaction('C123456', '1234567890.123456', 'thumbsup')
      ).resolves.toBeUndefined();
    });

    it('should strip colons from emoji names', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      await connector.addReaction('C123456', '1234567890.123456', ':thumbsup:');

      expect(mockPost).toHaveBeenCalledWith(
        '/reactions.add',
        expect.objectContaining({
          name: 'thumbsup' // Colons removed
        })
      );
    });
  });

  describe('uploadFile', () => {
    it('should upload a file', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const result = await connector.uploadFile(
        ['C123456'],
        Buffer.from('test content'),
        {
          filename: 'test.txt',
          title: 'Test File'
        }
      );

      expect(result.file.id).toBe('F123456');
      expect(result.file.permalink).toBeDefined();
    });
  });

  describe('processWebhook', () => {
    it('should handle URL verification challenge', async () => {
      const event: WebhookEvent = {
        id: 'webhook-123',
        source: 'slack',
        type: 'url_verification',
        timestamp: new Date().toISOString(),
        payload: {
          type: 'url_verification',
          token: 'test-token',
          challenge: 'challenge-string'
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.metadata?.type).toBe('url_verification');
      expect(result.metadata?.challenge).toBe('challenge-string');
    });

    it('should process message event', async () => {
      const event: WebhookEvent = {
        id: 'webhook-456',
        source: 'slack',
        type: 'event_callback',
        timestamp: new Date().toISOString(),
        payload: {
          type: 'event_callback',
          teamId: 'T123456',
          eventId: 'Ev123456',
          event: {
            type: 'message',
            user: 'U123456',
            channel: 'C123456',
            text: 'Hello!',
            ts: '1234567890.123456'
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
      expect(result.metadata?.eventType).toBe('message');
    });

    it('should process reaction_added event', async () => {
      const event: WebhookEvent = {
        id: 'webhook-789',
        source: 'slack',
        type: 'event_callback',
        timestamp: new Date().toISOString(),
        payload: {
          type: 'event_callback',
          teamId: 'T123456',
          event: {
            type: 'reaction_added',
            user: 'U123456',
            reaction: 'thumbsup',
            item: {
              type: 'message',
              channel: 'C123456',
              ts: '1234567890.123456'
            }
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(1);
    });

    it('should handle unknown event types', async () => {
      const event: WebhookEvent = {
        id: 'webhook-999',
        source: 'slack',
        type: 'event_callback',
        timestamp: new Date().toISOString(),
        payload: {
          type: 'event_callback',
          event: {
            type: 'unknown_event'
          }
        },
        signature: 'test-signature',
        headers: {}
      };

      const result = await connector.processWebhook(event);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(0);
    });
  });

  describe('sync', () => {
    it('should throw when not authenticated', async () => {
      const options: SyncOptions = {
        types: ['message']
      };

      const iterator = connector.sync(options);
      await expect(iterator.next()).rejects.toThrow('Not authenticated');
    });

    it('should sync channels', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const options = {
        recordTypes: ['channel']
      };

      const iterator = connector.sync(options);
      const results: any[] = [];

      for await (const record of iterator) {
        results.push(record);
      }

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('channel');
      expect(results[0].source).toBe('slack');
    });

    it('should sync users', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const options = {
        recordTypes: ['user']
      };

      const iterator = connector.sync(options);
      const results: any[] = [];

      for await (const record of iterator) {
        results.push(record);
      }

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('user');
    });

    it('should sync messages from specified channels', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const options = {
        recordTypes: ['message'],
        channels: ['C123456']
      };

      const iterator = connector.sync(options);
      const results: any[] = [];

      for await (const record of iterator) {
        results.push(record);
      }

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].type).toBe('message');
      expect(results[0].data.channel).toBe('C123456');
    });

    it('should skip message sync when no channels specified', async () => {
      await connector.authenticate({
        tenantId: 'test-tenant',
        auth: { type: 'bearer', token: 'xoxb-test123' }
      });

      const options = {
        recordTypes: ['message']
        // No channels specified
      };

      const iterator = connector.sync(options);
      const results: any[] = [];

      for await (const record of iterator) {
        results.push(record);
      }

      expect(results.length).toBe(0);
    });
  });
});

describe('SLACK_CONNECTOR_METADATA', () => {
  it('should have correct structure', () => {
    expect(SLACK_CONNECTOR_METADATA.name).toBe('slack');
    expect(SLACK_CONNECTOR_METADATA.version).toBe('1.0.0');
    expect(SLACK_CONNECTOR_METADATA.displayName).toBe('Slack');
    expect(SLACK_CONNECTOR_METADATA.recordTypes).toContain('message');
    expect(SLACK_CONNECTOR_METADATA.recordTypes).toContain('channel');
    expect(SLACK_CONNECTOR_METADATA.authMethods).toContain('bearer');
    expect(SLACK_CONNECTOR_METADATA.supportsWebhooks).toBe(true);
    expect(SLACK_CONNECTOR_METADATA.rateLimits.requestsPerHour).toBe(3000);
  });
});
