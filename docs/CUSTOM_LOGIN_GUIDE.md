# Centralized Custom Login Integration Guide

All MCP servers must integrate with centralized login at `panel.wtyczki.ai`.

## Session Data Structure

**Key:** `workos_session:{uuid}`

**Value (JSON):**
```json
{
  "user_id": "uuid-from-database",
  "email": "user@example.com",
  "workos_user_id": "workos-uuid",
  "access_token": "workos-access-token",
  "refresh_token": "workos-refresh-token",
  "created_at": 1234567890000,
  "expires_at": 1234826890000
}
```

**Cookie:** `workos_session={uuid}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=259200`

## Implementation

### Step 1: Get Shared KV Namespace IDs

Copy from `CLOUDFLARE_CONFIG.md`:

```jsonc
{
  "binding": "USER_SESSIONS",
  "id": "e5ad189139cd44f38ba0224c3d596c73",
  "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"
}
```

### Step 2: Update wrangler.jsonc

```jsonc
{
  "name": "your-mcp-server",
  "main": "src/index.ts",
  "compatibility_date": "2024-09-25",

  "kv_namespaces": [
    {
      "binding": "OAUTH_KV",
      "id": "your-oauth-kv-id",
      "preview_id": "your-oauth-preview-id"
    },
    {
      "binding": "USER_SESSIONS",
      "id": "e5ad189139cd44f38ba0224c3d596c73",
      "preview_id": "49c43fb4d6e242db87fd885ba46b5a1d"
    }
  ],

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "mcp-tokens-database",
      "database_id": "5e4ab4c8-2a57-4d02-aa13-0385d0cdc790"
    }
  ]
}
```

### Step 3: Update types.ts

```typescript
// src/types.ts
export interface Env {
    OAUTH_KV: KVNamespace;
    MCP_OBJECT: DurableObjectNamespace;
    DB: D1Database;
    WORKOS_CLIENT_ID: string;
    WORKOS_API_KEY: string;
    USER_SESSIONS: KVNamespace;  // Required
}
```

### Step 4: Modify /authorize Endpoint

```typescript
// src/authkit-handler.ts
app.get("/authorize", async (c) => {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
    if (!oauthReqInfo.clientId) {
        return c.text("Invalid request", 400);
    }

    // STEP 1: Check for session cookie
    const cookieHeader = c.req.header('Cookie');
    let sessionToken: string | null = null;

    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {} as Record<string, string>);
        sessionToken = cookies['workos_session'] || null;
    }

    // STEP 2: If no session, redirect to centralized login
    if (!sessionToken && c.env.USER_SESSIONS) {
        console.log('🔐 [OAuth] No session found, redirecting to centralized custom login');
        const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
        loginUrl.searchParams.set('return_to', c.req.url);
        return Response.redirect(loginUrl.toString(), 302);
    }

    // STEP 3: Validate session
    if (sessionToken && c.env.USER_SESSIONS) {
        const sessionData = await c.env.USER_SESSIONS.get(
            `workos_session:${sessionToken}`,
            'json'
        );

        if (!sessionData) {
            console.log('🔐 [OAuth] Invalid session, redirecting to centralized custom login');
            const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
            loginUrl.searchParams.set('return_to', c.req.url);
            return Response.redirect(loginUrl.toString(), 302);
        }

        const session = sessionData as {
            expires_at: number;
            user_id: string;
            email: string
        };

        // Check expiration
        if (session.expires_at < Date.now()) {
            console.log('🔐 [OAuth] Session expired, redirecting to centralized custom login');
            const loginUrl = new URL('https://panel.wtyczki.ai/auth/login-custom');
            loginUrl.searchParams.set('return_to', c.req.url);
            return Response.redirect(loginUrl.toString(), 302);
        }

        // STEP 4: Load user from database
        console.log(`✅ [OAuth] Valid session found for user: ${session.email}`);

        const dbUser = await getUserByEmail(c.env.DB, session.email);

        if (!dbUser) {
            console.log(`❌ [OAuth] User not found in database: ${session.email}`);
            return c.html(formatPurchaseRequiredPage(session.email), 403);
        }

        if (dbUser.is_deleted === 1) {
            console.log(`❌ [OAuth] Account deleted: ${session.email}`);
            return c.html(formatAccountDeletedPage(), 403);
        }

        // STEP 5: Complete OAuth authorization
        const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
            request: oauthReqInfo,
            userId: session.user_id,
            metadata: {},
            scope: [],
            props: {
                accessToken: '',
                organizationId: undefined,
                permissions: [],
                refreshToken: '',
                user: {
                    id: session.user_id,
                    email: session.email,
                    emailVerified: true,
                    profilePictureUrl: null,
                    firstName: null,
                    lastName: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    lastSignInAt: new Date().toISOString(),
                    locale: null,
                    externalId: null,
                    metadata: {},
                    object: 'user' as const,
                },
                userId: dbUser.user_id,  // Database user_id for token operations
                email: dbUser.email,
            } satisfies Props,
        });

        return Response.redirect(redirectTo);
    }

    // STEP 6: Fallback to WorkOS
    console.log('⚠️ [OAuth] No session handling - falling back to WorkOS');
    return Response.redirect(
        c.get("workOS").userManagement.getAuthorizationUrl({
            provider: "authkit",
            clientId: c.env.WORKOS_CLIENT_ID,
            redirectUri: new URL("/callback", c.req.url).href,
            state: btoa(JSON.stringify(oauthReqInfo)),
        }),
    );
});
```

### Step 5: Ensure /callback Uses Database user_id

```typescript
// In /callback handler, ensure:
props: {
    user: workosUser,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    permissions: [],
    organizationId: undefined,
    userId: dbUser.user_id,  // Database user_id
    email: dbUser.email,
}
```

## Token System Integration

Pass database user_id to Props:

```typescript
props: {
    // WorkOS data
    user: User,
    accessToken: string,
    refreshToken: string,
    permissions: string[],
    organizationId?: string,

    // Database user data (REQUIRED)
    userId: dbUser.user_id,
    email: dbUser.email,
}
```

Tool execution uses Props.userId:

```typescript
const userId = this.props?.userId;
const balanceCheck = await checkBalance(this.env.DB, userId, TOOL_COST);
await consumeTokensWithRetry(this.env.DB, userId, ...);
```

## Verification Checklist

- [ ] `USER_SESSIONS` KV namespace added to `wrangler.jsonc` with shared IDs
- [ ] `USER_SESSIONS` added to `Env` interface as required (not optional)
- [ ] `/authorize` checks for session cookie
- [ ] `/authorize` redirects to `https://panel.wtyczki.ai/auth/login-custom` if no session
- [ ] `/authorize` validates session from `USER_SESSIONS` KV
- [ ] `/authorize` queries database with `getUserByEmail(c.env.DB, session.email)`
- [ ] `/authorize` checks `dbUser.is_deleted` flag
- [ ] `/authorize` passes `dbUser.user_id` to `Props.userId`
- [ ] `/callback` queries database and passes `dbUser.user_id`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Deploy: `wrangler deploy`
- [ ] Test in Cloudflare Workers AI Playground

## Testing

### Deploy
```bash
wrangler deploy
```

### Test Authentication Flow

1. Open https://playground.ai.cloudflare.com/
2. Add MCP Server: `https://your-server.wtyczki.ai/sse`
3. Click "Connect"
4. Redirects to `https://panel.wtyczki.ai/auth/login-custom`
5. Enter email and 6-digit code
6. Redirects back, OAuth completes
7. Tools appear

### Test Session Sharing

1. Open NEW tab
2. Connect to different MCP server: `https://another-server.wtyczki.ai/sse`
3. No login prompt (session reused)
4. OAuth completes immediately

### Test Token Consumption

```bash
wrangler tail --format pretty
```

Expected logs:
```
✅ [OAuth] Valid session found for user: test@example.com
[Token Consumption] Balance check for user abc-123: 100 tokens
[Token Consumption] ✅ Success! User abc-123: 100 → 99 tokens
```

## Troubleshooting

### Redirect Loop

Check:
1. Cookie domain is `.wtyczki.ai`
2. Cookie exists in DevTools → Application → Cookies
3. `SameSite=Lax` not `Strict`

### User Not Found

```bash
wrangler d1 execute DB --command="SELECT * FROM users WHERE email = 'test@example.com'"
```

### Invalid Session

Verify:
1. USER_SESSIONS namespace ID matches CLOUDFLARE_CONFIG.md
2. Session key format: `workos_session:{uuid}`

### Token Operations Fail

Check:
1. Props uses `dbUser.user_id` not `workosUser.id`
2. Database query happens before `completeAuthorization()`
3. Log: `console.log('Props.userId:', this.props?.userId);`