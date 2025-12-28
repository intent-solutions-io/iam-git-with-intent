import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { ISecretManager } from './ISecretManager.js';

/**
 * GCP Secret Manager implementation
 */
export class GCPSecretManager implements ISecretManager {
  private client: SecretManagerServiceClient;

  constructor(private readonly projectId: string) {
    this.client = new SecretManagerServiceClient();
  }

  async getSecret(tenantId: string, key: string): Promise<string> {
    const name = this.getSecretName(tenantId, key);

    try {
      const [version] = await this.client.accessSecretVersion({
        name: `${name}/versions/latest`
      });

      const payload = version.payload?.data;
      if (!payload) {
        throw new Error(`Secret ${name} has no payload`);
      }

      return payload.toString();
    } catch (error) {
      throw new Error(
        `Failed to get secret ${key} for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async setSecret(tenantId: string, key: string, value: string): Promise<void> {
    const name = this.getSecretName(tenantId, key);
    const secretId = this.getSecretId(tenantId, key);

    try {
      // Try to create secret if doesn't exist
      try {
        await this.client.createSecret({
          parent: `projects/${this.projectId}`,
          secretId,
          secret: {
            replication: {
              automatic: {}
            },
            labels: {
              tenant_id: this.sanitizeLabelValue(tenantId),
              managed_by: 'gwi-connectors'
            }
          }
        });
      } catch (error) {
        // Ignore "already exists" errors
        if (error instanceof Error && !error.message.includes('already exists')) {
          throw error;
        }
      }

      // Add secret version
      await this.client.addSecretVersion({
        parent: name,
        payload: {
          data: Buffer.from(value, 'utf-8')
        }
      });
    } catch (error) {
      throw new Error(
        `Failed to set secret ${key} for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async deleteSecret(tenantId: string, key: string): Promise<void> {
    const name = this.getSecretName(tenantId, key);

    try {
      await this.client.deleteSecret({ name });
    } catch (error) {
      throw new Error(
        `Failed to delete secret ${key} for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async listSecrets(tenantId: string): Promise<string[]> {
    try {
      const [secrets] = await this.client.listSecrets({
        parent: `projects/${this.projectId}`,
        filter: `labels.tenant_id="${this.sanitizeLabelValue(tenantId)}"`
      });

      return secrets.map(s => {
        const secretName = s.name || '';
        const parts = secretName.split('/');
        return parts[parts.length - 1];
      });
    } catch (error) {
      throw new Error(
        `Failed to list secrets for tenant ${tenantId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Generate secret ID from tenant and key
   */
  private getSecretId(tenantId: string, key: string): string {
    // Secret IDs must be lowercase alphanumeric plus hyphens
    return `gwi-${tenantId}-${key}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  /**
   * Get full secret name (resource path)
   */
  private getSecretName(tenantId: string, key: string): string {
    return `projects/${this.projectId}/secrets/${this.getSecretId(tenantId, key)}`;
  }

  /**
   * Sanitize label value (lowercase alphanumeric plus hyphens/underscores)
   */
  private sanitizeLabelValue(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  }
}
