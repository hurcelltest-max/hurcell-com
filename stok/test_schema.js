const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://sdxgbjzdkxenjkqjlzbc.supabase.co';
const supabaseKey = 'sb_publishable_80ENkPBgbKIKTQ7zz32PHA_-82bvF6y';
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase.from('campaigns').insert([{
    name: 'Test Fixed Price',
    campaign_type: 'cross_product',
    discount_type: 'fixed_price',
    discount_value: 100,
    buy_quantity: 1,
    discounted_quantity: 1,
    starts_at: new Date().toISOString(),
    is_active: false
  }]);
  console.log("fixed_price error:", error);
  process.exit(0);
})();
