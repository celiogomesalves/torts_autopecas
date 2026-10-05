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
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
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
          ai_connection_validated: boolean
          ai_enabled: boolean
          ai_model: string
          ai_token: string | null
          ai_validated_at: string | null
          allow_public_search: boolean
          barcode_label_config: Json | null
          barcode_scanner_enabled: boolean
          cashflow_start_date: string | null
          company_id: string
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
          ai_connection_validated?: boolean
          ai_enabled?: boolean
          ai_model?: string
          ai_token?: string | null
          ai_validated_at?: string | null
          allow_public_search?: boolean
          barcode_label_config?: Json | null
          barcode_scanner_enabled?: boolean
          cashflow_start_date?: string | null
          company_id: string
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
          ai_connection_validated?: boolean
          ai_enabled?: boolean
          ai_model?: string
          ai_token?: string | null
          ai_validated_at?: string | null
          allow_public_search?: boolean
          barcode_label_config?: Json | null
          barcode_scanner_enabled?: boolean
          cashflow_start_date?: string | null
          company_id?: string
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
      fiscal_notes: {
        Row: {
          ambiente: string | null
          chave: string
          company_id: string
          customer_doc: string | null
          customer_name: string
          emitted_at: string | null
          id: string
          notes: string | null
          numero: number
          sale_id: string | null
          sale_number: number | null
          serie: number
          status: string | null
          total: number
          type: string
        }
        Insert: {
          ambiente?: string | null
          chave: string
          company_id: string
          customer_doc?: string | null
          customer_name: string
          emitted_at?: string | null
          id?: string
          notes?: string | null
          numero: number
          sale_id?: string | null
          sale_number?: number | null
          serie: number
          status?: string | null
          total: number
          type: string
        }
        Update: {
          ambiente?: string | null
          chave?: string
          company_id?: string
          customer_doc?: string | null
          customer_name?: string
          emitted_at?: string | null
          id?: string
          notes?: string | null
          numero?: number
          sale_id?: string | null
          sale_number?: number | null
          serie?: number
          status?: string | null
          total?: number
          type?: string
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
          cnpj: string | null
          company_id: string
          endereco: string | null
          ie: string | null
          razao_social: string | null
          regime: string | null
          serie: number | null
          ultimo_numero: number | null
          updated_at: string | null
        }
        Insert: {
          ambiente?: string | null
          cnpj?: string | null
          company_id: string
          endereco?: string | null
          ie?: string | null
          razao_social?: string | null
          regime?: string | null
          serie?: number | null
          ultimo_numero?: number | null
          updated_at?: string | null
        }
        Update: {
          ambiente?: string | null
          cnpj?: string | null
          company_id?: string
          endereco?: string | null
          ie?: string | null
          razao_social?: string | null
          regime?: string | null
          serie?: number | null
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
          company_id: string
          complement: string | null
          created_at: string
          created_by: string | null
          doc: string | null
          email: string | null
          id: string
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
          company_id: string
          complement?: string | null
          created_at?: string
          created_by?: string | null
          doc?: string | null
          email?: string | null
          id?: string
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
          company_id?: string
          complement?: string | null
          created_at?: string
          created_by?: string | null
          doc?: string | null
          email?: string | null
          id?: string
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
          company_id: string
          created_at: string
          id: string
          name: string
          requires_due_date: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          requires_due_date?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
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
          barcode: string | null
          brand: string | null
          brand_id: string | null
          category_id: string | null
          company_id: string
          cost_price: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          location_id: string | null
          min_stock: number
          name: string
          sale_price: number
          sku: string
          stock: number
          supplier_id: string | null
          unit: string
          unit_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          alternative_code?: string | null
          barcode?: string | null
          brand?: string | null
          brand_id?: string | null
          category_id?: string | null
          company_id: string
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          location_id?: string | null
          min_stock?: number
          name: string
          sale_price?: number
          sku: string
          stock?: number
          supplier_id?: string | null
          unit?: string
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          alternative_code?: string | null
          barcode?: string | null
          brand?: string | null
          brand_id?: string | null
          category_id?: string | null
          company_id?: string
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          location_id?: string | null
          min_stock?: number
          name?: string
          sale_price?: number
          sku?: string
          stock?: number
          supplier_id?: string | null
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
      sales: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          customer_id: string | null
          discount: number
          due_date: string | null
          id: string
          notes: string | null
          number: number
          payment_method: string | null
          status: Database["public"]["Enums"]["sale_status"]
          subtotal: number
          total: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          number?: number
          payment_method?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          discount?: number
          due_date?: string | null
          id?: string
          notes?: string | null
          number?: number
          payment_method?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          subtotal?: number
          total?: number
        }
        Relationships: [
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
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ai_product_lookup_enabled?: boolean
          brand_logo_url?: string | null
          brand_name?: string | null
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ai_product_lookup_enabled?: boolean
          brand_logo_url?: string | null
          brand_name?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_company: { Args: { _company: string }; Returns: undefined }
      clear_n8n_logs: { Args: never; Returns: number }
      delete_sale: { Args: { _sale_id: string }; Returns: undefined }
      finalize_sale_validated: {
        Args: {
          _expected_total: number
          _payment_method: string
          _sale_id: string
        }
        Returns: string
      }
      get_app_base_url: { Args: never; Returns: string }
      has_company_role: {
        Args: {
          _company: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
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
      register_network_access: {
        Args: { _company: string; _ip: string; _ua: string }
        Returns: undefined
      }
      register_sale:
        | {
            Args: {
              _company: string
              _customer: string
              _discount?: number
              _due_date?: string
              _items: Json
              _notes?: string
              _payment_method?: string
            }
            Returns: string
          }
        | {
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
      rotate_invite_code: { Args: { _company: string }; Returns: string }
      seed_default_company_roles_for: {
        Args: { _company: string }
        Returns: undefined
      }
      seed_system_barcode_labels_for: {
        Args: { _company: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
