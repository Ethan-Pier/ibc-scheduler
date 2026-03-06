import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, Calendar } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { useRealtime } from '../context/RealtimeContext';
import { setCurrentUser } from '../lib/storage';
import type { User } from '../types';
import { cn, getUpcomingShifts } from '../lib/utils';

export function HomePage() {
  const { setViewMode, setCurrentUser: setAppUser } = useApp();
  const { t } = useLanguage();
  const { users, schedule } = useRealtime();
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);

  // Calculate upcoming shifts for each user
  const upcomingShiftsMap = useMemo(() => {
    const map = new Map<string, { day: number; dayName: string; period: number; timeUntil: string }[]>();
    
    users.forEach(user => {
      const userSchedule = schedule.filter(s => s.userId === user.id);
      const upcoming = getUpcomingShifts(
        userSchedule.map(s => ({ userId: s.userId, dayOfWeek: s.dayOfWeek, period: s.period, assigned: true })),
        users,
        72 // 72 hours = 3 days
      ).filter(s => s.userName === user.name).slice(0, 2);
      
      if (upcoming.length > 0) {
        map.set(user.id, upcoming.map(s => ({ day: s.day, dayName: s.dayName, period: s.period, timeUntil: s.timeUntil })));
      }
    });
    
    return map;
  }, [users, schedule]);

  const handleSelectUser = (user: User) => {
    setAppUser(user);
    setCurrentUser(user);
    setViewMode('schedule');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-4"
          >
            <Sparkles className="w-4 h-4 text-blue-500" />
            <span className="text-sm text-slate-600">{t('appName')}</span>
          </motion.div>
          <h1 className="text-3xl font-semibold text-slate-800 tracking-tight mb-2">
            {t('welcome')}
          </h1>
          <p className="text-slate-500 text-sm">
            {t('welcomeSubtitle')}
          </p>
        </div>

        {/* User List */}
        <div className="glass-card rounded-2xl p-2 md:p-6 space-y-2 md:space-y-3">
          <AnimatePresence mode="popLayout">
            {users.map((user, index) => {
              const upcomingShifts = upcomingShiftsMap.get(user.id) || [];
              
              return (
              <motion.button
                key={user.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => handleSelectUser(user)}
                onMouseEnter={() => setHoveredUser(user.id)}
                onMouseLeave={() => setHoveredUser(null)}
                className={cn(
                  "w-full flex items-center justify-between p-3 md:p-4 rounded-xl",
                  "transition-all duration-300",
                  hoveredUser === user.id
                    ? "bg-blue-50/50 shadow-md"
                    : "bg-white/40 hover:bg-white/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 md:w-10 h-8 md:h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-medium text-sm">
                    {user.name.charAt(0)}
                  </div>
                  <div className="text-left">
                    <span className="font-medium text-slate-700 text-sm md:text-base">{user.name}</span>
                    {upcomingShifts.length > 0 && (
                      <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {upcomingShifts[0].dayName} 第{upcomingShifts[0].period}節 · {upcomingShifts[0].timeUntil}
                      </div>
                    )}
                  </div>
                </div>
                <motion.div
                  animate={{ x: hoveredUser === user.id ? 4 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ArrowRight className="w-4 md:w-5 h-4 md:h-5 text-slate-400" />
                </motion.div>
              </motion.button>
            );})}
          </AnimatePresence>

          {users.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 text-slate-400"
            >
              <p>{t('noUsers')}</p>
              <p className="text-sm mt-2">{t('adminLogin')}</p>
            </motion.div>
          )}
        </div>

        {/* Admin Access */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center"
        >
          <button
            onClick={() => setViewMode('admin')}
            className="text-sm text-slate-400 hover:text-blue-500 transition-colors"
          >
            {t('adminLogin')}
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
