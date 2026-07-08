import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: acceptances, error: err1 } = await supabaseAdmin
    .from('credit_agreement_acceptances')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (err1) {
    console.error("Error fetching acceptances:", err1);
    return;
  }
  
  if (!acceptances || acceptances.length === 0) {
    console.log("No acceptance found");
    return;
  }
  const acceptance = acceptances[0];
  
  // Mask sensitive
  const maskedToken = acceptance.otp_verification_id ? `${acceptance.otp_verification_id.substring(0, 8)}...` : 'null';
  
  console.log("=== ACCEPTANCE ===");
  console.log(`agreement_version: ${acceptance.agreement_version}`);
  console.log(`agreement_body_hash is set: ${!!acceptance.agreement_body_hash}`);
  console.log(`agreement_body_snapshot is set: ${!!acceptance.agreement_body_snapshot}`);
  console.log(`otp_verification_id is set: ${!!acceptance.otp_verification_id}`);

  // Customer
  const { data: customer } = await supabaseAdmin
    .from('credit_customers')
    .select('*')
    .eq('id', acceptance.credit_customer_id)
    .single();
    
  if (customer) {
    console.log("\n=== CUSTOMER ===");
    console.log(`phone_normalized: ${customer.phone_normalized ? customer.phone_normalized.substring(0, 5) + 'XXXXXXX' : 'null'} (Starts with 905: ${customer.phone_normalized?.startsWith('905')}, length: ${customer.phone_normalized?.length})`);
    console.log(`full_name: ${customer.full_name}`);
    console.log(`customer_card_code is set: ${!!customer.customer_card_code} (${customer.customer_card_code})`);
    console.log(`card_token is set: ${!!customer.card_token} (${customer.card_token?.substring(0,8)}...)`);
  }

  // Account
  const { data: account } = await supabaseAdmin
    .from('credit_accounts')
    .select('*')
    .eq('credit_customer_id', acceptance.credit_customer_id)
    .single();

  if (account) {
    console.log("\n=== ACCOUNT ===");
    console.log(`credit_limit: ${account.credit_limit}`);
    console.log(`statement_day: ${account.statement_day}`);
  }
}

check().catch(console.error);
