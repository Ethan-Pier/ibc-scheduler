import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type Language = 'zh' | 'en';

interface Translations {
  [key: string]: string | Translations;
}

const translations: Record<Language, Translations> = {
  zh: {
    // Common
    appName: 'IBC 排班系統',
    selectUser: '選擇使用者',
    addUser: '新增使用者',
    backToHome: '返回首頁',
    submit: '提交',
    cancel: '取消',
    confirm: '確認',
    delete: '刪除',
    edit: '編輯',
    save: '保存',
    loading: '載入中...',
    
    // Home Page
    welcome: '請選擇您的名字',
    welcomeSubtitle: '選擇您的名字以開始排班',
    enterName: '輸入姓名',
    adminLogin: '管理員登入',
    
    // Schedule Page
    scheduleTitle: '給班表',
    scheduleSubtitle: '請點擊格子標記可排班時間',
    selectedSlots: '已選時段',
    available: '可排班',
    unavailable: '不可排班',
    morning: '上午',
    afternoon: '下午',
    info: '點擊格子即可標記您的可排班時間。藍色表示已選擇。',
    
    // Admin
    adminTitle: '管理員登入',
    adminSubtitle: '請輸入管理員密碼',
    enterPassword: '輸入密碼',
    login: '登入',
    logout: '登出',
    wrongPassword: '密碼錯誤',
    loggedIn: '已登入',
    
    // Admin Tabs
    scheduleOverview: '排班總覽',
    userManagement: '使用者管理',
    
    // Admin Schedule
    viewSchedule: '查看和管理所有排班',
    clearSchedule: '清除',
    autoSchedule: '自動排班',
    exportCSV: '導出 CSV',
    periodDay: '節次 / 星期',
    unassigned: '未安排',
    totalUsers: '總使用者',
    scheduledSlots: '已排班時段',
    totalAvailable: '總可用時段',
    
    // Admin Users
    addNewUser: '新增使用者',
    allUsers: '所有使用者',
    noUsers: '尚無使用者',
    
    // Language
    language: '語言',
    switchLanguage: '切換語言',
    chinese: '中文',
    english: 'English',
    
    // Days
    monday: '週一',
    tuesday: '週二',
    wednesday: '週三',
    thursday: '週四',
    friday: '週五',
    
    // Periods
    period1: '第一節',
    period2: '第二節',
    period3: '第三節',
    period4: '第四節',
    period5: '第五節',
    period6: '第六節',
    period7: '第七節',
    period8: '第八節',
  },
  en: {
    // Common
    appName: 'IBC Scheduling System',
    selectUser: 'Select User',
    addUser: 'Add User',
    backToHome: 'Back to Home',
    submit: 'Submit',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    loading: 'Loading...',
    
    // Home Page
    welcome: 'Select Your Name',
    welcomeSubtitle: 'Choose your name to start scheduling',
    enterName: 'Enter name',
    adminLogin: 'Admin Login',
    
    // Schedule Page
    scheduleTitle: 'Availability',
    scheduleSubtitle: 'Click cells to mark your available time slots',
    selectedSlots: 'Selected slots',
    available: 'Available',
    unavailable: 'Unavailable',
    morning: 'Morning',
    afternoon: 'Afternoon',
    info: 'Click cells to mark your available time slots. Blue indicates selected.',
    
    // Admin
    adminTitle: 'Admin Login',
    adminSubtitle: 'Please enter admin password',
    enterPassword: 'Enter password',
    login: 'Login',
    logout: 'Logout',
    wrongPassword: 'Incorrect password',
    loggedIn: 'Logged in',
    
    // Admin Tabs
    scheduleOverview: 'Schedule Overview',
    userManagement: 'User Management',
    
    // Admin Schedule
    viewSchedule: 'View and manage all schedules',
    clearSchedule: 'Clear',
    autoSchedule: 'Auto Schedule',
    exportCSV: 'Export CSV',
    periodDay: 'Period / Day',
    unassigned: 'Unassigned',
    totalUsers: 'Total Users',
    scheduledSlots: 'Scheduled Slots',
    totalAvailable: 'Total Available',
    
    // Admin Users
    addNewUser: 'Add New User',
    allUsers: 'All Users',
    noUsers: 'No users yet',
    
    // Language
    language: 'Language',
    switchLanguage: 'Switch Language',
    chinese: '中文',
    english: 'English',
    
    // Days
    monday: 'Mon',
    tuesday: 'Tue',
    wednesday: 'Wed',
    thursday: 'Thu',
    friday: 'Fri',
    
    // Periods
    period1: 'Period 1',
    period2: 'Period 2',
    period3: 'Period 3',
    period4: 'Period 4',
    period5: 'Period 5',
    period6: 'Period 6',
    period7: 'Period 7',
    period8: 'Period 8',
  },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('ibc-language');
    return (saved as Language) || 'zh';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('ibc-language', lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev: Language) => prev === 'zh' ? 'en' : 'zh');
  }, []);

  const t = useCallback((key: string): string => {
    const keys = key.split('.');
    let value: unknown = translations[language];
    
    for (const k of keys) {
      if (typeof value === 'object' && value !== null) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    
    return typeof value === 'string' ? value : key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
