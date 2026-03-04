import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LockScreenProps {
  onUnlock: () => void;
}

const CORRECT_PIN = 'IBC2024';
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 300000; // 5 minutes

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    // Check for existing lockout
    const storedLockout = localStorage.getItem('ibc_lockout_until');
    if (storedLockout) {
      const lockoutTime = parseInt(storedLockout);
      if (lockoutTime > Date.now()) {
        setLockoutUntil(lockoutTime);
      } else {
        localStorage.removeItem('ibc_lockout_until');
      }
    }
  }, []);

  useEffect(() => {
    if (lockoutUntil) {
      const timer = setInterval(() => {
        if (Date.now() >= lockoutUntil) {
          setLockoutUntil(null);
          setAttempts(0);
          localStorage.removeItem('ibc_lockout_until');
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutUntil]);

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if PIN is complete
    if (newPin.every(d => d !== '') && index === 5) {
      verifyPin(newPin.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyPin = (enteredPin: string) => {
    if (lockoutUntil) return;

    if (enteredPin === CORRECT_PIN) {
      // Success
      localStorage.setItem('ibc_unlocked', 'true');
      onUnlock();
    } else {
      // Failure
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();

      if (newAttempts >= MAX_ATTEMPTS) {
        const lockout = Date.now() + LOCKOUT_TIME;
        setLockoutUntil(lockout);
        localStorage.setItem('ibc_lockout_until', lockout.toString());
        setError('錯誤次數過多，系統已鎖定，請 5 分鐘後再試');
      } else {
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setError(`密碼錯誤，剩餘嘗試次數：${MAX_ATTEMPTS - newAttempts}`);
      }
    }
  };

  const formatLockoutTime = () => {
    if (!lockoutUntil) return '';
    const remaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Aurora Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" />
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>
      </div>

      {/* Glass Card */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md mx-4 p-8 rounded-3xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-2xl"
      >
        {/* Lock Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-light text-white text-center mb-2">IBC Scheduler</h2>
        <p className="text-white/60 text-center mb-8">輸入 6 位密碼解鎖系統</p>

        {/* PIN Input */}
        <div className={`flex justify-center gap-2 mb-4 ${shake ? 'animate-shake' : ''}`}>
          {pin.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              disabled={!!lockoutUntil}
              className="w-12 h-14 text-center text-2xl font-bold rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
            />
          ))}
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-red-400 text-center text-sm mb-4"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Lockout Timer */}
        {lockoutUntil && (
          <div className="text-center">
            <p className="text-white/60 text-sm">系統已鎖定</p>
            <p className="text-white text-lg font-mono mt-1">{formatLockoutTime()}</p>
          </div>
        )}

        {/* Hint */}
        <p className="text-white/30 text-center text-xs mt-8">
          演示密碼：IBC2024
        </p>
      </motion.div>
    </div>
  );
}
