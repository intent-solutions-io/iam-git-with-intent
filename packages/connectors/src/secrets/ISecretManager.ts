/**
 * Interface for secret management
 */
export interface ISecretManager {
  /**
   * Get secret value
   *
   * @param tenantId - Tenant identifier
   * @param key - Secret key
   * @returns Secret value
   * @throws {Error} If secret not found or access denied
   */
  getSecret(tenantId: string, key: string): Promise<string>;

  /**
   * Set secret value
   *
   * @param tenantId - Tenant identifier
   * @param key - Secret key
   * @param value - Secret value
   * @throws {Error} If operation fails
   */
  setSecret(tenantId: string, key: string, value: string): Promise<void>;

  /**
   * Delete secret
   *
   * @param tenantId - Tenant identifier
   * @param key - Secret key
   * @throws {Error} If operation fails
   */
  deleteSecret(tenantId: string, key: string): Promise<void>;

  /**
   * List secrets for tenant
   *
   * @param tenantId - Tenant identifier
   * @returns List of secret keys
   */
  listSecrets(tenantId: string): Promise<string[]>;
}
