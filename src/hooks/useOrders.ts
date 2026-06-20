'use client';

import { useAppData } from '@/context/AppDataContext';
import type { OrderStatus } from '@/types';

export function useOrders() {
  const { orders, updateOrderStatus, addOrder, activeOrdersCount } = useAppData();
  return { orders, updateOrderStatus, addOrder, activeOrdersCount };
}

export function useOrderStatusMutation() {
  const { updateOrderStatus } = useAppData();
  return {
    mutate: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      updateOrderStatus(orderId, status),
  };
}

export function useDashboardStats() {
  const { stats } = useAppData();
  return stats;
}

export function useProducts() {
  const { products, updateProduct, addProduct, deleteProduct } = useAppData();
  return { products, updateProduct, addProduct, deleteProduct };
}

export function useInventory() {
  const { inventory, stockMovements, lowStockCount, updateInventory } = useAppData();
  return { inventory, stockMovements, lowStockCount, updateInventory };
}

export function useCashRegister() {
  const { cashSession, addCashTransaction, openCashRegister, closeCashRegister } = useAppData();
  return { cashSession, addCashTransaction, openCashRegister, closeCashRegister };
}

export function useDeliveries() {
  const { deliveries, assignRider, updateRiderPosition } = useAppData();
  return { deliveries, assignRider, updateRiderPosition };
}

export function useSettings() {
  const { settings, updateSettings } = useAppData();
  return { settings, updateSettings };
}
