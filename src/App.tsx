import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { BuyCreditsProvider } from "@/components/BuyCreditsDialog";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import MaintenanceGate from "@/components/MaintenanceGate";
import SmartRoot from "./components/SmartRoot";


import Pricing from "./pages/Pricing";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Refund from "./pages/legal/Refund";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import NewClass from "./pages/NewClass";
import ClassView from "./pages/ClassView";
import ClassMarksheet from "./pages/ClassMarksheet";
import StudentCard from "./pages/StudentCard";
import StyleBank from "./pages/StyleBank";
import Requirements from "./pages/Requirements";
import SchoolRequirements from "./pages/SchoolRequirements";
import Feedback from "./pages/Feedback";
import ReviewExport from "./pages/ReviewExport";
import Billing from "./pages/Billing";
import VerifySchool from "./pages/VerifySchool";
import SchoolInvoice from "./pages/SchoolInvoice";
import AdminDomains from "./pages/AdminDomains";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BuyCreditsProvider>
            <Routes>
              {/* Public */}
              <Route path="/" element={<SmartRoot />} />
              <Route path="/pricing" element={<Pricing />} />

              <Route path="/legal/terms" element={<Terms />} />
              <Route path="/legal/privacy" element={<Privacy />} />
              <Route path="/legal/refunds" element={<Refund />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-school" element={<VerifySchool />} />

              {/* Authenticated app */}
              <Route path="/app" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/classes/new" element={<ProtectedRoute><NewClass /></ProtectedRoute>} />
              <Route path="/classes/:id" element={<ProtectedRoute><ClassView /></ProtectedRoute>} />
              <Route path="/classes/:id/review" element={<ProtectedRoute><ReviewExport /></ProtectedRoute>} />
              <Route path="/classes/:id/marksheet" element={<ProtectedRoute><ClassMarksheet /></ProtectedRoute>} />
              <Route path="/students/:id" element={<ProtectedRoute><StudentCard /></ProtectedRoute>} />
              <Route path="/style-bank" element={<ProtectedRoute><StyleBank /></ProtectedRoute>} />
              <Route path="/requirements" element={<ProtectedRoute><Requirements /></ProtectedRoute>} />
              <Route path="/school" element={<ProtectedRoute><SchoolRequirements /></ProtectedRoute>} />
              <Route path="/feedback" element={<ProtectedRoute><Feedback /></ProtectedRoute>} />
              <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
              <Route path="/school/invoice" element={<ProtectedRoute><SchoolInvoice /></ProtectedRoute>} />
              <Route path="/admin/domains" element={<ProtectedRoute><AdminDomains /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BuyCreditsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
