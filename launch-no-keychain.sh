#!/bin/bash

echo "🚀 Launching Void VS Code without keychain integration"
echo "=================================================="

# Build the application if needed
if [ ! -d "out" ]; then
    echo "📦 Building VS Code first..."
    npm run compile
fi

# Launch VS Code with flags to disable keychain access
echo "🔓 Starting VS Code with no keychain prompts..."
./scripts/code.sh \
    --use-inmemory-secretstorage \
    --password-store=basic \
    --disable-keychain \
    "$@"

echo "✅ VS Code launched without keychain integration!"

