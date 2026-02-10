import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { getUsers, setCurrentUser } from '../lib/storage';
import type { User } from '../types';
import { cn } from '../lib/utils';

export function HomePage() {
  const { setViewMode, setCurrentUser: setAppUser } = useApp();
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [hoveredUser, setHoveredUser] = useState<string | null>(null);

  useEffect(() => {
    getUsers().then(setUsers);
  }, []);

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
        <div className="glass-card rounded-2xl p-6 space-y-3">
          <AnimatePresence mode="popLayout">
            {users.map((user, index) => (
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
                  "w-full flex items-center justify-between p-4 rounded-xl",
                  "transition-all duration-300",
                  hoveredUser === user.id
                    ? "bg-blue-50/50 shadow-md"
                    : "bg-white/40 hover:bg-white/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center text-white font-medium text-sm">
                    {user.name.charAt(0)}
                  </div>
                  <span className="font-medium text-slate-700">{user.name}</span>
                </div>
                <motion.div
                  animate={{ x: hoveredUser === user.id ? 4 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ArrowRight className="w-5 h-5 text-slate-400" />
                </motion.div>
              </motion.button>
            ))}
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
