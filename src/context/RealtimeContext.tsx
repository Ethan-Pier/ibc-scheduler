import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Availability, Schedule } from '../types';
import {
  getUsers,
  getAvailability,
  getSchedule,
  subscribeToSchedule,
  subscribeToAvailability,
  subscribeToUsers,
} from '../lib/storage';

interface RealtimeContextType {
  users: User[];
  availability: Availability[];
  schedule: Schedule[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [schedule, setSchedule] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const [usersData, availabilityData, scheduleData] = await Promise.all([
        getUsers(),
        getAvailability(),
        getSchedule(),
      ]);
      setUsers(usersData);
      setAvailability(availabilityData);
      setSchedule(scheduleData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refresh();

    // Subscribe to real-time updates
    const scheduleSub = subscribeToSchedule((newSchedule) => {
      setSchedule(newSchedule);
    });

    const availabilitySub = subscribeToAvailability((newAvailability) => {
      setAvailability(newAvailability);
    });

    const usersSub = subscribeToUsers((newUsers) => {
      setUsers(newUsers);
    });

    // Cleanup subscriptions
    return () => {
      scheduleSub.unsubscribe();
      availabilitySub.unsubscribe();
      usersSub.unsubscribe();
    };
  }, [refresh]);

  return (
    <RealtimeContext.Provider value={{
      users,
      availability,
      schedule,
      loading,
      error,
      refresh,
    }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}
