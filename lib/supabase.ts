import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bookflow_workspaces: {
        Row: {
          data: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          data?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      public_invoice_links: {
        Row: {
          created_at: string;
          expires_at: string;
          invoice_id: string;
          payload: Json;
          status: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at?: string;
          invoice_id: string;
          payload: Json;
          status?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          expires_at?: string;
          invoice_id?: string;
          payload?: Json;
          status?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_invoice_links_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'bookflow_workspaces';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * Creates a database-only Supabase client. Authentication remains owned by
 * Clerk; the current Clerk session token is attached to every Supabase call.
 */
export function createClerkSupabaseClient(accessToken: () => Promise<string | null>) {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error(
      'Missing Supabase configuration. Add EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart Expo.',
    );
  }

  return createClient<Database>(supabaseUrl, supabasePublishableKey, {
    accessToken: () => {
      // Expo Router statically renders web routes in Node, where Clerk's
      // client-side getToken() is intentionally unavailable.
      if (Platform.OS === 'web' && typeof window === 'undefined') {
        return Promise.resolve(null);
      }
      return accessToken();
    },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function getSupabaseFunctionUrl(functionName: string) {
  if (!supabaseUrl) {
    throw new Error('Supabase is not configured.');
  }
  return `${supabaseUrl}/functions/v1/${functionName}`;
}
