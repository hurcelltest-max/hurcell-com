import { supabase } from "@/lib/supabaseClient";
import type { Database } from "@/lib/types";
import type {
  PostgrestMaybeSingleResponse,
  PostgrestResponse,
  PostgrestSingleResponse,
} from "@supabase/postgrest-js";

function getSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase client not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
  }
  return supabase;
}

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type NewProduct = Database["public"]["Tables"]["products"]["Insert"];
export type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

export type ProductListResponse = PostgrestResponse<Product>;
export type ProductSingleResponse = PostgrestSingleResponse<Product>;
export type ProductKeyResponse = PostgrestMaybeSingleResponse<{ id: string; stock: number }>;

export async function fetchProducts(): Promise<ProductListResponse> {
  return (await getSupabase().from('products').select('*').order('created_at', { ascending: false })) as ProductListResponse;
}

export async function findProductByBarcode(barcode: string): Promise<ProductKeyResponse> {
  return (await getSupabase().from('products').select('id, stock').eq('barcode', barcode).maybeSingle()) as ProductKeyResponse;
}

export async function createProduct(product: NewProduct): Promise<ProductSingleResponse> {
  return (await getSupabase().from('products').insert([product as unknown as never]).select().single()) as ProductSingleResponse;
}

export async function updateProduct(productId: string, updates: ProductUpdate): Promise<ProductSingleResponse> {
  return (await getSupabase().from('products').update(updates as unknown as never).eq('id', productId).select().single()) as ProductSingleResponse;
}

export async function deleteProduct(productId: string) {
  return await getSupabase().from('products').delete().eq('id', productId);
}

export async function changeProductStock(
  productId: string,
  newStock: number,
  quantity: number,
  movementType: "IN" | "OUT" | "RETURN",
  note?: string
): Promise<{ data: Product | null; error: unknown }> {
  const updateResponse = await getSupabase()
    .from('products')
    .update({ stock: newStock } as unknown as never)
    .eq('id', productId)
    .select()
    .single();
  if (updateResponse.error) {
    return { data: null, error: updateResponse.error };
  }

  const movementResponse = await getSupabase()
    .from('stock_movements')
    .insert([
      {
        product_id: productId,
        movement_type: movementType,
        quantity,
        note,
      } as unknown as never,
    ])
    .select()
    .single();

  if (movementResponse.error) {
    return { data: null, error: movementResponse.error };
  }

  return { data: updateResponse.data, error: null };
}
