export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          company_id: string
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          meta: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          meta?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          company_id: string
          date: string
          description: string
          id: string
          imported_at: string | null
          matched_payable_id: string | null
          reconciled: boolean | null
        }
        Insert: {
          amount: number
          company_id: string
          date: string
          description: string
          id?: string
          imported_at?: string | null
          matched_payable_id?: string | null
          reconciled?: boolean | null
        }
        Update: {
          amount?: number
          company_id?: string
          date?: string
          description?: string
          id?: string
          imported_at?: string | null
          matched_payable_id?: string | null
          reconciled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_payable_id_fkey"
            columns: ["matched_payable_id"]
            isOneToOne: false
            referencedRelation: "payables"
            referencedColumns: ["id"]
          },
        ]
      }
      barcode_labels: {
        Row: {
          border_radius_mm: number | null
          code: string
          cols: number
          company_id: string
          created_at: string
          created_by: string | null
          font_size_pt: number | null
          gap_x_mm: number
          gap_y_mm: number
          id: string
          is_default: boolean
          is_system: boolean
          label_height_mm: number
          label_width_mm: number
          margin_left_mm: number
          margin_top_mm: number
          name: string
          offset_x: number | null
          offset_y: number | null
          page_height_mm: number
          page_width_mm: number
          rows: number
          updated_at: string
        }
        Insert: {
          border_radius_mm?: number | null
          code: string
          cols?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          font_size_pt?: number | null
          gap_x_mm?: number
          gap_y_mm?: number
          id?: string
          is_default?: boolean
          is_system?: boolean
          label_height_mm: number
          label_width_mm: number
          margin_left_mm?: number
          margin_top_mm?: number
          name: string
          offset_x?: number | null
          offset_y?: number | null
          page_height_mm: number
          page_width_mm: number
          rows?: number
          updated_at?: string
        }
        Update: {
          border_radius_mm?: number | null
          code?: string
          cols?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          font_size_pt?: number | null
          gap_x_mm?: number
          gap_y_mm?: number
          id?: string
          is_default?: boolean
          is_system?: boolean
          label_height_mm?: number
          label_width_mm?: number
          margin_left_mm?: number
          margin_top_mm?: number
          name?: string
          offset_x?: number | null
          offset_y?: number | null
          page_height_mm?: number
          page_width_mm?: number
          rows?: number
          updated_at?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string | null
          final_balance_calculated: number | null
          final_balance_informed: number | null
          id: string
          initial_balance: number
          is_locked: boolean
          locked_at: string | null
          locked_by_user_id: string | null
          opened_at: string | null
          status: string
          unlock_required_role: string | null
          user_id_close: string | null
          user_id_open: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string | null
          final_balance_calculated?: number | null
          final_balance_informed?: number | null
          id?: string
          initial_balance?: number
          is_locked?: boolean
          locked_at?: string | null
          locked_by_user_id?: string | null
          opened_at?: string | null
          status?: string
          unlock_required_role?: string | null
          user_id_close?: string | null
          user_id_open: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string | null
          final_balance_calculated?: number | null
          final_balance_informed?: number | null
          id?: string
          initial_balance?: number
          is_locked?: boolean
          locked_at?: string | null
          locked_by_user_id?: string | null
          opened_at?: string | null
          status?: string
          unlock_required_role?: string | null
          user_id_close?: string | null
          user_id_open?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_locked_by_user_id_fkey"
            columns: ["locked_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_user_id_close_fkey"
            columns: ["user_id_close"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_user_id_open_fkey"
            columns: ["user_id_open"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_transactions: {
        Row: {
          amount: number
          cash_register_id: string
          category: string
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          payment_method: string
          reference_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          cash_register_id: string
          category: string
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          payment_method: string
          reference_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          cash_register_id?: string
          category?: string
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          payment_method?: string
          reference_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_transactions_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          ncm: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          ncm?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          ncm?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          cnpj: string | null
          created_at: string
          created_by: string | null
          delivery_enabled: boolean | null
          id: string
          invite_code: string
          name: string
          phone: string | null
          pickup_enabled: boolean | null
          rejected_at: string | null
          rejection_reason: string | null
          zip_code: string | null
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          delivery_enabled?: boolean | null
          id?: string
          invite_code?: string
          name: string
          phone?: string | null
          pickup_enabled?: boolean | null
          rejected_at?: string | null
          rejection_reason?: string | null
          zip_code?: string | null
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          delivery_enabled?: boolean | null
          id?: string
          invite_code?: string
          name?: string
          phone?: string | null
          pickup_enabled?: boolean | null
          rejected_at?: string | null
          rejection_reason?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      company_drive_settings: {
        Row: {
          access_token: string | null
          company_id: string
          connected_at: string | null
          daily_check_enabled: boolean
          daily_check_hour: number
          enabled: boolean
          google_email: string | null
          refresh_token: string | null
          root_folder_id: string | null
          root_folder_name: string
          token_expires_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          access_token?: string | null
          company_id: string
          connected_at?: string | null
          daily_check_enabled?: boolean
          daily_check_hour?: number
          enabled?: boolean
          google_email?: string | null
          refresh_token?: string | null
          root_folder_id?: string | null
          root_folder_name?: string
          token_expires_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          access_token?: string | null
          company_id?: string
          connected_at?: string | null
          daily_check_enabled?: boolean
          daily_check_hour?: number
          enabled?: boolean
          google_email?: string | null
          refresh_token?: string | null
          root_folder_id?: string | null
          root_folder_name?: string
          token_expires_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_drive_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_email_settings: {
        Row: {
          access_token: string | null
          company_id: string
          connected_at: string | null
          created_at: string
          google_email: string | null
          provider: string
          refresh_token: string | null
          sender_name: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          company_id: string
          connected_at?: string | null
          created_at?: string
          google_email?: string | null
          provider?: string
          refresh_token?: string | null
          sender_name?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          company_id?: string
          connected_at?: string | null
          created_at?: string
          google_email?: string | null
          provider?: string
          refresh_token?: string | null
          sender_name?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_email_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_network_access: {
        Row: {
          access_count: number
          company_id: string
          first_access: string
          id: string
          ip_address: string
          last_access: string
          user_agent: string | null
        }
        Insert: {
          access_count?: number
          company_id: string
          first_access?: string
          id?: string
          ip_address: string
          last_access?: string
          user_agent?: string | null
        }
        Update: {
          access_count?: number
          company_id?: string
          first_access?: string
          id?: string
          ip_address?: string
          last_access?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_network_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_roles: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          accounting_email: string | null
          accounting_emails: string[]
          accounting_include_pdf: boolean
          accounting_name: string | null
          accounting_nfe_auto_send: boolean
          accounting_nfe_webhook_url: string | null
          accounting_sender_name: string | null
          accounting_webhook_url: string | null
          ai_connection_validated: boolean
          ai_enabled: boolean
          ai_model: string
          ai_token: string | null
          ai_validated_at: string | null
          allow_public_search: boolean
          auto_logout_enabled: boolean
          auto_logout_time: string | null
          barcode_label_config: Json | null
          barcode_scanner_enabled: boolean
          cashflow_start_date: string | null
          company_id: string
          default_ncm: string | null
          force_logout_at: string | null
          last_forced_logout_at: string | null
          network_access_ttl_days: number
          profit_margin: number | null
          public_search_end_time: string | null
          public_search_start_time: string | null
          stock_code_auto_generate: boolean | null
          stock_code_prefix: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accounting_email?: string | null
          accounting_emails?: string[]
          accounting_include_pdf?: boolean
          accounting_name?: string | null
          accounting_nfe_auto_send?: boolean
          accounting_nfe_webhook_url?: string | null
          accounting_sender_name?: string | null
          accounting_webhook_url?: string | null
          ai_connection_validated?: boolean
          ai_enabled?: boolean
          ai_model?: string
          ai_token?: string | null
          ai_validated_at?: string | null
          allow_public_search?: boolean
          auto_logout_enabled?: boolean
          auto_logout_time?: string | null
          barcode_label_config?: Json | null
          barcode_scanner_enabled?: boolean
          cashflow_start_date?: string | null
          company_id: string
          default_ncm?: string | null
          force_logout_at?: string | null
          last_forced_logout_at?: string | null
          network_access_ttl_days?: number
          profit_margin?: number | null
          public_search_end_time?: string | null
          public_search_start_time?: string | null
          stock_code_auto_generate?: boolean | null
          stock_code_prefix?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accounting_email?: string | null
          accounting_emails?: string[]
          accounting_include_pdf?: boolean
          accounting_name?: string | null
          accounting_nfe_auto_send?: boolean
          accounting_nfe_webhook_url?: string | null
          accounting_sender_name?: string | null
          accounting_webhook_url?: string | null
          ai_connection_validated?: boolean
          ai_enabled?: boolean
          ai_model?: string
          ai_token?: string | null
          ai_validated_at?: string | null
          allow_public_search?: boolean
          auto_logout_enabled?: boolean
          auto_logout_time?: string | null
          barcode_label_config?: Json | null
          barcode_scanner_enabled?: boolean
          cashflow_start_date?: string | null
          company_id?: string
          default_ncm?: string | null
          force_logout_at?: string | null
          last_forced_logout_at?: string | null
          network_access_ttl_days?: number
          profit_margin?: number | null
          public_search_end_time?: string | null
          public_search_start_time?: string | null
          stock_code_auto_generate?: boolean | null
          stock_code_prefix?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_usages: {
        Row: {
          amount: number
          created_at: string
          credit_id: string
          id: string
          sale_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credit_id: string
          id?: string
          sale_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_id?: string
          id?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_usages_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "customer_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_usages_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          amount: number
          balance: number
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          origin_sale_id: string | null
          partner_id: string
          reason: string | null
        }
        Insert: {
          amount: number
          balance: number
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          origin_sale_id?: string | null
          partner_id: string
          reason?: string | null
        }
        Update: {
          amount?: number
          balance?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          origin_sale_id?: string | null
          partner_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_origin_sale_id_fkey"
            columns: ["origin_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_business_hours: {
        Row: {
          close_time: string
          company_id: string
          created_at: string | null
          day_of_week: number
          id: string
          is_closed: boolean | null
          open_time: string
        }
        Insert: {
          close_time: string
          company_id: string
          created_at?: string | null
          day_of_week: number
          id?: string
          is_closed?: boolean | null
          open_time: string
        }
        Update: {
          close_time?: string
          company_id?: string
          created_at?: string | null
          day_of_week?: number
          id?: string
          is_closed?: boolean | null
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_business_hours_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_fees_by_km: {
        Row: {
          company_id: string
          created_at: string | null
          fee: number
          id: string
          max_km: number
          min_km: number
        }
        Insert: {
          company_id: string
          created_at?: string | null
          fee: number
          id?: string
          max_km: number
          min_km?: number
        }
        Update: {
          company_id?: string
          created_at?: string | null
          fee?: number
          id?: string
          max_km?: number
          min_km?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_fees_by_km_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_orders: {
        Row: {
          address: string
          company_id: string
          created_at: string | null
          customer_id: string | null
          customer_name: string
          delivery_fee: number | null
          delivery_fee_id: string | null
          driver_id: string | null
          id: string
          notes: string | null
          payment_method: string | null
          sale_id: string | null
          sale_number: number | null
          status: string | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          address: string
          company_id: string
          created_at?: string | null
          customer_id?: string | null
          customer_name: string
          delivery_fee?: number | null
          delivery_fee_id?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          sale_id?: string | null
          sale_number?: number | null
          status?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string
          company_id?: string
          created_at?: string | null
          customer_id?: string | null
          customer_name?: string
          delivery_fee?: number | null
          delivery_fee_id?: string | null
          driver_id?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          sale_id?: string | null
          sale_number?: number | null
          status?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_delivery_fee_id_fkey"
            columns: ["delivery_fee_id"]
            isOneToOne: false
            referencedRelation: "delivery_fees_by_km"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          active: boolean | null
          company_id: string
          created_at: string | null
          id: string
          name: string
          phone: string | null
          vehicle: string | null
        }
        Insert: {
          active?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          phone?: string | null
          vehicle?: string | null
        }
        Update: {
          active?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          phone?: string | null
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          company_id: string
          context: string | null
          created_at: string
          error: string | null
          id: string
          status: string
          subject: string | null
          to_emails: string[]
        }
        Insert: {
          company_id: string
          context?: string | null
          created_at?: string
          error?: string | null
          id?: string
          status?: string
          subject?: string | null
          to_emails?: string[]
        }
        Update: {
          company_id?: string
          context?: string | null
          created_at?: string
          error?: string | null
          id?: string
          status?: string
          subject?: string | null
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_note_attempts: {
        Row: {
          ambiente: string | null
          company_id: string
          created_at: string
          created_by: string | null
          error_code: string | null
          fiscal_note_id: string | null
          http_status: number | null
          id: string
          ref: string | null
          request_payload: Json | null
          response_body: Json | null
          sale_id: string | null
          status: string
        }
        Insert: {
          ambiente?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          fiscal_note_id?: string | null
          http_status?: number | null
          id?: string
          ref?: string | null
          request_payload?: Json | null
          response_body?: Json | null
          sale_id?: string | null
          status: string
        }
        Update: {
          ambiente?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          fiscal_note_id?: string | null
          http_status?: number | null
          id?: string
          ref?: string | null
          request_payload?: Json | null
          response_body?: Json | null
          sale_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_note_attempts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_note_attempts_fiscal_note_id_fkey"
            columns: ["fiscal_note_id"]
            isOneToOne: false
            referencedRelation: "fiscal_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_note_attempts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_notes: {
        Row: {
          ambiente: string | null
          cancelada_em: string | null
          cancelada_por: string | null
          chave: string | null
          company_id: string
          customer_doc: string | null
          customer_name: string | null
          danfce_storage_path: string | null
          danfce_url: string | null
          drive_folder_id: string | null
          drive_pdf_file_id: string | null
          drive_upload_attempts: number
          drive_upload_error: string | null
          drive_upload_next_retry_at: string | null
          drive_upload_status: string
          drive_uploaded_at: string | null
          drive_xml_file_id: string | null
          emitted_at: string | null
          id: string
          motivo_cancelamento: string | null
          motivo_rejeicao: string | null
          notes: string | null
          numero: number | null
          protocolo: string | null
          qr_code_url: string | null
          ref: string | null
          referencia_chave: string | null
          referencia_note_id: string | null
          sale_id: string | null
          sale_number: number | null
          serie: number | null
          status: string | null
          tipo_operacao: string | null
          total: number | null
          type: string
          xml_storage_path: string | null
          xml_url: string | null
        }
        Insert: {
          ambiente?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          chave?: string | null
          company_id: string
          customer_doc?: string | null
          customer_name?: string | null
          danfce_storage_path?: string | null
          danfce_url?: string | null
          drive_folder_id?: string | null
          drive_pdf_file_id?: string | null
          drive_upload_attempts?: number
          drive_upload_error?: string | null
          drive_upload_next_retry_at?: string | null
          drive_upload_status?: string
          drive_uploaded_at?: string | null
          drive_xml_file_id?: string | null
          emitted_at?: string | null
          id?: string
          motivo_cancelamento?: string | null
          motivo_rejeicao?: string | null
          notes?: string | null
          numero?: number | null
          protocolo?: string | null
          qr_code_url?: string | null
          ref?: string | null
          referencia_chave?: string | null
          referencia_note_id?: string | null
          sale_id?: string | null
          sale_number?: number | null
          serie?: number | null
          status?: string | null
          tipo_operacao?: string | null
          total?: number | null
          type: string
          xml_storage_path?: string | null
          xml_url?: string | null
        }
        Update: {
          ambiente?: string | null
          cancelada_em?: string | null
          cancelada_por?: string | null
          chave?: string | null
          company_id?: string
          customer_doc?: string | null
          customer_name?: string | null
          danfce_storage_path?: string | null
          danfce_url?: string | null
          drive_folder_id?: string | null
          drive_pdf_file_id?: string | null
          drive_upload_attempts?: number
          drive_upload_error?: string | null
          drive_upload_next_retry_at?: string | null
          drive_upload_status?: string
          drive_uploaded_at?: string | null
          drive_xml_file_id?: string | null
          emitted_at?: string | null
          id?: string
          motivo_cancelamento?: string | null
          motivo_rejeicao?: string | null
          notes?: string | null
          numero?: number | null
          protocolo?: string | null
          qr_code_url?: string | null
          ref?: string | null
          referencia_chave?: string | null
          referencia_note_id?: string | null
          sale_id?: string | null
          sale_number?: number | null
          serie?: number | null
          status?: string | null
          tipo_operacao?: string | null
          total?: number | null
          type?: string
          xml_storage_path?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_notes_referencia_note_id_fkey"
            columns: ["referencia_note_id"]
            isOneToOne: false
            referencedRelation: "fiscal_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_notes_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_settings: {
        Row: {
          ambiente: string | null
          auto_print_nfce: boolean
          cep: string | null
          certificado_validade: string | null
          cnae: string | null
          cnpj: string | null
          cod_municipio_ibge: string | null
          company_id: string
          crt: number | null
          csc: string | null
          csc_id: string | null
          email: string | null
          endereco: string | null
          endereco_bairro: string | null
          endereco_complemento: string | null
          endereco_logradouro: string | null
          endereco_numero: string | null
          focus_company_token: string | null
          focus_token_homologacao: string | null
          focus_token_producao: string | null
          ie: string | null
          im: string | null
          impressora_modelo: string | null
          municipio: string | null
          nfce_ativa: boolean | null
          proximo_numero_nfce: number | null
          razao_social: string | null
          regime: string | null
          regime_tributario: number | null
          serie: number | null
          serie_nfce: number | null
          telefone: string | null
          uf: string | null
          ultimo_numero: number | null
          updated_at: string | null
        }
        Insert: {
          ambiente?: string | null
          auto_print_nfce?: boolean
          cep?: string | null
          certificado_validade?: string | null
          cnae?: string | null
          cnpj?: string | null
          cod_municipio_ibge?: string | null
          company_id: string
          crt?: number | null
          csc?: string | null
          csc_id?: string | null
          email?: string | null
          endereco?: string | null
          endereco_bairro?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          focus_company_token?: string | null
          focus_token_homologacao?: string | null
          focus_token_producao?: string | null
          ie?: string | null
          im?: string | null
          impressora_modelo?: string | null
          municipio?: string | null
          nfce_ativa?: boolean | null
          proximo_numero_nfce?: number | null
          razao_social?: string | null
          regime?: string | null
          regime_tributario?: number | null
          serie?: number | null
          serie_nfce?: number | null
          telefone?: string | null
          uf?: string | null
          ultimo_numero?: number | null
          updated_at?: string | null
        }
        Update: {
          ambiente?: string | null
          auto_print_nfce?: boolean
          cep?: string | null
          certificado_validade?: string | null
          cnae?: string | null
          cnpj?: string | null
          cod_municipio_ibge?: string | null
          company_id?: string
          crt?: number | null
          csc?: string | null
          csc_id?: string | null
          email?: string | null
          endereco?: string | null
          endereco_bairro?: string | null
          endereco_complemento?: string | null
          endereco_logradouro?: string | null
          endereco_numero?: string | null
          focus_company_token?: string | null
          focus_token_homologacao?: string | null
          focus_token_producao?: string | null
          ie?: string | null
          im?: string | null
          impressora_modelo?: string | null
          municipio?: string | null
          nfce_ativa?: boolean | null
          proximo_numero_nfce?: number | null
          razao_social?: string | null
          regime?: string | null
          regime_tributario?: number | null
          serie?: number | null
          serie_nfce?: number | null
          telefone?: string | null
          uf?: string | null
          ultimo_numero?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          custom_role_id: string | null
          id: string
          is_blocked: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          custom_role_id?: string | null
          id?: string
          is_blocked?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          custom_role_id?: string | null
          id?: string
          is_blocked?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
      }
      partner_addresses: {
        Row: {
          address: string
          cep: string | null
          company_id: string
          complement: string | null
          created_at: string | null
          id: string
          is_default: boolean | null
          number: string | null
          partner_id: string
          updated_at: string | null
        }
        Insert: {
          address: string
          cep?: string | null
          company_id: string
          complement?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          number?: string | null
          partner_id: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          cep?: string | null
          company_id?: string
          complement?: string | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          number?: string | null
          partner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_addresses_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          active: boolean
          address: string | null
          cep: string | null
          cod_municipio_ibge: string | null
          company_id: string
          complement: string | null
          created_at: string
          created_by: string | null
          doc: string | null
          email: string | null
          id: string
          ie: string | null
          ie_indicador: number | null
          name: string
          notes: string | null
          number: string | null
          phone: string | null
          telegram_id: string | null
          type: Database["public"]["Enums"]["partner_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          cep?: string | null
          cod_municipio_ibge?: string | null
          company_id: string
          complement?: string | null
          created_at?: string
          created_by?: string | null
          doc?: string | null
          email?: string | null
          id?: string
          ie?: string | null
          ie_indicador?: number | null
          name: string
          notes?: string | null
          number?: string | null
          phone?: string | null
          telegram_id?: string | null
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          cep?: string | null
          cod_municipio_ibge?: string | null
          company_id?: string
          complement?: string | null
          created_at?: string
          created_by?: string | null
          doc?: string | null
          email?: string | null
          id?: string
          ie?: string | null
          ie_indicador?: number | null
          name?: string
          notes?: string | null
          number?: string | null
          phone?: string | null
          telegram_id?: string | null
          type?: Database["public"]["Enums"]["partner_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partners_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payables: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string | null
          description: string
          direction: Database["public"]["Enums"]["payable_direction"]
          due_date: string
          id: string
          notes: string | null
          paid_at: string | null
          partner_id: string | null
          payment_method: string | null
          sale_id: string | null
          status: Database["public"]["Enums"]["payable_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          created_by?: string | null
          description: string
          direction: Database["public"]["Enums"]["payable_direction"]
          due_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          partner_id?: string | null
          payment_method?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: Database["public"]["Enums"]["payable_direction"]
          due_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          partner_id?: string | null
          payment_method?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["payable_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payables_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payables_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          active: boolean
          auto_issue_nfce: boolean
          bandeira: string | null
          cnpj_credenciadora: string | null
          codigo_sefaz: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          requires_due_date: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_issue_nfce?: boolean
          bandeira?: string | null
          cnpj_credenciadora?: string | null
          codigo_sefaz?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          requires_due_date?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_issue_nfce?: boolean
          bandeira?: string | null
          cnpj_credenciadora?: string | null
          codigo_sefaz?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          requires_due_date?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_references: {
        Row: {
          brand_id: string | null
          company_id: string
          created_at: string
          id: string
          manufacturer_code: string | null
          product_id: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          manufacturer_code?: string | null
          product_id: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          manufacturer_code?: string | null
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_references_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_references_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          alternative_code: string | null
          brand: string | null
          brand_id: string | null
          category_id: string | null
          cest: string | null
          cfop: string | null
          cofins_aliquota: number | null
          cofins_cst: string | null
          company_id: string
          cost_price: number
          created_at: string
          created_by: string | null
          description: string | null
          gtin: string | null
          gtin_tributavel: string | null
          icms_aliquota: number | null
          icms_csosn: string | null
          icms_cst: string | null
          icms_reducao_bc: number | null
          id: string
          image_url: string | null
          location_id: string | null
          min_stock: number
          name: string
          ncm: string | null
          origem: number | null
          pis_aliquota: number | null
          pis_cst: string | null
          sale_price: number
          search_tsv: unknown
          sku: string
          stock: number
          supplier_id: string | null
          unidade_tributavel: string | null
          unit: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          alternative_code?: string | null
          brand?: string | null
          brand_id?: string | null
          category_id?: string | null
          cest?: string | null
          cfop?: string | null
          cofins_aliquota?: number | null
          cofins_cst?: string | null
          company_id: string
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          gtin?: string | null
          gtin_tributavel?: string | null
          icms_aliquota?: number | null
          icms_csosn?: string | null
          icms_cst?: string | null
          icms_reducao_bc?: number | null
          id?: string
          image_url?: string | null
          location_id?: string | null
          min_stock?: number
          name: string
          ncm?: string | null
          origem?: number | null
          pis_aliquota?: number | null
          pis_cst?: string | null
          sale_price?: number
          search_tsv?: unknown
          sku: string
          stock?: number
          supplier_id?: string | null
          unidade_tributavel?: string | null
          unit?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          alternative_code?: string | null
          brand?: string | null
          brand_id?: string | null
          category_id?: string | null
          cest?: string | null
          cfop?: string | null
          cofins_aliquota?: number | null
          cofins_cst?: string | null
          company_id?: string
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          gtin?: string | null
          gtin_tributavel?: string | null
          icms_aliquota?: number | null
          icms_csosn?: string | null
          icms_cst?: string | null
          icms_reducao_bc?: number | null
          id?: string
          image_url?: string | null
          location_id?: string | null
          min_stock?: number
          name?: string
          ncm?: string | null
          origem?: number | null
          pis_aliquota?: number | null
          pis_cst?: string | null
          sale_price?: number
          search_tsv?: unknown
          sku?: string
          stock?: number
          supplier_id?: string | null
          unidade_tributavel?: string | null
          unit?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      quotations: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          discount: number
          id: string
          items: Json
          notes: string | null
          number: number
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          items?: Json
          notes?: string | null
          number?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          items?: Json
          notes?: string | null
          number?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          id: string
          module: string
          role_id: string
          updated_at: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module: string
          role_id: string
          updated_at?: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          id?: string
          module?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "company_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_edit_logs: {
        Row: {
          company_id: string
          created_at: string
          diff: Json
          edited_by: string | null
          id: string
          reason: string | null
          sale_id: string
          snapshot_after: Json
          snapshot_before: Json
        }
        Insert: {
          company_id: string
          created_at?: string
          diff: Json
          edited_by?: string | null
          id?: string
          reason?: string | null
          sale_id: string
          snapshot_after: Json
          snapshot_before: Json
        }
        Update: {
          company_id?: string
          created_at?: string
          diff?: Json
          edited_by?: string | null
          id?: string
          reason?: string | null
          sale_id?: string
          snapshot_after?: Json
          snapshot_before?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sale_edit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_edit_logs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          company_id: string
          id: string
          product_id: string
          quantity: number
          sale_id: string
          total: number
          unit_price: number
        }
        Insert: {
          company_id: string
          id?: string
          product_id: string
          quantity: number
          sale_id: string
          total: number
          unit_price: number
        }
        Update: {
          company_id?: string
          id?: string
          product_id?: string
          quantity?: number
          sale_id?: string
          total?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          first_due_date: string | null
          id: string
          installments: number
          method: string
          notes: string | null
          payment_method_id: string | null
          sale_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          first_due_date?: string | null
          id?: string
          installments?: number
          method: string
          notes?: string | null
          payment_method_id?: string | null
          sale_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          first_due_date?: string | null
          id?: string
          installments?: number
          method?: string
          notes?: string | null
          payment_method_id?: string | null
          sale_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cash_register_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          due_date: string | null
          id: string
          nf_type: string
          notes: string | null
          number: number
          origin: string
          origin_sale_id: string | null
          payment_method: string | null
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total: number
          type: string
        }
        Insert: {
          cash_register_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          nf_type?: string
          notes?: string | null
          number?: number
          origin?: string
          origin_sale_id?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
          type?: string
        }
        Update: {
          cash_register_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          nf_type?: string
          notes?: string | null
          number?: number
          origin?: string
          origin_sale_id?: string | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_origin_sale_id_fkey"
            columns: ["origin_sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_items: {
        Row: {
          company_id: string
          count_id: string
          created_at: string
          expected_quantity: number
          id: string
          product_id: string
          product_name: string
          sku: string
          unit: string
          updated_at: string
          verified: boolean
          verified_at: string | null
        }
        Insert: {
          company_id: string
          count_id: string
          created_at?: string
          expected_quantity?: number
          id?: string
          product_id: string
          product_name: string
          sku: string
          unit?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Update: {
          company_id?: string
          count_id?: string
          created_at?: string
          expected_quantity?: number
          id?: string
          product_id?: string
          product_name?: string
          sku?: string
          unit?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_team_locations: {
        Row: {
          company_id: string
          count_id: string
          id: string
          location_id: string
          team_id: string
        }
        Insert: {
          company_id: string
          count_id: string
          id?: string
          location_id: string
          team_id: string
        }
        Update: {
          company_id?: string
          count_id?: string
          id?: string
          location_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_team_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_team_locations_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_team_locations_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_team_locations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "stock_count_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_team_members: {
        Row: {
          company_id: string
          count_id: string
          created_at: string
          id: string
          team_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          count_id: string
          created_at?: string
          id?: string
          team_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          count_id?: string
          created_at?: string
          id?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_team_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_team_members_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "stock_count_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_count_teams: {
        Row: {
          company_id: string
          count_id: string
          created_at: string | null
          id: string
          name: string
          status: string | null
        }
        Insert: {
          company_id: string
          count_id: string
          created_at?: string | null
          id?: string
          name: string
          status?: string | null
        }
        Update: {
          company_id?: string
          count_id?: string
          created_at?: string | null
          id?: string
          name?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_count_teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_count_teams_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "stock_counts"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_counts: {
        Row: {
          company_id: string
          count_date: string
          created_at: string
          created_by: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          count_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          count_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_counts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          area_height: number | null
          area_width: number | null
          company_id: string
          created_at: string
          id: string
          is_vertical: boolean | null
          name: string
          pos_x: number | null
          pos_y: number | null
        }
        Insert: {
          area_height?: number | null
          area_width?: number | null
          company_id: string
          created_at?: string
          id?: string
          is_vertical?: boolean | null
          name: string
          pos_x?: number | null
          pos_y?: number | null
        }
        Update: {
          area_height?: number | null
          area_width?: number | null
          company_id?: string
          created_at?: string
          id?: string
          is_vertical?: boolean | null
          name?: string
          pos_x?: number | null
          pos_y?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          product_id: string
          quantity: number
          reason: string | null
          type: Database["public"]["Enums"]["movement_type"]
          unit_cost: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          type: Database["public"]["Enums"]["movement_type"]
          unit_cost?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          ai_product_lookup_enabled: boolean
          brand_logo_url: string | null
          brand_name: string | null
          bulk_count_verification_enabled: boolean
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_product_lookup_enabled?: boolean
          brand_logo_url?: string | null
          brand_name?: string | null
          bulk_count_verification_enabled?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_product_lookup_enabled?: boolean
          brand_logo_url?: string | null
          brand_name?: string | null
          bulk_count_verification_enabled?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      units: {
        Row: {
          abbreviation: string
          company_id: string
          created_at: string
          description: string
          id: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          company_id: string
          created_at?: string
          description: string
          id?: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          company_id?: string
          created_at?: string
          description?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["system_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["system_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["system_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          agenda_alert_sound_enabled: boolean | null
          agenda_alert_sound_type: string | null
          company_id: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agenda_alert_sound_enabled?: boolean | null
          agenda_alert_sound_type?: string | null
          company_id: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agenda_alert_sound_enabled?: boolean | null
          agenda_alert_sound_type?: string | null
          company_id?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tasks: {
        Row: {
          company_id: string
          created_at: string | null
          description: string | null
          due_at: string
          id: string
          reminder_at: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          description?: string | null
          due_at: string
          id?: string
          reminder_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          description?: string | null
          due_at?: string
          id?: string
          reminder_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          company_id: string | null
          created_at: string
          delivery_id: string | null
          event: string
          id: string
          last_attempt_at: string | null
          last_response: string | null
          last_status_code: number | null
          payload: Json
          status: string
        }
        Insert: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          delivery_id?: string | null
          event: string
          id?: string
          last_attempt_at?: string | null
          last_response?: string | null
          last_status_code?: number | null
          payload: Json
          status?: string
        }
        Update: {
          attempts?: number
          company_id?: string | null
          created_at?: string
          delivery_id?: string | null
          event?: string
          id?: string
          last_attempt_at?: string | null
          last_response?: string | null
          last_status_code?: number | null
          payload?: Json
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_customer_credit: {
        Args: { _amount: number; _partner: string; _sale: string }
        Returns: number
      }
      apply_focus_nfe_webhook: {
        Args: {
          _chave?: string
          _danfce_url?: string
          _motivo_rejeicao?: string
          _protocolo?: string
          _qr_code_url?: string
          _ref: string
          _status: string
          _xml_url?: string
        }
        Returns: Json
      }
      approve_company: { Args: { _company: string }; Returns: undefined }
      cancel_sale: { Args: { _sale: string }; Returns: string }
      cancel_sale_with_credit: {
        Args: {
          _cpf?: string
          _mode: string
          _name?: string
          _partner_id?: string
          _reason: string
          _sale: string
        }
        Returns: Json
      }
      clear_n8n_logs: { Args: never; Returns: number }
      companies_due_for_auto_logout: {
        Args: never
        Returns: {
          company_id: string
        }[]
      }
      create_return_sale: {
        Args: {
          _cpf?: string
          _items: Json
          _mode: string
          _name?: string
          _origin_sale: string
          _partner_id?: string
          _reason: string
        }
        Returns: Json
      }
      delete_sale: { Args: { _sale_id: string }; Returns: undefined }
      dispatch_delivery_webhook: {
        Args: { _delivery_id: string; _event: string }
        Returns: undefined
      }
      edit_sale: {
        Args: {
          _customer_id: string
          _discount: number
          _due_date: string
          _items: Json
          _notes: string
          _payment_method: string
          _reason: string
          _sale_id: string
        }
        Returns: string
      }
      f_unaccent: { Args: { "": string }; Returns: string }
      finalize_sale_validated: {
        Args: {
          _expected_total: number
          _payment_method: string
          _sale_id: string
        }
        Returns: string
      }
      get_app_base_url: { Args: never; Returns: string }
      get_company_ai_token: { Args: { _company: string }; Returns: string }
      get_company_invite_code: { Args: { _company: string }; Returns: string }
      get_customer_credit_balance: {
        Args: { _partner: string }
        Returns: number
      }
      has_company_role: {
        Args: {
          _company: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      has_open_stock_count: { Args: { _company: string }; Returns: boolean }
      has_permission: {
        Args: { _action: string; _company: string; _module: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["system_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _company: string }; Returns: boolean }
      is_member: { Args: { _company: string }; Returns: boolean }
      is_public_search_time_allowed: {
        Args: { _end: string; _start: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      join_company_by_code: { Args: { _code: string }; Returns: string }
      list_companies_by_ip: {
        Args: { _ip: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      list_pending_companies: {
        Args: never
        Returns: {
          cnpj: string
          created_at: string
          created_by: string
          creator_email: string
          creator_name: string
          id: string
          invite_code: string
          name: string
          rejected_at: string
          rejection_reason: string
        }[]
      }
      list_super_admin_ids: { Args: never; Returns: string[] }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      products_compute_tsv: { Args: { _id: string }; Returns: unknown }
      public_stock_search: {
        Args: { _company: string; _term: string }
        Returns: {
          alternative_code: string
          brand_name: string
          description: string
          has_location: boolean
          id: string
          image_url: string
          location_name: string
          min_stock: number
          name: string
          sale_price: number
          sku: string
          stock: number
          unit: string
        }[]
      }
      purge_expired_network_access: { Args: never; Returns: number }
      refresh_product_search_tsv: {
        Args: { _product_id: string }
        Returns: undefined
      }
      register_network_access: {
        Args: { _company: string; _ip: string; _ua: string }
        Returns: undefined
      }
      register_sale: {
        Args: {
          _company: string
          _customer: string
          _discount?: number
          _due_date?: string
          _items: Json
          _notes?: string
          _payment_method?: string
          _status?: Database["public"]["Enums"]["sale_status"]
        }
        Returns: string
      }
      reject_company: {
        Args: { _company: string; _reason?: string }
        Returns: undefined
      }
      reopen_sale_to_cart: { Args: { _sale: string }; Returns: string }
      rotate_invite_code: { Args: { _company: string }; Returns: string }
      search_products:
        | {
            Args: {
              _brand?: string
              _category?: string
              _company: string
              _has_refs?: boolean
              _limit?: number
              _location?: string
              _offset?: number
              _q?: string
              _sort_by?: string
              _sort_desc?: boolean
              _status?: string
            }
            Returns: Json
          }
        | {
            Args: {
              _brand?: string
              _category?: string
              _company: string
              _has_refs?: boolean
              _limit?: number
              _location?: string
              _ncm_filter?: string
              _offset?: number
              _q?: string
              _sort_by?: string
              _sort_desc?: boolean
              _status?: string
            }
            Returns: Json
          }
      seed_default_company_roles_for: {
        Args: { _company: string }
        Returns: undefined
      }
      seed_system_barcode_labels_for: {
        Args: { _company: string }
        Returns: undefined
      }
      set_company_ai_token: {
        Args: { _company: string; _token: string }
        Returns: undefined
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "gerente" | "vendedor" | "estoquista"
      movement_type: "entrada" | "saida" | "ajuste"
      partner_type: "cliente" | "fornecedor" | "ambos"
      payable_direction: "receber" | "pagar"
      payable_status: "aberto" | "pago" | "cancelado"
      sale_status: "aberta" | "concluida" | "cancelada" | "aguardando"
      system_role: "super_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "gerente", "vendedor", "estoquista"],
      movement_type: ["entrada", "saida", "ajuste"],
      partner_type: ["cliente", "fornecedor", "ambos"],
      payable_direction: ["receber", "pagar"],
      payable_status: ["aberto", "pago", "cancelado"],
      sale_status: ["aberta", "concluida", "cancelada", "aguardando"],
      system_role: ["super_admin"],
    },
  },
} as const
