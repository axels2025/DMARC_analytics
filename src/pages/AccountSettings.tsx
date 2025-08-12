import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Mail, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const AccountSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [email, setEmail] = useState(user?.email || "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);

  useEffect(() => {
    document.title = "Account Settings - DMARC Analytics";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'Manage your DMARC Analytics account: change email and update password.');
  }, []);

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !email.includes('@')) {
      setError("Please enter a valid email address");
      return;
    }
    try {
      setLoadingEmail(true);
      const redirectTo = `${window.location.origin}/auth`;
      const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: redirectTo } as any);
      if (error) {
        setError(error.message);
      } else {
        toast({ title: "Confirmation sent", description: "Check your new email to confirm the change." });
      }
    } catch (err) {
      setError("Failed to update email");
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoadingPassword(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setError(error.message);
      } else {
        setNewPassword("");
        setConfirmPassword("");
        toast({ title: "Password updated", description: "Your password has been changed." });
      }
    } catch (err) {
      setError("Failed to update password");
    } finally {
      setLoadingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Account Settings</h1>
        <p className="text-gray-600 text-sm">Update your email and password</p>
      </header>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Change Email</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={loadingEmail}>
                {loadingEmail ? "Saving..." : "Send confirmation"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" disabled={loadingPassword}>
                {loadingPassword ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AccountSettings;
