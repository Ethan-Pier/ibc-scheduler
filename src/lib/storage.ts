import type { User, Availability, Schedule } from '../types';
import { generateId } from './utils';

const STORAGE_KEYS = {
  USERS: 'ibc-users',
  AVAILABILITY: 'ibc-availability',
  SCHEDULE: 'ibc-schedule',
  CURRENT_USER: 'ibc-current-user',
};

// Users
export function getUsers(): User[] {
  const data = localStorage.getItem(STORAGE_KEYS.USERS);
  return data ? JSON.parse(data) : [];
}

export function saveUser(name: string): User {
  const users = getUsers();
  const newUser: User = {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  return newUser;
}

export function deleteUser(userId: string): void {
  const users = getUsers().filter(u => u.id !== userId);
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  
  // Also clean up availability and schedule
  const availability = getAvailability().filter(a => a.userId !== userId);
  localStorage.setItem(STORAGE_KEYS.AVAILABILITY, JSON.stringify(availability));
  
  const schedule = getSchedule().filter(s => s.userId !== userId);
  localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
}

// Current User
export function getCurrentUser(): User | null {
  const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  return data ? JSON.parse(data) : null;
}

export function setCurrentUser(user: User | null): void {
  if (user) {
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  }
}

// Availability
export function getAvailability(): Availability[] {
  const data = localStorage.getItem(STORAGE_KEYS.AVAILABILITY);
  return data ? JSON.parse(data) : [];
}

export function getUserAvailability(userId: string): Availability[] {
  return getAvailability().filter(a => a.userId === userId);
}

export function toggleAvailability(userId: string, dayOfWeek: number, period: number): void {
  const availability = getAvailability();
  const existingIndex = availability.findIndex(
    a => a.userId === userId && a.dayOfWeek === dayOfWeek && a.period === period
  );
  
  if (existingIndex >= 0) {
    availability.splice(existingIndex, 1);
  } else {
    availability.push({
      userId,
      dayOfWeek,
      period,
      isAvailable: true,
    });
  }
  
  localStorage.setItem(STORAGE_KEYS.AVAILABILITY, JSON.stringify(availability));
}

export function isAvailable(userId: string, dayOfWeek: number, period: number): boolean {
  return getAvailability().some(
    a => a.userId === userId && a.dayOfWeek === dayOfWeek && a.period === period
  );
}

// Schedule
export function getSchedule(): Schedule[] {
  const data = localStorage.getItem(STORAGE_KEYS.SCHEDULE);
  return data ? JSON.parse(data) : [];
}

export function getScheduleForSlot(dayOfWeek: number, period: number): Schedule | undefined {
  return getSchedule().find(s => s.dayOfWeek === dayOfWeek && s.period === period);
}

export function assignSchedule(userId: string, dayOfWeek: number, period: number): void {
  const schedule = getSchedule().filter(s => !(s.dayOfWeek === dayOfWeek && s.period === period));
  schedule.push({
    userId,
    dayOfWeek,
    period,
    assigned: true,
  });
  localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(schedule));
}

export function clearSchedule(): void {
  localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify([]));
}

// Auto Schedule
export function autoSchedule(): Schedule[] {
  const users = getUsers();
  const availability = getAvailability();
  const newSchedule: Schedule[] = [];
  
  // For each day and period
  for (let day = 0; day < 5; day++) {
    for (let period = 1; period <= 8; period++) {
      // Find available users for this slot
      const availableUsers = users.filter(user =>
        availability.some(a => 
          a.userId === user.id && 
          a.dayOfWeek === day && 
          a.period === period
        )
      );
      
      if (availableUsers.length > 0) {
        // Pick user with least assignments so far
        const userAssignmentCount = new Map<string, number>();
        availableUsers.forEach(user => {
          userAssignmentCount.set(user.id, newSchedule.filter(s => s.userId === user.id).length);
        });
        
        const selectedUser = availableUsers.sort((a, b) => 
          (userAssignmentCount.get(a.id) || 0) - (userAssignmentCount.get(b.id) || 0)
        )[0];
        
        newSchedule.push({
          userId: selectedUser.id,
          dayOfWeek: day,
          period,
          assigned: true,
        });
      }
    }
  }
  
  localStorage.setItem(STORAGE_KEYS.SCHEDULE, JSON.stringify(newSchedule));
  return newSchedule;
}
