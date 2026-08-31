import {
  LayoutDashboard, ShoppingBag, Utensils, Package, Users,
  Truck, Bot, BarChart3, Settings, Wallet, MessageSquare, Receipt, History, Building2
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  alert?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Registro Sedes', href: '/registro', icon: Building2 },
  { label: 'Pedidos', href: '/pedidos', icon: ShoppingBag },
  { label: 'Historial', href: '/historial', icon: History },
  { label: 'Menú', href: '/menu', icon: Utensils },
  { label: 'Inventario', href: '/inventario', icon: Package, alert: true },
  { label: 'Caja POS', href: '/caja', icon: Wallet },
  { label: 'Registro Pagos', href: '/pagos', icon: Receipt },
  { label: 'Clientes', href: '/clientes', icon: Users },
  { label: 'Domicilios', href: '/domicilios', icon: Truck },
  { label: 'Repartidores', href: '/repartidores', icon: Users },
  { label: 'Mensajes', href: '/mensajes', icon: MessageSquare },
  { label: 'IA & Bots', href: '/ia', icon: Bot },
  { label: 'Reportes', href: '/reportes', icon: BarChart3 },
  { label: 'Configuración', href: '/configuracion', icon: Settings },
];

