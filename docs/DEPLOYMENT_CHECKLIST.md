# Production Deployment Checklist

## Pre-Deployment

### ✅ Pre-Deployment Validation (Phase 1-3 Improvements)

Run validation scripts in sequence:

```bash
# Phase 1: Runtime Secret Validation (CRITICAL - BLOCKS DEPLOYMENT)
bash ../scripts/validate-runtime-secrets.sh
# Exit code 0 = pass, 1 = missing secrets

# Phase 1: Consistency Check
bash ../scripts/verify-consistency.sh
# Exit code 0 = pass, 1 = configuration errors

# Phase 2: Security Integration Verification (optional)
bash ../scripts/verify-security-integration.sh
# Exit code 0 = pass (6/6), 1 = issues, 2 = critical

# Phase 1: TypeScript Compilation (using safe wrapper)
bash ../scripts/safe-command.sh tsc --noEmit
# Exit code 0 = pass, non-zero = compilation errors
```

**Documentation:** See `/Users/patpil/Documents/ai-projects/Cloudflare_mcp/scripts/README.md`

**Critical Checks:**
- [ ] Runtime secrets validated (`validate-runtime-secrets.sh`)
- [ ] Consistency check passed (`verify-consistency.sh`)
- [ ] Security integration verified (`verify-security-integration.sh`)
- [ ] TypeScript compilation passed (via `safe-command.sh`)
- [ ] All validation exit codes = 0
- [ ] All `// TODO:` completed or documented
- [ ] wrangler.jsonc configured

### ✅ Authentication Configuration

- [ ] USER_SESSIONS in `wrangler.jsonc` (ID: `e5ad189139cd44f38ba0224c3d596c73`)
- [ ] USER_SESSIONS required in `src/types.ts` (not optional)
- [ ] Consistency script: `./scripts/verify-consistency.sh`
- [ ] Verify required:
  ```bash
  ! grep -q "USER_SESSIONS?: KVNamespace" src/types.ts && echo "✅ Required"
  ```

### ✅ Code Quality

- [ ] All `// TODO:` completed
- [ ] Server name updated (OpenSkyMcp → YourMCP)
- [ ] Token costs set appropriately
- [ ] Error messages user-friendly (Polish)
- [ ] API client implemented
- [ ] Input validation before token checks
- [ ] Error handling in all tools

### ✅ Configuration Files

- [ ] `wrangler.jsonc`:
  - [ ] Server name
  - [ ] Class names in migrations
  - [ ] Class names in durable_objects
  - [ ] KV namespace ID
  - [ ] D1 database binding
- [ ] `package.json` updated
- [ ] `.gitignore` includes `.dev.vars`
- [ ] `.dev.vars.example` documented

### ✅ WorkOS Configuration

- [ ] WorkOS application created
- [ ] Redirect URI: `https://your-server.wtyczki.ai/callback`
- [ ] Client ID and API Key ready
- [ ] Magic Auth enabled

## Deployment Steps

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial MCP server implementation"
git remote add origin https://github.com/patpil-cloudflare-mcp/your-server-mcp.git
git push -u origin main
```

**Checklist:**
- [ ] Repository created on GitHub
- [ ] Added to `deployed-servers.md`
- [ ] Code pushed
- [ ] `.dev.vars` NOT committed
- [ ] Branch is `main`

### Step 2: Configure Secrets

```bash
wrangler secret put WORKOS_CLIENT_ID
wrangler secret put WORKOS_API_KEY
wrangler secret put YOUR_API_KEY  # If needed
```

**Checklist:**
- [ ] WORKOS_CLIENT_ID set
- [ ] WORKOS_API_KEY set
- [ ] Custom API keys set
- [ ] Verify: `wrangler secret list`

### Step 3: Create KV Namespace

```bash
wrangler kv namespace create OAUTH_KV
# Update wrangler.jsonc with production ID
```

**Checklist:**
- [ ] KV namespace created
- [ ] ID in `wrangler.jsonc`
- [ ] Binding name is `OAUTH_KV`

### Step 4: Deploy Worker

```bash
npx tsc --noEmit
wrangler deploy
```

**Checklist:**
- [ ] Type check passed
- [ ] Deployment successful
- [ ] Workers.dev URL received
- [ ] No errors
- [ ] Worker in Dashboard

### Step 5: Configure Custom Domain

In Cloudflare Dashboard:
1. Workers & Pages → Your Worker → Settings → Domains & Routes
2. Add Custom Domain
3. Enter: `your-server.wtyczki.ai`

**Checklist:**
- [ ] Custom domain added
- [ ] DNS records created (automatic)
- [ ] SSL certificate provisioned
- [ ] Status: Active
- [ ] Domain on `wtyczki.ai`

### Step 6: Set Up GitHub Integration

Follow `GITHUB_INTEGRATION_GUIDE.md`.

**Checklist:**
- [ ] Repository connected to Cloudflare
- [ ] Test commit triggers deployment
- [ ] Cloudflare Dashboard shows deployment
- [ ] GitHub check run green

### Step 7: Test GitHub Integration

```bash
echo "# GitHub Integration Verified" >> README.md
git add README.md
git commit -m "test: Verify GitHub integration"
git push origin main
```

Monitor in Dashboard → Deployments.

**Checklist:**
- [ ] Commit pushed
- [ ] Deployment triggered
- [ ] Build logs visible
- [ ] Deployment completed
- [ ] GitHub check run success
- [ ] No manual deploy needed

### Step 8: Update WorkOS Redirect URI

In WorkOS Dashboard:
1. Applications → Your Application → Configuration
2. Redirect URI: `https://your-server.wtyczki.ai/callback`
3. Save

**Checklist:**
- [ ] Production callback configured
- [ ] Changes saved

### Step 9: Test Production Deployment

#### Test 1: Basic Connectivity

```bash
curl -I https://your-server.wtyczki.ai/sse
curl -I https://your-server.wtyczki.ai/mcp
curl -I https://your-server.wtyczki.ai/authorize
```

**Checklist:**
- [ ] `/sse` responds
- [ ] `/mcp` responds
- [ ] `/authorize` responds

#### Test 2: Cloudflare Workers AI Playground

1. Open https://playground.ai.cloudflare.com/
2. Set model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
3. Connect SSE: `https://your-server.wtyczki.ai/sse`
4. Complete OAuth
5. Verify Connected
6. Verify tools listed
7. Connect MCP: `https://your-server.wtyczki.ai/mcp`
8. Complete OAuth
9. Verify Connected
10. Test tool execution

**Test Centralized Login:**
1. Connect to server
2. Verify redirect to `https://panel.wtyczki.ai/auth/login-custom`
3. **Not** `exciting-domain-65.authkit.app`
4. If wrong, check:
   - `wrangler.jsonc` has USER_SESSIONS
   - `src/types.ts` has required (not optional)
   - Run `./scripts/verify-consistency.sh`
   - Redeploy

**Test Token System:**
```bash
wrangler tail --format pretty | grep -i token

wrangler d1 execute mcp-tokens-database --command="
  SELECT user_id, tool_name, tokens_consumed, created_at
  FROM mcp_actions
  WHERE mcp_server_name = 'your-server-mcp'
  ORDER BY created_at DESC
  LIMIT 10"
```

**OAuth Checklist:**
- [ ] Playground connects
- [ ] SSE connects
- [ ] MCP connects
- [ ] OAuth completes
- [ ] Tools listed
- [ ] Tools execute
- [ ] Results returned
- [ ] Tokens deducted
- [ ] Transactions logged
- [ ] Non-database users get 403
- [ ] Polish error for insufficient balance

#### Test 3: API Key Authentication

**Validate API Key:**
```bash
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_VALID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# Expected: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05",...}}

curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_invalid_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"initialize","params":{}}'

# Expected: {"error":"Invalid or expired API key","status":401}
```

**Tools List:**
```bash
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_VALID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}'
```

**Tool Execution:**
```bash
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_YOUR_VALID_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"simpleLookup","arguments":{"query":"test"}}}'
```

**Verify Tokens:**
```bash
wrangler d1 execute mcp-tokens-database --command="
  SELECT user_id, tool_name, tokens_consumed, success, created_at
  FROM mcp_actions
  WHERE mcp_server_name = 'your-server-mcp'
  AND created_at > datetime('now', '-5 minutes')
  ORDER BY created_at DESC
  LIMIT 10"
```

**AnythingLLM (Optional):**
```json
{
  "mcpServers": {
    "your-server": {
      "type": "streamable",
      "url": "https://your-server.wtyczki.ai/mcp",
      "headers": {
        "Authorization": "Bearer wtyk_YOUR_API_KEY"
      },
      "anythingllm": {
        "autoStart": true
      }
    }
  }
}
```

**API Key Checklist:**
- [ ] Valid key authenticates
- [ ] Invalid key returns 401
- [ ] Expired key returns 401
- [ ] Deleted user returns 404
- [ ] Tools list correct
- [ ] Tool execution works
- [ ] Tokens deducted
- [ ] Transactions logged
- [ ] Insufficient balance shows Polish error
- [ ] Both paths identical
- [ ] AnythingLLM connects (if tested)

### Step 10: Update Deployment Registry

```bash
cd /Users/patpil/Documents/ai-projects/Cloudflare_mcp

# Edit deployed-servers.md
# Add row with server info

git add deployed-servers.md
git commit -m "docs: Add [server-name] to deployment registry"
git push origin main
```

**Checklist:**
- [ ] Entry added to `deployed-servers.md`
- [ ] GitHub Integration: ✅ Connected
- [ ] All fields filled
- [ ] Committed to main

### Step 11: Monitor Initial Usage

```bash
wrangler tail --format pretty
wrangler tail --format pretty | grep -i error
wrangler tail --format pretty | grep "Token"
```

**Monitor:**
- [ ] OAuth flows
- [ ] Tool executions
- [ ] Token deductions
- [ ] Errors/warnings
- [ ] Performance

## Post-Deployment

### ✅ GitHub Integration Verification

```bash
echo "// Test comment" >> src/server.ts
git add src/server.ts
git commit -m "test: Verify auto-deployment workflow"
git push origin main
```

**Checklist:**
- [ ] Push triggers deployment
- [ ] Build completes
- [ ] GitHub check success
- [ ] No manual deploy
- [ ] Visible in Dashboard

### ✅ Branch Protection

In GitHub: Settings → Branches → Add rule for `main`:
- ✅ Require pull request reviews
- ✅ Require status checks (Cloudflare Workers)
- ✅ Require branches up to date

**Checklist:**
- [ ] Branch protection enabled
- [ ] PR reviews required
- [ ] Status checks required
- [ ] Team notified

### ✅ Documentation Updates

- [ ] README with production URL
- [ ] Both endpoints documented
- [ ] Client configuration examples
- [ ] Available tools documented
- [ ] Token costs documented
- [ ] GitHub integration documented

### ✅ Database Verification

```sql
SELECT COUNT(*) FROM mcp_actions
WHERE mcp_server_name = 'your-server-name'
AND created_at > datetime('now', '-1 hour');

SELECT user_id, tool_name, tokens_consumed, success, created_at
FROM mcp_actions
WHERE mcp_server_name = 'your-server-name'
ORDER BY created_at DESC
LIMIT 10;
```

**Checklist:**
- [ ] Transactions logged
- [ ] User IDs correct
- [ ] Token amounts correct
- [ ] Success flags accurate

### ✅ Performance Monitoring

Check Dashboard: Workers & Pages → Your Worker → Metrics

**Checklist:**
- [ ] Response times <1s
- [ ] No error spikes
- [ ] CPU usage reasonable
- [ ] No timeouts

### ✅ Security Verification

#### Phase 1: Authentication & Authorization

- [ ] OAuth working
- [ ] Database checks enforced
- [ ] Token validation working
- [ ] No CORS issues
- [ ] HTTPS enforced
- [ ] Secrets not exposed
- [ ] Can't access without auth
- [ ] Can't bypass token checks
- [ ] Invalid tokens rejected
- [ ] SQL injection prevented

#### Phase 2: Output Sanitization & PII Redaction

**Package Verification:**
```bash
grep "pilpat-mcp-security" package.json
# Expected: "pilpat-mcp-security": "^1.1.0"
```

- [ ] `pilpat-mcp-security` v1.1.0+
- [ ] Imports in server.ts and api-key-handler.ts

**HTML Sanitization:**
Test: `<script>alert('XSS')</script>Hello World`
Expected: `Hello World`

- [ ] Script tags removed
- [ ] HTML entities normalized
- [ ] Control characters stripped
- [ ] Output clean

**US/International PII:**
```bash
# Credit Card
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_XXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"processWithSecurity","arguments":{"data":"Card: 4532-1111-2222-3333"}}}'
# Expected: Card: [REDACTED]

# SSN
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_XXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"processWithSecurity","arguments":{"data":"SSN: 123-45-6789"}}}'
# Expected: SSN: [REDACTED]
```

- [ ] Credit cards redacted
- [ ] SSN redacted
- [ ] Phones redacted
- [ ] Bank accounts redacted

**Polish PII:**
```bash
# PESEL
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_XXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"processWithSecurity","arguments":{"data":"PESEL: 44051401359"}}}'
# Expected: PESEL: [REDACTED]

# Polish ID
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_XXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"processWithSecurity","arguments":{"data":"ID Card: ABC123456"}}}'
# Expected: ID Card: [REDACTED]

# Polish Phone
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_XXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"processWithSecurity","arguments":{"data":"Phone: +48 123 456 789"}}}'
# Expected: Phone: [REDACTED]
```

- [ ] PESEL redacted
- [ ] Polish ID redacted
- [ ] Polish passports redacted
- [ ] Polish phones redacted
- [ ] NIP redacted
- [ ] REGON redacted

**Email Default (v1.1.0+):**
```bash
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_XXX" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"processWithSecurity","arguments":{"data":"Contact: support@example.com"}}}'
# Expected: Contact: support@example.com (preserved)
```

- [ ] Emails preserved by default
- [ ] `redactEmails: false` default
- [ ] Business logic works

**PII Logging:**
```bash
wrangler tail --format pretty | grep -i "Security.*PII"
# Expected: [Security] Tool processWithSecurity: Redacted PII types: ['creditCard', 'pesel']
```

- [ ] PII events logged
- [ ] Detected types listed
- [ ] No PII values in logs
- [ ] Logs in Dashboard

**Dual Auth Security:**
Test in both OAuth (Playground) and API key (curl) paths.

- [ ] Security in OAuth path
- [ ] Security in API key path
- [ ] Identical output
- [ ] Both log PII

**Output Validation:**
```bash
# Test length limit
curl -X POST https://your-server.wtyczki.ai/mcp \
  -H "Authorization: Bearer wtyk_XXX" \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/call\",\"params\":{\"name\":\"processWithSecurity\",\"arguments\":{\"data\":\"$(python3 -c 'print(\"A\" * 10000)')\",\"max_length\":5000}}}"
# Expected: Truncated to 5000
```

- [ ] Length limits enforced
- [ ] Type validation working
- [ ] Invalid output rejected
- [ ] Errors descriptive

**Security Summary:**
- [ ] pilpat-mcp-security v1.1.0+
- [ ] Imports in both files
- [ ] HTML sanitization working
- [ ] US PII redaction working
- [ ] Polish PII redaction working
- [ ] Email preservation working
- [ ] PII detection logged
- [ ] Both auth paths secure
- [ ] Output validation enforced
- [ ] No sensitive data leaked

### ✅ Client Testing

Test with Cloudflare Workers AI Playground:
- [ ] Connection successful
- [ ] Both transports tested
- [ ] OAuth working
- [ ] Tools execute
- [ ] Token system functioning

## Validation Troubleshooting

### Script Exit Codes

All validation scripts use standardized exit codes:
- `0` - Success/Pass
- `1` - Failure/Warnings (check output)
- `2` - Critical Error (for some scripts)

### Common Issues

**Missing Secrets:**
```bash
# Detected by validate-runtime-secrets.sh
# Solution: Configure missing secrets
echo "value" | wrangler secret put SECRET_NAME
```

**Consistency Errors:**
```bash
# Detected by verify-consistency.sh
# Common: TOKEN_DB vs DB binding mismatch
# Solution: Update wrangler.jsonc and src/types.ts
```

**Security Integration Issues:**
```bash
# Detected by verify-security-integration.sh
# Solution: Auto-fix common issues
bash ../scripts/verify-security-integration.sh --fix
```

**TypeScript Compilation Failures:**
```bash
# Use safe-command.sh wrapper (handles npx issues)
bash ../scripts/safe-command.sh tsc --noEmit
```

**For detailed troubleshooting:** See `scripts/README.md`

## Rollback Plan

### Option 1: Revert Commit

```bash
git revert HEAD
git push origin main
```

### Option 2: Manual Rollback

```bash
wrangler deployments list
wrangler rollback --deployment-id <id>
```

### Option 3: Fix Forward

```bash
git checkout -b fix/deployment-issue
# Fix issue
npx tsc --noEmit
git add .
git commit -m "fix: Resolve deployment issue"
git push origin fix/deployment-issue
# Create PR → Merge
```

### Option 4: Hotfix

```bash
git checkout -b hotfix/critical-issue
# Fix issue
npx tsc --noEmit
git add .
git commit -m "hotfix: Critical production issue"
git push origin hotfix/critical-issue
# Create PR → Merge or direct push
```

## Common Issues

### Domain SSL Not Provisioning

Wait 10-15 minutes. If failing:
- [ ] DNS pointed to Cloudflare
- [ ] Domain active
- [ ] No conflicting DNS

### OAuth Redirects Failing

- [ ] Redirect URI matches exactly
- [ ] Includes `/callback`
- [ ] Uses `https://`
- [ ] No trailing slash

### 403 for Valid Users

- [ ] User email in database
- [ ] Email matches (case-sensitive)
- [ ] Database binding configured
- [ ] D1 ID correct

### Tools Not Appearing

- [ ] Durable Object migrations correct
- [ ] Class names match
- [ ] Tools in `init()` method
- [ ] No JS errors in logs

### Token Deduction Not Working

- [ ] Database binding configured
- [ ] Database ID correct
- [ ] `consumeTokensWithRetry()` called
- [ ] User ID in `this.props`

## Maintenance

### Regular Checks

- [ ] Check error logs (weekly)
- [ ] Monitor token usage (weekly)
- [ ] Verify database transactions (weekly)
- [ ] Check performance metrics (weekly)
- [ ] Update dependencies (monthly)

### Monitoring Queries

```sql
-- Weekly usage
SELECT
    DATE(created_at) as date,
    COUNT(*) as requests,
    SUM(tokens_consumed) as tokens
FROM mcp_actions
WHERE mcp_server_name = 'your-server'
AND created_at > datetime('now', '-7 days')
GROUP BY DATE(created_at);

-- Error rate
SELECT
    success,
    COUNT(*) as count
FROM mcp_actions
WHERE mcp_server_name = 'your-server'
AND created_at > datetime('now', '-1 day')
GROUP BY success;
```

## Success Criteria

- ✅ Both endpoints respond
- ✅ Playground connects
- ✅ OAuth completes
- ✅ Database user check working
- ✅ Tools execute
- ✅ Tokens deducted
- ✅ Transactions logged
- ✅ Custom domain active with SSL
- ✅ No production errors
- ✅ Performance acceptable

---

**Deployment Complete!** 🚀

Production URLs:
- SSE: `https://your-server.wtyczki.ai/sse`
- MCP: `https://your-server.wtyczki.ai/mcp`

Daily workflow:
```bash
# Make changes
# Test: npx tsc --noEmit
git add .
git commit -m "feat: Your change"
git push origin main
# Auto-deployment happens
```