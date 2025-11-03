# MCP Server Customization Guide

## Before Starting

Read `/CLOUDFLARE_CONFIG.md` first. Contains:
- Cloudflare Account ID
- Shared KV namespace IDs
- Shared D1 database ID
- WorkOS credentials
- Domain patterns

Use exact IDs from CLOUDFLARE_CONFIG.md - never create new infrastructure.

## Prerequisites

- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- WorkOS account
- Cloudflare account
- **Reference:** `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/skeleton-api-reference.md` for function signatures

## Step 1: Clone and Rename

### Copy Template

```bash
cd /path/to/your/projects
cp -r mcp-server-skeleton weather-mcp
cd weather-mcp
```

### Find and Replace

| Find | Replace With |
|------|--------------|
| `OpenSkyMcp` | `WeatherMCP` |
| `opensky` | `weather-mcp` |
| `OpenSky Flight Tracker` | `Weather MCP Server` |

Command line:
```bash
find . -type f -name "*.ts" -o -name "*.json" -o -name "*.md" | xargs sed -i '' 's/OpenSkyMcp/WeatherMCP/g'
find . -type f -name "*.ts" -o -name "*.json" -o -name "*.md" | xargs sed -i '' 's/opensky/weather-mcp/g'
```

## Step 2: Configure Environment

### Get Shared Credentials from CLOUDFLARE_CONFIG.md

Copy these from `/CLOUDFLARE_CONFIG.md`:

1. WorkOS Credentials (shared):
```
WORKOS_CLIENT_ID=client_01XXXXXXXXXXXXXXXXXXXXXX
WORKOS_API_KEY=sk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

2. KV Namespace IDs (shared):
```jsonc
// CACHE_KV
"id": "fa6ff790f146478e85ea77ae4a5caa4b"
"preview_id": "4b37112559f2429191633d98781645ca"

// OAUTH_KV
"id": "b77ec4c7e96043fab0c466a978c2f186"
"preview_id": "cf8ef9f38ab24ae583d20dd4e973810c"
```

3. D1 Database ID (shared):
```
database_id: "ebb389aa-2d65-4d38-a0da-50c7da9dfe8b"
```

### Create Local Environment File

```bash
cp .dev.vars.example .dev.vars
nano .dev.vars
```

Add shared WorkOS credentials from CLOUDFLARE_CONFIG.md:
```bash
WORKOS_CLIENT_ID=client_01XXXXXXXXXXXXXXXXXXXXXX
WORKOS_API_KEY=sk_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# Add custom API keys below
# YOUR_CUSTOM_API_KEY=...
```

### Verify wrangler.jsonc Uses Shared Infrastructure

Verify exact values match CLOUDFLARE_CONFIG.md:

```jsonc
"kv_namespaces": [
    {
        "binding": "CACHE_KV",
        "id": "fa6ff790f146478e85ea77ae4a5caa4b",
        "preview_id": "4b37112559f2429191633d98781645ca"
    },
    {
        "binding": "OAUTH_KV",
        "id": "b77ec4c7e96043fab0c466a978c2f186",
        "preview_id": "cf8ef9f38ab24ae583d20dd4e973810c"
    }
],
"d1_databases": [
    {
        "binding": "TOKEN_DB",
        "database_name": "mcp-tokens-database",
        "database_id": "ebb389aa-2d65-4d38-a0da-50c7da9dfe8b"
    }
]
```

## Step 3: Customize Types

### Update Environment Bindings

Edit `src/types.ts`:

```typescript
export interface Env {
    // Required (don't remove)
    OAUTH_KV: KVNamespace;
    MCP_OBJECT: DurableObjectNamespace;
    DB: D1Database;
    WORKOS_CLIENT_ID: string;
    WORKOS_API_KEY: string;

    // Add custom bindings:
    WEATHER_API_KEY?: string;
    WEATHER_API_URL?: string;
    // AI?: Ai;
    // MY_BUCKET?: R2Bucket;
}
```

### Define API Response Types

```typescript
export interface WeatherApiResponse {
    location: string;
    temperature: number;
    condition: string;
    humidity: number;
    timestamp: string;
}

export interface WeatherResult {
    location: string;
    current: {
        temp: number;
        condition: string;
    };
    forecast: Array<{
        date: string;
        high: number;
        low: number;
    }>;
}
```

### Add Production Secrets

```bash
wrangler secret put WEATHER_API_KEY
wrangler secret put WEATHER_API_URL
```

## Step 4: Implement API Client

### Replace Placeholder

Edit `src/api-client.ts`:

```typescript
export class WeatherApiClient {
    private env: Env;
    private baseUrl: string;

    constructor(env: Env) {
        this.env = env;
        this.baseUrl = env.WEATHER_API_URL || "https://api.weather.com";
    }

    async getCurrentWeather(location: string): Promise<WeatherApiResponse> {
        const url = `${this.baseUrl}/current?location=${encodeURIComponent(location)}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.env.WEATHER_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        return response.json();
    }

    async getForecast(location: string, days: number): Promise<WeatherApiResponse> {
        // Implement forecast
    }
}
```

### Add Error Handling

```typescript
async getCurrentWeather(location: string): Promise<WeatherApiResponse> {
    try {
        const response = await fetch(/* ... */);

        if (!response.ok) {
            console.error(`[Weather API] Error: ${response.status}`, await response.text());
            throw new Error(`Weather API returned ${response.status}`);
        }

        return response.json();
    } catch (error) {
        console.error('[Weather API] Request failed:', error);
        throw new Error(`Failed to fetch weather: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
```

## Step 5: Define Tools

Implement every tool in TWO files:
1. `src/server.ts` (OAuth path)
2. `src/api-key-handler.ts` (API key path)

### OAuth Path (src/server.ts)

```typescript
export class WeatherMCP extends McpAgent<Env, unknown, Props> {
    server = new McpServer({
        name: "Weather MCP Server",
        version: "1.0.0",
    });

    async init() {
        const apiClient = new WeatherApiClient(this.env);

        this.server.tool(
            "getCurrentWeather",
            "Get current weather. ⚠️ Costs 1 token.",
            {
                location: z.string().min(1).describe("City name or coordinates"),
            },
            async ({ location }) => {
                const TOOL_COST = 1;
                const TOOL_NAME = "getCurrentWeather";
                const actionId = crypto.randomUUID();

                try {
                    // 1. Get user ID
                    const userId = this.props?.userId;
                    if (!userId) throw new Error("User ID not found");

                    // 2. Check balance
                    const balanceCheck = await checkBalance(this.env.TOKEN_DB, userId, TOOL_COST);

                    // 3. Insufficient tokens?
                    if (!balanceCheck.sufficient) {
                        return {
                            content: [{
                                type: "text" as const,
                                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST)
                            }],
                            isError: true
                        };
                    }

                    // 4. Execute
                    const weather = await apiClient.getCurrentWeather(location);

                    // 4.5. Security (sanitize + redact PII)
                    const sanitized = sanitizeOutput(JSON.stringify(weather), {
                        removeHtml: true,
                        maxLength: 5000,
                    });

                    const { redacted, detectedPII } = redactPII(sanitized, {
                        redactEmails: false,
                        redactPhones: true,
                        redactCreditCards: true,
                        redactSSN: true,
                        redactPESEL: true,
                        redactPolishIdCard: true,
                        redactPolishPassport: true,
                        redactPolishPhones: true,
                    });

                    if (detectedPII.length > 0) {
                        console.warn(`[Security] Detected: ${detectedPII.join(', ')}`);
                    }

                    // 5. Consume tokens
                    await consumeTokensWithRetry(
                        this.env.TOKEN_DB, userId, TOOL_COST,
                        "weather-mcp", TOOL_NAME,
                        { location }, redacted, true, actionId
                    );

                    // 6. Return
                    return {
                        content: [{ type: "text" as const, text: redacted }]
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
```

### API Key Path (src/api-key-handler.ts)

Update in FOUR locations:

**Location 1: getOrCreateServer() (~line 260)**
```typescript
server.tool(
    "getCurrentWeather",
    "Get current weather. ⚠️ Costs 1 token.",
    {
        location: z.string().min(1).describe("City name or coordinates"),
    },
    async ({ location }) => {
        const TOOL_COST = 1;
        const TOOL_NAME = "getCurrentWeather";
        const actionId = crypto.randomUUID();

        try {
            const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

            if (balanceCheck.userDeleted) {
                return {
                    content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
                    isError: true,
                };
            }

            if (!balanceCheck.sufficient) {
                return {
                    content: [{
                        type: "text" as const,
                        text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
                    }],
                    isError: true,
                };
            }

            const apiClient = new WeatherApiClient(env);
            const result = await apiClient.getCurrentWeather(location);

            const sanitized = sanitizeOutput(JSON.stringify(result), { removeHtml: true, maxLength: 5000 });
            const { redacted, detectedPII } = redactPII(sanitized, {
                redactPhones: true,
                redactCreditCards: true,
                redactPESEL: true,
            });

            if (detectedPII.length > 0) {
                console.warn(`[Security] Detected: ${detectedPII.join(', ')}`);
            }

            await consumeTokensWithRetry(
                env.TOKEN_DB, userId, TOOL_COST,
                "weather-mcp", TOOL_NAME,
                { location }, redacted, true, actionId
            );

            return {
                content: [{ type: "text" as const, text: redacted }],
            };
        } catch (error) {
            return {
                content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
                isError: true,
            };
        }
    }
);
```

**Location 2: handleToolsList() (~line 625)**
```typescript
const tools = [
    {
        name: "getCurrentWeather",
        description: "Get current weather. ⚠️ Costs 1 token.",
        inputSchema: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    minLength: 1,
                    description: "City name or coordinates",
                },
            },
            required: ["location"],
        },
    },
];
```

**Location 3: handleToolsCall() (~line 750)**
```typescript
switch (toolName) {
    case "getCurrentWeather":
        result = await executeCurrentWeatherTool(toolArgs, env, userId);
        break;
}
```

**Location 4: Create Executor Function (~line 770)**
```typescript
async function executeCurrentWeatherTool(
    args: Record<string, any>,
    env: Env,
    userId: string
): Promise<any> {
    const TOOL_COST = 1;
    const TOOL_NAME = "getCurrentWeather";
    const actionId = crypto.randomUUID();

    const balanceCheck = await checkBalance(env.TOKEN_DB, userId, TOOL_COST);

    if (balanceCheck.userDeleted) {
        return {
            content: [{ type: "text" as const, text: formatAccountDeletedError(TOOL_NAME) }],
            isError: true,
        };
    }

    if (!balanceCheck.sufficient) {
        return {
            content: [{
                type: "text" as const,
                text: formatInsufficientTokensError(TOOL_NAME, balanceCheck.currentBalance, TOOL_COST),
            }],
            isError: true,
        };
    }

    const apiClient = new WeatherApiClient(env);
    const result = await apiClient.getCurrentWeather(args.location);

    const sanitized = sanitizeOutput(JSON.stringify(result), { removeHtml: true, maxLength: 5000 });
    const { redacted, detectedPII } = redactPII(sanitized, {
        redactPhones: true,
        redactCreditCards: true,
        redactPESEL: true,
    });

    if (detectedPII.length > 0) {
        console.warn(`[Security] Detected: ${detectedPII.join(', ')}`);
    }

    await consumeTokensWithRetry(
        env.TOKEN_DB, userId, TOOL_COST,
        "weather-mcp", TOOL_NAME,
        args, redacted, true, actionId
    );

    return {
        content: [{ type: "text" as const, text: redacted }],
    };
}
```

### Verification Checklist

- [ ] Tool in `src/server.ts` (OAuth)
- [ ] Tool in `getOrCreateServer()` in `src/api-key-handler.ts`
- [ ] Schema in `handleToolsList()` in `src/api-key-handler.ts`
- [ ] Case in `handleToolsCall()` in `src/api-key-handler.ts`
- [ ] Executor function in `src/api-key-handler.ts`
- [ ] Identical token costs

### Input Validation

Validate BEFORE checking tokens:

```typescript
async ({ startDate, endDate }) => {
    // Validate first (free)
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
        return {
            content: [{ type: "text" as const, text: "Error: Invalid date range" }],
            isError: true
        };
    }

    // Now check tokens
    const balanceCheck = await checkBalance(/* ... */);
}
```

### Security Processing (Step 4.5)

Import in both files:
```typescript
import { sanitizeOutput, redactPII, validateOutput } from 'pilpat-mcp-security';
```

Complete pattern:
```typescript
// 4. Execute
const result = await apiClient.yourMethod(param1, param2);

// 4.5A: Sanitize
let processed = sanitizeOutput(JSON.stringify(result), {
    removeHtml: true,
    removeControlChars: true,
    normalizeWhitespace: true,
    maxLength: 5000
});

// 4.5B: Redact PII
const { redacted, detectedPII } = redactPII(processed, {
    redactEmails: false,        // v1.1.0+ default
    redactPhones: true,
    redactCreditCards: true,
    redactSSN: true,
    redactBankAccounts: true,
    redactPESEL: true,          // Polish National ID
    redactPolishIdCard: true,   // Polish ID card
    redactPolishPassport: true, // Polish passport
    redactPolishPhones: true,   // Polish phones
});
processed = redacted;

if (detectedPII.length > 0) {
    console.warn(`[Security] Redacted: ${detectedPII.join(', ')}`);
}

// 4.5C: Validate
const validation = validateOutput(processed, {
    maxLength: 5000,
    expectedType: 'string'
});

if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
}

// 5. Consume tokens (use processed)
await consumeTokensWithRetry(..., processed, ...);

// 6. Return (use processed)
return { content: [{ type: "text", text: processed }] };
```

### Security Checklist

- [ ] `pilpat-mcp-security@^1.1.0` in package.json
- [ ] Imports in `src/server.ts` AND `src/api-key-handler.ts`
- [ ] Step 4.5 in every tool (sanitize → redact → validate)
- [ ] Polish PII patterns enabled
- [ ] PII detection logged
- [ ] Processed output in Step 5 and 6
- [ ] Both paths have identical security

### Function Signature Reference

**CRITICAL:** Always check `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/skeleton-api-reference.md` for correct signatures.

Most commonly misused:
- `validateApiKey(apiKey: string, env: ApiKeyEnv): Promise<string | null>`
- `checkBalance(db: D1Database, userId: string, cost: number): Promise<BalanceCheck>`
- `consumeTokensWithRetry(db, userId, cost, serverName, toolName, input, output, success, actionId)`

**Anti-pattern (❌ WRONG):**
```typescript
const validation = await validateApiKey(env.TOKEN_DB, apiKey); // Wrong parameter order
```

**Correct pattern (✅ RIGHT):**
```typescript
const userId = await validateApiKey(apiKey, env);
if (!userId) return new Response('Invalid API key', { status: 401 });
```

## Step 6: Configure Centralized Authentication

Add USER_SESSIONS namespace to `wrangler.jsonc`.

### Get Shared IDs from CLOUDFLARE_CONFIG.md

```jsonc
{
  "binding": "USER_SESSIONS",
  "id": "e5ad189139cd44f38ba0224c3d596c73",
  "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"
}
```

### Add to wrangler.jsonc

```jsonc
{
  "name": "your-mcp-server",
  "kv_namespaces": [
    {
      "binding": "CACHE_KV",
      "id": "fa6ff790f146478e85ea77ae4a5caa4b",
      "preview_id": "4b37112559f2429191633d98781645ca"
    },
    {
      "binding": "OAUTH_KV",
      "id": "b77ec4c7e96043fab0c466a978c2f186",
      "preview_id": "cf8ef9f38ab24ae583d20dd4e973810c"
    },
    {
      "binding": "USER_SESSIONS",
      "id": "e5ad189139cd44f38ba0224c3d596c73",
      "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"
    }
  ]
}
```

### Verify USER_SESSIONS is Required

```typescript
// src/types.ts - Correct
USER_SESSIONS: KVNamespace;  // Required

// Wrong - don't do this
USER_SESSIONS?: KVNamespace;  // Optional
```

Check:
```bash
grep "USER_SESSIONS" src/types.ts
# Expected: USER_SESSIONS: KVNamespace;

grep "USER_SESSIONS?: KVNamespace" src/types.ts
# Expected: No output (should be required)
```

### AnythingLLM Configuration

Create configuration file:

```json
{
  "mcpServers": {
    "your-server": {
      "type": "streamable",
      "url": "https://your-server.wtyczki.ai/mcp",
      "headers": {
        "Authorization": "Bearer wtyk_YOUR_API_KEY_HERE"
      },
      "anythingllm": {
        "autoStart": true
      }
    }
  }
}
```

Test:
```bash
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

## Step 7: Update Configuration Files

### wrangler.jsonc

```jsonc
{
  "name": "weather-mcp",
  "migrations": [
    {
      "new_sqlite_classes": ["WeatherMCP"],
      "tag": "v1"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "WeatherMCP",
        "name": "MCP_OBJECT"
      }
    ]
  }
}
```

### package.json

```json
{
  "name": "weather-mcp",
  "description": "Weather MCP server with token integration"
}
```

## Step 8: Pre-Deployment Validation

**CRITICAL:** Run validation scripts before deployment to prevent common failures.

### Pre-Deployment Validation Sequence

```bash
# 1. Consistency check
bash ../../scripts/verify-consistency.sh

# 2. Runtime secrets (CRITICAL - BLOCKS DEPLOYMENT)
bash ../../scripts/validate-runtime-secrets.sh

# 3. Security integration (optional but recommended)
bash ../../scripts/verify-security-integration.sh

# 4. TypeScript compilation (using safe wrapper)
bash ../../scripts/safe-command.sh tsc --noEmit
```

**Never skip secret validation** - prevents 15% of silent production failures.

### Validation Scripts

All scripts are documented in `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/scripts/README.md`.

**Exit codes:**
- `0` = Pass (safe to deploy)
- `1` = Fail (fix issues before deployment)
- `2` = Critical error (some scripts)

### Common Issues

**Missing Secrets:**
```bash
# Configure missing secrets
echo "your_value" | wrangler secret put SECRET_NAME
```

**Consistency Errors:**
```bash
# Fix TOKEN_DB vs DB mismatch in wrangler.jsonc and src/types.ts
```

**Security Issues:**
```bash
# Auto-fix package installation and imports
bash ../../scripts/verify-security-integration.sh --fix
```

## Common Patterns

### Add Workers AI

```typescript
// src/types.ts
export interface Env {
    AI?: Ai;
}

// wrangler.jsonc
"ai": {
    "binding": "AI"
}

// src/server.ts
const response = await this.env.AI.run(
    "@cf/meta/llama-3-8b-instruct",
    { prompt: userPrompt }
);
```

### Add R2 Storage

```typescript
// src/types.ts
export interface Env {
    MY_BUCKET?: R2Bucket;
}

// wrangler.jsonc
"r2_buckets": [
    {
        "binding": "MY_BUCKET",
        "bucket_name": "my-bucket"
    }
]

// src/server.ts
await this.env.MY_BUCKET.put("key", data);
```

### Add State Management

```typescript
// src/types.ts
export type State = {
    conversationHistory: string[];
    userPreferences: Record<string, unknown>;
};

// src/server.ts
export class WeatherMCP extends McpAgent<Env, State, Props> {
    initialState: State = {
        conversationHistory: [],
        userPreferences: {},
    };

    async init() {
        // Access: this.state
        // Update: await this.setState({ ... })
    }
}
```

## Troubleshooting

### Type Errors

```bash
npm run cf-typegen
npx tsc --noEmit
```

### KV Namespace Not Found

Use shared IDs from CLOUDFLARE_CONFIG.md:
- CACHE_KV: fa6ff790f146478e85ea77ae4a5caa4b
- OAUTH_KV: b77ec4c7e96043fab0c466a978c2f186

### Authentication Fails

1. Check WorkOS credentials as production secrets
2. Verify redirect URI: `https://your-server.wtyczki.ai/callback`

### Token Database Error

- Database ID: `ebb389aa-2d65-4d38-a0da-50c7da9dfe8b`
- Binding name: `TOKEN_DB` (not `DB`)

## Next Steps

1. Run: `npx tsc --noEmit`
2. Deploy: `wrangler deploy`
3. Configure custom domain
4. Test at: https://playground.ai.cloudflare.com/

See [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for production deployment.