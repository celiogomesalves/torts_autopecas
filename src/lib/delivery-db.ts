import { appwrite } from "@/integrations/appwrite/client";
import type { DeliveryBusinessHour, DeliveryFeeByKm } from "./db-types";

const db = appwrite as any;

export async function fetchDeliveryBusinessHours(
  companyId: string,
): Promise<DeliveryBusinessHour[]> {
  const { data, error } = await db
    .from("delivery_business_hours")
    .select("*")
    .eq("company_id", companyId)
    .order("day_of_week");
  if (error) throw error;
  return data ?? [];
}

export async function upsertDeliveryBusinessHour(
  companyId: string,
  hour: Partial<DeliveryBusinessHour>,
) {
  const { data, error } = await db
    .from("delivery_business_hours")
    .upsert({ ...hour, company_id: companyId }, { onConflict: "company_id,day_of_week" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDeliveryFeesByKm(companyId: string): Promise<DeliveryFeeByKm[]> {
  const { data, error } = await db
    .from("delivery_fees_by_km")
    .select("*")
    .eq("company_id", companyId)
    .order("min_km");
  if (error) throw error;
  return data ?? [];
}

export async function upsertDeliveryFeeByKm(companyId: string, fee: Partial<DeliveryFeeByKm>) {
  const { data, error } = await db
    .from("delivery_fees_by_km")
    .upsert({ ...fee, company_id: companyId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDeliveryFeeByKm(id: string) {
  const { error } = await db.from("delivery_fees_by_km").delete().eq("id", id);
  if (error) throw error;
}
