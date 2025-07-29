// Test file for IP provider detection
// This can be run in the browser console or used for debugging

import { detectIPProvider, getProviderCacheStats, clearProviderCache, testDNSLookup } from './ipProviderDetection';

// Test IPs that should demonstrate different detection methods
const testIPs = [
  // Should be detected by IP range
  '74.125.130.26',      // Google Gmail
  '40.107.83.228',      // Microsoft Outlook
  '66.196.118.37',      // Yahoo Mail
  
  // Should require DNS lookup
  '13.236.255.231',     // AWS EC2 (example from user)
  '104.154.89.105',     // Google Cloud
  '52.86.25.125',       // AWS
  '159.89.146.18',      // DigitalOcean
  
  // Invalid IPs
  '999.999.999.999',    // Invalid IP
  'not-an-ip',          // Not an IP
];

export async function testIPDetection() {
  console.log('🔍 Testing IP Provider Detection...\n');
  
  // Clear cache to start fresh
  clearProviderCache();
  
  for (const ip of testIPs) {
    console.log(`Testing IP: ${ip}`);
    try {
      const startTime = Date.now();
      const provider = await detectIPProvider(ip);
      const endTime = Date.now();
      
      console.log(`  ✅ Result: ${provider} (${endTime - startTime}ms)`);
    } catch (error) {
      console.log(`  ❌ Error: ${error}`);
    }
    console.log('');
  }
  
  // Show cache statistics
  const stats = await getProviderCacheStats();
  console.log('📊 Cache Statistics:');
  console.log(`  Total entries: ${stats.size}`);
  console.log(`  IP range entries: ${stats.ipRangeEntries}`);
  console.log(`  DNS lookup entries: ${stats.dnsLookupEntries}`);
  
  if (stats.oldestEntry) {
    console.log(`  Oldest entry: ${new Date(stats.oldestEntry).toLocaleString()}`);
  }
  if (stats.newestEntry) {
    console.log(`  Newest entry: ${new Date(stats.newestEntry).toLocaleString()}`);
  }
}

// Function to test specific IP for debugging
export async function testSingleIP(ip: string) {
  console.log(`🔍 Testing single IP: ${ip}`);
  
  const startTime = Date.now();
  const provider = await detectIPProvider(ip);
  const endTime = Date.now();
  
  console.log(`✅ Result: ${provider} (${endTime - startTime}ms)`);
  
  return provider;
}

// Make functions available globally for browser console testing
if (typeof window !== 'undefined') {
  const globalWindow = window as unknown as Record<string, unknown>;
  globalWindow.testIPDetection = testIPDetection;
  globalWindow.testSingleIP = testSingleIP;
  globalWindow.detectIPProvider = detectIPProvider;
  globalWindow.getProviderCacheStats = getProviderCacheStats;
  globalWindow.testDNSLookup = testDNSLookup;
  globalWindow.clearProviderCache = clearProviderCache;
}