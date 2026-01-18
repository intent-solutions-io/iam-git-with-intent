/**
 * Generated TypeScript types for Git With Intent Gateway API
 *
 * This file is auto-generated from the OpenAPI specification.
 * DO NOT EDIT MANUALLY - changes will be overwritten.
 *
 * Generated on: 2026-01-18T05:14:02.596Z
 * OpenAPI Spec: apps/gateway/openapi.yaml
 *
 * To regenerate:
 *   npm run generate:sdk-types
 *
 * To validate:
 *   npm run validate:sdk-types
 *
 * @see https://github.com/drwpow/openapi-typescript
 * @module @gwi/sdk/generated
 */

/* eslint-disable */
/* prettier-ignore */

export interface paths {
    "/v1/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search connectors
         * @description Search for connectors by query, capabilities, or categories
         */
        get: operations["searchConnectors"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get connector info
         * @description Get detailed information about a connector including all versions
         */
        get: operations["getConnector"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}/{version}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get version metadata
         * @description Get metadata for a specific connector version
         */
        get: operations["getVersion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}/{version}/tarball": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Download tarball
         * @description Download the gzipped tarball for a connector version
         */
        get: operations["downloadTarball"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}/{version}/signature": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Download signature
         * @description Download the cryptographic signature for a connector version
         */
        get: operations["downloadSignature"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Publish connector metadata
         * @description Publish connector metadata when tarball is already uploaded to GCS.
         *     For CLI usage, prefer POST /v1/publish which handles tarball upload.
         */
        post: operations["publishMetadata"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Publish connector with tarball
         * @description Full publish endpoint that accepts tarball as base64 and handles
         *     GCS upload server-side. This is the recommended endpoint for CLI usage.
         *
         *     Rate limited to 10 publishes per 15 minutes per publisher.
         *     Maximum tarball size: 50MB.
         */
        post: operations["publishFull"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}/{version}/deprecate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Deprecate a version
         * @description Mark a connector version as deprecated with a reason
         */
        post: operations["deprecateVersion"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/connectors/{id}/{version}/download": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Track download
         * @description Explicitly track a download for metrics (optional, downloads are also tracked on tarball access)
         */
        post: operations["trackDownload"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/openapi": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get OpenAPI specification
         * @description Returns this OpenAPI specification
         */
        get: operations["getOpenApiSpec"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/ops/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get Prometheus metrics
         * @description Returns operational metrics in Prometheus text format.
         *     Protected by GWI_METRICS_ENABLED environment variable.
         */
        get: operations["getMetrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sso/oidc/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start OIDC login flow
         * @description Initiates OIDC authentication with PKCE. Returns authorization URL
         *     for redirect. The state parameter is stored server-side.
         */
        post: operations["startOidcLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sso/oidc/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Handle OIDC callback
         * @description Handles the OIDC authorization callback. Validates state, exchanges
         *     code for tokens, validates ID token using JWKS, and returns session.
         */
        post: operations["handleOidcCallback"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sso/saml/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start SAML login flow
         * @description Initiates SAML SP-initiated SSO. Returns a URL with SAMLRequest
         *     for redirect to the IdP.
         */
        post: operations["startSamlLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sso/saml/acs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * SAML Assertion Consumer Service
         * @description Handles SAML assertions from the IdP. Validates signature using
         *     x509 certificate, extracts claims, and returns session.
         */
        post: operations["handleSamlAcs"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sso/saml/metadata": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get SAML SP metadata
         * @description Returns SAML Service Provider metadata XML for IdP configuration.
         */
        get: operations["getSamlSpMetadata"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scim/v2/Users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List SCIM users
         * @description List users with optional filtering and pagination.
         *     SCIM 2.0 compliant (RFC 7644).
         */
        get: operations["listScimUsers"];
        put?: never;
        /**
         * Create SCIM user
         * @description Create a new user via SCIM provisioning
         */
        post: operations["createScimUser"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scim/v2/Users/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get SCIM user
         * @description Get a user by ID
         */
        get: operations["getScimUser"];
        /**
         * Replace SCIM user
         * @description Replace all attributes of a user
         */
        put: operations["replaceScimUser"];
        post?: never;
        /**
         * Delete SCIM user
         * @description Delete a user
         */
        delete: operations["deleteScimUser"];
        options?: never;
        head?: never;
        /**
         * Patch SCIM user
         * @description Update specific attributes of a user using SCIM PATCH operations
         */
        patch: operations["patchScimUser"];
        trace?: never;
    };
    "/scim/v2/Groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List SCIM groups
         * @description List groups with optional filtering and pagination
         */
        get: operations["listScimGroups"];
        put?: never;
        /**
         * Create SCIM group
         * @description Create a new group
         */
        post: operations["createScimGroup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/scim/v2/Groups/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Get SCIM group
         * @description Get a group by ID
         */
        get: operations["getScimGroup"];
        /**
         * Replace SCIM group
         * @description Replace all attributes of a group
         */
        put: operations["replaceScimGroup"];
        post?: never;
        /**
         * Delete SCIM group
         * @description Delete a group
         */
        delete: operations["deleteScimGroup"];
        options?: never;
        head?: never;
        /**
         * Patch SCIM group
         * @description Update specific attributes of a group
         */
        patch: operations["patchScimGroup"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            /** @description Error type */
            error: string;
            /** @description Human-readable error message */
            message?: string;
            details?: {
                path?: string;
                message?: string;
            }[];
        };
        RateLimitError: components["schemas"]["Error"] & {
            /** @description Seconds until rate limit resets */
            retryAfter?: number;
        };
        TarballTooLargeError: components["schemas"]["Error"] & {
            /** @description Maximum allowed size in bytes */
            maxSize?: number;
            /** @description Actual size of tarball in bytes */
            actualSize?: number;
        };
        SearchEntry: {
            id?: string;
            latestVersion?: string;
            displayName?: string;
            description?: string;
            author?: string;
            capabilities?: string[];
            downloads?: number;
            /** Format: date-time */
            updatedAt?: string;
        };
        SearchResults: {
            connectors?: components["schemas"]["SearchEntry"][];
            total?: number;
            page?: number;
            pageSize?: number;
        };
        ConnectorDetails: {
            id?: string;
            displayName?: string;
            description?: string;
            author?: string;
            capabilities?: string[];
            latestVersion?: string;
            versions?: string[];
            totalDownloads?: number;
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
        };
        VersionDetails: {
            id?: string;
            version?: string;
            /** @description Full connector manifest */
            manifest?: Record<string, never>;
            /** Format: uri */
            tarballUrl?: string;
            /** @description SHA256 checksum of tarball */
            tarballChecksum?: string;
            /** Format: uri */
            signatureUrl?: string;
            /** Format: date-time */
            publishedAt?: string;
            downloads?: number;
        };
        SignatureFile: {
            /** @description Signature format version */
            version: number;
            /** @description ID of the signing key */
            keyId: string;
            /** @description Signature algorithm (e.g., ed25519) */
            algorithm: string;
            /** @description Base64-encoded signature */
            signature: string;
            /** @description SHA256 hex checksum of tarball */
            checksum: string;
            /** Format: date-time */
            signedAt: string;
            /** @description Optional payload that was signed */
            payload?: string;
        };
        ConnectorManifest: {
            id: string;
            version: string;
            displayName: string;
            description?: string;
            author: string;
            capabilities: string[];
        };
        PublishMetadataRequest: {
            connectorId: string;
            version: string;
            manifest: components["schemas"]["ConnectorManifest"];
            signature: components["schemas"]["SignatureFile"];
            tarballChecksum: string;
            changelog?: string;
            releaseNotes?: string;
            /** @default false */
            prerelease: boolean;
        };
        PublishFullRequest: {
            manifest: components["schemas"]["ConnectorManifest"];
            /** @description Base64-encoded gzipped tarball */
            tarball: string;
            signature: components["schemas"]["SignatureFile"];
        };
        PublishResponse: {
            success?: boolean;
            /** @description Published version details */
            version?: Record<string, never>;
        };
        PublishFullResponse: {
            success?: boolean;
            connectorId?: string;
            version?: string;
            checksum?: string;
            /** Format: uri */
            tarballUrl?: string;
        };
        OidcStartRequest: {
            /** @description Organization ID */
            orgId: string;
            /** @description IdP configuration ID */
            idpConfigId: string;
            /**
             * Format: uri
             * @description Override redirect URI (optional)
             */
            redirectUri?: string;
        };
        OidcStartResponse: {
            /**
             * Format: uri
             * @description URL to redirect user to for authentication
             */
            authorizationUrl: string;
            /** @description State parameter for CSRF protection */
            state: string;
        };
        OidcCallbackRequest: {
            /** @description Authorization code from IdP */
            code: string;
            /** @description State parameter from start request */
            state: string;
        };
        SamlStartRequest: {
            /** @description Organization ID */
            orgId: string;
            /** @description IdP configuration ID */
            idpConfigId: string;
        };
        SamlStartResponse: {
            /**
             * Format: uri
             * @description URL with SAMLRequest to redirect to IdP
             */
            samlRequestUrl: string;
            /** @description RelayState for tracking request */
            relayState: string;
        };
        SsoAuthResponse: {
            success: boolean;
            /** @description Internal user ID */
            userId: string;
            /** Format: email */
            email?: string;
            displayName?: string;
            /**
             * @description Mapped internal role
             * @enum {string}
             */
            role: "OWNER" | "ADMIN" | "DEVELOPER" | "VIEWER";
            /** @description Session access token */
            accessToken?: string;
            /**
             * Format: date-time
             * @description Token expiration time
             */
            expiresAt?: string;
        };
        ScimError: {
            /**
             * @example [
             *       "urn:ietf:params:scim:api:messages:2.0:Error"
             *     ]
             */
            schemas: string[];
            /** @description HTTP status code as string */
            status: string;
            /**
             * @description SCIM error type
             * @enum {string}
             */
            scimType?: "invalidValue" | "uniqueness" | "noTarget" | "invalidPath" | "invalidFilter" | "tooMany" | "mutability" | "sensitive" | "invalidSyntax" | "invalidVersion";
            /** @description Human-readable error message */
            detail: string;
        };
        ScimMeta: {
            /** @enum {string} */
            resourceType?: "User" | "Group";
            /** Format: date-time */
            created?: string;
            /** Format: date-time */
            lastModified?: string;
            /** Format: uri */
            location?: string;
            version?: string;
        };
        ScimName: {
            formatted?: string;
            familyName?: string;
            givenName?: string;
            middleName?: string;
        };
        ScimEmail: {
            /** Format: email */
            value: string;
            /** @enum {string} */
            type?: "work" | "home" | "other";
            primary?: boolean;
        };
        ScimUser: {
            /**
             * @default [
             *       "urn:ietf:params:scim:schemas:core:2.0:User"
             *     ]
             */
            schemas: string[];
            readonly id?: string;
            /** @description External ID from IdP */
            externalId?: string;
            /** @description Unique username */
            userName: string;
            name?: components["schemas"]["ScimName"];
            displayName?: string;
            emails?: components["schemas"]["ScimEmail"][];
            /** @default true */
            active: boolean;
            meta?: components["schemas"]["ScimMeta"];
        };
        ScimGroupMember: {
            /** @description User ID */
            value: string;
            /** @description Display name */
            display?: string;
            /**
             * Format: uri
             * @description URI reference to user
             */
            $ref?: string;
        };
        ScimGroup: {
            /**
             * @default [
             *       "urn:ietf:params:scim:schemas:core:2.0:Group"
             *     ]
             */
            schemas: string[];
            readonly id?: string;
            /** @description External ID from IdP */
            externalId?: string;
            /** @description Group name */
            displayName: string;
            members?: components["schemas"]["ScimGroupMember"][];
            meta?: components["schemas"]["ScimMeta"];
        };
        ScimListResponse: {
            /**
             * @default [
             *       "urn:ietf:params:scim:api:messages:2.0:ListResponse"
             *     ]
             */
            schemas: string[];
            /** @description Total number of results */
            totalResults: number;
            /** @description 1-based index of first result */
            startIndex?: number;
            /** @description Number of results in this page */
            itemsPerPage?: number;
            Resources?: (components["schemas"]["ScimUser"] | components["schemas"]["ScimGroup"])[];
        };
        ScimPatchOp: {
            /** @enum {string} */
            op: "add" | "remove" | "replace";
            /** @description Attribute path */
            path?: string;
            /** @description Value to set (for add/replace) */
            value?: unknown;
        };
        ScimPatchRequest: {
            /**
             * @default [
             *       "urn:ietf:params:scim:api:messages:2.0:PatchOp"
             *     ]
             */
            schemas: string[];
            Operations: components["schemas"]["ScimPatchOp"][];
        };
    };
    responses: {
        /** @description Resource not found */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Validation failed */
        ValidationError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Authentication required */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Access denied */
        Forbidden: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Rate limit exceeded */
        RateLimited: {
            headers: {
                "X-RateLimit-Limit"?: number;
                "X-RateLimit-Remaining"?: number;
                "X-RateLimit-Reset"?: number;
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["RateLimitError"];
            };
        };
        /** @description Internal server error */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description SCIM authentication failed */
        ScimUnauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/scim+json": components["schemas"]["ScimError"];
            };
        };
        /** @description SCIM request validation failed */
        ScimBadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/scim+json": components["schemas"]["ScimError"];
            };
        };
        /** @description SCIM resource not found */
        ScimNotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/scim+json": components["schemas"]["ScimError"];
            };
        };
    };
    parameters: {
        /** @description Connector identifier */
        ConnectorId: string;
        /** @description Semantic version */
        Version: string;
        /** @description SCIM resource identifier */
        ScimResourceId: string;
        /** @description SCIM filter expression */
        ScimFilter: string;
        /** @description 1-based index of first result */
        ScimStartIndex: number;
        /** @description Maximum number of results */
        ScimCount: number;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    searchConnectors: {
        parameters: {
            query?: {
                /** @description Search query string */
                q?: string;
                /** @description Filter by capabilities (comma-separated) */
                capabilities?: string;
                /** @description Filter by categories (comma-separated) */
                categories?: string;
                /** @description Page number (1-indexed) */
                page?: number;
                /** @description Results per page */
                pageSize?: number;
                /** @description Sort field */
                sortBy?: "downloads" | "updated" | "name";
                /** @description Sort order */
                sortOrder?: "asc" | "desc";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Search results */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SearchResults"];
                };
            };
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    getConnector: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Connector identifier */
                id: components["parameters"]["ConnectorId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Connector details */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConnectorDetails"];
                };
            };
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    getVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Connector identifier */
                id: components["parameters"]["ConnectorId"];
                /** @description Semantic version */
                version: components["parameters"]["Version"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Version metadata */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["VersionDetails"];
                };
            };
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    downloadTarball: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Connector identifier */
                id: components["parameters"]["ConnectorId"];
                /** @description Semantic version */
                version: components["parameters"]["Version"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Connector tarball */
            200: {
                headers: {
                    "Content-Disposition"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/gzip": string;
                };
            };
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    downloadSignature: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Connector identifier */
                id: components["parameters"]["ConnectorId"];
                /** @description Semantic version */
                version: components["parameters"]["Version"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Signature file */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SignatureFile"];
                };
            };
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    publishMetadata: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublishMetadataRequest"];
            };
        };
        responses: {
            /** @description Published successfully */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublishResponse"];
                };
            };
            400: components["responses"]["ValidationError"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    publishFull: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PublishFullRequest"];
            };
        };
        responses: {
            /** @description Published successfully */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublishFullResponse"];
                };
            };
            400: components["responses"]["ValidationError"];
            401: components["responses"]["Unauthorized"];
            403: components["responses"]["Forbidden"];
            /** @description Tarball too large */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TarballTooLargeError"];
                };
            };
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
        };
    };
    deprecateVersion: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Connector identifier */
                id: components["parameters"]["ConnectorId"];
                /** @description Semantic version */
                version: components["parameters"]["Version"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @description Reason for deprecation */
                    reason: string;
                };
            };
        };
        responses: {
            /** @description Deprecated successfully */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        success?: boolean;
                        id?: string;
                        version?: string;
                        reason?: string;
                    };
                };
            };
            400: components["responses"]["ValidationError"];
            401: components["responses"]["Unauthorized"];
            500: components["responses"]["InternalError"];
        };
    };
    trackDownload: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description Connector identifier */
                id: components["parameters"]["ConnectorId"];
                /** @description Semantic version */
                version: components["parameters"]["Version"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Download tracked */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        success?: boolean;
                        id?: string;
                        version?: string;
                    };
                };
            };
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    getOpenApiSpec: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description OpenAPI specification */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/yaml": string;
                    "application/json": Record<string, never>;
                };
            };
        };
    };
    getMetrics: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Prometheus metrics */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/plain": string;
                };
            };
            /** @description Metrics disabled */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    startOidcLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OidcStartRequest"];
            };
        };
        responses: {
            /** @description Authorization URL for redirect */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OidcStartResponse"];
                };
            };
            400: components["responses"]["ValidationError"];
            /** @description IdP configuration not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    handleOidcCallback: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OidcCallbackRequest"];
            };
        };
        responses: {
            /** @description Authentication successful */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SsoAuthResponse"];
                };
            };
            /** @description Invalid state or code */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Token validation failed */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    startSamlLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SamlStartRequest"];
            };
        };
        responses: {
            /** @description SAML request URL for redirect */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SamlStartResponse"];
                };
            };
            400: components["responses"]["ValidationError"];
            /** @description IdP configuration not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    handleSamlAcs: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/x-www-form-urlencoded": {
                    /** @description Base64-encoded SAML response */
                    SAMLResponse: string;
                    /** @description RelayState from original request */
                    RelayState?: string;
                };
            };
        };
        responses: {
            /** @description Authentication successful */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SsoAuthResponse"];
                };
            };
            /** @description Invalid SAML response */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Assertion validation failed */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    getSamlSpMetadata: {
        parameters: {
            query: {
                orgId: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description SP metadata XML */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/xml": string;
                };
            };
            /** @description Organization not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    listScimUsers: {
        parameters: {
            query?: {
                /** @description SCIM filter expression */
                filter?: components["parameters"]["ScimFilter"];
                /** @description 1-based index of first result */
                startIndex?: components["parameters"]["ScimStartIndex"];
                /** @description Maximum number of results */
                count?: components["parameters"]["ScimCount"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of users */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimListResponse"];
                };
            };
            401: components["responses"]["ScimUnauthorized"];
            500: components["responses"]["InternalError"];
        };
    };
    createScimUser: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/scim+json": components["schemas"]["ScimUser"];
            };
        };
        responses: {
            /** @description User created */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimUser"];
                };
            };
            400: components["responses"]["ScimBadRequest"];
            401: components["responses"]["ScimUnauthorized"];
            /** @description User already exists */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimError"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    getScimUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description User details */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimUser"];
                };
            };
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    replaceScimUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/scim+json": components["schemas"]["ScimUser"];
            };
        };
        responses: {
            /** @description User updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimUser"];
                };
            };
            400: components["responses"]["ScimBadRequest"];
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteScimUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description User deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    patchScimUser: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/scim+json": components["schemas"]["ScimPatchRequest"];
            };
        };
        responses: {
            /** @description User updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimUser"];
                };
            };
            400: components["responses"]["ScimBadRequest"];
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    listScimGroups: {
        parameters: {
            query?: {
                /** @description SCIM filter expression */
                filter?: components["parameters"]["ScimFilter"];
                /** @description 1-based index of first result */
                startIndex?: components["parameters"]["ScimStartIndex"];
                /** @description Maximum number of results */
                count?: components["parameters"]["ScimCount"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of groups */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimListResponse"];
                };
            };
            401: components["responses"]["ScimUnauthorized"];
            500: components["responses"]["InternalError"];
        };
    };
    createScimGroup: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/scim+json": components["schemas"]["ScimGroup"];
            };
        };
        responses: {
            /** @description Group created */
            201: {
                headers: {
                    Location?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimGroup"];
                };
            };
            400: components["responses"]["ScimBadRequest"];
            401: components["responses"]["ScimUnauthorized"];
            500: components["responses"]["InternalError"];
        };
    };
    getScimGroup: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Group details */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimGroup"];
                };
            };
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    replaceScimGroup: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/scim+json": components["schemas"]["ScimGroup"];
            };
        };
        responses: {
            /** @description Group updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimGroup"];
                };
            };
            400: components["responses"]["ScimBadRequest"];
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteScimGroup: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Group deleted */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    patchScimGroup: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description SCIM resource identifier */
                id: components["parameters"]["ScimResourceId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/scim+json": components["schemas"]["ScimPatchRequest"];
            };
        };
        responses: {
            /** @description Group updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/scim+json": components["schemas"]["ScimGroup"];
                };
            };
            400: components["responses"]["ScimBadRequest"];
            401: components["responses"]["ScimUnauthorized"];
            404: components["responses"]["ScimNotFound"];
            500: components["responses"]["InternalError"];
        };
    };
}
