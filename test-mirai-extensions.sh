#!/bin/bash

echo "🚀 Testing Mirai Extensions"
echo "=========================="

# Compile all Mirai extensions
echo "📦 Compiling Mirai Extensions..."

cd extensions/mirai-auth
echo "  - Compiling mirai-auth..."
npm run compile
if [ $? -ne 0 ]; then
    echo "❌ Failed to compile mirai-auth"
    exit 1
fi

cd ../mirai-figma
echo "  - Compiling mirai-figma..."
npm run compile
if [ $? -ne 0 ]; then
    echo "❌ Failed to compile mirai-figma"
    exit 1
fi

cd ../mirai-jira
echo "  - Compiling mirai-jira..."
npm run compile
if [ $? -ne 0 ]; then
    echo "❌ Failed to compile mirai-jira"
    exit 1
fi

cd ../..

echo "✅ All extensions compiled successfully!"
echo ""
echo "🎯 How to test the extensions:"
echo "1. Open VS Code in this directory: code ."
echo "2. Press F5 to launch Extension Development Host"
echo "3. In the new window, press Cmd+Shift+P"
echo "4. Type 'Mirai' to see available commands:"
echo "   - Mirai Auth: Sign In"
echo "   - Mirai Auth: Check Credits"
echo "   - Mirai Figma: Connect to Figma"
echo "   - Mirai Figma: Browse Figma Files"
echo "   - Mirai Jira: Connect to Jira"
echo ""
echo "🔧 Configuration:"
echo "Set these in VS Code settings (Cmd+,):"
echo "  - mirai-auth.serverUrl: http://localhost:5173"
echo "  - mirai-figma.serverUrl: http://localhost:5173"
echo "  - mirai-jira.serverUrl: http://localhost:5173"
echo ""
echo "🎉 Extensions are ready for testing!"

