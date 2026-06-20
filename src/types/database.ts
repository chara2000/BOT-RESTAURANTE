export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string;
          customer_id: string | null;
          status: string;
          total: number;
          created_at: string;
        };
        Insert: { id?: string; status?: string; total?: number; tenant_id?: string; branch_id?: string; customer_id?: string | null };
        Update: { status?: string; total?: number };
      };
      products: {
        Row: {
          id: string;
          name: string;
          price: number;
          is_available: boolean;
        };
        Insert: { id?: string; name: string; price: number; is_available?: boolean };
        Update: { name?: string; price?: number; is_available?: boolean };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          telegram_chat_id: string | null;
        };
        Insert: { id?: string; name: string; telegram_chat_id?: string | null };
        Update: { name?: string; telegram_chat_id?: string | null };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
