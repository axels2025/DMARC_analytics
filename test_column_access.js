// Test script to verify include_in_dashboard column access
// Run with: node test_column_access.js

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testColumnAccess() {
  console.log('Testing include_in_dashboard column access...');
  
  try {
    // Test 1: Basic table access
    console.log('\n1. Testing basic table access...');
    const { data, error } = await supabase
      .from('dmarc_reports')
      .select('id, include_in_dashboard')
      .limit(1);
    
    if (error) {
      console.error('❌ Basic table access failed:', error.message);
      return;
    }
    console.log('✅ Basic table access successful');
    
    // Test 2: Column filtering
    console.log('\n2. Testing column filtering...');
    const { data: filtered, error: filterError } = await supabase
      .from('dmarc_reports')
      .select('id, include_in_dashboard')
      .or('include_in_dashboard.is.null,include_in_dashboard.eq.true')
      .limit(1);
    
    if (filterError) {
      console.error('❌ Column filtering failed:', filterError.message);
      return;
    }
    console.log('✅ Column filtering successful');
    
    // Test 3: Join with filtering
    console.log('\n3. Testing join with filtering...');
    const { data: joined, error: joinError } = await supabase
      .from('dmarc_records')
      .select(`
        id,
        count,
        dmarc_reports!inner(user_id, include_in_dashboard)
      `)
      .or('dmarc_reports.include_in_dashboard.is.null,dmarc_reports.include_in_dashboard.eq.true')
      .limit(1);
    
    if (joinError) {
      console.error('❌ Join with filtering failed:', joinError.message);
      return;
    }
    console.log('✅ Join with filtering successful');
    
    console.log('\n🎉 All tests passed! The include_in_dashboard column is accessible.');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
  }
}

testColumnAccess();