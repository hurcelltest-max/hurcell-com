-- Supabase SQL to handle atomic stock decrement
CREATE OR REPLACE FUNCTION decrement_stock(row_id UUID, amount INT)
RETURNS void AS $$
BEGIN
  UPDATE products
  SET stock = stock - amount
  WHERE id = row_id AND stock >= amount;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock or product not found';
  END IF;
END;
$$ LANGUAGE plpgsql;
