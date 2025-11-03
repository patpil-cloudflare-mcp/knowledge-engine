import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { WolframApiClient } from "./api-client";
import type { Env } from "./types";
import { ResponseFormat } from "./types";
import type { Props } from "./props";
import { checkBalance, consumeTokensWithRetry } from "./tokenConsumption";
import { formatInsufficientTokensError } from "./tokenUtils";
import { sanitizeOutput, redactPII, validateOutput } from 'pilpat-mcp-security';

/**
 * Wolfram Knowledge Engine with Token Integration
 *
 * This server demonstrates the complete token-based authentication pattern
 * with three example tools showing different token costs (1, 2, 3 tokens).
 *
 * Generic type parameters:
 * - Env: Cloudflare Workers environment bindings (KV, D1, WorkOS credentials, etc.)
 * - unknown: No state management (stateless server) - change if you need state
 * - Props: Authenticated user context from WorkOS (user, tokens, permissions, userId)
 *
 * Authentication flow:
 * 1. User connects via MCP client
 * 2. Redirected to WorkOS AuthKit (Magic Auth)
 * 3. User enters email → receives 6-digit code
 * 4. OAuth callback checks if user exists in token database
 * 5. If not in database → 403 error page
 * 6. If in database → Access granted, user info available via this.props
 * 7. All tools check token balance before execution
 */
export class WolframKnowledgeEngineMCP extends McpAgent<Env, unknown, Props> {
    server = new McpServer({
        name: "Wolfram Knowledge Engine",
        version: "1.0.0",
    });

    // NO initialState - this is a stateless server
    // TODO: If you need state, add:
    // initialState = { yourStateHere: "value" };
    // Then change generic from 'unknown' to your State type

    async init() {
        const apiClient = new WolframApiClient(this.env);

        // Tool 1: getQuickAnswer (2 tokens) - Short Answers API
        this.server.tool(
            "getQuickAnswer",
            "Get a quick, factual answer to a simple query using WolframAlpha's Short Answers API. " +
            "Returns plain text answers for questions like 'distance from LA to NY' or 'population of France'. " +
            "Responses are cached for 15 minutes to optimize iterative workflows. " +
            "⚠️ This tool costs 2 tokens per use.",
            {
                query: z.string().min(1).describe("Natural language query (e.g., 'How far is LA from NY?')"),
                units: z.enum(["metric", "imperial"]).optional().describe("Unit system (optional, default: metric)"),
            },
            async ({ query, units }) => {
                const TOOL_COST = 2;
                const TOOL_NAME = "getQuickAnswer";
                const actionId = crypto.randomUUID();

                try {
                    // Step 1: Get user ID
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found in authentication context");
                    }

                    // Step 2: Check operational cache (15-minute TTL)
                    const cacheKey = WolframApiClient.getCacheKey(TOOL_NAME, query + (units || ""));
                    const cachedResult = await WolframApiClient.checkCache(this.env.CACHE_KV, cacheKey);

                    if (cachedResult) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: `[Cached Result]\n\n${cachedResult}`
                            }]
                        };
                    }

                    // Step 3: Check token balance
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // Step 4: Execute WolframAlpha API call
                    const result = await apiClient.getQuickAnswer(query, units);

                    // Step 4.5: Security Processing (MANDATORY Phase 2)
                    const sanitized = sanitizeOutput(result, {
                        removeHtml: true,
                        removeControlChars: true,
                        normalizeWhitespace: true,
                        maxLength: 5000
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactBankAccounts: true,
                        redactPESEL: true,
                        redactPolishIdCard: true,
                        redactPolishPassport: true,
                        redactPolishPhones: true,
                        placeholder: '[REDACTED]'
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] ${TOOL_NAME}: Detected PII:`, detectedPII);
                    }

                    const finalResult = redacted;

                    // Step 5: Consume tokens WITH RETRY and idempotency
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "knowledge-engine",
                        TOOL_NAME,
                        { query, units },
                        finalResult,
                        true,
                        actionId
                    );

                    // Step 6: Store in cache
                    await WolframApiClient.storeCache(this.env.CACHE_KV, cacheKey, finalResult);

                    // Step 7: Return result
                    return {
                        content: [{
                            type: "text" as const,
                            text: finalResult
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }],
                        isError: true
                    };
                }
            }
        );

        // Tool 2: getDetailedAnalysis (4 tokens) - LLM API
        this.server.tool(
            "getDetailedAnalysis",
            "Get comprehensive, structured analysis for complex queries using WolframAlpha's LLM API. " +
            "Returns rich, detailed responses optimized for LLM comprehension (e.g., '10 densest elemental metals'). " +
            "Responses include data, images, properties, and computational results. " +
            "Cached for 15 minutes to optimize iterative workflows. " +
            "⚠️ This tool costs 4 tokens per use.",
            {
                query: z.string().min(1).describe("Complex query requiring detailed analysis"),
                maxchars: z.number().min(1000).max(10000).optional().describe("Max character limit (default: 6800, max: 10000)"),
            },
            async ({ query, maxchars }) => {
                const TOOL_COST = 4;
                const TOOL_NAME = "getDetailedAnalysis";
                const actionId = crypto.randomUUID();

                try {
                    // Step 1: Get user ID
                    const userId = this.props?.userId;
                    if (!userId) {
                        throw new Error("User ID not found in authentication context");
                    }

                    // Step 2: Check operational cache (15-minute TTL)
                    const cacheKey = WolframApiClient.getCacheKey(TOOL_NAME, query + (maxchars || ""));
                    const cachedResult = await WolframApiClient.checkCache(this.env.CACHE_KV, cacheKey);

                    if (cachedResult) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: `[Cached Result]\n\n${cachedResult}`
                            }]
                        };
                    }

                    // Step 3: Check token balance
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // Step 4: Execute WolframAlpha API call
                    const result = await apiClient.getDetailedAnalysis(query, maxchars);

                    // Step 4.5: Security Processing (MANDATORY Phase 2)
                    const sanitized = sanitizeOutput(result, {
                        removeHtml: true,
                        removeControlChars: true,
                        normalizeWhitespace: true,
                        maxLength: maxchars || 6800
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactBankAccounts: true,
                        redactPESEL: true,
                        redactPolishIdCard: true,
                        redactPolishPassport: true,
                        redactPolishPhones: true,
                        placeholder: '[REDACTED]'
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] ${TOOL_NAME}: Detected PII:`, detectedPII);
                    }

                    const finalResult = redacted;

                    // Step 5: Consume tokens WITH RETRY and idempotency
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB,
                        userId,
                        TOOL_COST,
                        "knowledge-engine",
                        TOOL_NAME,
                        { query, maxchars },
                        finalResult,
                        true,
                        actionId
                    );

                    // Step 6: Store in cache
                    await WolframApiClient.storeCache(this.env.CACHE_KV, cacheKey, finalResult);

                    // Step 7: Return result
                    return {
                        content: [{
                            type: "text" as const,
                            text: finalResult
                        }]
                    };
                } catch (error) {
                    return {
                        content: [{
                            type: "text" as const,
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }],
                        isError: true
                    };
                }
            }
        );

    }
}
