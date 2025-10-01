# Jira OAuth Configuration

This extension supports OAuth authentication with Jira, but requires system-level configuration of OAuth credentials.

## Setup Instructions

### 1. Create Atlassian OAuth App

1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click "Create" → "OAuth 2.0 integration"
3. Fill in your app details:
   - **App name**: Mirai Editor (or your preferred name)
   - **Description**: Jira integration for Mirai Editor
4. Add permissions:
   - **Jira API**: `read:jira-user`, `read:jira-work`, `write:jira-work`
5. Set the **Callback URL** to: `mirai://mirai.mirai-jira/oauth-callback`
6. Save your app and note down the **Client ID** and **Client Secret**

### 2. Configure OAuth Credentials

**Option A: Using Config File (Recommended for Development)**

1. Copy `oauth.config.js` to `oauth.config.local.js`
2. Edit `oauth.config.local.js` and replace the placeholder values:
   ```javascript
   module.exports = {
       JIRA_CLIENT_ID: 'your_actual_client_id_here',
       JIRA_CLIENT_SECRET: 'your_actual_client_secret_here',
       JIRA_REDIRECT_URI: 'mirai://mirai.mirai-jira/oauth-callback'
   };
   ```
3. Rename the file back to `oauth.config.js`

**Option B: Using Environment Variables (Recommended for Production)**

Set these environment variables before building/running Mirai:

```bash
export JIRA_CLIENT_ID="your_actual_client_id_here"
export JIRA_CLIENT_SECRET="your_actual_client_secret_here"
```

### 3. Security Notes

- **Never commit `oauth.config.js` with real credentials to version control**
- The config file is already in `.gitignore` to prevent accidental commits
- For production builds, use environment variables instead of config files
- Users will never see these credentials - they only see a "Login with Jira" button

### 4. User Experience

Once configured, users will see:
- **🔐 Login with Jira** - For OAuth authentication (no setup required by user)
- **🔑 Setup Personal Token** - For manual token entry

The OAuth flow is completely transparent to users - they just click "Login with Jira" and authenticate in their browser.

## Important Notes

### OAuth vs API Tokens

**OAuth (Recommended when configured):**
- ✅ One-click authentication
- ✅ More secure (no permanent tokens)
- ✅ Automatic token refresh
- ❌ Requires app registration and approval
- ❌ More complex setup for developers

**API Tokens (Always available):**
- ✅ Simple setup for users
- ✅ No developer configuration required
- ✅ Works immediately
- ❌ Manual token management
- ❌ Users need to generate tokens manually

### Jira Cloud vs Server

This OAuth implementation is designed for **Jira Cloud** only. For Jira Server/Data Center, users should use API tokens.

## Troubleshooting

- **"OAuth not configured"**: Make sure your credentials are properly set in `oauth.config.js` or environment variables
- **"Token exchange failed"**: Verify your Client ID and Secret are correct
- **"Redirect URI mismatch"**: Ensure your Atlassian app's callback URL exactly matches `mirai://mirai.mirai-jira/oauth-callback`
- **"No accessible resources"**: Make sure the user has access to at least one Jira Cloud instance
- **Scope errors**: Ensure your app has the required permissions: `read:jira-user`, `read:jira-work`, `write:jira-work`

## Required Permissions

Your Atlassian app needs these scopes:
- `read:jira-user` - Read user profile information
- `read:jira-work` - Read issues, projects, and other work items
- `write:jira-work` - Create and update issues

## Testing OAuth Flow

1. Set up credentials as described above
2. Build and run Mirai
3. Open the Jira extension
4. Click "Login with Jira"
5. You should be redirected to Atlassian's OAuth page
6. After authorization, you should be redirected back to Mirai

If any step fails, check the developer console for error messages and verify your configuration.

