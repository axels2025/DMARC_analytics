import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Separator } from '@/components/ui/separator';
import { RotateCcw, Database, Filter } from 'lucide-react';

interface EmailProcessingSettingsProps {
  configId: string;
  currentSettings: {
    sync_unread_only?: boolean;
    incremental_sync_enabled?: boolean;
    delete_after_import?: boolean;
  };
  onSettingsUpdate: () => void;
}

export const EmailProcessingSettings: React.FC<EmailProcessingSettingsProps> = ({
  configId,
  currentSettings,
  onSettingsUpdate
}) => {
  const [loading, setLoading] = useState<string | null>(null);

  const updateSetting = async (setting: string, value: boolean) => {
    setLoading(setting);
    
    try {
      const { error } = await supabase
        .from('user_email_configs')
        .update({ [setting]: value })
        .eq('id', configId);

      if (error) {
        throw error;
      }

      onSettingsUpdate();
    } catch (error) {
      console.error('Failed to update setting:', error);
    } finally {
      setLoading(null);
    }
  };

  const resetProcessingHistory = async () => {
    setLoading('reset');
    
    try {
      // Clear message tracking history for this config
      const { error } = await supabase
        .from('email_message_tracking')
        .delete()
        .eq('config_id', configId);

      if (error) {
        throw error;
      }

      // Reset sync cursor
      await supabase
        .from('user_email_configs')
        .update({ 
          last_sync_cursor: null,
          last_sync_at: null 
        })
        .eq('id', configId);

      onSettingsUpdate();
    } catch (error) {
      console.error('Failed to reset processing history:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Email Processing Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Unread Only Setting */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-medium">Process unread emails only</div>
            <div className="text-sm text-muted-foreground">
              Only sync DMARC reports from unread emails (recommended for efficiency)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={currentSettings.sync_unread_only ?? true}
              onCheckedChange={(checked) => updateSetting('sync_unread_only', checked)}
              disabled={loading === 'sync_unread_only'}
            />
            {currentSettings.sync_unread_only && (
              <Badge variant="secondary" className="text-xs">Efficient</Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Incremental Sync Setting */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-medium">Incremental sync</div>
            <div className="text-sm text-muted-foreground">
              Only process emails newer than the last sync (faster for large mailboxes)
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={currentSettings.incremental_sync_enabled ?? true}
              onCheckedChange={(checked) => updateSetting('incremental_sync_enabled', checked)}
              disabled={loading === 'incremental_sync_enabled'}
            />
            {currentSettings.incremental_sync_enabled && (
              <Badge variant="secondary" className="text-xs">Fast</Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Delete After Import Setting */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="font-medium">Delete emails after import</div>
            <div className="text-sm text-muted-foreground">
              Automatically delete DMARC report emails after successful processing
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={currentSettings.delete_after_import ?? false}
              onCheckedChange={(checked) => updateSetting('delete_after_import', checked)}
              disabled={loading === 'delete_after_import'}
            />
            {currentSettings.delete_after_import && (
              <Badge variant="outline" className="text-xs border-orange-200 text-orange-700">
                Destructive
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Advanced Actions */}
        <div className="space-y-4">
          <div className="font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            Advanced Actions
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">Reset Processing History</div>
              <div className="text-xs text-muted-foreground">
                Clear all email tracking data and start fresh (will reprocess all emails)
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={resetProcessingHistory}
              disabled={loading === 'reset'}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {loading === 'reset' ? (
                <>
                  <RotateCcw className="w-4 h-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset History
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};