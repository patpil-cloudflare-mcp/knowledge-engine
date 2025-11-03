/**
 * Cloudflare Workers Environment Bindings
 *
 * This interface defines all the bindings available to your MCP server,
 * including authentication credentials and Cloudflare resources.
 *
 * TODO: Add your custom bindings here (AI, R2, additional KV/D1, etc.)
 */
export interface Env {
    /** KV namespace for storing OAuth tokens and session data */
    OAUTH_KV: KVNamespace;

    /** KV namespace for operational caching (15-minute TTL for iterative workflows) */
    CACHE_KV: KVNamespace;

    /** Durable Object namespace for MCP server instances (required by McpAgent) */
    MCP_OBJECT: DurableObjectNamespace;

    /** D1 Database for token management (shared with mcp-token-system) */
    TOKEN_DB: D1Database;

    /** WorkOS Client ID (public, used to initiate OAuth flows) */
    WORKOS_CLIENT_ID: string;

    /** WorkOS API Key (sensitive, starts with sk_, used to initialize WorkOS SDK) */
    WORKOS_API_KEY: string;

    /**
     * KV namespace for centralized custom login session storage (MANDATORY)
     *
     * CRITICAL: This is REQUIRED for centralized authentication at panel.wtyczki.ai
     *
     * Without this binding:
     * - Users will be redirected to default WorkOS UI (exciting-domain-65.authkit.app)
     * - Centralized branded login will NOT work
     * - Session sharing across servers will fail
     *
     * This namespace is already configured in wrangler.jsonc with the correct ID
     * from CLOUDFLARE_CONFIG.md. DO NOT make this optional or remove it.
     *
     * See docs/CUSTOM_LOGIN_GUIDE.md for architecture details.
     */
    USER_SESSIONS: KVNamespace;

    /**
     * Cloudflare AI Gateway Configuration
     *
     * Route all AI requests through AI Gateway for:
     * - Authenticated access control
     * - Rate limiting (60 requests/hour per user)
     * - Response caching (1-hour TTL)
     * - Analytics and monitoring
     */
    AI_GATEWAY_ID: string;
    AI_GATEWAY_TOKEN: string;

    // WolframAlpha-specific bindings
    WOLFRAM_APPID: string;  // Secret: WolframAlpha Application ID

    // TODO: Add your custom environment variables and bindings here
    // Examples:
    // AI?: Ai;                              // Workers AI for LLM inference
    // MY_BUCKET?: R2Bucket;                 // R2 storage bucket
    // EXTERNAL_API_KEY?: string;            // Third-party API credentials
    // CUSTOM_KV?: KVNamespace;              // Additional KV namespace
}

/**
 * WolframAlpha API response types
 */

/** Response from Short Answers API (plain text) */
export interface WolframQuickAnswerResponse {
    answer: string;  // Plain text answer
}

/** Response from LLM API (structured text with images) */
export interface WolframDetailedResponse {
    query: string;
    interpretation: string;
    result: string;
    images?: string[];
    properties?: Record<string, any>;
    wolframUrl: string;
}

/** Operational cache entry for 15-minute TTL */
export interface CacheEntry {
    data: string;
    timestamp: number;
    ttl: number;  // 15 minutes = 900000ms
}

/**
 * Response format options for tools that return large datasets
 *
 * Based on MCP best practices for token optimization and LLM comprehension.
 * Use this enum to give agents control over response verbosity.
 *
 * @see https://developers.cloudflare.com/agents/model-context-protocol/
 */
export enum ResponseFormat {
    /**
     * Concise format: Essential data only, ~1/3 tokens
     *
     * - Returns human-readable names, descriptions, and key attributes
     * - Excludes technical IDs, metadata, and redundant fields
     * - Optimized for LLM comprehension and decision-making
     * - Default choice for most tools
     *
     * Example: { name: "Report.pdf", type: "PDF", author: "Jane Smith" }
     */
    CONCISE = "concise",

    /**
     * Detailed format: Full data including IDs for programmatic use
     *
     * - Includes all fields from API response
     * - Contains technical identifiers (UUIDs, IDs, hashes)
     * - Useful when agent needs to make subsequent API calls
     * - Use for tools that are building blocks for complex workflows
     *
     * Example: { id: "uuid-123", name: "Report.pdf", mime_type: "application/pdf", ... }
     */
    DETAILED = "detailed"
}
