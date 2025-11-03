# GitHub Integration

This MCP server uses **Cloudflare Workers Builds** for deployment (recommended).

## Why No Workflows Folder?

**Workers Builds** is Cloudflare's native CI/CD solution that:
- ✅ Requires **zero configuration files**
- ✅ Requires **no GitHub secrets**
- ✅ Auto-deploys on every push to `main`
- ✅ Provides automatic PR preview deployments
- ✅ Posts build status as GitHub check runs

## How to Set Up Workers Builds

Follow the detailed instructions in `/GITHUB_INTEGRATION_GUIDE.md` → **Method 1: Workers Builds**.

**Quick Setup:**
1. Deploy worker once: `wrangler deploy`
2. Open Cloudflare Dashboard → Workers & Pages → Your Worker
3. Go to **Settings** → **Builds** → **Connect**
4. Select your GitHub repository
5. Configure:
   - Production Branch: `main`
   - Deploy Command: `npx wrangler deploy`

Done! Now every push to `main` automatically deploys.

## Alternative: GitHub Actions

If you need custom build logic or self-hosted runners, you can use GitHub Actions instead:

1. Follow `/GITHUB_INTEGRATION_GUIDE.md` → **Method 2: GitHub Actions**
2. Create `.github/workflows/deploy.yml` (template provided in guide)
3. Add repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

**Note:** Most MCP servers should use Workers Builds. Only use GitHub Actions if you have specific requirements that Workers Builds cannot fulfill.

## Current Servers

Check `/deployed-servers.md` to see which deployment method each server uses:
- ✅ Connected = Workers Builds (recommended)
- 🔧 Actions = GitHub Actions (advanced use case)
