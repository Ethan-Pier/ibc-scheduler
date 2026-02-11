#!/bin/bash

# IBC 排班系統 - 一鍵部署腳本
# 用法: ./deploy.sh

set -e

echo "🚀 IBC 排班系統一鍵部署"
echo "========================"

# 檢查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未檢測到 Node.js，請先安裝: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 安裝依賴
echo "📦 安裝依賴..."
npm install

# 檢查 Supabase 配置
STORAGE_FILE="src/lib/storage.ts"
if grep -q "your-project-url" "$STORAGE_FILE" || grep -q "your-anon-key" "$STORAGE_FILE"; then
    echo ""
    echo "⚠️  請先配置 Supabase"
    echo ""
    echo "步驟:"
    echo "1. 訪問 https://supabase.com 創建項目"
    echo "2. 在 SQL Editor 執行專案根目錄的 setup.sql"
    echo "3. 獲取 Project URL 和 Anon Key"
    echo "4. 更新 $STORAGE_FILE 中的配置"
    echo ""
    read -p "是否現在編輯配置文件? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        if command -v code &> /dev/null; then
            code "$STORAGE_FILE"
        elif command -v vim &> /dev/null; then
            vim "$STORAGE_FILE"
        else
            open "$STORAGE_FILE"
        fi
        echo "請更新配置後重新運行 ./deploy.sh"
        exit 0
    fi
fi

# 構建
echo "🔨 構建項目..."
npm run build

# 部署到 GitHub Pages
echo "📤 部署到 GitHub Pages..."

# 檢查是否有 GitHub 倉庫
if ! git remote -v &> /dev/null; then
    echo "❌ 未檢測到 GitHub 倉庫"
    echo "請先創建 GitHub 倉庫並添加遠程:"
    echo "  git remote add origin https://github.com/你的用戶名/ibc-scheduler.git"
    exit 1
fi

# 保存當前分支
CURRENT_BRANCH=$(git branch --show-current)

# 創建或切換到 gh-pages 分支
if git show-ref --verify --quiet refs/heads/gh-pages; then
    git checkout gh-pages
    git rm -rf . || true
else
    git checkout --orphan gh-pages
    git rm -rf . || true
fi

# 複製構建文件
cp -r dist/* .

# 提交並推送
git add .
git commit -m "Deploy to GitHub Pages - $(date '+%Y-%m-%d %H:%M:%S')" || true
git push origin gh-pages --force

# 返回原分支
git checkout "$CURRENT_BRANCH"

echo ""
echo "✅ 部署完成！"
echo ""
echo "🌐 你的網站將在以下地址可用："
echo "   https://$(git remote get-url origin | sed 's/.*github.com[:/]//' | sed 's/.git$//' | sed 's/\\//.github.io\\//')"
echo ""
echo "⚠️  如果這是首次部署，請在 GitHub 倉庫設置中啟用 Pages："
echo "   Settings > Pages > Source > Deploy from a branch > gh-pages"
echo ""
