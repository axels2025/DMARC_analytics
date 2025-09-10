// Debug script to check and set Microsoft configuration in Supabase
// Run with: node debug-microsoft-config.js

import { createClient } from '@supabase/supabase-js';

// You'll need to replace these with your actual Supabase URL and key
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY';

if (!supabaseUrl || !supabaseKey || supabaseUrl === 'YOUR_SUPABASE_URL') {
  console.error('❌ Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndSetMicrosoftConfig() {
  console.log('🔍 Checking Microsoft configuration in database...');
  
  try {
    // First, check if the app_configurations table exists and what's in it
    const { data: existing, error: fetchError } = await supabase
      .from('app_configurations')
      .select('*')
      .eq('key', 'oauth_settings');
    
    console.log('📊 Current app_configurations table content:');
    console.log('Data:', existing);
    console.log('Error:', fetchError);
    
    if (fetchError) {
      console.log('❌ Error reading from app_configurations table:', fetchError);
      
      // If table doesn't exist, try to create it
      console.log('🔧 Attempting to create app_configurations table...');
      const { error: createError } = await supabase.rpc('create_app_configurations_table');
      console.log('Create table result:', createError);
    }
    
    // Check specifically for oauth_settings
    if (!existing || existing.length === 0) {
      console.log('⚡ No oauth_settings found, creating new record...');
      
      // Example Microsoft Client ID (replace with real one)
      const exampleClientId = 'your-microsoft-client-id-here';
      
      const { data: inserted, error: insertError } = await supabase
        .from('app_configurations')
        .insert([
          {
            key: 'oauth_settings',
            microsoft_client_id: exampleClientId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select();
      
      console.log('📝 Insert result:');
      console.log('Data:', inserted);
      console.log('Error:', insertError);
      
      if (insertError) {
        console.log('❌ Failed to insert oauth_settings:', insertError);
      } else {
        console.log('✅ Successfully created oauth_settings record');
      }
    } else {
      console.log('✅ Found existing oauth_settings:', existing[0]);
      
      if (existing[0].microsoft_client_id) {
        console.log('✅ Microsoft Client ID is configured:', existing[0].microsoft_client_id.substring(0, 8) + '...');
      } else {
        console.log('❌ Microsoft Client ID is not set in the record');
        
        // Update with example client ID
        const exampleClientId = 'your-microsoft-client-id-here';
        const { data: updated, error: updateError } = await supabase
          .from('app_configurations')
          .update({ 
            microsoft_client_id: exampleClientId,
            updated_at: new Date().toISOString()
          })
          .eq('key', 'oauth_settings')
          .select();
        
        console.log('📝 Update result:');
        console.log('Data:', updated);
        console.log('Error:', updateError);
      }
    }
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

checkAndSetMicrosoftConfig();