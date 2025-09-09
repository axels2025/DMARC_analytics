import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { sessionEncryption } from '@/utils/sessionEncryption';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

export const TokenMigration: React.FC = () => {
  const [migrationStatus, setMigrationStatus] = useState<{
    needed: boolean;
    inProgress: boolean;
    completed: boolean;
    error: string | null;
  }>({
    needed: false,
    inProgress: false,
    completed: false,
    error: null
  });

  useEffect(() => {
    checkMigrationNeeded();
  }, []);

  const checkMigrationNeeded = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if there are any tokens that might need migration
      const hasLegacyKeys = localStorage.getItem('dmarc_session_encryption_key') || 
                           localStorage.getItem('dmarc_encryption_key');
      
      setMigrationStatus(prev => ({
        ...prev,
        needed: !!hasLegacyKeys
      }));
    } catch (error) {
      console.error('Failed to check migration status:', error);
    }
  };

  const runMigration = async () => {
    setMigrationStatus(prev => ({ ...prev, inProgress: true, error: null }));
    
    try {
      await sessionEncryption.migrateExistingTokens();
      setMigrationStatus(prev => ({
        ...prev,
        inProgress: false,
        completed: true,
        needed: false
      }));
    } catch (error) {
      setMigrationStatus(prev => ({
        ...prev,
        inProgress: false,
        error: error instanceof Error ? error.message : 'Migration failed'
      }));
    }
  };

  if (!migrationStatus.needed && !migrationStatus.completed) {
    return null;
  }

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <RefreshCw className="w-5 h-5" />
          Gmail Integration Update Available
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {migrationStatus.needed && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              We've improved the security of Gmail token storage. Click below to update your 
              existing Gmail configuration to the new system. This will eliminate the need 
              for daily re-authentication.
            </AlertDescription>
          </Alert>
        )}
        
        {migrationStatus.completed && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Migration completed successfully! Your Gmail integration now uses improved 
              session-based encryption and should no longer require daily re-authentication.
            </AlertDescription>
          </Alert>
        )}

        {migrationStatus.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Migration failed: {migrationStatus.error}
            </AlertDescription>
          </Alert>
        )}

        {migrationStatus.needed && (
          <Button 
            onClick={runMigration} 
            disabled={migrationStatus.inProgress}
            className="w-full"
          >
            {migrationStatus.inProgress ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Updating Gmail Integration...
              </>
            ) : (
              'Update Gmail Integration'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};