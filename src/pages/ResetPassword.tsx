import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Reset Password - DMARC Analytics";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', 'Reset your DMARC Analytics account password securely.');
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(error.message || "Failed to reset password. Use the link from your email again.");
        return;
      }

      toast({ title: "Password updated", description: "Your password has been reset successfully." });
      // After successful reset, user is authenticated; take them to dashboard
      navigate("/dashboard");
    } catch (err) {
      setError("An unexpected error occurred while resetting your password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card as-child>
          <div>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Reset Password</CardTitle>
              <p className="text-gray-600 text-sm">Enter a new password for your account</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Create a new password (min 8 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
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
                    placeholder="Re-enter the new password"
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

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Updating..." : "Update Password"}
                </Button>

                <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/auth")}>Back to Sign In</Button>
              </form>
            </CardContent>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
