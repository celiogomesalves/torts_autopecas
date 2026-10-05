// Tipos manuais que espelham o schema Appwrite.
// Substituir pelos tipos gerados (Database) após a migração ser aplicada.

export type Role = "admin" | "gerente" | "vendedor" | "estoquista";
export type MovementType = "entrada" | "saida" | "ajuste" | "venda" | "devolucao";

// ---------- Custom Roles & Permissions ----------
export type PermissionAction = "view" | "create" | "edit" | "delete";

export interface CompanyRole {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  updated_at: string;
}

export interface CompanyRoleWithPermissions extends CompanyRole {
  permissions: RolePermission[];
}

export interface Company {
  id: string;
  name: string;
  cnpj: string | null;
  invite_code: string;
  phone: string | null;
  created_by: string | null;
  created_at: string;
  approved?: boolean;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
}

export interface PendingCompany {
  id: string;
  name: string;
  cnpj: string | null;
  invite_code: string;
  created_at: string;
  created_by: string | null;
  creator_name: string | null;
  creator_email: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
}

export interface Membership {
  id: string;
  user_id: string;
  company_id: string;
  role: Role;
  custom_role_id?: string | null;
  created_at: string;
  is_blocked?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface Category {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Brand {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  location_id: string | null;
  sku: string;
  alternative_code: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  description: string | null;
  cost_price: number;
  sale_price: number;
  stock: number;
  min_stock: number;
  unit: string;
  unit_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  image_url?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  // Join fields
  profiles?: { name: string } | null;
}

export interface StockLocation {
  id: string;
  company_id: string;
  name: string;
  created_at: string;
}

export interface Unit {
  id: string;
  company_id: string;
  abbreviation: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  company_id: string;
  product_id: string;
  type: MovementType;
  quantity: number;
  unit_cost: number | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface StockCount {
  id: string;
  company_id: string;
  count_date: string;
  status: "aberta" | "concluida";
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockCountItem {
  id: string;
  count_id: string;
  company_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  expected_quantity: number;
  verified: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockCountTeam {
  id: string;
  count_id: string;
  company_id: string;
  name: string;
  status: "aberta" | "concluida";
  created_at: string;
  locations?: string[];
  members?: string[];
}

export interface StockCountTeamLocation {
  id: string;
  company_id: string;
  count_id: string;
  team_id: string;
  location_id: string;
}


export type PartnerType = "cliente" | "fornecedor" | "ambos";
export type SaleStatus = "aberta" | "concluida" | "cancelada" | "aguardando";
export type PayableDirection = "receber" | "pagar";
export type PayableStatus = "aberto" | "pago" | "cancelado";

export interface Partner {
  id: string;
  company_id: string;
  type: PartnerType;
  name: string;
  doc: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  cep: string | null;
  number: string | null;
  complement: string | null;
  notes: string | null;
  active: boolean;
  telegram_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartnerAddress {
  id: string;
  company_id: string;
  partner_id: string;
  address: string;
  complement: string | null;
  number: string | null;
  cep: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  company_id: string;
  customer_id: string | null;
  number: number;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string | null;
  due_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  company_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Payable {
  id: string;
  company_id: string;
  direction: PayableDirection;
  partner_id: string | null;
  sale_id: string | null;
  description: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: PayableStatus;
  payment_method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  company_id: string;
  name: string;
  requires_due_date: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------- Delivery ----------
export type DeliveryStatus =
  | "aguardando_confirmacao"
  | "preparo"
  | "rota"
  | "entregue"
  | "cancelado";

export interface Driver {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  active: boolean;
  created_at: string;
}

export interface DeliveryBusinessHour {
  id: string;
  company_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: boolean;
}

export interface DeliveryFeeByKm {
  id: string;
  company_id: string;
  min_km: number;
  max_km: number;
  fee: number;
}

export interface DeliveryOrder {
  id: string;
  company_id: string;
  sale_id: string | null;
  sale_number: number | null;
  customer_id: string | null;
  customer_name: string;
  address: string;
  total: number;
  driver_id: string | null;
  status: DeliveryStatus;
  notes: string | null;
  delivery_fee?: number;
  delivery_fee_id?: string | null;
  created_at: string;
  updated_at: string;
  items?: { product_id: string; quantity: number; unit_price: number }[];
}

// ---------- Conciliation ----------
export interface BankTransaction {
  id: string;
  company_id: string;
  date: string;
  description: string;
  amount: number;
  matched_payable_id: string | null;
  reconciled: boolean;
  imported_at: string;
}

// ---------- Fiscal ----------
export type NfType = "NF-e" | "NFC-e";
export type NfStatus = "rascunho" | "autorizada" | "cancelada";

export interface FiscalSettings {
  company_id: string;
  razao_social: string | null;
  cnpj: string | null;
  ie: string | null;
  regime: string | null;
  endereco: string | null;
  ambiente: "homologacao" | "producao";
  ultimo_numero: number;
  serie: number;
  updated_at: string;
}

export interface FiscalNote {
  id: string;
  company_id: string;
  type: NfType;
  numero: number;
  serie: number;
  sale_id: string | null;
  sale_number: number | null;
  customer_name: string;
  customer_doc: string | null;
  total: number;
  chave: string;
  status: NfStatus;
  ambiente: string | null;
  notes: string | null;
  emitted_at: string;
}
