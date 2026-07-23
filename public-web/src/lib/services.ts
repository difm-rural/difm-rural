import { createClient } from "@supabase/supabase-js";

export type PublicService = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  pricing_type: string | null;
  rate: number | null;
  unit_label: string | null;
  location_name: string | null;
  photos: string[] | null;
  card_headline: string | null;
  card_supporting_text: string | null;
  card_style: "bold" | "bottom" | "clean" | null;
};

export async function getFeaturedServices(): Promise<PublicService[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return [];

  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("services")
    .select(
      "id,title,description,category,pricing_type,rate,unit_label,location_name,photos,card_headline,card_supporting_text,card_style"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error || !data) return [];
  return data as PublicService[];
}

export function formatServicePrice(service: PublicService) {
  if (service.pricing_type === "quote_required") return "Quote required";
  if (service.rate == null) return "Ask for pricing";
  if (service.pricing_type === "hourly") return `$${service.rate}/hr`;
  if (service.pricing_type === "day_rate") return `$${service.rate}/day`;
  if (service.pricing_type === "per_unit") {
    return `$${service.rate}/${service.unit_label || "unit"}`;
  }
  return `$${service.rate} fixed`;
}
