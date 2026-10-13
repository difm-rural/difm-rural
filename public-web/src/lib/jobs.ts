import { createClient } from "@supabase/supabase-js";

export type PublicJob = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  price_type: string | null;
  price: number | null;
  location_area: string | null;
  photos: string[] | null;
};

export async function getFeaturedJobs(): Promise<PublicJob[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return [];

  const supabase = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Read the jobs_public VIEW, never the base jobs table: the view masks the exact
  // location, exposing only the coarse location_area to the public site.
  const { data, error } = await supabase
    .from("jobs_public")
    .select(
      "id,title,description,category,price_type,price,location_area,photos,created_at"
    )
    .eq("status", "open")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error || !data) return [];
  return data as PublicJob[];
}

export function formatJobPrice(job: PublicJob) {
  if (job.price == null) return "Open to offers";
  if (job.price_type === "hourly") return `$${job.price}/hr`;
  return `$${job.price}`;
}
