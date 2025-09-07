import { supabase } from "@/integrations/supabase/client";
import { detectIPProvider } from "@/utils/ipProviderDetection";
import * as ipaddr from "ipaddr.js";

export type IPCategory = 'authorized' | 'cloud_provider' | 'esp' | 'suspicious' | 'unknown';

export interface IPGeoLocation {
  country: string;
  countryCode?: string | null;
  city?: string | null;
  region?: string | null;
  lat?: number | null;
  lon?: number | null;
  isp?: string | null;
  org?: string | null;
}

export interface IPClassification {
  ip: string;
  category: IPCategory;
  provider: string | null;
  hostname: string | null;
  confidence: number; // 0-100
  authorized: boolean; // convenience flag
  source: string[]; // which signals contributed
  location?: IPGeoLocation;
}

export interface TrustedRule {
  id: string;
  domain: string;
  ip_address: string | null;
  ip_range: string | null;
  trust_level: 'trusted' | 'blocked';
  notes?: string | null;
}

const RESIDENTIAL_HOSTNAME_MARKERS = [
  'dynamic', 'pool', 'dhcp', 'pppoe', 'dsl', 'dialup', 'cable', 'fiber', 'cust-', 'dyn-', 'res-', 'home', 'client', 'pool-'
];

const PROVIDER_CATEGORY_MAP: Record<string, IPCategory> = {
  // ESPs
  'sendgrid': 'esp',
  'mailchimp': 'esp',
  'constant contact': 'esp',
  'campaign monitor': 'esp',
  'sparkpost': 'esp',
  'mailgun': 'esp',
  'postmark': 'esp',
  'amazon ses': 'esp',
  'ses': 'esp',
  // Workspace mail infra (treat as authorized)
  'google': 'authorized',
  'gmail': 'authorized',
  'google workspace': 'authorized',
  'microsoft 365': 'authorized',
  'office 365': 'authorized',
  'outlook': 'authorized',
  'exchange online': 'authorized',
  // Clouds (generic)
  'aws': 'cloud_provider',
  'amazon': 'cloud_provider',
  'ec2': 'cloud_provider',
  'gcp': 'cloud_provider',
  'google cloud': 'cloud_provider',
  'azure': 'cloud_provider',
  'cloudflare': 'cloud_provider',
};

// simple in-memory cache with localStorage persistence
const LOCAL_CACHE_KEY = 'ip-intel-cache-v1';
const memCache = new Map<string, IPClassification>();

function loadCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    if (!raw) return;
    const parsed: IPClassification[] = JSON.parse(raw);
    parsed.forEach((c) => memCache.set(c.ip, c));
  } catch {
    // Ignore localStorage errors
  }
}

function saveCache() {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(Array.from(memCache.values())));
  } catch {
    // Ignore localStorage errors
  }
}

loadCache();

// Import the new IP intelligence service
import { getIPLocation as getIPLocationNew, ipIntelligenceService } from '@/services/ipIntelligenceService';

function unknownLocation(): IPGeoLocation {
  return { country: 'Unknown', countryCode: null, city: null, region: null, lat: null, lon: null, isp: null, org: null };
}

function isGeolocatable(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const range = (addr as any).range?.() || 'unicast';
    const bad = ['private','loopback','linkLocal','uniqueLocal','unspecified','broadcast','carrierGradeNat'];
    return !bad.includes(range);
  } catch {
    return false;
  }
}

export async function getIPLocation(ip: string): Promise<IPGeoLocation> {
  // try cache first (stored alongside classification)
  const cached = memCache.get(ip);
  if (cached?.location) return cached.location;

  if (!isGeolocatable(ip)) return unknownLocation();

  // Use the new IP intelligence service instead of direct API calls
  try {
    console.log(`Using new IP intelligence service for: ${ip}`);
    const geoData = await getIPLocationNew(ip);
    
    // helper to persist location into our cache structure
    const persist = (geo: IPGeoLocation) => {
      const existing = memCache.get(ip);
      const updated: IPClassification = existing
        ? { ...existing, location: geo }
        : { ip, category: 'unknown', provider: null, hostname: null, confidence: 0, authorized: false, source: ['geo'], location: geo };
      memCache.set(ip, updated);
      saveCache();
      return geo;
    };
    
    return persist(geoData);
  } catch (error) {
    console.warn('New IP intelligence service failed, using fallback:', error);
    return unknownLocation();
  }
}

export function matchCIDR(ip: string, cidr: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    const [rangeStr, prefixLenStr] = cidr.split('/');
    const range = ipaddr.parse(rangeStr);
    const prefix = parseInt(prefixLenStr, 10);
    return addr.match([range, prefix]);
  } catch {
    return false;
  }
}

export function validateIPOrCIDR(input: string): { valid: boolean; type: 'ip' | 'cidr' | null; error?: string } {
  if (!input || input.trim() === '') {
    return { valid: false, type: null, error: 'IP address or CIDR range is required' };
  }

  const trimmed = input.trim();

  // Check if it's a CIDR range
  if (trimmed.includes('/')) {
    try {
      const [ip, prefix] = trimmed.split('/');
      const addr = ipaddr.parse(ip);
      const prefixNum = parseInt(prefix, 10);
      
      if (isNaN(prefixNum)) {
        return { valid: false, type: null, error: 'Invalid CIDR prefix' };
      }
      
      const maxPrefix = addr.kind() === 'ipv4' ? 32 : 128;
      if (prefixNum < 0 || prefixNum > maxPrefix) {
        return { valid: false, type: null, error: `CIDR prefix must be between 0 and ${maxPrefix}` };
      }
      
      return { valid: true, type: 'cidr' };
    } catch {
      return { valid: false, type: null, error: 'Invalid CIDR range format' };
    }
  }

  // Check if it's a single IP
  try {
    ipaddr.parse(trimmed);
    return { valid: true, type: 'ip' };
  } catch {
    return { valid: false, type: null, error: 'Invalid IP address format' };
  }
}

export async function fetchTrustedRules(userId: string, domain?: string): Promise<TrustedRule[]> {
  let q = supabase
    .from('trusted_ips')
    .select('id, domain, ip_address, ip_range, trust_level, notes')
    .eq('user_id', userId);
  if (domain) q = q.eq('domain', domain);
  const { data, error } = await q;
  if (error) {
    console.error('fetchTrustedRules error', error);
    return [];
  }
  return (data || []) as unknown as TrustedRule[];
}

export function checkTrusted(ip: string, rules: TrustedRule[]): 'trusted' | 'blocked' | null {
  for (const r of rules) {
    if (r.ip_address && r.ip_address === ip) return r.trust_level;
    if (r.ip_range && matchCIDR(ip, r.ip_range)) return r.trust_level;
  }
  return null;
}

function categoryFromProviderName(name: string | null): IPCategory {
  if (!name) return 'unknown';
  const key = name.toLowerCase();
  for (const k of Object.keys(PROVIDER_CATEGORY_MAP)) {
    if (key.includes(k)) return PROVIDER_CATEGORY_MAP[k];
  }
  return 'unknown';
}

function looksResidential(hostname: string | null): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return RESIDENTIAL_HOSTNAME_MARKERS.some((m) => h.includes(m));
}

export async function classifyIP(ip: string, userId: string, domain?: string, rules?: TrustedRule[]): Promise<IPClassification> {
  // cache first
  const cached = memCache.get(ip);
  if (cached) return cached;

  const signals: string[] = [];

  const localRules = rules || await fetchTrustedRules(userId, domain);
  const rule = checkTrusted(ip, localRules);
  if (rule === 'blocked') {
    const cls: IPClassification = {
      ip, category: 'suspicious', provider: null, hostname: null, confidence: 90, authorized: false, source: ['trusted:block']
    };
    memCache.set(ip, cls); saveCache();
    return cls;
  }

  // provider via range/known patterns
  let provider = await detectIPProvider(ip).catch(() => null);
  if (provider) signals.push('provider:range');

  // reverse DNS
  const { data: rdnsData, error: rdnsErr } = await supabase.functions.invoke('dns-lookup', { body: { ip } });
  if (rdnsErr) console.warn('dns-lookup error', rdnsErr.message);
  const hostname = rdnsData?.hostname || null;
  if (rdnsData?.provider) { provider = provider || rdnsData.provider; signals.push('provider:rdns'); }
  if (hostname) signals.push('rdns');

  // category
  let category: IPCategory = categoryFromProviderName(provider);

  // residential detection overrides to suspicious
  if (looksResidential(hostname)) {
    category = 'suspicious';
    signals.push('residential-hostname');
  }

  // apply trust rule override to authorized
  let authorized = category === 'authorized' || category === 'esp';
  if (rule === 'trusted') { authorized = true; signals.push('trusted:allow'); }

  // confidence
  let confidence = 40;
  if (provider) confidence += 30;
  if (hostname) confidence += 15;
  if (signals.includes('provider:range') && signals.includes('provider:rdns')) confidence += 15;
  confidence = Math.max(0, Math.min(100, confidence));

  const cls: IPClassification = { ip, category, provider: provider || null, hostname, confidence, authorized, source: signals };

  // cache in memory/localStorage
  memCache.set(ip, cls); saveCache();

  // store to DB cache (per-user)
  await supabase.from('ip_classifications').upsert({
    user_id: userId,
    domain: domain || null,
    ip: ip,
    category: category,
    confidence,
    provider: cls.provider,
    hostname: cls.hostname,
    details: { source: signals }
  }).then(({ error }) => { if (error) console.warn('ip_classifications upsert warn', error.message); });

  return cls;
}

export async function classifyIPs(ips: string[], userId: string, domain?: string): Promise<Map<string, IPClassification>> {
  const rules = await fetchTrustedRules(userId, domain);
  const results = await Promise.all(ips.map((ip) => classifyIP(ip, userId, domain, rules)));
  return new Map(results.map((r) => [r.ip, r]));
}

export async function setTrustLevel(userId: string, domain: string, input: string, trust: 'trusted' | 'blocked', note?: string) {
  const validation = validateIPOrCIDR(input);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid IP or CIDR format');
  }

  const trimmed = input.trim();
  const isRange = validation.type === 'cidr';

  // First, try to find existing record
  let existingQuery = supabase
    .from('trusted_ips')
    .select('id')
    .eq('user_id', userId)
    .eq('domain', domain);

  if (isRange) {
    existingQuery = existingQuery.eq('ip_range', trimmed);
  } else {
    existingQuery = existingQuery.eq('ip_address', trimmed);
  }

  const { data: existing, error: findError } = await existingQuery.single();

  if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw findError;
  }

  // Prepare the record data
  const recordData = {
    user_id: userId,
    domain,
    ip_address: isRange ? null : trimmed,
    ip_range: isRange ? trimmed : null,
    trust_level: trust,
    notes: note || null,
  };

  let error;
  if (existing) {
    // Update existing record
    ({ error } = await supabase
      .from('trusted_ips')
      .update(recordData)
      .eq('id', existing.id));
  } else {
    // Insert new record
    ({ error } = await supabase
      .from('trusted_ips')
      .insert(recordData));
  }

  if (error) throw error;
  
  // invalidate local cache for this IP (if it's a single IP)
  if (!isRange) {
    memCache.delete(trimmed);
    saveCache();
  }
}

export async function clearTrustLevel(userId: string, domain: string, input: string) {
  const validation = validateIPOrCIDR(input);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid IP or CIDR format');
  }

  const trimmed = input.trim();
  const isRange = validation.type === 'cidr';

  let query = supabase.from('trusted_ips').delete()
    .eq('user_id', userId)
    .eq('domain', domain);

  if (isRange) {
    query = query.eq('ip_range', trimmed);
  } else {
    query = query.eq('ip_address', trimmed);
  }

  const { error } = await query;
  if (error) throw error;
  
  // invalidate local cache for this IP (if it's a single IP)
  if (!isRange) {
    memCache.delete(trimmed);
    saveCache();
  }
}
