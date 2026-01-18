/**
 * Report Signing Tests
 *
 * Tests for D4.4: Report signing and verification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SignatureAlgorithm,
  SignerIdentity,
  SigningKeyInfo,
  ReportSignature,
  SignedReport,
  SignatureVerificationResult,
  generateSignatureId,
  computeKeyFingerprint,
  computeReportHash,
  canonicalizeReportContent,
  generateSigningKeyPair,
  signReport,
  signReportContent,
  verifyReportSignature,
  verifySignature,
  isSignatureValid,
  ReportSigner,
  createReportSigner,
  createReportSignerWithKey,
  createReportVerifier,
  initializeReportSigner,
  getReportSigner,
  resetReportSigner,
} from '../report-signing.js';
import type { ComplianceReportTemplate } from '../report-templates.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockSigner: SignerIdentity = {
  signerId: 'signer-001',
  name: 'John Doe',
  title: 'Compliance Officer',
  organization: 'Test Corp',
  email: 'john.doe@testcorp.com',
};

const createMockReport = (): ComplianceReportTemplate => ({
  reportId: 'rpt-test-001',
  version: '1.0.0',
  framework: {
    name: 'SOC 2 Type II',
    framework: 'soc2_type2',
    version: '2017',
    description: 'SOC 2 Type II compliance assessment',
    domains: ['Security', 'Availability'],
  },
  tenantId: 'tenant-123',
  title: 'Test SOC 2 Report',
  description: 'Test compliance report',
  scope: 'All production systems',
  period: {
    start: new Date('2024-01-01'),
    end: new Date('2024-01-31'),
    type: 'period',
  },
  summary: {
    totalControls: 5,
    byStatus: {
      compliant: 3,
      partiallyCompliant: 1,
      nonCompliant: 0,
      notApplicable: 0,
      notEvaluated: 1,
      compensating: 0,
    },
    compliancePercentage: 80,
    criticalFindings: 0,
    evidenceCount: 10,
    attestationCount: 2,
  },
  organizationName: 'Test Corp',
  controls: [
    {
      controlId: 'CC6.1',
      title: 'Logical Access Security',
      description: 'Access controls are in place',
      category: 'Security',
      priority: 'high',
      status: 'compliant',
      evidence: [],
      remediation: [],
      attestations: [],
      notes: [],
      tags: [],
    },
  ],
  systemsInScope: ['API', 'Database'],
  exclusions: [],
  createdAt: new Date('2024-02-01'),
  updatedAt: new Date('2024-02-01'),
  createdBy: 'test-user',
});

// =============================================================================
// Schema Validation Tests
// =============================================================================

describe('Report Signing Schemas', () => {
  describe('SignatureAlgorithm', () => {
    it('should accept valid algorithms', () => {
      const algorithms = ['RSA-SHA256', 'RSA-SHA384', 'RSA-SHA512'];
      for (const alg of algorithms) {
        expect(SignatureAlgorithm.safeParse(alg).success).toBe(true);
      }
    });

    it('should reject invalid algorithms', () => {
      expect(SignatureAlgorithm.safeParse('MD5').success).toBe(false);
      expect(SignatureAlgorithm.safeParse('SHA1').success).toBe(false);
    });
  });

  describe('SignerIdentity', () => {
    it('should validate a valid signer', () => {
      const result = SignerIdentity.safeParse(mockSigner);
      expect(result.success).toBe(true);
    });

    it('should require signerId and name', () => {
      expect(SignerIdentity.safeParse({ name: 'Test' }).success).toBe(false);
      expect(SignerIdentity.safeParse({ signerId: 'id' }).success).toBe(false);
    });

    it('should validate email format', () => {
      const validSigner = { ...mockSigner, email: 'valid@email.com' };
      expect(SignerIdentity.safeParse(validSigner).success).toBe(true);

      const invalidSigner = { ...mockSigner, email: 'not-an-email' };
      expect(SignerIdentity.safeParse(invalidSigner).success).toBe(false);
    });
  });

  describe('SigningKeyInfo', () => {
    it('should validate key info', () => {
      const keyInfo: SigningKeyInfo = {
        keyId: 'key-001',
        algorithm: 'RSA-SHA256',
        createdAt: new Date(),
        fingerprint: 'abc123def456',
        signer: mockSigner,
      };
      expect(SigningKeyInfo.safeParse(keyInfo).success).toBe(true);
    });
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('Utility Functions', () => {
  describe('generateSignatureId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateSignatureId();
      const id2 = generateSignatureId();

      expect(id1).toMatch(/^sig-[a-z0-9]+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('computeKeyFingerprint', () => {
    it('should compute consistent fingerprint', () => {
      const key = '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----';
      const fp1 = computeKeyFingerprint(key);
      const fp2 = computeKeyFingerprint(key);

      expect(fp1).toBe(fp2);
      expect(fp1.length).toBe(32);
    });

    it('should produce different fingerprints for different keys', () => {
      const fp1 = computeKeyFingerprint('key1');
      const fp2 = computeKeyFingerprint('key2');

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('computeReportHash', () => {
    it('should compute sha256 hash by default', () => {
      const hash = computeReportHash('test content');
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex chars
    });

    it('should compute sha384 hash', () => {
      const hash = computeReportHash('test content', 'sha384');
      expect(hash.length).toBe(96); // SHA-384 produces 96 hex chars
    });

    it('should compute sha512 hash', () => {
      const hash = computeReportHash('test content', 'sha512');
      expect(hash.length).toBe(128); // SHA-512 produces 128 hex chars
    });

    it('should be deterministic', () => {
      const content = 'test content';
      const hash1 = computeReportHash(content);
      const hash2 = computeReportHash(content);
      expect(hash1).toBe(hash2);
    });
  });

  describe('canonicalizeReportContent', () => {
    it('should produce consistent JSON output', () => {
      const report = createMockReport();
      const content1 = canonicalizeReportContent(report);
      const content2 = canonicalizeReportContent(report);

      expect(content1).toBe(content2);
    });

    it('should produce valid JSON', () => {
      const report = createMockReport();
      const content = canonicalizeReportContent(report);

      expect(() => JSON.parse(content)).not.toThrow();
    });
  });
});

// =============================================================================
// Key Generation Tests
// =============================================================================

describe('Key Generation', () => {
  describe('generateSigningKeyPair', () => {
    it('should generate a valid key pair', () => {
      const keyPair = generateSigningKeyPair(mockSigner);

      expect(keyPair.info.keyId).toBeDefined();
      expect(keyPair.info.algorithm).toBe('RSA-SHA256');
      expect(keyPair.info.fingerprint.length).toBe(32);
      expect(keyPair.info.signer).toEqual(mockSigner);
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
    });

    it('should support different algorithms', () => {
      const keyPair384 = generateSigningKeyPair(mockSigner, { algorithm: 'RSA-SHA384' });
      const keyPair512 = generateSigningKeyPair(mockSigner, { algorithm: 'RSA-SHA512' });

      expect(keyPair384.info.algorithm).toBe('RSA-SHA384');
      expect(keyPair512.info.algorithm).toBe('RSA-SHA512');
    });

    it('should support expiration', () => {
      const keyPair = generateSigningKeyPair(mockSigner, { expiresInDays: 30 });

      expect(keyPair.info.expiresAt).toBeDefined();
      const expectedExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(keyPair.info.expiresAt!.getTime() - expectedExpiry.getTime());
      expect(diff).toBeLessThan(1000); // Within 1 second
    });

    it('should generate unique key pairs', () => {
      const kp1 = generateSigningKeyPair(mockSigner);
      const kp2 = generateSigningKeyPair(mockSigner);

      expect(kp1.info.keyId).not.toBe(kp2.info.keyId);
      expect(kp1.info.fingerprint).not.toBe(kp2.info.fingerprint);
    });
  });
});

// =============================================================================
// Signing Tests
// =============================================================================

describe('Report Signing', () => {
  let keyPair: ReturnType<typeof generateSigningKeyPair>;

  beforeEach(() => {
    keyPair = generateSigningKeyPair(mockSigner);
  });

  describe('signReport', () => {
    it('should sign a report', () => {
      const report = createMockReport();
      const signed = signReport(report, keyPair.privateKey, keyPair.info);

      expect(signed.report).toEqual(report);
      expect(signed.content).toBeDefined();
      expect(signed.signature).toBeDefined();
      expect(signed.signature.signatureId).toMatch(/^sig-/);
      expect(signed.signature.algorithm).toBe('RSA-SHA256');
      expect(signed.signature.keyId).toBe(keyPair.info.keyId);
      expect(signed.signature.reportId).toBe(report.reportId);
    });

    it('should include signer identity', () => {
      const report = createMockReport();
      const signed = signReport(report, keyPair.privateKey, keyPair.info);

      expect(signed.signature.signer).toEqual(mockSigner);
    });

    it('should compute content hash', () => {
      const report = createMockReport();
      const signed = signReport(report, keyPair.privateKey, keyPair.info);

      expect(signed.signature.contentHash.length).toBe(64);
      expect(signed.signature.hashAlgorithm).toBe('sha256');
    });

    it('should support different hash algorithms', () => {
      const report = createMockReport();

      const signed384 = signReport(report, keyPair.privateKey, keyPair.info, {
        hashAlgorithm: 'sha384',
      });
      expect(signed384.signature.contentHash.length).toBe(96);
      expect(signed384.signature.hashAlgorithm).toBe('sha384');

      const signed512 = signReport(report, keyPair.privateKey, keyPair.info, {
        hashAlgorithm: 'sha512',
      });
      expect(signed512.signature.contentHash.length).toBe(128);
      expect(signed512.signature.hashAlgorithm).toBe('sha512');
    });
  });

  describe('signReportContent', () => {
    it('should sign raw content', () => {
      const content = '{"test": "content"}';
      const signature = signReportContent(
        content,
        'rpt-001',
        '1.0.0',
        keyPair.privateKey,
        keyPair.info
      );

      expect(signature.reportId).toBe('rpt-001');
      expect(signature.reportVersion).toBe('1.0.0');
      expect(signature.signatureValue).toBeDefined();
    });
  });
});

// =============================================================================
// Verification Tests
// =============================================================================

describe('Signature Verification', () => {
  let keyPair: ReturnType<typeof generateSigningKeyPair>;
  let signedReport: SignedReport;

  beforeEach(() => {
    keyPair = generateSigningKeyPair(mockSigner);
    const report = createMockReport();
    signedReport = signReport(report, keyPair.privateKey, keyPair.info);
  });

  describe('verifyReportSignature', () => {
    it('should verify a valid signature', () => {
      const result = verifyReportSignature(signedReport, keyPair.publicKey);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
      expect(result.verifiedAt).toBeInstanceOf(Date);
    });

    it('should detect content tampering', () => {
      const tampered = {
        ...signedReport,
        content: signedReport.content + 'tampered',
      };

      const result = verifyReportSignature(tampered, keyPair.publicKey);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Content hash mismatch - report may have been modified');
    });

    it('should detect invalid signature', () => {
      const tampered = {
        ...signedReport,
        signature: {
          ...signedReport.signature,
          signatureValue: 'invalid_signature_base64',
        },
      };

      const result = verifyReportSignature(tampered, keyPair.publicKey);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should warn about key fingerprint mismatch', () => {
      const otherKeyPair = generateSigningKeyPair(mockSigner);

      const result = verifyReportSignature(signedReport, otherKeyPair.publicKey);

      // Will be invalid because signature was made with different key
      expect(result.valid).toBe(false);
      expect(result.warnings).toContain(
        'Key fingerprint does not match - different key being used for verification'
      );
    });
  });

  describe('verifySignature', () => {
    it('should verify content and signature directly', () => {
      const result = verifySignature(
        signedReport.content,
        signedReport.signature,
        keyPair.publicKey
      );

      expect(result.valid).toBe(true);
    });
  });

  describe('isSignatureValid', () => {
    it('should return true for valid signature', () => {
      const valid = isSignatureValid(
        signedReport.content,
        signedReport.signature,
        keyPair.publicKey
      );

      expect(valid).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const valid = isSignatureValid(
        signedReport.content + 'tampered',
        signedReport.signature,
        keyPair.publicKey
      );

      expect(valid).toBe(false);
    });
  });
});

// =============================================================================
// ReportSigner Service Tests
// =============================================================================

describe('ReportSigner', () => {
  let signer: ReportSigner;
  let keyPair: ReturnType<typeof generateSigningKeyPair>;

  beforeEach(() => {
    keyPair = generateSigningKeyPair(mockSigner);
    signer = createReportSignerWithKey(keyPair);
  });

  describe('sign', () => {
    it('should sign with default key', () => {
      const report = createMockReport();
      const signed = signer.sign(report);

      expect(signed.signature.keyId).toBe(keyPair.info.keyId);
    });

    it('should throw without default key', () => {
      const emptySigner = new ReportSigner({});
      const report = createMockReport();

      expect(() => emptySigner.sign(report)).toThrow('No default signing key configured');
    });
  });

  describe('signWithKey', () => {
    it('should sign with specific key', () => {
      const secondKeyPair = generateSigningKeyPair(mockSigner);
      signer.addKeyPair(secondKeyPair);

      const report = createMockReport();
      const signed = signer.signWithKey(report, secondKeyPair.info.keyId);

      expect(signed.signature.keyId).toBe(secondKeyPair.info.keyId);
    });

    it('should throw for unknown key', () => {
      const report = createMockReport();

      expect(() => signer.signWithKey(report, 'unknown-key')).toThrow('Key not found');
    });
  });

  describe('verify', () => {
    it('should verify signed report', () => {
      const report = createMockReport();
      const signed = signer.sign(report);

      const result = signer.verify(signed);

      expect(result.valid).toBe(true);
    });

    it('should fail for unknown key ID', () => {
      const otherSigner = createReportSigner(mockSigner);
      const report = createMockReport();
      const signed = otherSigner.sign(report);

      const result = signer.verify(signed);

      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Unknown key ID');
    });
  });

  describe('verifyWithKey', () => {
    it('should verify with explicit public key', () => {
      const otherSigner = createReportSigner(mockSigner);
      const otherKeyPair = Array.from(
        (otherSigner as any).keyPairs.values()
      )[0] as ReturnType<typeof generateSigningKeyPair>;

      const report = createMockReport();
      const signed = otherSigner.sign(report);

      const result = signer.verifyWithKey(signed, otherKeyPair.publicKey);

      expect(result.valid).toBe(true);
    });
  });

  describe('key management', () => {
    it('should add and remove key pairs', () => {
      const newKeyPair = generateSigningKeyPair(mockSigner);

      signer.addKeyPair(newKeyPair);
      expect(signer.getKeyPair(newKeyPair.info.keyId)).toBeDefined();

      signer.removeKeyPair(newKeyPair.info.keyId);
      expect(signer.getKeyPair(newKeyPair.info.keyId)).toBeUndefined();
    });

    it('should set new key as default', () => {
      const newKeyPair = generateSigningKeyPair(mockSigner);
      signer.addKeyPair(newKeyPair, true);

      const report = createMockReport();
      const signed = signer.sign(report);

      expect(signed.signature.keyId).toBe(newKeyPair.info.keyId);
    });

    it('should list key IDs', () => {
      const newKeyPair = generateSigningKeyPair(mockSigner);
      signer.addKeyPair(newKeyPair);

      const keyIds = signer.listKeyIds();

      expect(keyIds).toContain(keyPair.info.keyId);
      expect(keyIds).toContain(newKeyPair.info.keyId);
    });

    it('should add trusted public keys', () => {
      const otherSigner = createReportSigner(mockSigner);
      const otherKeyPair = Array.from(
        (otherSigner as any).keyPairs.values()
      )[0] as ReturnType<typeof generateSigningKeyPair>;

      // Sign with other signer
      const report = createMockReport();
      const signed = otherSigner.sign(report);

      // Initially verification fails
      expect(signer.verify(signed).valid).toBe(false);

      // Add trusted key
      signer.addTrustedPublicKey(otherKeyPair.info.keyId, otherKeyPair.publicKey);

      // Now verification succeeds
      expect(signer.verify(signed).valid).toBe(true);

      // Remove trusted key
      signer.removeTrustedPublicKey(otherKeyPair.info.keyId);
      expect(signer.verify(signed).valid).toBe(false);
    });
  });

  describe('generateKey', () => {
    it('should generate and add a new key', () => {
      const emptySigner = new ReportSigner({});
      const generatedKeyPair = emptySigner.generateKey(mockSigner, { setAsDefault: true });

      expect(emptySigner.getKeyPair(generatedKeyPair.info.keyId)).toBeDefined();

      const report = createMockReport();
      const signed = emptySigner.sign(report);
      expect(signed.signature.keyId).toBe(generatedKeyPair.info.keyId);
    });
  });

  describe('isKeyExpired', () => {
    it('should return false for unexpired key', () => {
      expect(signer.isKeyExpired(keyPair.info.keyId)).toBe(false);
    });

    it('should return true for unknown key', () => {
      expect(signer.isKeyExpired('unknown')).toBe(true);
    });

    it('should detect expired keys', () => {
      const expiredKeyPair = generateSigningKeyPair(mockSigner, { expiresInDays: -1 });
      signer.addKeyPair(expiredKeyPair);

      expect(signer.isKeyExpired(expiredKeyPair.info.keyId)).toBe(true);
    });
  });

  describe('getKeyInfo', () => {
    it('should return key info', () => {
      const info = signer.getKeyInfo(keyPair.info.keyId);

      expect(info).toEqual(keyPair.info);
    });

    it('should return undefined for unknown key', () => {
      expect(signer.getKeyInfo('unknown')).toBeUndefined();
    });
  });
});

// =============================================================================
// Factory Function Tests
// =============================================================================

describe('Factory Functions', () => {
  describe('createReportSigner', () => {
    it('should create signer with new key', () => {
      const signer = createReportSigner(mockSigner);
      const keyIds = signer.listKeyIds();

      expect(keyIds.length).toBe(1);
    });
  });

  describe('createReportSignerWithKey', () => {
    it('should create signer with existing key', () => {
      const keyPair = generateSigningKeyPair(mockSigner);
      const signer = createReportSignerWithKey(keyPair);

      expect(signer.getKeyPair(keyPair.info.keyId)).toBeDefined();
    });
  });

  describe('createReportVerifier', () => {
    it('should create verifier-only signer', () => {
      const keyPair = generateSigningKeyPair(mockSigner);
      const trustedKeys = new Map([[keyPair.info.keyId, keyPair.publicKey]]);
      const verifier = createReportVerifier(trustedKeys);

      // Should not be able to sign
      const report = createMockReport();
      expect(() => verifier.sign(report)).toThrow('No default signing key configured');
    });
  });
});

// =============================================================================
// Singleton Management Tests
// =============================================================================

describe('Singleton Management', () => {
  beforeEach(() => {
    resetReportSigner();
  });

  describe('initializeReportSigner', () => {
    it('should initialize global signer', () => {
      initializeReportSigner(mockSigner);

      expect(() => getReportSigner()).not.toThrow();
    });
  });

  describe('getReportSigner', () => {
    it('should throw if not initialized', () => {
      expect(() => getReportSigner()).toThrow('Report signer not initialized');
    });

    it('should return initialized signer', () => {
      initializeReportSigner(mockSigner);
      const signer = getReportSigner();

      expect(signer).toBeInstanceOf(ReportSigner);
    });
  });

  describe('resetReportSigner', () => {
    it('should reset global state', () => {
      initializeReportSigner(mockSigner);
      resetReportSigner();

      expect(() => getReportSigner()).toThrow();
    });
  });
});

// =============================================================================
// Cross-Algorithm Tests
// =============================================================================

describe('Cross-Algorithm Signing', () => {
  it('should verify signatures across algorithms', () => {
    const algorithms: Array<'sha256' | 'sha384' | 'sha512'> = ['sha256', 'sha384', 'sha512'];
    const report = createMockReport();

    for (const hashAlgorithm of algorithms) {
      const keyPair = generateSigningKeyPair(mockSigner);
      const signed = signReport(report, keyPair.privateKey, keyPair.info, {
        hashAlgorithm,
      });

      const result = verifyReportSignature(signed, keyPair.publicKey);

      expect(result.valid).toBe(true);
      expect(signed.signature.hashAlgorithm).toBe(hashAlgorithm);
    }
  });
});
