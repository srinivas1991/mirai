# Figma OAuth Configuration

This extension supports OAuth authentication with Figma, but requires system-level configuration of OAuth credentials.

## Setup Instructions

### 1. Create Figma OAuth App

1. Go to [Figma Developer Apps](https://www.figma.com/developers/apps)
2. Click "Create new app"
3. Fill in your app details:
   - **App name**: Mirai Editor (or your preferred name)
   - **Description**: Figma integration for Mirai Editor
4. Set the **Redirect URI** to: `mirai://mirai.mirai-figma/oauth-callback`
   - Note: This URI is automatically adjusted based on your system configuration
5. Save your app and note down the **Client ID** and **Client Secret**

### 2. Configure OAuth Credentials

**Option A: Using Config File (Recommended for Development)**

1. Copy `oauth.config.js` to `oauth.config.local.js`
2. Edit `oauth.config.local.js` and replace the placeholder values:
   ```javascript
   module.exports = {
       FIGMA_CLIENT_ID: 'your_actual_client_id_here',
       FIGMA_CLIENT_SECRET: 'your_actual_client_secret_here'
   };
   ```
   - Note: FIGMA_REDIRECT_URI is no longer needed; it's generated automatically
3. Rename the file back to `oauth.config.js`

**Option B: Using Environment Variables (Recommended for Production)**

Set these environment variables before building/running Mirai:

```bash
export FIGMA_CLIENT_ID="your_actual_client_id_here"
export FIGMA_CLIENT_SECRET="your_actual_client_secret_here"
```

### 3. Security Notes

- **Never commit `oauth.config.js` with real credentials to version control**
- The config file is already in `.gitignore` to prevent accidental commits
- For production builds, use environment variables instead of config files
- Users will never see these credentials - they only see a "Login with Figma" button

### 4. User Experience

Once configured, users will see:
- **🔑 Setup Personal Token** - For manual token entry
- **🔐 Login with Figma** - For OAuth authentication (no setup required by user)

The OAuth flow is completely transparent to users - they just click "Login with Figma" and authenticate in their browser.

## Troubleshooting

- **"OAuth not configured"**: Make sure your credentials are properly set in `oauth.config.js` or environment variables
- **"Token exchange failed"**: Verify your Client ID and Secret are correct
- **"Redirect URI mismatch"**: Ensure your Figma app's redirect URI exactly matches `mirai://mirai.mirai-figma/oauth-callback`



