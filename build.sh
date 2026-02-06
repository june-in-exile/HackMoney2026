#!/bin/bash
set -e

echo "🔨 Building Octopus Monorepo..."

# Get the directory where this script is located (project root)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📍 Project root: $PROJECT_ROOT"

# Build SDK first
echo "📦 Building SDK..."
cd "$PROJECT_ROOT/sdk"
npm install
npm run build

# Build Frontend
echo "🎨 Building Frontend..."
cd "$PROJECT_ROOT/frontend"
npm install
npm run build

echo "✅ Build complete!"
