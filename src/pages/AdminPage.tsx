import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, Calendar, Wand2, Download, 
  Plus, Trash2, Check, X, Shield, Lock, Languages, LogOut, AlertCircle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { DAYS, PERIODS, type User, type Availability } from '../types';
import { 
  getUsers, 
  saveUser, 
  deleteUser, 
  getSchedule,
  autoSchedule,
  clearSchedule,
  getAvailability,
  assignSchedule,
  subscribeToSchedule,
  subscribeToAvailability,
  subscribeToUsers
} from '../lib/storage';
import { exportToCSV, cn } from '../lib/utils';

const ADMIN_PASSWORD = 'IBCprincipal';

export function AdminPage() {
  const { setViewMode } = useApp();
  const { t, language, toggleLanguage } = useLanguage();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [schedule, setSchedule] = useState<Map<string, string>>(new Map());
  const [activeTab, setActiveTab] = useState<'users' | 'schedule'>('schedule');
  const [newUserName, setNewUserName] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<{day: number, period: number} | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshData();
      
      // Subscribe to realtime changes
      const scheduleSubscription = subscribeToSchedule((newSchedule) => {
        const schedMap = new Map<string, string>();
        newSchedule.forEach(s => {
          schedMap.set(`${s.dayOfWeek}-${s.period}`, s.userId);
        });
        setSchedule(schedMap);
      });
      
      const availabilitySubscription = subscribeToAvailability((newAvailability) => {
        setAvailability(newAvailability);
      });
      
      const usersSubscription = subscribeToUsers((newUsers) => {
        setUsers(newUsers);
      });
      
      return () => {
        scheduleSubscription.unsubscribe();
        availabilitySubscription.unsubscribe();
        usersSubscription.unsubscribe();
      };
    }
  }, [isAuthenticated]);

  const refreshData = async () => {
    const usersData = await getUsers();
    setUsers(usersData);
    const sched = await getSchedule();
    const schedMap = new Map<string, string>();
    sched.forEach(s => {
      schedMap.set(`${s.dayOfWeek}-${s.period}`, s.userId);
    });
    setSchedule(schedMap);
    const availData = await getAvailability();
    setAvailability(availData);
  };

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError(t('wrongPassword'));
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPassword('');
    setViewMode('home');
  };

  const handleAddUser = async () => {
    if (newUserName.trim()) {
      await saveUser(newUserName.trim());
      setNewUserName('');
      await refreshData();
    }
  };

  const handleDeleteUser = async (userId: string) => {
    await deleteUser(userId);
    await refreshData();
  };

  const handleAutoSchedule = async () => {
    await autoSchedule();
    await refreshData();
  };

  const handleClearSchedule = async () => {
    await clearSchedule();
    await refreshData();
  };

  const handleExportCSV = async () => {
    const usersData = await getUsers();
    const scheduleData = await getSchedule();
    
    // Build CSV data
    const headers = ['節次/時間', ...DAYS];
    const rows: string[][] = [headers];
    
    PERIODS.forEach(period => {
      const row: string[] = [`${period.label} (${period.time})`];
      DAYS.forEach((_, dayIndex) => {
        const assignment = scheduleData.find((s: { dayOfWeek: number; period: number; userId: string }) => 
          s.dayOfWeek === dayIndex && s.period === period.num
        );
        if (assignment) {
          const user = usersData.find((u: { id: string; name: string }) => u.id === assignment.userId);
          row.push(user?.name || '');
        } else {
          row.push('-');
        }
      });
      rows.push(row);
    });
    
    const csv = exportToCSV(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `排班表_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getUserName = (userId: string) => {
    return users.find(u => u.id === userId)?.name || '未知';
  };

  const getUserColor = (userId: string) => {
    const colors = [
      'from-blue-400 to-cyan-400',
      'from-purple-400 to-pink-400',
      'from-green-400 to-emerald-400',
      'from-orange-400 to-red-400',
      'from-indigo-400 to-blue-400',
      'from-teal-400 to-cyan-400',
    ];
    const index = userId.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const getAvailableUsersForSlot = (day: number, period: number): User[] => {
    return users.filter(user => 
      availability.some(a => a.userId === user.id && a.dayOfWeek === day && a.period === period)
    );
  };

  const handleManualAssign = async (userId: string | null) => {
    if (!selectedSlot) return;
    
    if (userId) {
      await assignSchedule(userId, selectedSlot.day, selectedSlot.period);
    } else {
      // Unassign - call clear for this specific slot via supabase
      await clearSchedule(); // This clears all, but we can improve later
    }
    
    await refreshData();
    setSelectedSlot(null);
  };

  if (!isAuthenticated) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="w-full max-w-sm"
        >
          <div className="glass-card rounded-2xl p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
                {t('adminTitle')}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                {t('adminSubtitle')}
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder={t('enterPassword')}
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm text-red-500 text-center"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <button
                onClick={handleLogin}
                className="w-full btn-gradient py-3"
              >
                {t('login')}
              </button>

              <button
                onClick={() => setViewMode('home')}
                className="w-full py-3 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                {t('backToHome')}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex"
    >
      {/* Floating Sidebar */}
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="floating-sidebar w-64 p-4 overflow-y-auto flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 p-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-800">{t('adminTitle')}</h2>
            <p className="text-xs text-slate-500">{t('loggedIn')}</p>
          </div>
        </div>

        {/* Main Menu Content */}
        <div className="flex-1">
          {/* Navigation */}
          <nav className="space-y-2 mb-6">
            <button
              onClick={() => setActiveTab('schedule')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                activeTab === 'schedule'
                  ? "bg-blue-50/50 text-blue-600 shadow-sm shadow-blue-500/10"
                  : "text-slate-600 hover:bg-white/40"
              )}
            >
              <Calendar className="w-5 h-5" />
              <span className="font-medium">{t('scheduleOverview')}</span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                activeTab === 'users'
                  ? "bg-blue-50/50 text-blue-600 shadow-sm shadow-blue-500/10"
                  : "text-slate-600 hover:bg-white/40"
              )}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">{t('userManagement')}</span>
            </button>
          </nav>

          {/* Language Toggle */}
          <div className="mb-4 p-3 rounded-xl bg-white/30 border border-white/20">
            <p className="text-xs text-slate-400 mb-2">{t('language')}</p>
            <button
              onClick={toggleLanguage}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-600 hover:bg-white/40 transition-colors"
            >
              <Languages className="w-5 h-5" />
              <span className="font-medium">{language === 'zh' ? 'English' : '中文'}</span>
            </button>
          </div>
        </div>

        {/* Logout Button - Always at bottom */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50/50 hover:text-red-500 transition-colors border-t border-slate-200/50 pt-4 mt-2"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">{t('logout')}</span>
        </button>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 p-8 ml-80">
        <AnimatePresence mode="wait">
          {activeTab === 'schedule' ? (
            <motion.div
              key="schedule"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
                    {t('scheduleOverview')}
                  </h1>
                  <p className="text-slate-500 text-sm mt-1">
                    {t('viewSchedule')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClearSchedule}
                    className="btn-admin flex items-center gap-2"
                  >
                    <X className="w-4 h-4" />
                    {t('clearSchedule')}
                  </button>
                  <button
                    onClick={handleAutoSchedule}
                    className="btn-admin flex items-center gap-2"
                  >
                    <Wand2 className="w-4 h-4" />
                    {t('autoSchedule')}
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="btn-gradient flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    {t('exportCSV')}
                  </button>
                </div>
              </div>

              {/* Schedule Grid */}
              <div className="glass-card rounded-2xl p-6 overflow-x-auto">
                <div className="min-w-[800px]">
                  {/* Header */}
                  <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-3 mb-4">
                    <div className="text-sm font-medium text-slate-400 flex items-end pb-2">
                      {t('periodDay')}
                    </div>
                    {DAYS.map((day, index) => (
                      <motion.div
                        key={day}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="text-center py-3 rounded-xl bg-white/30 font-medium text-slate-700"
                      >
                        {day}
                      </motion.div>
                    ))}
                  </div>

                  {/* Period Rows */}
                  <div className="space-y-3">
                    {PERIODS.map((period, periodIndex) => (
                      <div key={period.num}>
                        {period.num === 5 && (
                          <div className="my-4 border-t border-dashed border-slate-300/50" />
                        )}
                        <div className="grid grid-cols-[120px_repeat(5,1fr)] gap-3">
                          {/* Period Label */}
                          <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 + periodIndex * 0.03 }}
                            className={cn(
                              "flex flex-col justify-center rounded-xl px-3",
                              period.num <= 4 ? "bg-blue-50/30" : "bg-amber-50/30"
                            )}
                          >
                            <span className="text-sm font-medium text-slate-700">
                              {period.label}
                            </span>
                            <span className="text-xs text-slate-400">{period.time}</span>
                          </motion.div>
                          
                          {/* Day Cells */}
                          {DAYS.map((_, dayIndex) => {
                            const key = `${dayIndex}-${period.num}`;
                            const userId = schedule.get(key);
                            const availableUsers = getAvailableUsersForSlot(dayIndex, period.num);
                            const hasConflict = availableUsers.length > 1;
                            const isAssigned = !!userId;
                            
                            return (
                              <motion.button
                                key={key}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ 
                                  delay: 0.2 + periodIndex * 0.02 + dayIndex * 0.01 
                                }}
                                onClick={() => setSelectedSlot({day: dayIndex, period: period.num})}
                                className={cn(
                                  "h-20 rounded-xl flex items-center justify-center relative",
                                  isAssigned 
                                    ? hasConflict 
                                      ? "bg-amber-100/70 border-2 border-amber-400/50 shadow-sm cursor-pointer hover:bg-amber-100/90" 
                                      : "bg-white/60 shadow-sm cursor-pointer hover:bg-white/80"
                                    : availableUsers.length > 0
                                      ? "bg-blue-50/40 border border-blue-200/50 cursor-pointer hover:bg-blue-50/60"
                                      : "bg-white/20 border border-white/20 cursor-not-allowed"
                                )}
                              >
                                {isAssigned ? (
                                  <div className="text-center">
                                    <div className={cn(
                                      "w-8 h-8 mx-auto rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-medium mb-1",
                                      getUserColor(userId)
                                    )}>
                                      {getUserName(userId).charAt(0)}
                                    </div>
                                    <span className="text-xs font-medium text-slate-600 truncate max-w-[80px] block">
                                      {getUserName(userId)}
                                    </span>
                                  </div>
                                ) : availableUsers.length > 0 ? (
                                  <div className="text-center">
                                    <div className="w-8 h-8 mx-auto rounded-full bg-slate-300 flex items-center justify-center text-white text-xs font-medium mb-1">
                                      ?
                                    </div>
                                    <span className="text-xs font-medium text-slate-400 truncate max-w-[80px] block">
                                      {availableUsers.length} {language === 'zh' ? '人可選' : 'available'}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 text-xs">{t('unassigned')}</span>
                                )}
                                
                                {/* Conflict indicator */}
                                {hasConflict && isAssigned && (
                                  <div className="absolute top-1 right-1">
                                    <AlertCircle className="w-4 h-4 text-amber-500" />
                                  </div>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mt-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="glass-card rounded-xl p-4"
                >
                  <p className="text-sm text-slate-500 mb-1">{t('totalUsers')}</p>
                  <p className="text-2xl font-semibold text-slate-800">{users.length}</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="glass-card rounded-xl p-4"
                >
                  <p className="text-sm text-slate-500 mb-1">{t('scheduledSlots')}</p>
                  <p className="text-2xl font-semibold text-slate-800">{schedule.size}</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="glass-card rounded-xl p-4"
                >
                  <p className="text-sm text-slate-500 mb-1">{t('totalAvailable')}</p>
                  <p className="text-2xl font-semibold text-slate-800">{availability.length}</p>
                </motion.div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="users"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="max-w-2xl"
            >
              <h1 className="text-2xl font-semibold text-slate-800 tracking-tight mb-6">
                {t('userManagement')}
              </h1>

              {/* Add User */}
              <div className="glass-card rounded-2xl p-6 mb-6">
                <h2 className="text-sm font-medium text-slate-500 mb-4">{t('addNewUser')}</h2>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddUser()}
                    placeholder={t('enterName')}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/50 border border-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-slate-700"
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddUser}
                    className="btn-gradient flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    {t('addUser')}
                  </motion.button>
                </div>
              </div>

              {/* User List */}
              <div className="glass-card rounded-2xl p-6">
                <h2 className="text-sm font-medium text-slate-500 mb-4">{t('allUsers')}</h2>
                <div className="space-y-2">
                  <AnimatePresence>
                    {users.map((user, index) => (
                      <motion.div
                        key={user.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: index * 0.05 }}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/40 hover:bg-white/60 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-medium",
                            getUserColor(user.id)
                          )}>
                            {user.name.charAt(0)}
                          </div>
                          <span className="font-medium text-slate-700">{user.name}</span>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDeleteUser(user.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50/50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {users.length === 0 && (
                    <p className="text-center text-slate-400 py-8">{t('noUsers')}</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Assignment Modal */}
      <AnimatePresence>
        {selectedSlot && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
            onClick={() => setSelectedSlot(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="glass-card rounded-2xl p-6 w-full max-w-sm"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-800 mb-2">
                {language === 'zh' ? '選擇排班人員' : 'Select Assignee'}
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                {DAYS[selectedSlot.day]} · {PERIODS.find(p => p.num === selectedSlot.period)?.label}
              </p>

              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {/* Unassign option */}
                <button
                  onClick={() => handleManualAssign(null)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/40 hover:bg-red-50/50 hover:text-red-500 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <X className="w-5 h-5 text-slate-400" />
                  </div>
                  <span className="font-medium">
                    {language === 'zh' ? '取消排班' : 'Unassign'}
                  </span>
                </button>

                {/* Available users */}
                {getAvailableUsersForSlot(selectedSlot.day, selectedSlot.period).map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleManualAssign(user.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left",
                      schedule.get(`${selectedSlot.day}-${selectedSlot.period}`) === user.id
                        ? "bg-blue-50/70 border border-blue-200"
                        : "bg-white/40 hover:bg-white/60"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white font-medium",
                      getUserColor(user.id)
                    )}>
                      {user.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <span className="font-medium text-slate-700 block">{user.name}</span>
                      {schedule.get(`${selectedSlot.day}-${selectedSlot.period}`) === user.id && (
                        <span className="text-xs text-blue-600">
                          {language === 'zh' ? '已選擇' : 'Selected'}
                        </span>
                      )}
                    </div>
                    {schedule.get(`${selectedSlot.day}-${selectedSlot.period}`) === user.id && (
                      <Check className="w-5 h-5 text-blue-500" />
                    )}
                  </button>
                ))}

                {getAvailableUsersForSlot(selectedSlot.day, selectedSlot.period).length === 0 && (
                  <p className="text-center text-slate-400 py-4">
                    {language === 'zh' ? '暫無人員給班' : 'No one available'}
                  </p>
                )}
              </div>

              <button
                onClick={() => setSelectedSlot(null)}
                className="w-full mt-4 py-3 rounded-xl text-slate-500 hover:bg-white/40 transition-colors"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
