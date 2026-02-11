# IBC 排班系統

一個精美的玻璃質感排班系統，支持跨設備同步。

![Screenshot](https://via.placeholder.com/800x450.png?text=IBC+Scheduler)

## ✨ 功能特性

- 🎨 **玻璃質感 UI** - 極光背景 + Framer Motion 動畫
- 🔄 **跨設備同步** - Supabase 實時數據同步
- 👥 **多使用者支持** - 管理員可添加/刪除使用者
- 📅 **智能排班** - 自動排班算法，支持手動調整
- 🌐 **雙語支持** - 中文/English 切換
- 📊 **CSV 導出** - 一鍵導出排班表

## 🚀 快速部署（3分鐘）

### 方法一：一鍵部署腳本（推薦）

```bash
# 1. 克隆專案
git clone https://github.com/Ethan-Pier/ibc-scheduler.git
cd ibc-scheduler

# 2. 運行部署腳本
./deploy.sh
```

腳本會自動：
- 安裝依賴
- 配置 Supabase
- 構建項目
- 部署到 GitHub Pages

### 方法二：手動部署

#### 1. 創建 Supabase 項目

1. 訪問 [supabase.com](https://supabase.com) 並登入
2. 點擊 "New Project"，名稱填 `ibc-scheduler`
3. 等待數據庫創建完成
4. 進入 SQL Editor，執行以下 SQL：

```sql
-- 用戶表
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 給班表
CREATE TABLE availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  period INTEGER NOT NULL,
  UNIQUE(user_id, day_of_week, period)
);

-- 排班表
CREATE TABLE schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,
  period INTEGER NOT NULL,
  UNIQUE(day_of_week, period)
);

-- 啟用 Realtime
ALTER TABLE schedule REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule;
ALTER TABLE availability REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE availability;
ALTER TABLE users REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE users;
```

#### 2. 獲取 API 密鑰

1. Project Settings > API
2. 複製 `Project URL` 和 `anon public` key
3. 更新 `src/lib/storage.ts` 中的配置：

```typescript
const SUPABASE_URL = '你的 Project URL';
const SUPABASE_KEY = '你的 Anon Key';
```

#### 3. 部署到 GitHub Pages

```bash
# 安裝依賴
npm install

# 構建
npm run build

# 部署到 GitHub Pages
npm run deploy
```

## 📁 項目結構

```
ibc-scheduler/
├── .github/workflows/    # GitHub Actions 自動部署
├── src/
│   ├── components/       # UI 組件
│   ├── context/         # React Context
│   ├── lib/             # 工具函數 & Supabase 配置
│   ├── pages/           # 頁面組件
│   └── types/           # TypeScript 類型
├── deploy.sh            # 一鍵部署腳本
└── README.md            # 本文檔
```

## 🔧 本地開發

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 訪問 http://localhost:5173
```

## 🌐 管理員登入

- **口令**: `IBCprincipal`

## 📄 許可證

MIT License

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！
