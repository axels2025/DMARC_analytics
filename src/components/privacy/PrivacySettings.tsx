import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  Key, 
  Eye, 
  EyeOff, 
  AlertTriangle, 
  Lock,
  Unlock,
  CheckCircle,
  XCircle,
  Download,
  Upload,
  Trash2,
  Info,
  Settings,
  Clock
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { 
  PrivacySettings as PrivacySettingsType,
  MaskingLevel,
  DEFAULT_PRIVACY_SETTINGS,
  MASKING_LEVELS,
  validatePrivacySettings,
  calculateComplianceScore,
  getPrivacyLevelDescription
} from '@/utils/privacyManager';
import { 
  ClientEncryption,
  KeyStorage,
  encryptionService,
  EncryptionProvider
} from '@/utils/encryptionService';
import { logPrivacyChange, logSecurityEvent } from '@/utils/privacyAudit';

interface PrivacySettingsProps {
  onSettingsChange?: (settings: PrivacySettingsType) => void;
}

export const PrivacySettingsComponent = ({ onSettingsChange }: PrivacySettingsProps) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PrivacySettingsType>(DEFAULT_PRIVACY_SETTINGS);
  const [originalSettings, setOriginalSettings] = useState<PrivacySettingsType>(DEFAULT_PRIVACY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [encryptionProvider, setEncryptionProvider] = useState<EncryptionProvider['name']>('browser-crypto');
  const [availableProviders, setAvailableProviders] = useState<EncryptionProvider[]>([]);
  const [encryptionKeys, setEncryptionKeys] = useState<Array<{ keyId: string; created: string; algorithm: string }>>([]);
  const [testingEncryption, setTestingEncryption] = useState(false);
  const [encryptionTestResult, setEncryptionTestResult] = useState<boolean | null>(null);
  
  // Load settings on component mount
  useEffect(() => {
    loadPrivacySettings();
    loadEncryptionProviders();
    loadEncryptionKeys();
  }, [user]);

  const loadPrivacySettings = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_privacy_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      const loadedSettings = data?.settings || DEFAULT_PRIVACY_SETTINGS;
      setSettings(loadedSettings);
      setOriginalSettings(loadedSettings);
      setEncryptionProvider(data?.encryption_provider || 'browser-crypto');
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
      setSettings(DEFAULT_PRIVACY_SETTINGS);
      setOriginalSettings(DEFAULT_PRIVACY_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const loadEncryptionProviders = () => {
    const providers = encryptionService.getAvailableProviders();
    setAvailableProviders(providers);
  };

  const loadEncryptionKeys = () => {
    const keys = KeyStorage.listKeys();
    setEncryptionKeys(keys);
  };

  const savePrivacySettings = async () => {
    if (!user) return;

    const validation = validatePrivacySettings(settings);
    if (!validation.isValid) {
      alert('Invalid settings: ' + validation.errors.join(', '));
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase
        .from('user_privacy_settings')
        .upsert({
          user_id: user.id,
          settings,
          encryption_provider: encryptionProvider,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Log privacy change
      await logPrivacyChange(user.id, originalSettings, settings);

      setOriginalSettings(settings);
      onSettingsChange?.(settings);
      
      alert('Privacy settings saved successfully');
    } catch (error) {
      console.error('Failed to save privacy settings:', error);
      alert('Failed to save privacy settings');
      
      await logSecurityEvent(
        user.id,
        'settings_change',
        'privacy_settings',
        'privacy_settings',
        error instanceof Error ? error.message : 'Unknown error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleMaskingLevelChange = (level: MaskingLevel) => {
    const levelSettings = MASKING_LEVELS[level];
    setSettings(prev => ({
      ...prev,
      ...levelSettings,
    }));
  };

  const generateEncryptionKey = async () => {
    if (!masterPassword) {
      alert('Please set a master password first');
      return;
    }

    if (masterPassword !== confirmPassword) {
      alert('Master passwords do not match');
      return;
    }

    try {
      const encryption = new ClientEncryption();
      const key = await encryption.generateKey();
      const keyId = await encryption.generateKeyFingerprint(key);
      
      await KeyStorage.storeKey(keyId, key, masterPassword);
      
      // Update settings to use encryption
      setSettings(prev => ({
        ...prev,
        encryptSensitiveData: true,
        requireMasterPassword: true,
      }));

      loadEncryptionKeys();
      alert('Encryption key generated successfully');
    } catch (error) {
      console.error('Failed to generate encryption key:', error);
      alert('Failed to generate encryption key');
    }
  };

  const testEncryption = async () => {
    setTestingEncryption(true);
    setEncryptionTestResult(null);

    try {
      const result = await encryptionService.testEncryption(encryptionProvider);
      setEncryptionTestResult(result);
    } catch (error) {
      console.error('Encryption test failed:', error);
      setEncryptionTestResult(false);
    } finally {
      setTestingEncryption(false);
    }
  };

  const deleteEncryptionKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this encryption key? This action cannot be undone.')) {
      return;
    }

    try {
      KeyStorage.deleteKey(keyId);
      loadEncryptionKeys();
      
      // If this was the last key, disable encryption
      if (encryptionKeys.length === 1) {
        setSettings(prev => ({
          ...prev,
          encryptSensitiveData: false,
          requireMasterPassword: false,
        }));
      }
      
      alert('Encryption key deleted');
    } catch (error) {
      console.error('Failed to delete encryption key:', error);
      alert('Failed to delete encryption key');
    }
  };

  const exportSettings = () => {
    const exportData = {
      settings,
      encryptionProvider,
      exportedAt: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dmarc-privacy-settings-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        if (importData.settings) {
          setSettings(importData.settings);
          if (importData.encryptionProvider) {
            setEncryptionProvider(importData.encryptionProvider);
          }
          alert('Settings imported successfully');
        } else {
          throw new Error('Invalid settings file format');
        }
      } catch (error) {
        console.error('Failed to import settings:', error);
        alert('Failed to import settings: Invalid file format');
      }
    };
    reader.readAsText(file);
  };

  const complianceScore = calculateComplianceScore(settings);
  const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(originalSettings);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2">Loading privacy settings...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Compliance Score */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Privacy & Security Settings
            </CardTitle>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium">Compliance Score</div>
                <div className="flex items-center gap-2">
                  <Progress value={complianceScore.score} className="w-20" />
                  <span className="font-bold text-lg">{complianceScore.score}%</span>
                </div>
              </div>
              {hasUnsavedChanges && (
                <Badge variant="outline" className="border-orange-500 text-orange-700">
                  Unsaved Changes
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="privacy" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="privacy">Privacy Levels</TabsTrigger>
          <TabsTrigger value="encryption">Encryption</TabsTrigger>
          <TabsTrigger value="retention">Data Retention</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="privacy" className="space-y-6">
          {/* Privacy Level Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Privacy Protection Level
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(MASKING_LEVELS).map(([level, config]) => (
                  <div
                    key={level}
                    className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                      settings.maskingLevel === level
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleMaskingLevelChange(level as MaskingLevel)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium capitalize">{level}</h3>
                      {settings.maskingLevel === level && (
                        <CheckCircle className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {getPrivacyLevelDescription(level as MaskingLevel)}
                    </p>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>Email Addresses</span>
                        {config.showEmailAddresses ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Subject Lines</span>
                        {config.showSubjects ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Email Content</span>
                        {config.showMessageContent ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Granular Controls */}
          <Card>
            <CardHeader>
              <CardTitle>Data Visibility Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-emails">Show Email Addresses</Label>
                    <Switch
                      id="show-emails"
                      checked={settings.showEmailAddresses}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, showEmailAddresses: checked }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-subjects">Show Subject Lines</Label>
                    <Switch
                      id="show-subjects"
                      checked={settings.showSubjects}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, showSubjects: checked }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-headers">Show Email Headers</Label>
                    <Switch
                      id="show-headers"
                      checked={settings.showHeaders}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, showHeaders: checked }))
                      }
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="show-content">Show Message Content</Label>
                    <Switch
                      id="show-content"
                      checked={settings.showMessageContent}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, showMessageContent: checked }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="audit-access">Audit Data Access</Label>
                    <Switch
                      id="audit-access"
                      checked={settings.auditDataAccess}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, auditDataAccess: checked }))
                      }
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <Label htmlFor="temporary-reveal">Allow Temporary Reveal</Label>
                    <Switch
                      id="temporary-reveal"
                      checked={settings.allowTemporaryReveal}
                      onCheckedChange={(checked) => 
                        setSettings(prev => ({ ...prev, allowTemporaryReveal: checked }))
                      }
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="encryption" className="space-y-6">
          {/* Encryption Provider Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Encryption Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label>Encryption Provider</Label>
                  <Select value={encryptionProvider} onValueChange={(value: EncryptionProvider['name']) => setEncryptionProvider(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProviders.map(provider => (
                        <SelectItem 
                          key={provider.name} 
                          value={provider.name}
                          disabled={!provider.isAvailable}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span>{provider.description}</span>
                            {provider.isAvailable ? 
                              <CheckCircle className="h-4 w-4 text-green-500" /> : 
                              <XCircle className="h-4 w-4 text-red-500" />
                            }
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={testEncryption}
                    disabled={testingEncryption || encryptionProvider === 'none'}
                    variant="outline"
                  >
                    {testingEncryption ? 'Testing...' : 'Test Encryption'}
                  </Button>
                  
                  {encryptionTestResult !== null && (
                    <div className="flex items-center gap-2">
                      {encryptionTestResult ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-700">Encryption working</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-red-700">Encryption failed</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Master Password Setup */}
          <Card>
            <CardHeader>
              <CardTitle>Master Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="master-password">Master Password</Label>
                  <div className="relative">
                    <Input
                      id="master-password"
                      type={showMasterPassword ? 'text' : 'password'}
                      value={masterPassword}
                      onChange={(e) => setMasterPassword(e.target.value)}
                      placeholder="Enter secure master password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={() => setShowMasterPassword(!showMasterPassword)}
                    >
                      {showMasterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type={showMasterPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm master password"
                  />
                </div>
              </div>

              <Button onClick={generateEncryptionKey}>
                <Key className="h-4 w-4 mr-2" />
                Generate New Encryption Key
              </Button>
            </CardContent>
          </Card>

          {/* Encryption Keys Management */}
          <Card>
            <CardHeader>
              <CardTitle>Encryption Keys</CardTitle>
            </CardHeader>
            <CardContent>
              {encryptionKeys.length === 0 ? (
                <div className="text-center py-8">
                  <Key className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-600">No encryption keys found</p>
                  <p className="text-sm text-gray-500">Generate a key to enable data encryption</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {encryptionKeys.map(key => (
                    <div key={key.keyId} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <div className="font-mono text-sm">{key.keyId}</div>
                        <div className="text-xs text-gray-500">
                          {key.algorithm} • Created {new Date(key.created).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteEncryptionKey(key.keyId)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Data Retention Policy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="retention-days">Retention Period (Days)</Label>
                <Input
                  id="retention-days"
                  type="number"
                  min="1"
                  max="2555"
                  value={settings.retentionPeriodDays}
                  onChange={(e) => 
                    setSettings(prev => ({ 
                      ...prev, 
                      retentionPeriodDays: parseInt(e.target.value) || 90 
                    }))
                  }
                />
                <div className="text-sm text-gray-500 mt-1">
                  Data will be automatically deleted after this period. Maximum: 7 years (2555 days).
                </div>
              </div>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Changing retention periods only affects new data. Existing data follows the retention policy that was active when it was created.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 border rounded">
                  <div className="text-2xl font-bold text-blue-600">{complianceScore.score}%</div>
                  <div className="text-sm text-gray-600">Overall Score</div>
                </div>
                <div className="text-center p-4 border rounded">
                  <div className="text-2xl font-bold text-green-600">
                    {complianceScore.factors.filter(f => f.met).length}
                  </div>
                  <div className="text-sm text-gray-600">Requirements Met</div>
                </div>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-medium">Compliance Factors</h4>
                {complianceScore.factors.map((factor, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <span className="text-sm">{factor.factor}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{factor.weight}%</span>
                      {factor.met ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button onClick={exportSettings} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Settings
              </Button>
              
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={importSettings}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Settings
                </Button>
              </div>
            </div>
            
            <div className="flex gap-2">
              {hasUnsavedChanges && (
                <Button variant="outline" onClick={loadPrivacySettings}>
                  Discard Changes
                </Button>
              )}
              
              <Button 
                onClick={savePrivacySettings} 
                disabled={saving || !hasUnsavedChanges}
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PrivacySettingsComponent;