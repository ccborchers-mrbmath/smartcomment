import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NewClass from "./pages/NewClass";
import ClassView from "./pages/ClassView";
import StudentCard from "./pages/StudentCard";
import StyleBank from "./pages/StyleBank";
import Requirements from "./pages/Requirements";
import SchoolRequirements from "./pages/SchoolRequirements";
import ReviewExport from "./pages/ReviewExport";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/classes/new" element={<ProtectedRoute><NewClass /></ProtectedRoute>} />
            <Route path="/classes/:id" element={<ProtectedRoute><ClassView /></ProtectedRoute>} />
            <Route path="/classes/:id/review" element={<ProtectedRoute><ReviewExport /></ProtectedRoute>} />
            <Route path="/students/:id" element={<ProtectedRoute><StudentCard /></ProtectedRoute>} />
            <Route path="/style-bank" element={<ProtectedRoute><StyleBank /></ProtectedRoute>} />
            <Route path="/requirements" element={<ProtectedRoute><Requirements /></ProtectedRoute>} />
            <Route path="/school" element={<ProtectedRoute><SchoolRequirements /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
