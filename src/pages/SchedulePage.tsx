import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Clock, Check, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage } from '../context/LanguageContext';
import { DAYS, PERIODS } from '../types';
import { 
  getUserAvailability, 
  toggleAvailability
} from '../lib/storage';
import { cn } from '../lib/utils';

export function SchedulePage() {
  const { currentUser, setViewMode, refreshTrigger } = useApp();
  const { t } = useLanguage();
  const [availability, setAvailability] = useState<Set<string>>(new Set());
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      const userAvail = getUserAvailability(currentUser.id);
      const slotSet = new Set(
        userAvail.map(a => `${a.dayOfWeek}-${a.period}`)
      );
      setAvailability(slotSet);
    }
  }, [currentUser, refreshTrigger]);

  const handleToggle = (day: number, period: number) => {
    if (!currentUser) return;
    
    toggleAvailability(currentUser.id, day, period);
    const key = `${day}-${period}`;
    setAvailability(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!currentUser) {
    setViewMode('home');
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen p-4 md:p-8"
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode('home')}
              className="p-2 rounded-xl glass-card hover:bg-white/80 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </motion.button>
            <div>
              <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
                {t('scheduleTitle')}
              </h1>
              <p className="text-slate-500 text-sm">
                {currentUser.name}，{t('scheduleSubtitle')}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="pill-tag">
              <Check className="w-3 h-3 mr-1" />
              {t('selectedSlots')}: {availability.size}
            </div>
          </div>
        </motion.div>

        {/* Info Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-4 mb-6 flex items-start gap-3"
        >
          <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            {t('info')}
          </p>
        </motion.div>

        {/* Schedule Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card rounded-2xl p-6 overflow-x-auto"
        >
          <div className="min-w-[800px]">
            {/* Header Row */}
            <div className="grid grid-cols-[100px_repeat(5,1fr)] gap-2 mb-4">
              <div className="text-sm font-medium text-slate-400 flex items-end pb-2">
                <Clock className="w-4 h-4 mr-1" />
                時間
              </div>
              {DAYS.map((day, index) => (
                <motion.div
                  key={day}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.05 }}
                  className="text-center py-3 rounded-xl bg-white/30"
                >
                  <span className="font-medium text-slate-700">{day}</span>
                </motion.div>
              ))}
            </div>

            {/* Period Rows */}
            <div className="space-y-2">
              {PERIODS.map((period, periodIndex) => (
                <div key={period.num}>
                  {/* Period separator */}
                  {period.num === 5 && (
                    <div className="my-4 border-t border-dashed border-slate-300/50" />
                  )}
                  <div className="grid grid-cols-[100px_repeat(5,1fr)] gap-2">
                    {/* Period Label */}
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + periodIndex * 0.03 }}
                      className="flex flex-col justify-center pr-2"
                    >
                      <span className="text-sm font-medium text-slate-600">
                        {period.label}
                      </span>
                      <span className="text-xs text-slate-400">{period.time}</span>
                    </motion.div>
                    
                    {/* Day Cells */}
                    {DAYS.map((_, dayIndex) => {
                      const key = `${dayIndex}-${period.num}`;
                      const isSelected = availability.has(key);
                      const isHovered = hoveredSlot === key;
                      
                      return (
                        <motion.button
                          key={key}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ 
                            delay: 0.3 + periodIndex * 0.02 + dayIndex * 0.01,
                            type: "spring",
                            stiffness: 300,
                            damping: 25
                          }}
                          whileHover={{ scale: 1.08, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleToggle(dayIndex, period.num)}
                          onMouseEnter={() => setHoveredSlot(key)}
                          onMouseLeave={() => setHoveredSlot(null)}
                          className={cn(
                            "relative h-16 rounded-xl transition-all duration-200",
                            isSelected
                              ? "bg-blue-500/20 border-2 border-blue-400/50 shadow-md shadow-blue-500/20"
                              : "bg-white/40 border border-white/30 hover:bg-white/60",
                            isHovered && !isSelected && "bg-white/50 shadow-md"
                          )}
                        >
                          {isSelected && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                                <Check className="w-5 h-5 text-white" strokeWidth={2.5} />
                              </div>
                            </motion.div>
                          )}
                          
                          {/* Hover indicator */}
                          {isHovered && !isSelected && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="absolute inset-0 flex items-center justify-center"
                            >
                              <div className="w-6 h-6 rounded-full border-2 border-blue-300/50" />
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Legend */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 flex items-center justify-center gap-6 text-sm text-slate-500"
        >
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-white/40 border border-white/30" />
            <span>{t('unavailable')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-blue-500/20 border-2 border-blue-400/50" />
            <span>{t('available')}</span>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
