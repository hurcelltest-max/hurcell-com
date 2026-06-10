-- Public can view web visible products policy
DROP POLICY IF EXISTS "Public can view web visible products" ON public.products;

CREATE POLICY "Public can view web visible products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (
    is_web_visible = true
    AND stock > 0
  );
