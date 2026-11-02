# Secrets Configuration Guide

This document describes the required secrets for the automated model management system.

## Required GitHub Secrets

The CI workflow (`.github/workflows/model-catalog-sync.yml`) requires the following secrets to be configured in your GitHub repository:

### Provider API Keys

| Secret Name | Provider | Required | Description |
|-------------|----------|----------|-------------|
| `OPENAI_API_KEY` | OpenAI | Yes | API key for OpenAI model discovery |
| `ANTHROPIC_API_KEY` | Anthropic | Yes | API key for Anthropic model discovery |
| `GOOGLE_API_KEY` | Google | Yes | API key for Google/Gemini model discovery |
| `GROQ_API_KEY` | Groq | Yes | API key for Groq model discovery |
| `CEREBRAS_API_KEY` | Cerebras | Yes | API key for Cerebras model discovery |
| `NVIDIA_API_KEY` | NVIDIA | Yes | API key for NVIDIA model discovery |

### GitHub Access

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `GITHUB_TOKEN` | Auto-provided | Automatically provided by GitHub Actions for PR creation |

## How to Configure Secrets

### 1. Navigate to Repository Settings

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**

### 2. Add Each Secret

For each provider API key:

1. **Name**: Enter the exact secret name (e.g., `OPENAI_API_KEY`)
2. **Value**: Paste your API key
3. Click **Add secret**

### 3. Verify Configuration

After adding all secrets, you should see:

```
✓ OPENAI_API_KEY
✓ ANTHROPIC_API_KEY
✓ GOOGLE_API_KEY
✓ GROQ_API_KEY
✓ CEREBRAS_API_KEY
✓ NVIDIA_API_KEY
```

## Obtaining API Keys

### OpenAI
1. Visit https://platform.openai.com/api-keys
2. Click **Create new secret key**
3. Copy the key (you won't be able to see it again)

### Anthropic
1. Visit https://console.anthropic.com/settings/keys
2. Click **Create Key**
3. Copy the key

### Google (Gemini)
1. Visit https://makersuite.google.com/app/apikey
2. Click **Create API key**
3. Copy the key

### Groq
1. Visit https://console.groq.com/keys
2. Click **Create API Key**
3. Copy the key

### Cerebras
1. Visit https://cloud.cerebras.ai/
2. Navigate to API Keys section
3. Create and copy key

### NVIDIA
1. Visit https://build.nvidia.com/
2. Navigate to API Keys
3. Create and copy key

## Security Best Practices

### ✅ Do

- **Rotate keys regularly** (every 90 days recommended)
- **Use separate keys** for CI/CD vs development
- **Monitor usage** through provider dashboards
- **Revoke immediately** if compromised
- **Use read-only keys** where possible

### ❌ Don't

- **Never commit keys** to version control
- **Never share keys** in chat/email
- **Never use production keys** in development
- **Never log keys** in CI output
- **Never store keys** in code comments

## Testing Secrets Configuration

### Manual Test

Run the workflow manually to verify secrets are configured correctly:

1. Go to **Actions** → **Model Catalog Sync**
2. Click **Run workflow**
3. Select branch and click **Run workflow**
4. Check logs for any authentication errors

### Expected Output

If secrets are configured correctly, you should see:

```
Discovery complete: X models
Changes detected: true/false
```

If secrets are missing or invalid:

```
Error: Missing API key for provider: [provider-name]
Error: Authentication failed for [provider-name]
```

## Troubleshooting

### Error: "Missing API key"

**Cause**: Secret not configured or wrong name

**Solution**:
1. Verify secret name matches exactly (case-sensitive)
2. Check secret is added to repository (not organization)
3. Ensure workflow has access to secrets

### Error: "Authentication failed"

**Cause**: Invalid or expired API key

**Solution**:
1. Verify key is correct (no extra spaces)
2. Check key hasn't been revoked
3. Verify key has required permissions
4. Try regenerating the key

### Error: "Rate limit exceeded"

**Cause**: Too many requests to provider API

**Solution**:
1. Check if key is being used elsewhere
2. Reduce workflow frequency
3. Contact provider for rate limit increase

## Monitoring

### Usage Tracking

Monitor API usage through provider dashboards:

- **OpenAI**: https://platform.openai.com/usage
- **Anthropic**: https://console.anthropic.com/settings/usage
- **Google**: https://console.cloud.google.com/apis/dashboard

### Cost Alerts

Set up billing alerts in each provider dashboard to avoid unexpected charges:

1. Navigate to billing settings
2. Set monthly budget limit
3. Configure email alerts at 50%, 75%, 90%

## Key Rotation Procedure

When rotating keys:

1. **Generate new key** in provider dashboard
2. **Update GitHub secret** with new key
3. **Test workflow** with manual run
4. **Revoke old key** after confirming new key works
5. **Document rotation** in audit log

## Support

For issues with:

- **GitHub Secrets**: Contact GitHub Support
- **Provider API Keys**: Contact provider support
- **Workflow Configuration**: See `.github/workflows/model-catalog-sync.yml`

---

**Last Updated**: 2026-02-24  
**Maintained By**: Model Management Team
