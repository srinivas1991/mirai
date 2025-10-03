# Custom GitHub Authentication Provider

This extension now includes a **custom GitHub authentication provider** that uses your own GitHub OAuth app, so users will see "**Authorize Mirai**" instead of "Authorize Visual Studio Code".

## 🎯 Why Custom Authentication?

- **Branding**: Shows "Authorize Mirai" in the GitHub OAuth flow
- **Control**: Uses your own GitHub OAuth app credentials
- **Integration**: Stores tokens in your Mirai database
- **Security**: Tokens are managed by your server infrastructure

## 🏗️ Architecture

### Server-Side (Mirai Server)

**New Routes Created:**

1. **`/auth/github/vscode`** - Initiates GitHub OAuth flow
   - Takes `redirect` and `state` parameters
   - Redirects to GitHub OAuth with your app's CLIENT_ID
   - Shows "Authorize Mirai" to the user

2. **`/auth/github/vscode/callback`** - Handles GitHub OAuth callback
   - Exchanges code for GitHub access token
   - Creates/updates user in database with GitHub token
   - Redirects back to VS Code with encrypted token

### VS Code Extension

**Components:**

1. **`MiraiGitHubAuthenticationProvider`** - Custom auth provider
   - Registered as `mirai-github` auth provider
   - Handles OAuth flow with your server
   - Stores GitHub access tokens securely
   - Implements `vscode.AuthenticationProvider` interface

2. **`GitHubRepoService`** - Updated to use custom provider
   - Now uses `mirai-github` instead of built-in `github` provider
   - Fetches repos using your authenticated tokens

## 🔧 Setup Requirements

### 1. GitHub OAuth App

Create a GitHub OAuth app at: https://github.com/settings/developers

**Settings:**
- **Application name**: Mirai (or your preferred name)
- **Homepage URL**: `http://localhost:5173` (your server URL)
- **Authorization callback URL**: `http://localhost:5173/auth/github/vscode/callback`

**Important**: This is what users will see when authorizing!

### 2. Environment Variables

Add to your Mirai server `.env`:

```bash
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

### 3. Database Schema

Your Prisma schema should have these fields on the User model:

```prisma
model User {
  // ... other fields

  githubAccessToken   String?   @db.Text
  githubUsername      String?
  githubConnectedAt   DateTime?
}
```

## 📝 How It Works

### OAuth Flow

```
1. User clicks "Refresh GitHub Repositories" in VS Code
   ↓
2. VS Code opens: http://localhost:5173/auth/github/vscode
   ↓
3. Server redirects to: https://github.com/login/oauth/authorize
   ↓
4. User sees: "Authorize Mirai" ✨
   ↓
5. User authorizes
   ↓
6. GitHub redirects to: /auth/github/vscode/callback
   ↓
7. Server exchanges code for token
   ↓
8. Server stores token in database
   ↓
9. Server redirects to: mirai://mirai.mirai-auth/github-callback?token=...
   ↓
10. VS Code receives token and stores it
    ↓
11. Extension fetches repos using the token
```

### Token Storage

**VS Code Extension:**
- Tokens stored in VS Code's `globalState`
- Encrypted and secured by VS Code
- Key: `mirai.github.sessions`

**Mirai Server:**
- GitHub access tokens stored in `User.githubAccessToken`
- Associated with user accounts
- Can be used for server-side GitHub operations

## 🚀 Usage

### For Users

1. Open Source Control panel (`Ctrl+Shift+G`)
2. Find "GitHub Repositories" section
3. Click the refresh icon
4. **See "Authorize Mirai"** in the OAuth flow
5. Authorize and see all your repos!

### For Developers

**Fetch repos programmatically:**

```typescript
// Get custom GitHub auth session
const session = await vscode.authentication.getSession(
  'mirai-github',
  ['repo', 'read:user'],
  { createIfNone: true }
);

// Use the token
const response = await fetch('https://api.github.com/user/repos', {
  headers: {
    'Authorization': `Bearer ${session.accessToken}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});
```

## 🔒 Security

### Token Handling

1. **OAuth State**: Random state parameter prevents CSRF attacks
2. **Token Encryption**: Tokens are base64url encoded with metadata
3. **Secure Storage**: VS Code securely stores authentication sessions
4. **Server-Side Validation**: State parameter validated on callback

### Token Format

```typescript
{
  githubId: string;           // GitHub user ID
  githubAccessToken: string;  // Actual GitHub token
  miraiUserId?: string;       // Optional Mirai user ID
  iat: number;                // Issued at timestamp
  exp: number;                // Expiry (1 year)
  iss: 'mirai';              // Issuer
  aud: 'vscode-github';      // Audience
  type: 'github';            // Token type
}
```

## 🔄 Compared to Default VS Code GitHub Auth

### Built-in GitHub Auth
- Shows: "Authorize Visual Studio Code"
- Uses: Microsoft's GitHub OAuth app
- Tokens: Managed by VS Code
- Server: No server-side access to tokens

### Custom Mirai GitHub Auth ✨
- Shows: **"Authorize Mirai"**
- Uses: Your own GitHub OAuth app
- Tokens: Stored in your database + VS Code
- Server: Full access to GitHub tokens for server-side operations

## 🛠️ Troubleshooting

### "Authorization Failed"

**Check:**
1. GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are set
2. OAuth callback URL matches in GitHub app settings
3. Server is running and accessible

### "No GitHub Session Found"

**Solution:**
1. Sign out: Click GitHub account in bottom-left
2. Select "Sign out of GitHub (Mirai)"
3. Try again

### "Token Invalid"

**Fix:**
1. Tokens expire after 1 year
2. Sign out and sign in again
3. Check database `githubAccessToken` is not null

## 🎨 Customization

### Change Application Name

Update your GitHub OAuth app name to change what users see:

1. Go to: https://github.com/settings/developers
2. Click your OAuth app
3. Change "Application name"
4. Users will see: "Authorize [Your Name]"

### Add More Scopes

Update scopes in `/auth/github/vscode.ts`:

```typescript
githubAuthUrl.searchParams.set(
  'scope',
  'repo read:user user:email read:org write:packages'
);
```

## 📊 Benefits

### For Your Business
- ✅ Better branding
- ✅ Control over OAuth flow
- ✅ Server-side GitHub token access
- ✅ User tracking and analytics
- ✅ Custom rate limiting

### For Users
- ✅ Trust your brand
- ✅ Seamless integration
- ✅ Single sign-on with Mirai
- ✅ Consistent experience

## 🔗 Related Files

**Server:**
- `/app/routes/auth.github.vscode.ts`
- `/app/routes/auth.github.vscode.callback.ts`

**Extension:**
- `/extensions/mirai-auth/src/githubAuthProvider.ts`
- `/extensions/mirai-auth/src/githubRepoService.ts`
- `/extensions/mirai-auth/src/extension.ts`

## 📖 Next Steps

1. **Create GitHub OAuth App** with your branding
2. **Set environment variables** on your server
3. **Test the flow** locally
4. **Deploy** and celebrate! 🎉

