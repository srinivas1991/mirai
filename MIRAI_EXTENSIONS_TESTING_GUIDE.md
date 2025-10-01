# Mirai Extensions Testing Guide

Your Mirai extensions have been successfully integrated into VS Code! Here's how to test them.

## ✅ Extensions Successfully Integrated

The following extensions are now built and ready:

1. **Mirai-Auth** - Authentication and credit management
2. **Mirai-Figma** - Figma design integration
3. **Mirai-Jira** - Issue tracking (placeholder)

## 🚀 How to Test the Extensions

### Method 1: Extension Development Host (Recommended)

1. **Open VS Code in the void directory**:
   ```bash
   cd /Users/srinivaskattimani/Desktop/test-vs/void
   code .
   ```

2. **Launch Extension Development Host**:
   - Press `F5` or go to `Run > Start Debugging`
   - This opens a new VS Code window with your extensions loaded

3. **Test the Extensions**:
   - Open Command Palette (`Cmd+Shift+P`)
   - Type "Mirai" to see all available commands:
     - `Mirai Auth: Sign In`
     - `Mirai Auth: Check Credits`
     - `Mirai Figma: Connect to Figma`
     - `Mirai Figma: Browse Figma Files`
     - `Mirai Jira: Connect to Jira`

### Method 2: Build and Install Locally

1. **Build the full VS Code with extensions**:
   ```bash
   cd /Users/srinivaskattimani/Desktop/test-vs/void
   npm run compile
   ```

2. **Run the built version**:
   ```bash
   ./scripts/code.sh
   ```

## 🔧 Configuration

Before testing, configure the server URLs in VS Code settings:

```json
{
  "mirai-auth.serverUrl": "http://localhost:5173",
  "mirai-figma.serverUrl": "http://localhost:5173",
  "mirai-jira.serverUrl": "http://localhost:5173"
}
```

Or use your deployed Mirai instance URL.

## 🧪 Testing Scenarios

### 1. Authentication Flow
1. Run `Mirai Auth: Sign In`
2. Should open browser to your Mirai auth page
3. Complete sign-in process
4. Should return to VS Code with success message
5. Run `Mirai Auth: Check Credits` to verify

### 2. Figma Integration
1. Ensure you're signed in to Mirai
2. Run `Mirai Figma: Connect to Figma`
3. Complete Figma OAuth flow
4. Run `Mirai Figma: Browse Figma Files`
5. Should show your Figma teams and files

### 3. Jira Integration (Placeholder)
1. Run `Mirai Jira: Connect to Jira`
2. Should show placeholder message
3. Extension structure is ready for implementation

## 🐛 Debugging

### Check Extension Status
- Go to `Help > Developer Tools`
- Check Console for any errors
- Look for extension activation messages

### View Extension Logs
- Open Command Palette
- Run `Developer: Show Running Extensions`
- Check if Mirai extensions are active

### Common Issues

1. **Extensions not showing up**:
   - Make sure you're in Extension Development Host (F5)
   - Check if extensions compiled successfully

2. **Authentication fails**:
   - Verify `mirai-auth.serverUrl` setting
   - Check if your Mirai server is running
   - Look for CORS issues in browser console

3. **Commands not available**:
   - Extensions might not be activated
   - Check extension activation events in package.json

## 📁 Extension Files Location

Your extensions are located at:
```
/Users/srinivaskattimani/Desktop/test-vs/void/extensions/
├── mirai-auth/          # Authentication & credits
├── mirai-figma/         # Figma integration
└── mirai-jira/          # Jira integration (placeholder)
```

Compiled output is in each `out/` directory.

## 🔄 Making Changes

If you need to modify the extensions:

1. **Edit source files** in `extensions/mirai-*/src/`
2. **Recompile**:
   ```bash
   cd extensions/mirai-auth && npm run compile
   # or for all extensions:
   npm run compile-extensions-build
   ```
3. **Reload Extension Development Host**: `Cmd+R` in the test window

## 🎯 Next Steps

1. **Test Authentication**: Verify the auth flow works with your Mirai server
2. **Test Figma Integration**: Connect and browse your Figma files
3. **Customize Configuration**: Adjust server URLs and settings
4. **Implement Jira**: Add real Jira integration when ready

## 📋 Extension Features Summary

### Mirai-Auth
- ✅ OAuth-like authentication flow
- ✅ Secure token storage
- ✅ Credit management and tracking
- ✅ User profile access
- ✅ Automatic token refresh

### Mirai-Figma
- ✅ Figma OAuth connection
- ✅ Browse teams, projects, files
- ✅ Component import (React/Vue/Angular/HTML)
- ✅ Asset export (SVG/PNG/JPG)
- ✅ Design token extraction
- ✅ URL-based import

### Mirai-Jira
- ✅ Extension structure ready
- ✅ Placeholder UI and commands
- ⏳ Full implementation pending

## 🎉 Success!

Your Mirai platform features are now fully integrated into VS Code! The extensions provide the same functionality as your web platform, adapted for the VS Code environment.

Test them out and let me know how they work!

