# Mirai Extensions Troubleshooting Guide

## Issue: Extensions Not Visible in UI / Commands Not Registered

### Current Status
- ✅ Extensions compile successfully
- ✅ Output files generated in `out/` directories
- ✅ `activate` function properly exported
- ❌ Extensions not visible in Extension Development Host
- ❌ Commands not registered in Command Palette

### Troubleshooting Steps

#### 1. Verify Extension Structure
```bash
# Check if all required files exist
ls -la extensions/mirai-auth/package.json
ls -la extensions/mirai-auth/out/extension.js
ls -la extensions/mirai-figma/package.json
ls -la extensions/mirai-figma/out/extension.js
ls -la extensions/mirai-jira/package.json
ls -la extensions/mirai-jira/out/extension.js
```

#### 2. Launch Extension Development Host Properly

**Method A: Command Line (Recommended)**
```bash
cd /Users/srinivaskattimani/Desktop/test-vs/void

# Launch with all extensions
./scripts/code.sh \
  --extensionDevelopmentPath=./extensions/mirai-auth \
  --extensionDevelopmentPath=./extensions/mirai-figma \
  --extensionDevelopmentPath=./extensions/mirai-jira
```

**Method B: Using Workspace File**
```bash
# Open the workspace
./scripts/code.sh mirai-extensions.code-workspace

# Then press F5 to launch Extension Development Host
```

**Method C: Individual Extension Testing**
```bash
# Test one extension at a time
./scripts/code.sh --extensionDevelopmentPath=./extensions/mirai-auth
```

#### 3. Debug Extension Loading

In the Extension Development Host window:

1. **Open Developer Tools**
   - Help → Toggle Developer Tools
   - Check Console for errors

2. **Check Running Extensions**
   - Cmd+Shift+P → "Developer: Show Running Extensions"
   - Look for Mirai extensions in the list

3. **Check Extension Host Log**
   - Cmd+Shift+P → "Developer: Open Extension Host Log"
   - Look for activation errors

#### 4. Common Issues & Solutions

**Issue: "Extension not found"**
- Ensure you're in the correct directory: `/Users/srinivaskattimani/Desktop/test-vs/void`
- Check that `package.json` has correct `main` field: `"./out/extension.js"`

**Issue: "Activation failed"**
- Check TypeScript compilation errors
- Verify all dependencies are installed: `npm install` in each extension directory

**Issue: "Commands not registered"**
- Verify `contributes.commands` in `package.json`
- Check that `vscode.commands.registerCommand` is called in `activate()`

**Issue: "Extension not activating"**
- Check `activationEvents` in `package.json` (should be `["onStartupFinished"]`)
- Verify VS Code version compatibility in `engines.vscode`

#### 5. Manual Verification

**Check Extension Activation:**
```javascript
// In Extension Development Host Console
vscode.extensions.all.filter(ext => ext.id.includes('mirai'))
```

**Check Commands:**
```javascript
// In Extension Development Host Console
vscode.commands.getCommands().then(commands =>
  console.log(commands.filter(cmd => cmd.includes('mirai')))
)
```

#### 6. Reset and Clean Build

If extensions still don't work:

```bash
# Clean all output
rm -rf extensions/mirai-*/out/
rm -rf extensions/mirai-*/node_modules/

# Reinstall dependencies and recompile
cd extensions/mirai-auth && npm install && npm run compile && cd ../..
cd extensions/mirai-figma && npm install && npm run compile && cd ../..
cd extensions/mirai-jira && npm install && npm run compile && cd ../..
```

### Expected Behavior

When working correctly, you should see:

1. **In Command Palette (Cmd+Shift+P):**
   - "Mirai Auth: Sign In"
   - "Mirai Auth: Check Credits"
   - "Mirai Figma: Connect to Figma"
   - "Mirai Figma: Browse Figma Files"
   - "Mirai Jira: Connect to Jira"

2. **In Extensions View:**
   - Mirai Authentication (Development)
   - Mirai Figma Integration (Development)
   - Mirai Jira Integration (Development)

3. **In Developer Tools Console:**
   - No activation errors
   - Extension activation messages

### Next Steps

If extensions are still not working after following this guide:

1. Check VS Code version compatibility
2. Try with a minimal extension first
3. Compare with working VS Code extension examples
4. Check VS Code Extension Development documentation

### Files Modified for Keychain Removal

- `src/vs/platform/encryption/electron-main/encryptionMainService.ts` - Always use plain text encryption
- `scripts/code.sh` - Added `--use-inmemory-secretstorage --password-store=basic` flags
- `extensions/mirai-auth/src/authProvider.ts` - Use `globalState` instead of `secrets`
- `extensions/mirai-auth/src/tokenManager.ts` - Use `globalState` instead of `secrets`

