
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import ReportDetail from "./pages/ReportDetail";
import ManageReports from "./pages/ManageReports";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthGuard from "./components/AuthGuard";
import { AuthProvider } from "./hooks/useAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import AccountSettings from "./pages/AccountSettings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: 1000,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

const App = () => {
  console.log('[App] Initializing DMARC Analytics application');
  
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <AuthGuard>
                <Routes>
                  <Route path="/" element={<Auth />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/dashboard" element={
                    <ProtectedRoute>
                      <Layout>
                        <Dashboard />
                      </Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/upload" element={
                    <ProtectedRoute>
                      <Layout>
                        <Upload />
                      </Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/report/:id" element={
                    <ProtectedRoute>
                      <Layout>
                        <ReportDetail />
                      </Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/manage-reports" element={
                    <ProtectedRoute>
                      <Layout>
                        <ManageReports />
                      </Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="/account" element={
                    <ProtectedRoute>
                      <Layout>
                        <AccountSettings />
                      </Layout>
                    </ProtectedRoute>
                  } />
                  <Route path="*" element={<Auth />} />
                </Routes>
              </AuthGuard>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
