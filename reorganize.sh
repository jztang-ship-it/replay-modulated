#!/bin/bash
# ReplayMod Reorganization Script
# Safely restructures project to clean 3-layer architecture

set -e  # Exit on any error

REPLAYMOD_DIR="$HOME/ReplayMod"
BACKUP_DIR="$HOME/ReplayMod-backup-$(date +%Y%m%d-%H%M%S)"

echo "🔍 ReplayMod Reorganization Script"
echo "=================================="
echo ""

# Check if ReplayMod exists
if [ ! -d "$REPLAYMOD_DIR" ]; then
    echo "❌ Error: ReplayMod directory not found at $REPLAYMOD_DIR"
    exit 1
fi

echo "📂 Project location: $REPLAYMOD_DIR"
echo "💾 Backup location: $BACKUP_DIR"
echo ""

# Step 1: Create full backup
echo "Step 1/7: Creating full backup..."
cp -r "$REPLAYMOD_DIR" "$BACKUP_DIR"
echo "✅ Backup created at $BACKUP_DIR"
echo ""

cd "$REPLAYMOD_DIR"

# Step 2: Create new directory structure
echo "Step 2/7: Creating new directory structure..."
mkdir -p backend/engines
mkdir -p backend/sports
mkdir -p backend/data
mkdir -p backend/models
mkdir -p frontend/src/views
mkdir -p frontend/src/components
mkdir -p frontend/src/adapters
mkdir -p frontend/src/assets
mkdir -p frontend/public/data
echo "✅ New structure created"
echo ""

# Step 3: Move backend files (core → backend)
echo "Step 3/7: Reorganizing backend..."

# Move engines
if [ -d "core/engine" ]; then
    echo "  → Moving core/engine/* to backend/engines/"
    cp -r core/engine/* backend/engines/ 2>/dev/null || true
fi

# Move sports configs
if [ -d "core/sports" ]; then
    echo "  → Moving core/sports/* to backend/sports/"
    cp -r core/sports/* backend/sports/ 2>/dev/null || true
fi

# Move data
if [ -d "core/data" ]; then
    echo "  → Moving core/data/* to backend/data/"
    cp -r core/data/* backend/data/ 2>/dev/null || true
fi

# Move models
if [ -d "core/models" ]; then
    echo "  → Moving core/models/* to backend/models/"
    cp -r core/models/* backend/models/ 2>/dev/null || true
fi

echo "✅ Backend reorganized"
echo ""

# Step 4: Move frontend files (apps/replay-ui → frontend)
echo "Step 4/7: Reorganizing frontend..."

# Move main files
if [ -d "apps/replay-ui" ]; then
    # Root files
    cp apps/replay-ui/package.json frontend/ 2>/dev/null || true
    cp apps/replay-ui/vite.config.ts frontend/ 2>/dev/null || true
    cp apps/replay-ui/index.html frontend/ 2>/dev/null || true
    cp apps/replay-ui/tsconfig*.json frontend/ 2>/dev/null || true
    cp apps/replay-ui/tailwind.config.js frontend/ 2>/dev/null || true
    cp apps/replay-ui/postcss.config.js frontend/ 2>/dev/null || true
    cp apps/replay-ui/eslint.config.js frontend/ 2>/dev/null || true
    
    # Move src files
    if [ -f "apps/replay-ui/src/App.tsx" ]; then
        echo "  → Moving App.tsx, main.tsx, styles"
        cp apps/replay-ui/src/App.tsx frontend/src/ 2>/dev/null || true
        cp apps/replay-ui/src/main.tsx frontend/src/ 2>/dev/null || true
        cp apps/replay-ui/src/*.css frontend/src/ 2>/dev/null || true
    fi
    
    # Move GameView to views
    if [ -f "apps/replay-ui/src/ui/GameView.tsx" ]; then
        echo "  → Moving GameView.tsx to views/"
        cp apps/replay-ui/src/ui/GameView.tsx frontend/src/views/ 2>/dev/null || true
    fi
    
    # Move components
    if [ -d "apps/replay-ui/src/ui/components" ]; then
        echo "  → Moving components/"
        cp -r apps/replay-ui/src/ui/components/* frontend/src/components/ 2>/dev/null || true
    fi
    
    # Move engine adapters
    if [ -d "apps/replay-ui/src/ui/engine" ]; then
        echo "  → Moving engine adapters"
        cp -r apps/replay-ui/src/ui/engine/* frontend/src/adapters/ 2>/dev/null || true
        # Rename engineAdapter.ts → gameAdapter.ts
        if [ -f "frontend/src/adapters/engineAdapter.ts" ]; then
            mv frontend/src/adapters/engineAdapter.ts frontend/src/adapters/gameAdapter.ts
        fi
    fi
    
    # Move public data
    if [ -d "apps/replay-ui/public" ]; then
        echo "  → Moving public files"
        cp -r apps/replay-ui/public/* frontend/public/ 2>/dev/null || true
    fi
    
    # Move assets if they exist
    if [ -d "apps/replay-ui/src/assets" ]; then
        cp -r apps/replay-ui/src/assets/* frontend/src/assets/ 2>/dev/null || true
    fi
fi

echo "✅ Frontend reorganized"
echo ""

# Step 5: Update import paths in frontend
echo "Step 5/7: Updating frontend import paths..."

# Update GameView.tsx imports
if [ -f "frontend/src/views/GameView.tsx" ]; then
    echo "  → Fixing GameView.tsx imports"
    sed -i.bak 's|from "./engine/types"|from "../adapters/types"|g' frontend/src/views/GameView.tsx
    sed -i.bak 's|from "./engine/engineAdapter"|from "../adapters/gameAdapter"|g' frontend/src/views/GameView.tsx
    sed -i.bak 's|from "./components/|from "../components/|g' frontend/src/views/GameView.tsx
    rm frontend/src/views/GameView.tsx.bak 2>/dev/null || true
fi

# Update App.tsx imports
if [ -f "frontend/src/App.tsx" ]; then
    echo "  → Fixing App.tsx imports"
    sed -i.bak 's|from "./ui/GameView"|from "./views/GameView"|g' frontend/src/App.tsx
    rm frontend/src/App.tsx.bak 2>/dev/null || true
fi

# Update component imports
for file in frontend/src/components/*.tsx; do
    if [ -f "$file" ]; then
        echo "  → Fixing $(basename $file) imports"
        sed -i.bak 's|from "../engine/types"|from "../adapters/types"|g' "$file"
        sed -i.bak 's|from "../engine/engineAdapter"|from "../adapters/gameAdapter"|g' "$file"
        rm "$file.bak" 2>/dev/null || true
    fi
done

echo "✅ Frontend import paths updated"
echo ""

# Step 6: Update backend import paths
echo "Step 6/7: Updating backend import paths..."

# Update all engine files
for file in backend/engines/*.ts; do
    if [ -f "$file" ]; then
        echo "  → Fixing $(basename $file) imports"
        sed -i.bak 's|from "../models"|from "../models"|g' "$file"
        sed -i.bak 's|from "./|from "./|g' "$file"
        rm "$file.bak" 2>/dev/null || true
    fi
done

# Update sport configs
for file in backend/sports/*.ts; do
    if [ -f "$file" ]; then
        echo "  → Fixing $(basename $file) imports"
        sed -i.bak 's|from "../models"|from "../models"|g' "$file"
        sed -i.bak 's|from "./achievements/|from "./achievements/|g' "$file"
        rm "$file.bak" 2>/dev/null || true
    fi
done

echo "✅ Backend import paths updated"
echo ""

# Step 7: Clean up old directories (SAFE - only if new ones exist)
echo "Step 7/7: Cleaning up old directories..."

# Only delete if new structure exists and has files
if [ -d "backend/engines" ] && [ "$(ls -A backend/engines)" ]; then
    echo "  → Removing old core/ directory"
    rm -rf core
else
    echo "  ⚠️  Keeping core/ (backend migration may have failed)"
fi

if [ -d "frontend/src/views" ] && [ -f "frontend/src/views/GameView.tsx" ]; then
    echo "  → Removing old apps/ directory"
    rm -rf apps
else
    echo "  ⚠️  Keeping apps/ (frontend migration may have failed)"
fi

# Remove definitely unused files
echo "  → Removing temp files"
rm -f code-logic-only.zip 2>/dev/null || true
rm -f *.zip 2>/dev/null || true
rm -f map-players.py 2>/dev/null || true

# Remove _archive if it exists
if [ -d "_archive" ]; then
    echo "  → Removing _archive/"
    rm -rf _archive
fi

echo "✅ Cleanup complete"
echo ""

# Final verification
echo "🔍 Verification:"
echo "==============="
echo ""

echo "Backend structure:"
ls -la backend/ 2>/dev/null | grep "^d" | awk '{print "  ✓", $9}'

echo ""
echo "Frontend structure:"  
ls -la frontend/src/ 2>/dev/null | grep "^d" | awk '{print "  ✓", $9}'

echo ""
echo "✅ REORGANIZATION COMPLETE!"
echo ""
echo "📁 New structure:"
echo "  ReplayMod/"
echo "  ├── backend/        (Layer 1 + 2: Engines + Sport Configs)"
echo "  ├── frontend/       (Layer 3: React UI)"
echo "  └── PROJECT.md"
echo ""
echo "💾 Original backup saved at:"
echo "  $BACKUP_DIR"
echo ""
echo "🔧 Next steps:"
echo "  1. cd ~/ReplayMod/frontend"
echo "  2. npm install"
echo "  3. npm run dev"
echo ""
echo "⚠️  If anything breaks, restore from backup:"
echo "  rm -rf ~/ReplayMod"
echo "  mv $BACKUP_DIR ~/ReplayMod"
