import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Home from "@/pages/public/Home";
import Packages from "@/pages/public/Packages";
import PackageDetail from "@/pages/public/PackageDetail";
import Ziyarat from "@/pages/public/Ziyarat";
import Hotels from "@/pages/public/Hotels";
import AIAssistant from "@/pages/public/AIAssistant";
import LiveChat from "@/pages/public/LiveChat";
import Blog from "@/pages/public/Blog";
import About from "@/pages/public/About";
import Contact from "@/pages/public/Contact";
import { PrivacyPolicy, TermsConditions, CancellationPolicy, RefundPolicy } from "@/pages/public/Legal";
import Invoice from "@/pages/public/Invoice";
import Login from "@/pages/auth/Login";
import CustomerDashboard from "@/pages/customer/Dashboard";
import AdminDashboard from "@/pages/admin/Dashboard";
import PackagesManager from "@/pages/admin/PackagesManager";
import BookingsManager from "@/pages/admin/BookingsManager";
import GalleryManager from "@/pages/admin/GalleryManager";
import GroupsManager from "@/pages/admin/GroupsManager";
import PilgrimManager from "@/pages/admin/PilgrimManager";
import PrintIdCards from "@/pages/admin/print/PrintIdCards";
import PrintLuggage from "@/pages/admin/print/PrintLuggage";
import PrintMedical from "@/pages/admin/print/PrintMedical";
import PrintHotelList from "@/pages/admin/print/PrintHotelList";
import PrintBusList from "@/pages/admin/print/PrintBusList";
import PrintAirlineList from "@/pages/admin/print/PrintAirlineList";
import PrintZamzam from "@/pages/admin/print/PrintZamzam";
import PrintFeedback from "@/pages/admin/print/PrintFeedback";
import PrintContract from "@/pages/admin/print/PrintContract";
import PrintLuggageSquare from "@/pages/admin/print/PrintLuggageSquare";
import PrintIdCardsPro from "@/pages/admin/print/PrintIdCardsPro";
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
      <Route path="/hotels" component={Hotels} />
      <Route path="/ai-assistant" component={AIAssistant} />
      <Route path="/live-chat" component={LiveChat} />
      <Route path="/blog" component={Blog} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/privacy" component={PrivacyPolicy} />
      <Route path="/terms" component={TermsConditions} />
      <Route path="/cancellation" component={CancellationPolicy} />
      <Route path="/refund" component={RefundPolicy} />
      <Route path="/login" component={Login} />
      <Route path="/invoice/:bookingNumber" component={Invoice} />

      {/* Customer Routes */}
      <Route path="/customer/dashboard" component={() => <CustomerRoute component={CustomerDashboard} />} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" component={() => <AdminRoute component={AdminDashboard} />} />
      <Route path="/admin/packages" component={() => <AdminRoute component={PackagesManager} />} />
      <Route path="/admin/bookings" component={() => <AdminRoute component={BookingsManager} />} />
      <Route path="/admin/gallery" component={() => <AdminRoute component={GalleryManager} />} />
      <Route path="/admin/groups" component={() => <AdminRoute component={GroupsManager} />} />
      <Route path="/admin/groups/:groupId/pilgrims" component={() => <AdminRoute component={PilgrimManager} />} />
      <Route path="/admin/groups/:groupId/print/id-cards" component={() => <AdminRoute component={PrintIdCards} />} />
      <Route path="/admin/groups/:groupId/print/id-cards-pro" component={() => <AdminRoute component={PrintIdCardsPro} />} />
      <Route path="/admin/groups/:groupId/print/luggage" component={() => <AdminRoute component={PrintLuggage} />} />
      <Route path="/admin/groups/:groupId/print/luggage-square" component={() => <AdminRoute component={PrintLuggageSquare} />} />
      <Route path="/admin/groups/:groupId/print/medical" component={() => <AdminRoute component={PrintMedical} />} />
      <Route path="/admin/groups/:groupId/print/hotel-list" component={() => <AdminRoute component={PrintHotelList} />} />
      <Route path="/admin/groups/:groupId/print/bus-list" component={() => <AdminRoute component={PrintBusList} />} />
      <Route path="/admin/groups/:groupId/print/airline-list" component={() => <AdminRoute component={PrintAirlineList} />} />
      <Route path="/admin/groups/:groupId/print/zamzam" component={() => <AdminRoute component={PrintZamzam} />} />
      <Route path="/admin/groups/:groupId/print/feedback" component={() => <AdminRoute component={PrintFeedback} />} />
      <Route path="/admin/groups/:groupId/print/contract" component={() => <AdminRoute component={PrintContract} />} />
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
