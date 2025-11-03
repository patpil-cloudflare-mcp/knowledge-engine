// src/api-client.ts
import { Env, WolframQuickAnswerResponse, WolframDetailedResponse } from './types';

export class WolframApiClient {
    private env: Env;
    private appId: string;

    constructor(env: Env) {
        this.env = env;
        this.appId = env.WOLFRAM_APPID;
    }

    /**
     * Get a quick, plain-text answer using the Short Answers API
     * @param query - Natural language query
     * @param units - Optional unit system ("metric" or "imperial")
     * @returns Plain text answer
     */
    async getQuickAnswer(query: string, units?: string): Promise<string> {
        const url = new URL('http://api.wolframalpha.com/v1/result');
        url.searchParams.set('appid', this.appId);
        url.searchParams.set('i', query);
        if (units) {
            url.searchParams.set('units', units);
        }

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'Cloudflare-Workers/WolframMCP',
                },
            });

            if (response.status === 501) {
                throw new Error('WolframAlpha could not interpret the query. Please rephrase or check spelling.');
            }

            if (response.status === 400) {
                throw new Error('Invalid query format. Please check your input.');
            }

            if (response.status === 403) {
                throw new Error('Invalid WolframAlpha AppID. Please check configuration.');
            }

            if (!response.ok) {
                throw new Error(`WolframAlpha API error: ${response.status} ${response.statusText}`);
            }

            const answer = await response.text();
            return answer.trim();
        } catch (error) {
            console.error('[WolframAPI] Quick Answer failed:', error);
            throw new Error(`Failed to get quick answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get detailed analysis using the LLM API
     * @param query - Natural language query
     * @param maxchars - Optional max character limit (default: 6800)
     * @returns Structured detailed response
     */
    async getDetailedAnalysis(query: string, maxchars?: number): Promise<string> {
        const url = new URL('https://www.wolframalpha.com/api/v1/llm-api');
        url.searchParams.set('appid', this.appId);
        url.searchParams.set('input', query);
        if (maxchars) {
            url.searchParams.set('maxchars', maxchars.toString());
        }

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'User-Agent': 'Cloudflare-Workers/WolframMCP',
                },
            });

            if (response.status === 501) {
                const errorBody = await response.text();
                throw new Error(`WolframAlpha could not interpret the query. ${errorBody ? 'Suggestions: ' + errorBody : 'Please rephrase.'}`);
            }

            if (response.status === 400) {
                throw new Error('Invalid query format. Please check your input.');
            }

            if (response.status === 403) {
                throw new Error('Invalid WolframAlpha AppID. Please check configuration.');
            }

            if (!response.ok) {
                throw new Error(`WolframAlpha API error: ${response.status} ${response.statusText}`);
            }

            const detailedResult = await response.text();
            return detailedResult.trim();
        } catch (error) {
            console.error('[WolframAPI] Detailed Analysis failed:', error);
            throw new Error(`Failed to get detailed analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Generate cache key for operational cache
     * @param toolName - Tool name (getQuickAnswer or getDetailedAnalysis)
     * @param query - User query
     * @returns Cache key
     */
    static getCacheKey(toolName: string, query: string): string {
        return `wolfram:${toolName}:${query}`;
    }

    /**
     * Check operational cache (15-minute TTL)
     * @param cacheKV - KV namespace for caching
     * @param cacheKey - Cache key
     * @returns Cached result or null
     */
    static async checkCache(cacheKV: KVNamespace, cacheKey: string): Promise<string | null> {
        try {
            const cached = await cacheKV.get(cacheKey);
            if (cached) {
                console.log(`[Cache] HIT: ${cacheKey}`);
                return cached;
            }
            console.log(`[Cache] MISS: ${cacheKey}`);
            return null;
        } catch (error) {
            console.error('[Cache] Read error:', error);
            return null;
        }
    }

    /**
     * Store result in operational cache (15-minute TTL)
     * @param cacheKV - KV namespace for caching
     * @param cacheKey - Cache key
     * @param result - Result to cache
     */
    static async storeCache(cacheKV: KVNamespace, cacheKey: string, result: string): Promise<void> {
        try {
            // 15 minutes = 900 seconds
            await cacheKV.put(cacheKey, result, { expirationTtl: 900 });
            console.log(`[Cache] STORED: ${cacheKey} (TTL: 15min)`);
        } catch (error) {
            console.error('[Cache] Write error:', error);
            // Don't throw - caching is optimization, not critical
        }
    }
}
