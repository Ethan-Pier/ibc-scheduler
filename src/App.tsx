import { motion, AnimatePresence } from 'framer-motion';
import { ThemeProvider } from './context/ThemeContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { useApp } from './context/AppContext';
import { AuroraBackground } from './components/AuroraBackground';
import { HomePage } from './pages/HomePage';
import { SchedulePage } from './pages/SchedulePage';
import { AdminPage } from './pages/AdminPage';
// LockScreen removed - using GitHub Pages version without lock
import { ThemeToggle } from './components/ThemeToggle';

function AppContent() {
  const { viewMode } = useApp();

  // Lock screen removed - direct to main content

  return (
    <div className="relative min-h-screen">
      {/* Aurora Background */}
      <AuroraBackground />
      
      {/* Main Content */}
      <AnimatePresence mode="wait">
        {viewMode === 'home' && (
          <motion.div
            key="home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <HomePage />
          </motion.div>
        )}
        {viewMode === 'schedule' && (
          <motion.div
            key="schedule"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <SchedulePage />
          </motion.div>
        )}
        {viewMode === 'admin' && (
          <motion.div
            key="admin"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <AdminPage />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Theme Toggle */}
      <ThemeToggle />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <RealtimeProvider>
        <AppContent />
      </RealtimeProvider>
    </ThemeProvider>
  );
}

export default App;
