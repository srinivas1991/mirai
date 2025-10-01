#!/bin/bash

echo "🚀 Testing Mirai Extensions Properly"
echo "===================================="

# Compile all extensions first
echo "📦 Compiling all Mirai extensions..."
cd extensions/mirai-auth && npm run compile && cd ../..
cd extensions/mirai-figma && npm run compile && cd ../..
cd extensions/mirai-jira && npm run compile && cd ../..

echo "✅ All extensions compiled!"
echo ""

# Method 1: Launch with multiple extension development paths
echo "🎯 Method 1: Launch with Extension Development Host"
echo "Run this command to test the extensions:"
echo ""
echo "./scripts/code.sh \\"
echo "  --extensionDevelopmentPath=./extensions/mirai-auth \\"
echo "  --extensionDevelopmentPath=./extensions/mirai-figma \\"
echo "  --extensionDevelopmentPath=./extensions/mirai-jira"
echo ""

# Method 2: Use the workspace file
echo "🎯 Method 2: Open the workspace file"
echo "Run this command:"
echo ""
echo "./scripts/code.sh mirai-extensions.code-workspace"
echo ""
echo "Then press F5 to launch Extension Development Host"
echo ""

# Method 3: Test individual extensions
echo "🎯 Method 3: Test individual extensions"
echo "For Mirai Auth only:"
echo "./scripts/code.sh --extensionDevelopmentPath=./extensions/mirai-auth"
echo ""

echo "📋 What to expect:"
echo "1. A new VS Code window will open (Extension Development Host)"
echo "2. Press Cmd+Shift+P to open Command Palette"
echo "3. Type 'Mirai' to see available commands:"
echo "   - Mirai Auth: Sign In"
echo "   - Mirai Auth: Check Credits"
echo "   - Mirai Figma: Connect to Figma"
echo "   - Mirai Figma: Browse Figma Files"
echo "   - Mirai Jira: Connect to Jira"
echo ""
echo "🔧 If commands don't appear:"
echo "1. Check Developer Tools (Help > Toggle Developer Tools)"
echo "2. Look for extension activation errors in Console"
echo "3. Check Running Extensions (Developer: Show Running Extensions)"
echo ""

# Actually launch it
echo "🚀 Launching now with all extensions..."
./scripts/code.sh \
  --extensionDevelopmentPath=./extensions/mirai-auth \
  --extensionDevelopmentPath=./extensions/mirai-figma \
  --extensionDevelopmentPath=./extensions/mirai-jira

