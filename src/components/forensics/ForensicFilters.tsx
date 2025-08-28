import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Badge } from '@/components/ui/badge';
import { 
  Filter, 
  X, 
  Search, 
  Calendar,
  Network,
  Shield,
  AlertTriangle,
  RotateCcw 
} from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { ForensicFilters } from '@/hooks/useForensicData';

interface ForensicFiltersProps {
  filters: Partial<ForensicFilters>;
  onFiltersChange: (filters: Partial<ForensicFilters>) => void;
  availableDomains?: string[];
  className?: string;
}

const FAILURE_TYPES = [
  { value: 'spf fail', label: 'SPF Fail', color: 'bg-orange-100 text-orange-800' },
  { value: 'dkim fail', label: 'DKIM Fail', color: 'bg-red-100 text-red-800' },
  { value: 'spf & dkim fail', label: 'SPF & DKIM Fail', color: 'bg-red-200 text-red-900' },
  { value: 'authentication fail', label: 'Authentication Fail', color: 'bg-purple-100 text-purple-800' },
];

const DATE_PRESETS = [
  { label: 'Last 24 hours', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

export const ForensicFiltersComponent = ({ 
  filters, 
  onFiltersChange, 
  availableDomains = [],
  className = '' 
}: ForensicFiltersProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFilters, setLocalFilters] = useState<Partial<ForensicFilters>>(filters);
  
  // Sync local state with props
  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleDateRangeChange = (dateRange: DateRange | undefined) => {
    if (dateRange?.from && dateRange?.to) {
      const updatedFilters = {
        ...localFilters,
        dateRange: {
          start: dateRange.from,
          end: dateRange.to,
        },
      };
      setLocalFilters(updatedFilters);
      onFiltersChange(updatedFilters);
    }
  };

  const handleDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const updatedFilters = {
      ...localFilters,
      dateRange: { start, end },
    };
    setLocalFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const handleSearchChange = (searchQuery: string) => {
    const updatedFilters = {
      ...localFilters,
      searchQuery: searchQuery || undefined,
    };
    setLocalFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const handleSourceIpChange = (sourceIp: string) => {
    const updatedFilters = {
      ...localFilters,
      sourceIp: sourceIp || undefined,
    };
    setLocalFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const handleFailureTypeToggle = (failureType: string, checked: boolean) => {
    const currentTypes = localFilters.failureTypes || [];
    let updatedTypes: string[];
    
    if (checked) {
      updatedTypes = [...currentTypes, failureType];
    } else {
      updatedTypes = currentTypes.filter(type => type !== failureType);
    }
    
    const updatedFilters = {
      ...localFilters,
      failureTypes: updatedTypes.length > 0 ? updatedTypes : undefined,
    };
    setLocalFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const handleDomainToggle = (domain: string, checked: boolean) => {
    const currentDomains = localFilters.domains || [];
    let updatedDomains: string[];
    
    if (checked) {
      updatedDomains = [...currentDomains, domain];
    } else {
      updatedDomains = currentDomains.filter(d => d !== domain);
    }
    
    const updatedFilters = {
      ...localFilters,
      domains: updatedDomains.length > 0 ? updatedDomains : undefined,
    };
    setLocalFilters(updatedFilters);
    onFiltersChange(updatedFilters);
  };

  const handleReset = () => {
    const resetFilters = {
      dateRange: {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
    };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (localFilters.searchQuery) count++;
    if (localFilters.sourceIp) count++;
    if (localFilters.failureTypes?.length) count++;
    if (localFilters.domains?.length) count++;
    return count;
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filters
            {getActiveFiltersCount() > 0 && (
              <Badge variant="secondary" className="ml-2">
                {getActiveFiltersCount()}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={getActiveFiltersCount() === 0}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Date Range - Always visible */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Date Range
          </Label>
          <div className="flex flex-wrap gap-2 mb-2">
            {DATE_PRESETS.map((preset) => (
              <Button
                key={preset.days}
                variant="outline"
                size="sm"
                onClick={() => handleDatePreset(preset.days)}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <DatePickerWithRange
            date={{
              from: localFilters.dateRange?.start,
              to: localFilters.dateRange?.end,
            }}
            onDateChange={handleDateRangeChange}
          />
        </div>

        {/* Search - Always visible */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search
          </Label>
          <Input
            placeholder="Search by subject, IP, sender, or domain..."
            value={localFilters.searchQuery || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {isExpanded && (
          <>
            {/* Source IP Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Network className="h-4 w-4" />
                Source IP Address
              </Label>
              <Input
                placeholder="e.g., 192.168.1.1 or 2001:db8::1"
                value={localFilters.sourceIp || ''}
                onChange={(e) => handleSourceIpChange(e.target.value)}
              />
            </div>

            {/* Failure Types */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Authentication Failure Types
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {FAILURE_TYPES.map((type) => (
                  <div key={type.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`failure-${type.value}`}
                      checked={localFilters.failureTypes?.includes(type.value) || false}
                      onCheckedChange={(checked) => 
                        handleFailureTypeToggle(type.value, checked as boolean)
                      }
                    />
                    <Label 
                      htmlFor={`failure-${type.value}`}
                      className="text-sm cursor-pointer"
                    >
                      <Badge variant="outline" className={type.color}>
                        {type.label}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Domain Filter */}
            {availableDomains.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Domains
                </Label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {availableDomains.map((domain) => (
                    <div key={domain} className="flex items-center space-x-2">
                      <Checkbox
                        id={`domain-${domain}`}
                        checked={localFilters.domains?.includes(domain) || false}
                        onCheckedChange={(checked) => 
                          handleDomainToggle(domain, checked as boolean)
                        }
                      />
                      <Label 
                        htmlFor={`domain-${domain}`}
                        className="text-sm cursor-pointer truncate"
                        title={domain}
                      >
                        {domain}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Active Filters Summary */}
        {getActiveFiltersCount() > 0 && (
          <div className="pt-2 border-t">
            <Label className="text-sm font-medium mb-2 block">Active Filters:</Label>
            <div className="flex flex-wrap gap-1">
              {localFilters.searchQuery && (
                <Badge variant="secondary" className="text-xs">
                  Search: {localFilters.searchQuery}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => handleSearchChange('')}
                  />
                </Badge>
              )}
              {localFilters.sourceIp && (
                <Badge variant="secondary" className="text-xs">
                  IP: {localFilters.sourceIp}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => handleSourceIpChange('')}
                  />
                </Badge>
              )}
              {localFilters.failureTypes?.map((type) => (
                <Badge key={type} variant="secondary" className="text-xs">
                  {type}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => handleFailureTypeToggle(type, false)}
                  />
                </Badge>
              ))}
              {localFilters.domains?.map((domain) => (
                <Badge key={domain} variant="secondary" className="text-xs">
                  {domain}
                  <X 
                    className="h-3 w-3 ml-1 cursor-pointer" 
                    onClick={() => handleDomainToggle(domain, false)}
                  />
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ForensicFiltersComponent;