import type { UserRole } from '@/types';

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['*'],
  admin: [
    'dashboard', 'orders', 'menu', 'inventory', 'pos', 'customers',
    'delivery', 'messages', 'ai', 'reports', 'settings',
  ],
  operator: ['dashboard', 'orders', 'menu', 'customers', 'pos', 'messages'],
  kitchen: ['dashboard', 'orders'],
  delivery: ['dashboard', 'orders', 'delivery'],
};

export function canAccess(role: UserRole, module: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms.includes('*') || perms.includes(module);
}
