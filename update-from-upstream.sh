#!/bin/bash

# Configuration
PROJECT_DIR="/home/moothz/worldcup2026"
PATCH_SCRIPT="/home/moothz/worldcup2026-patch.py"

echo "🚀 Starting update from upstream..."

cd "$PROJECT_DIR" || exit

# 1. Fetch updates from upstream
echo "📡 Fetching from upstream..."
git fetch upstream

# 2. Merge updates
echo "🔀 Merging upstream/main into local main..."
if git merge --no-edit upstream/main; then
    echo "✅ Merge successful."
else
    echo "❌ Merge failed! Please resolve conflicts manually."
    exit 1
fi

# 3. Push to your origin fork
echo "📤 Pushing updates to your GitHub fork (origin)..."
git push origin main

# 4. Apply local patches
echo "🩹 Applying local patches via $PATCH_SCRIPT..."
if python3 "$PATCH_SCRIPT"; then
    echo "✅ Patches applied."
else
    echo "❌ Patching failed!"
    exit 1
fi

# 5. Restart PM2 processes
echo "♻️ Restarting PM2 processes..."
pm2 restart ecosystem.config.js

# 6. Show status and logs
echo "📊 Current PM2 Status:"
pm2 status

echo "📝 Showing last 20 lines of wc-sync logs:"
pm2 logs wc-sync --lines 20 --nostream

echo "🎉 Update complete!"
