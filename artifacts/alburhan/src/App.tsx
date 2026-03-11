import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/public/Home";
import Packages from "@/pages/public/Packages";
import PackageDetail from "@/pages/public/PackageDetail";
import Ziyarat from "@/pages/public/Ziyarat";
import Blog from "@/pages/public/Blog";
import About from "@/pages/public/About";
import Contact from "@/pages/public/Contact";
import { PrivacyPolicy, TermsConditions, CancellationPolicy, RefundPolicy } from "@/pages/public/Legal";
import Login from "@/pages/auth/Login";
import CustomerDashboard from "@/pages/customer/Dashboard";
import AdminDashboard from "@/pages/admin/Dashboard";
import PackagesManager from "@/pages/admin/PackagesManager";
import BookingsManager from "@/pages/admin/BookingsManager";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layout/MainLayout";

const queryClient = new QueryClient();

// Protected Route Wrapper for Customers
function CustomerRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  if (isLoading) return <MainLayout><div className="py-20 text-center">Loading...</div></MainLayout>;
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (isAdmin) return <Redirect to="/admin/dashboard" />;
  return <Component />;
}

// Protected Route Wrapper for Admins
function AdminRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  if (isLoading) return <div className="py-20 text-center">Loading...</div>;
  if (!isAuthenticated) return <Redirect to="/login" />;
  if (!isAdmin) return <Redirect to="/customer/dashboard" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public Routes */}
      <Route path="/" component={Home} />
      <Route path="/packages" component={Packages} />
      <Route path="/packages/:id" component={PackageDetail} />
      <Route path="/ziyarat" component={Ziyarat} />
      <Route path="/blog" component={Blog} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsConditions} />
      <Route path="/cancellation" component={CancellationPolicy} />
      <Route path="/refund" component={RefundPolicy} />
      <Route path="/login" component={Login} />

      {/* Customer Routes */}
      <Route path="/customer/dashboard" component={() => <CustomerRoute component={CustomerDashboard} />} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" component={() => <AdminRoute component={AdminDashboard} />} />
      <Route path="/admin/packages" component={() => <AdminRoute component={PackagesManager} />} />
      <Route path="/admin/bookings" component={() => <AdminRoute component={BookingsManager} />} />
      <Route path="/admin/customers" component={() => <AdminRoute component={() => <div className="p-8 text-2xl font-serif">Customers Manager (Coming Soon)</div>} />} />
      <Route path="/admin/inquiries" component={() => <AdminRoute component={() => <div className="p-8 text-2xl font-serif">Inquiries Manager (Coming Soon)</div>} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
