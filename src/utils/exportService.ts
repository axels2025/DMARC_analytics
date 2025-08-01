// Enhanced Export Service
// Handles comprehensive DMARC data export with proper formatting

import { supabase } from "@/integrations/supabase/client";
import { detectIPProviders } from "@/utils/ipProviderDetection";

interface ReportData {
  id: string;
  domain: string;
  org_name: string;
  date_range_begin: number;
  date_range_end: number;
  policy_p: string;
  policy_sp?: string;
  policy_pct: number;
  policy_dkim: string;
  policy_spf: string;
  report_id: string;
}

interface RecordData {
  source_ip: string;
  count: number;
  dkim_result: string;
  spf_result: string;
  disposition: string;
  report_id: string;
}

interface ProcessedReportData {
  domain: string;
  organization: string;
  reportId: string;
  dateRange: string;
  startDate: string;
  endDate: string;
  policy: string;
  subdomainPolicy: string;
  policyAlignment: string;
  policyPercentage: number;
  totalEmails: number;
  passedEmails: number;
  failedEmails: number;
  successRate: number;
  uniqueIPs: number;
  topProvider: string;
  topProviderCount: number;
  topProviderRate: number;
  dispositionNone: number;
  dispositionQuarantine: number;
  dispositionReject: number;
  dkimPassRate: number;
  spfPassRate: number;
}

/**
 * Formats Unix timestamp to readable date
 */
function formatUnixDate(timestamp: number): string {
  if (!timestamp || isNaN(timestamp)) return 'Invalid Date';
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Formats date range for display
 */
function formatDateRange(start: number, end: number): string {
  const startDate = formatUnixDate(start);
  const endDate = formatUnixDate(end);
  return `${startDate} - ${endDate}`;
}

/**
 * Fetches comprehensive DMARC data for export
 */
async function fetchExportData(userId: string): Promise<ProcessedReportData[]> {
  // Fetch all reports for the user
  const { data: reports, error: reportsError } = await supabase
    .from('dmarc_reports')
    .select('*')
    .eq('user_id', userId)
    .order('date_range_begin', { ascending: false });

  if (reportsError) {
    throw new Error(`Failed to fetch reports: ${reportsError.message}`);
  }

  if (!reports || reports.length === 0) {
    return [];
  }

  const processedReports: ProcessedReportData[] = [];

  for (const report of reports) {
    // Fetch records for this report
    const { data: records, error: recordsError } = await supabase
      .from('dmarc_records')
      .select('*')
      .eq('report_id', report.id);

    if (recordsError) {
      console.error(`Failed to fetch records for report ${report.id}:`, recordsError);
      continue;
    }

    if (!records || records.length === 0) {
      // Include report even if no records, with zero values
      processedReports.push({
        domain: report.domain || 'Unknown',
        organization: report.org_name || 'Unknown',
        reportId: report.report_id || 'Unknown',
        dateRange: formatDateRange(report.date_range_begin, report.date_range_end),
        startDate: formatUnixDate(report.date_range_begin),
        endDate: formatUnixDate(report.date_range_end),
        policy: report.policy_p || 'none',
        subdomainPolicy: report.policy_sp || 'same as p',
        policyAlignment: `DKIM: ${report.policy_dkim || 'r'}, SPF: ${report.policy_spf || 'r'}`,
        policyPercentage: report.policy_pct || 100,
        totalEmails: 0,
        passedEmails: 0,
        failedEmails: 0,
        successRate: 0,
        uniqueIPs: 0,
        topProvider: 'No Data',
        topProviderCount: 0,
        topProviderRate: 0,
        dispositionNone: 0,
        dispositionQuarantine: 0,
        dispositionReject: 0,
        dkimPassRate: 0,
        spfPassRate: 0
      });
      continue;
    }

    // Process records data
    const totalEmails = records.reduce((sum, r) => sum + r.count, 0);
    const passedEmails = records
      .filter(r => r.dkim_result === 'pass' && r.spf_result === 'pass')
      .reduce((sum, r) => sum + r.count, 0);
    const failedEmails = totalEmails - passedEmails;
    const successRate = totalEmails > 0 ? Math.round((passedEmails / totalEmails) * 100 * 10) / 10 : 0;

    // Calculate DKIM and SPF pass rates
    const dkimPassEmails = records
      .filter(r => r.dkim_result === 'pass')
      .reduce((sum, r) => sum + r.count, 0);
    const spfPassEmails = records
      .filter(r => r.spf_result === 'pass')
      .reduce((sum, r) => sum + r.count, 0);
    const dkimPassRate = totalEmails > 0 ? Math.round((dkimPassEmails / totalEmails) * 100 * 10) / 10 : 0;
    const spfPassRate = totalEmails > 0 ? Math.round((spfPassEmails / totalEmails) * 100 * 10) / 10 : 0;

    // Group by IP and get provider information
    const uniqueIPs = [...new Set(records.map(r => r.source_ip))].filter((ip): ip is string => typeof ip === 'string');
    const providerMap = await detectIPProviders(uniqueIPs);

    const providerGroups = records.reduce((acc: Record<string, { count: number; passed: number }>, record) => {
      const provider = (typeof record.source_ip === 'string' ? providerMap.get(record.source_ip) : null) || 'Unknown Provider';
      if (!acc[provider]) {
        acc[provider] = { count: 0, passed: 0 };
      }
      acc[provider].count += record.count;
      if (record.dkim_result === 'pass' && record.spf_result === 'pass') {
        acc[provider].passed += record.count;
      }
      return acc;
    }, {});

    // Find top provider
    const topProvider = Object.entries(providerGroups)
      .sort(([, a], [, b]) => b.count - a.count)[0];

    const topProviderName = topProvider ? topProvider[0] : 'Unknown Provider';
    const topProviderCount = topProvider ? topProvider[1].count : 0;
    const topProviderRate = topProvider && topProvider[1].count > 0 
      ? Math.round((topProvider[1].passed / topProvider[1].count) * 100 * 10) / 10 
      : 0;

    // Calculate disposition data
    const dispositionGroups = records.reduce((acc: Record<string, number>, record) => {
      const disposition = record.disposition || 'none';
      acc[disposition] = (acc[disposition] || 0) + record.count;
      return acc;
    }, {});

    processedReports.push({
      domain: report.domain || 'Unknown',
      organization: report.org_name || 'Unknown',
      reportId: report.report_id || 'Unknown',
      dateRange: formatDateRange(report.date_range_begin, report.date_range_end),
      startDate: formatUnixDate(report.date_range_begin),
      endDate: formatUnixDate(report.date_range_end),
      policy: report.policy_p || 'none',
      subdomainPolicy: report.policy_sp || 'same as p',
      policyAlignment: `DKIM: ${report.policy_dkim || 'r'}, SPF: ${report.policy_spf || 'r'}`,
      policyPercentage: report.policy_pct || 100,
      totalEmails,
      passedEmails,
      failedEmails,
      successRate,
      uniqueIPs: uniqueIPs.length,
      topProvider: topProviderName,
      topProviderCount,
      topProviderRate,
      dispositionNone: dispositionGroups.none || 0,
      dispositionQuarantine: dispositionGroups.quarantine || 0,
      dispositionReject: dispositionGroups.reject || 0,
      dkimPassRate,
      spfPassRate
    });
  }

  return processedReports;
}

/**
 * Generates CSV content from processed data
 */
function generateCSV(data: ProcessedReportData[]): string {
  const headers = [
    'Domain',
    'Organization',
    'Report ID',
    'Date Range',
    'Start Date',
    'End Date',
    'Policy',
    'Subdomain Policy',
    'Policy Alignment',
    'Policy Percentage',
    'Total Emails',
    'Passed Emails',
    'Failed Emails',
    'Success Rate (%)',
    'Unique Source IPs',
    'Top Provider',
    'Top Provider Emails',
    'Top Provider Success Rate (%)',
    'Disposition None',
    'Disposition Quarantine',
    'Disposition Reject',
    'DKIM Pass Rate (%)',
    'SPF Pass Rate (%)'
  ];

  const rows = data.map(report => [
    report.domain,
    report.organization,
    report.reportId,
    report.dateRange,
    report.startDate,
    report.endDate,
    report.policy,
    report.subdomainPolicy,
    report.policyAlignment,
    report.policyPercentage,
    report.totalEmails,
    report.passedEmails,
    report.failedEmails,
    report.successRate,
    report.uniqueIPs,
    report.topProvider,
    report.topProviderCount,
    report.topProviderRate,
    report.dispositionNone,
    report.dispositionQuarantine,
    report.dispositionReject,
    report.dkimPassRate,
    report.spfPassRate
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  return csvContent;
}

/**
 * Generates HTML content for PDF export
 */
function generateHTML(data: ProcessedReportData[]): string {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const totalEmails = data.reduce((sum, report) => sum + report.totalEmails, 0);
  const totalPassed = data.reduce((sum, report) => sum + report.passedEmails, 0);
  const overallSuccessRate = totalEmails > 0 ? Math.round((totalPassed / totalEmails) * 100 * 10) / 10 : 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>DMARC Analytics Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #2563eb; margin-bottom: 5px; font-size: 28px; }
        .header p { color: #666; margin: 0; }
        .summary { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .summary h2 { color: #1f2937; margin-top: 0; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 15px; }
        .summary-item { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb; }
        .summary-item h3 { margin: 0 0 5px 0; color: #374151; font-size: 14px; }
        .summary-item p { margin: 0; font-size: 20px; font-weight: bold; color: #1f2937; }
        .reports-section { margin-bottom: 30px; }
        .reports-section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f3f4f6; font-weight: 600; color: #374151; }
        .success-rate { color: #059669; font-weight: 600; }
        .failure-rate { color: #dc2626; font-weight: 600; }
        .policy-badge { background: #dbeafe; color: #1d4ed8; padding: 2px 6px; border-radius: 3px; font-size: 10px; }
        .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        @media print {
          body { margin: 0; }
          .header { page-break-after: avoid; }
          table { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>DMARC Analytics Report</h1>
        <p>Comprehensive Email Security Analysis • Generated on ${currentDate}</p>
      </div>
      
      <div class="summary">
        <h2>Executive Summary</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <h3>Total Reports</h3>
            <p>${data.length}</p>
          </div>
          <div class="summary-item">
            <h3>Total Emails Analyzed</h3>
            <p>${totalEmails.toLocaleString()}</p>
          </div>
          <div class="summary-item">
            <h3>Overall Success Rate</h3>
            <p class="success-rate">${overallSuccessRate}%</p>
          </div>
          <div class="summary-item">
            <h3>Unique Domains</h3>
            <p>${[...new Set(data.map(d => d.domain))].length}</p>
          </div>
        </div>
      </div>
      
      <div class="reports-section">
        <h2>Detailed Report Analysis</h2>
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Organization</th>
              <th>Date Range</th>
              <th>Policy</th>
              <th>Total Emails</th>
              <th>Success Rate</th>
              <th>Top Provider</th>
              <th>DKIM Pass</th>
              <th>SPF Pass</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(report => `
              <tr>
                <td><strong>${report.domain}</strong></td>
                <td>${report.organization}</td>
                <td>${report.dateRange}</td>
                <td><span class="policy-badge">p=${report.policy}</span></td>
                <td>${report.totalEmails.toLocaleString()}</td>
                <td class="${report.successRate > 90 ? 'success-rate' : 'failure-rate'}">
                  ${report.successRate}%
                </td>
                <td>${report.topProvider}</td>
                <td>${report.dkimPassRate}%</td>
                <td>${report.spfPassRate}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      
      <div class="footer">
        <p>Generated by DMARC Report Dashboard • ${totalEmails.toLocaleString()} emails analyzed across ${data.length} reports</p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Downloads a file with the given content
 */
function downloadFile(content: string, filename: string, contentType: string): void {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports DMARC data as CSV
 */
export async function exportAsCSV(userId: string): Promise<void> {
  const data = await fetchExportData(userId);
  if (data.length === 0) {
    throw new Error('No data available for export');
  }
  
  const csvContent = generateCSV(data);
  const timestamp = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `dmarc-analytics-${timestamp}.csv`, 'text/csv');
}

/**
 * Exports DMARC data as PDF (HTML for printing)
 */
export async function exportAsPDF(userId: string): Promise<void> {
  const data = await fetchExportData(userId);
  if (data.length === 0) {
    throw new Error('No data available for export');
  }
  
  const htmlContent = generateHTML(data);
  const printWindow = window.open('', '_blank');
  
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load then trigger print
    printWindow.onload = () => {
      printWindow.print();
    };
  } else {
    // Fallback to HTML download if popup blocked
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(htmlContent, `dmarc-analytics-${timestamp}.html`, 'text/html');
  }
}

/**
 * Exports a single report as XML (original format)
 */
export async function exportReportAsXML(reportId: string, userId: string): Promise<void> {
  const { data: report, error } = await supabase
    .from('dmarc_reports')
    .select('raw_xml, domain, org_name, date_range_begin, date_range_end')
    .eq('id', reportId)
    .eq('user_id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch report: ${error.message}`);
  }

  if (!report?.raw_xml) {
    throw new Error('No XML data available for this report');
  }

  const startDate = formatUnixDate(report.date_range_begin);
  const endDate = formatUnixDate(report.date_range_end);
  const filename = `dmarc-report-${report.domain}-${startDate.replace(/[^\w]/g, '')}-${endDate.replace(/[^\w]/g, '')}.xml`;
  
  downloadFile(report.raw_xml, filename, 'application/xml');
}

/**
 * Exports a single report as CSV
 */
export async function exportReportAsCSV(reportId: string, userId: string): Promise<void> {
  const { data: report, error: reportError } = await supabase
    .from('dmarc_reports')
    .select('*')
    .eq('id', reportId)
    .eq('user_id', userId)
    .single();

  if (reportError) {
    throw new Error(`Failed to fetch report: ${reportError.message}`);
  }

  const { data: records, error: recordsError } = await supabase
    .from('dmarc_records')
    .select(`
      *,
      dmarc_auth_results (
        auth_type,
        result,
        domain,
        selector
      )
    `)
    .eq('report_id', reportId);

  if (recordsError) {
    throw new Error(`Failed to fetch records: ${recordsError.message}`);
  }

  if (!records || records.length === 0) {
    throw new Error('No records available for this report');
  }

  // Enhanced CSV with complete data including auth results
  const csvLines = [];
  
  // Report metadata header
  csvLines.push('DMARC REPORT DETAILS');
  csvLines.push(`Domain,${report.domain}`);
  csvLines.push(`Organization,${report.org_name}`);
  csvLines.push(`Organization Email,${report.org_email || 'N/A'}`);
  csvLines.push(`Report ID,${report.report_id}`);
  csvLines.push(`Date Range Begin,${formatUnixDate(report.date_range_begin)}`);
  csvLines.push(`Date Range End,${formatUnixDate(report.date_range_end)}`);
  csvLines.push(`Policy Domain,${report.policy_domain}`);
  csvLines.push(`Policy P,${report.policy_p}`);
  csvLines.push(`Policy SP,${report.policy_sp || 'N/A'}`);
  csvLines.push(`Policy PCT,${report.policy_pct}`);
  csvLines.push(`Policy DKIM,${report.policy_dkim}`);
  csvLines.push(`Policy SPF,${report.policy_spf}`);
  csvLines.push('');
  
  // Record data headers
  const recordHeaders = [
    'Source IP',
    'Count',
    'DKIM Result',
    'SPF Result',
    'Disposition',
    'Header From',
    'Envelope To',
    'Auth Type',
    'Auth Result',
    'Auth Domain',
    'Auth Selector'
  ];
  csvLines.push(recordHeaders.join(','));

  // Record data with auth results
  records.forEach(record => {
    const authResults = record.dmarc_auth_results || [];
    
    if (authResults.length === 0) {
      // No auth results, show basic record data
      const row = [
        record.source_ip,
        record.count,
        record.dkim_result,
        record.spf_result,
        record.disposition,
        record.header_from,
        record.envelope_to || 'N/A',
        'N/A',
        'N/A',
        'N/A',
        'N/A'
      ];
      csvLines.push(row.map(cell => `"${cell}"`).join(','));
    } else {
      // Show record data with each auth result
      authResults.forEach(authResult => {
        const row = [
          record.source_ip,
          record.count,
          record.dkim_result,
          record.spf_result,
          record.disposition,
          record.header_from,
          record.envelope_to || 'N/A',
          authResult.auth_type,
          authResult.result,
          authResult.domain,
          authResult.selector || 'N/A'
        ];
        csvLines.push(row.map(cell => `"${cell}"`).join(','));
      });
    }
  });

  const csvContent = csvLines.join('\n');
  const startDate = formatUnixDate(report.date_range_begin);
  const endDate = formatUnixDate(report.date_range_end);
  const filename = `dmarc-report-${report.domain}-${startDate.replace(/[^\w]/g, '')}-${endDate.replace(/[^\w]/g, '')}.csv`;
  
  downloadFile(csvContent, filename, 'text/csv');
}

/**
 * Exports a single report as PDF
 */
export async function exportReportAsPDF(reportId: string, userId: string): Promise<void> {
  const { data: report, error: reportError } = await supabase
    .from('dmarc_reports')
    .select('*')
    .eq('id', reportId)
    .eq('user_id', userId)
    .single();

  if (reportError) {
    throw new Error(`Failed to fetch report: ${reportError.message}`);
  }

  const { data: records, error: recordsError } = await supabase
    .from('dmarc_records')
    .select(`
      *,
      dmarc_auth_results (
        auth_type,
        result,
        domain,
        selector
      )
    `)
    .eq('report_id', reportId);

  if (recordsError) {
    throw new Error(`Failed to fetch records: ${recordsError.message}`);
  }

  const totalEmails = records?.reduce((sum, r) => sum + r.count, 0) || 0;
  const passedEmails = records?.filter(r => r.dkim_result === 'pass' && r.spf_result === 'pass')
    .reduce((sum, r) => sum + r.count, 0) || 0;
  const successRate = totalEmails > 0 ? Math.round((passedEmails / totalEmails) * 100 * 10) / 10 : 0;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>DMARC Report - ${report.domain}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; line-height: 1.6; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 20px; }
        .header h1 { color: #2563eb; margin-bottom: 5px; font-size: 28px; }
        .metadata { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px; }
        .metadata-item { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb; }
        .metadata-item h4 { margin: 0 0 5px 0; color: #374151; font-size: 12px; text-transform: uppercase; }
        .metadata-item p { margin: 0; font-weight: 600; color: #1f2937; }
        .summary { background: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-top: 15px; }
        .summary-item { background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #2563eb; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
        th, td { padding: 6px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f3f4f6; font-weight: 600; color: #374151; }
        .success-rate { color: #059669; font-weight: 600; }
        .failure-rate { color: #dc2626; font-weight: 600; }
        .auth-details { font-size: 10px; color: #6b7280; }
        @media print {
          body { margin: 0; font-size: 10px; }
          .header { page-break-after: avoid; }
          table { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>DMARC Report - ${report.domain}</h1>
        <p>Comprehensive Report Details • Generated on ${new Date().toLocaleDateString()}</p>
      </div>
      
      <div class="metadata">
        <h2>Report Metadata</h2>
        <div class="metadata-grid">
          <div class="metadata-item">
            <h4>Domain</h4>
            <p>${report.domain}</p>
          </div>
          <div class="metadata-item">
            <h4>Organization</h4>
            <p>${report.org_name}</p>
          </div>
          <div class="metadata-item">
            <h4>Organization Email</h4>
            <p>${report.org_email || 'N/A'}</p>
          </div>
          <div class="metadata-item">
            <h4>Report ID</h4>
            <p>${report.report_id}</p>
          </div>
          <div class="metadata-item">
            <h4>Policy Domain</h4>
            <p>${report.policy_domain}</p>
          </div>
          <div class="metadata-item">
            <h4>Date Range</h4>
            <p>${formatDateRange(report.date_range_begin, report.date_range_end)}</p>
          </div>
        </div>
      </div>
      
      <div class="metadata">
        <h2>DMARC Policy Configuration</h2>
        <div class="metadata-grid">
          <div class="metadata-item">
            <h4>Policy (p)</h4>
            <p>${report.policy_p}</p>
          </div>
          <div class="metadata-item">
            <h4>Subdomain Policy (sp)</h4>
            <p>${report.policy_sp || 'Same as p'}</p>
          </div>
          <div class="metadata-item">
            <h4>Policy Percentage (pct)</h4>
            <p>${report.policy_pct}%</p>
          </div>
          <div class="metadata-item">
            <h4>DKIM Alignment</h4>
            <p>${report.policy_dkim}</p>
          </div>
          <div class="metadata-item">
            <h4>SPF Alignment</h4>
            <p>${report.policy_spf}</p>
          </div>
        </div>
      </div>
      
      <div class="summary">
        <h2>Email Summary</h2>
        <div class="summary-grid">
          <div class="summary-item">
            <h3>Total Emails</h3>
            <p>${totalEmails.toLocaleString()}</p>
          </div>
          <div class="summary-item">
            <h3>Success Rate</h3>
            <p class="${successRate > 90 ? 'success-rate' : 'failure-rate'}">${successRate}%</p>
          </div>
          <div class="summary-item">
            <h3>Passed Authentication</h3>
            <p class="success-rate">${passedEmails.toLocaleString()}</p>
          </div>
          <div class="summary-item">
            <h3>Unique Source IPs</h3>
            <p>${[...new Set(records?.map(r => r.source_ip) || [])].length}</p>
          </div>
        </div>
      </div>
      
      <div class="section">
        <h2>Record Details with Authentication Results</h2>
        <table>
          <thead>
            <tr>
              <th>Source IP</th>
              <th>Count</th>
              <th>DKIM</th>
              <th>SPF</th>
              <th>Disposition</th>
              <th>Header From</th>
              <th>Envelope To</th>
              <th>Auth Details</th>
            </tr>
          </thead>
          <tbody>
            ${records?.map(record => {
              const authResults = record.dmarc_auth_results || [];
              const authSummary = authResults.map(auth => 
                `${auth.auth_type}: ${auth.result} (${auth.domain}${auth.selector ? ', selector: ' + auth.selector : ''})`
              ).join('; ') || 'No detailed auth results';
              
              return `
                <tr>
                  <td>${record.source_ip}</td>
                  <td>${record.count.toLocaleString()}</td>
                  <td class="${record.dkim_result === 'pass' ? 'success-rate' : 'failure-rate'}">${record.dkim_result}</td>
                  <td class="${record.spf_result === 'pass' ? 'success-rate' : 'failure-rate'}">${record.spf_result}</td>
                  <td>${record.disposition}</td>
                  <td>${record.header_from}</td>
                  <td>${record.envelope_to || 'N/A'}</td>
                  <td class="auth-details">${authSummary}</td>
                </tr>
              `;
            }).join('') || ''}
          </tbody>
        </table>
      </div>
      
      ${records && records.some(r => r.dmarc_auth_results && r.dmarc_auth_results.length > 0) ? `
      <div class="section">
        <h2>Detailed Authentication Results</h2>
        <table>
          <thead>
            <tr>
              <th>Source IP</th>
              <th>Auth Type</th>
              <th>Result</th>
              <th>Domain</th>
              <th>Selector</th>
            </tr>
          </thead>
          <tbody>
            ${records?.map(record => 
              record.dmarc_auth_results?.map(auth => `
                <tr>
                  <td>${record.source_ip}</td>
                  <td>${auth.auth_type}</td>
                  <td class="${auth.result === 'pass' ? 'success-rate' : 'failure-rate'}">${auth.result}</td>
                  <td>${auth.domain}</td>
                  <td>${auth.selector || 'N/A'}</td>
                </tr>
              `).join('') || ''
            ).join('') || ''}
          </tbody>
        </table>
      </div>` : ''}
      
      <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p>Generated by DMARC Report Dashboard • ${totalEmails.toLocaleString()} emails analyzed</p>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  } else {
    const startDate = formatUnixDate(report.date_range_begin);
    const endDate = formatUnixDate(report.date_range_end);
    const filename = `dmarc-report-${report.domain}-${startDate.replace(/[^\w]/g, '')}-${endDate.replace(/[^\w]/g, '')}.html`;
    downloadFile(htmlContent, filename, 'text/html');
  }
}