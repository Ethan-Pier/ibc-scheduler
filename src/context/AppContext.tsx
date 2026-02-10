import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { User, ViewMode } from '../types';
import { getCurrentUser, setCurrentUser as saveCurrentUser } from '../lib/storage';

interface AppContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  isAdmin: boolean;
  setIsAdmin: (isAdmin: boolean) => void;
  refreshData: () => void;
  refreshTrigger: number;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [currentUser, setCurrentUserState] = useState<User | null>(getCurrentUser());
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const setCurrentUser = useCallback((user: User | null) => {
    setCurrentUserState(user);
    saveCurrentUser(user);
  }, []);

  const refreshData = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return (
    <AppContext.Provider value={{
      viewMode,
      setViewMode,
      currentUser,
      setCurrentUser,
      isAdmin,
      setIsAdmin,
      refreshData,
      refreshTrigger,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
