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
import { PrivacyPolicy, TermsAndConditions, CancellationPolicy, RefundPolicy } from "@/pages/public/Legal";
import Invoice from "@/pages/public/Invoice";
import PaymentPage from "@/pages/public/PaymentPage";
import Login from "@/pages/auth/Login";
import CustomerDashboard from "@/pages/customer/Dashboard";
import DocumentCenter from "@/pages/customer/DocumentCenter";
import SupportCenter from "@/pages/customer/SupportCenter";
import SupportManager from "@/pages/admin/SupportManager";
import SuperDashboard from "@/pages/admin/SuperDashboard";
import PilgrimReports from "@/pages/admin/PilgrimReports";
import BusinessIntelligence from "@/pages/admin/BusinessIntelligence";
import CertificateCenter from "@/pages/admin/CertificateCenter";
import GuidePanel from "@/pages/admin/GuidePanel";
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
import PrintLuggageLarge from "@/pages/admin/print/PrintLuggageLarge";
import PrintIdCardsPro from "@/pages/admin/print/PrintIdCardsPro";
import PrintIdCardsDuplex from "@/pages/admin/print/PrintIdCardsDuplex";
import PrintRoomStickers from "@/pages/admin/print/PrintRoomStickers";
import PrintHajiList from "@/pages/admin/print/PrintHajiList";
import InvoiceManager from "@/pages/admin/InvoiceManager";
import CustomerManager from "@/pages/admin/CustomerManager";
import RequestsManager from "@/pages/admin/RequestsManager";
import InquiryManager from "@/pages/admin/InquiryManager";
import OfflineBookingManager from "@/pages/admin/OfflineBookingManager";
import OfflinePaymentsManager from "@/pages/admin/OfflinePaymentsManager";
import QRTracker from "@/pages/admin/QRTracker";
import ReportsManager from "@/pages/admin/ReportsManager";
import PaymentAnalytics from "@/pages/admin/PaymentAnalytics";
import PaymentTrash from "@/pages/admin/PaymentTrash";
import SystemHealth from "@/pages/admin/SystemHealth";
import OTPDebug from "@/pages/admin/OTPDebug";
import PrintCenter from "@/pages/admin/PrintCenter";
import BroadcastManager from "@/pages/admin/BroadcastManager";
import KYCManager from "@/pages/admin/KYCManager";
import KYCPage from "@/pages/customer/KYC";
import FeedbackPage from "@/pages/public/FeedbackPage";
import FeedbackManager from "@/pages/admin/FeedbackManager";
import StaffManager from "@/pages/admin/StaffManager";
import PrintStaffCards from "@/pages/admin/print/PrintStaffCards";
import PrintSprayLabel from "@/pages/admin/print/PrintSprayLabel";
import PrintSingleCard from "@/pages/admin/print/PrintSingleCard";
import PrintSheetCards from "@/pages/admin/print/PrintSheetCards";
import PrintSingleCardPro from "@/pages/admin/print/PrintSingleCardPro";
import PrintIdCardSVG from "@/pages/admin/print/PrintIdCardSVG";
import AttendanceManager from "@/pages/admin/AttendanceManager";
import PrintFamilySheet from "@/pages/admin/print/PrintFamilySheet";
import AttendanceScanner from "@/pages/admin/AttendanceScanner";
import AttendanceReport from "@/pages/admin/AttendanceReport";
import ExpenseManager from "@/pages/admin/ExpenseManager";
import AccountingDashboard from "@/pages/admin/AccountingDashboard";
import FlightManager from "@/pages/admin/FlightManager";
import OperationsDashboard from "@/pages/admin/OperationsDashboard";
import FamilyLedger from "@/pages/admin/FamilyLedger";
import HotelManager from "@/pages/admin/HotelManager";
import BusManager from "@/pages/admin/BusManager";
import MedicalManager from "@/pages/admin/MedicalManager";
import VisaTracker from "@/pages/admin/VisaTracker";
import AdminAIAssistant from "@/pages/admin/AIAssistant";
import CustomerLedger from "@/pages/admin/CustomerLedger";
import HajjiLedger from "@/pages/admin/HajjiLedger";
import VendorManager from "@/pages/admin/VendorManager";
import GSTReports from "@/pages/admin/GSTReports";
import PayrollManager from "@/pages/admin/PayrollManager";
import AssetManager from "@/pages/admin/AssetManager";
import AuditLogs from "@/pages/admin/AuditLogs";
import UserRolesManager from "@/pages/admin/UserRolesManager";
import BillingSettings from "@/pages/admin/BillingSettings";
import NotificationCenter from "@/pages/admin/NotificationCenter";
import NotificationLogs from "@/pages/admin/NotificationLogs";
import CommunicationCenter from "@/pages/admin/CommunicationCenter";
import NotificationTemplates from "@/pages/admin/NotificationTemplates";
import WhatsAppTemplateManager from "@/pages/admin/WhatsAppTemplateManager";
import BotBeeDashboard from "@/pages/admin/BotBeeDashboard";
import WhatsAppHistory from "@/pages/admin/WhatsAppHistory";
import SMSTemplateManager from "@/pages/admin/SMSTemplateManager";
import RCSTemplateManager from "@/pages/admin/RCSTemplateManager";
import EmailTemplateManager from "@/pages/admin/EmailTemplateManager";
import TestNotifications from "@/pages/admin/TestNotifications";
import WorkflowCenter from "@/pages/admin/WorkflowCenter";
import ZiyaratManager from "@/pages/admin/ZiyaratManager";
import LuggageManager from "@/pages/admin/LuggageManager";
import AllocationsManager from "@/pages/admin/AllocationsManager";
import AutomationCenter from "@/pages/admin/AutomationCenter";
import LoyaltyManager from "@/pages/admin/LoyaltyManager";
import ApiSettings from "@/pages/admin/ApiSettings";
import PaymentReminderSettings from "@/pages/admin/PaymentReminderSettings";
import AutoNotificationSettings from "@/pages/admin/AutoNotificationSettings";
import AttendanceScanPublic from "@/pages/public/AttendanceScanPublic";
import StaffVerify from "@/pages/public/StaffVerify";
import VerifyPilgrim from "@/pages/public/VerifyPilgrim";
import VerifyFamily from "@/pages/public/VerifyFamily";
import ScanPilgrim from "@/pages/public/ScanPilgrim";
import AgreementCenter from "@/pages/admin/AgreementCenter";
import AgreementSigning from "@/pages/customer/AgreementSigning";
import VerifyAgreement from "@/pages/public/VerifyAgreement";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/use-auth";
import { MainLayout } from "@/components/layout/MainLayout";
import { DeleteGuardProvider } from "@/components/DeleteGuard";

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
      <Route path="/terms" component={TermsAndConditions} />
      <Route path="/cancellation" component={CancellationPolicy} />
      <Route path="/refund" component={RefundPolicy} />
      <Route path="/login" component={Login} />
      <Route path="/invoice/:bookingNumber" component={Invoice} />
      <Route path="/pay/:bookingNumber" component={PaymentPage} />
      <Route path="/feedback" component={FeedbackPage} />
      <Route path="/verify-staff" component={StaffVerify} />
      <Route path="/verify/family/:groupId/:familyId" component={VerifyFamily} />
      <Route path="/verify/:id" component={VerifyPilgrim} />
      <Route path="/scan/:barcodeId" component={ScanPilgrim} />
      <Route path="/attendance-scan/:groupId/:eventId" component={AttendanceScanPublic} />

      {/* Public Agreement Verification */}
      <Route path="/verify-agreement/:token" component={VerifyAgreement} />

      {/* Customer Routes */}
      <Route path="/customer/dashboard" component={() => <CustomerRoute component={CustomerDashboard} />} />
      <Route path="/customer/documents" component={() => <CustomerRoute component={DocumentCenter} />} />
      <Route path="/customer/support" component={() => <CustomerRoute component={SupportCenter} />} />
      <Route path="/kyc" component={() => <CustomerRoute component={KYCPage} />} />
      <Route path="/agreement/:id/sign" component={() => <CustomerRoute component={AgreementSigning} />} />

      {/* Admin Routes */}
      <Route path="/admin/dashboard" component={() => <AdminRoute component={AdminDashboard} />} />
      <Route path="/admin/packages" component={() => <AdminRoute component={PackagesManager} />} />
      <Route path="/admin/bookings" component={() => <AdminRoute component={BookingsManager} />} />
      <Route path="/admin/invoices" component={() => <AdminRoute component={InvoiceManager} />} />
      <Route path="/admin/gallery" component={() => <AdminRoute component={GalleryManager} />} />
      <Route path="/admin/groups" component={() => <AdminRoute component={GroupsManager} />} />
      <Route path="/admin/groups/:groupId/pilgrims" component={() => <AdminRoute component={PilgrimManager} />} />
      <Route path="/admin/groups/:groupId/print/id-card-sheet" component={() => <AdminRoute component={PrintSheetCards} />} />
      <Route path="/admin/groups/:groupId/print/id-cards" component={() => <AdminRoute component={PrintIdCards} />} />
      <Route path="/admin/groups/:groupId/print/id-cards-pro" component={() => <AdminRoute component={PrintIdCardsPro} />} />
      <Route path="/admin/groups/:groupId/print/id-cards-duplex" component={() => <AdminRoute component={PrintIdCardsDuplex} />} />
      <Route path="/admin/groups/:groupId/print/luggage" component={() => <AdminRoute component={PrintLuggage} />} />
      <Route path="/admin/groups/:groupId/print/luggage-square" component={() => <AdminRoute component={PrintLuggageSquare} />} />
      <Route path="/admin/groups/:groupId/print/luggage-large" component={() => <AdminRoute component={PrintLuggageLarge} />} />
      <Route path="/admin/groups/:groupId/print/medical" component={() => <AdminRoute component={PrintMedical} />} />
      <Route path="/admin/groups/:groupId/print/hotel-list" component={() => <AdminRoute component={PrintHotelList} />} />
      <Route path="/admin/groups/:groupId/print/bus-list" component={() => <AdminRoute component={PrintBusList} />} />
      <Route path="/admin/groups/:groupId/print/airline-list" component={() => <AdminRoute component={PrintAirlineList} />} />
      <Route path="/admin/groups/:groupId/print/zamzam" component={() => <AdminRoute component={PrintZamzam} />} />
      <Route path="/admin/groups/:groupId/print/feedback" component={() => <AdminRoute component={PrintFeedback} />} />
      <Route path="/admin/groups/:groupId/print/contract" component={() => <AdminRoute component={PrintContract} />} />
      <Route path="/admin/groups/:groupId/print/room-stickers" component={() => <AdminRoute component={PrintRoomStickers} />} />
      <Route path="/admin/groups/:groupId/print/haji-list" component={() => <AdminRoute component={PrintHajiList} />} />
      <Route path="/admin/groups/:groupId/families/:familyId/print" component={() => <AdminRoute component={PrintFamilySheet} />} />
      <Route path="/admin/offline-bookings" component={() => <AdminRoute component={OfflineBookingManager} />} />
      <Route path="/admin/qr-tracker" component={() => <AdminRoute component={QRTracker} />} />
      <Route path="/admin/reports" component={() => <AdminRoute component={ReportsManager} />} />
      <Route path="/admin/offline-payments" component={() => <AdminRoute component={OfflinePaymentsManager} />} />
      <Route path="/admin/payment-analytics" component={() => <AdminRoute component={PaymentAnalytics} />} />
      <Route path="/admin/payments" component={() => <AdminRoute component={PaymentAnalytics} />} />
      <Route path="/admin/payment-reminders" component={() => <AdminRoute component={PaymentReminderSettings} />} />
      <Route path="/admin/auto-notifications" component={() => <AdminRoute component={AutoNotificationSettings} />} />
      <Route path="/admin/payment-trash" component={() => <AdminRoute component={PaymentTrash} />} />
      <Route path="/admin/print-center" component={() => <AdminRoute component={PrintCenter} />} />
      <Route path="/admin/customers" component={() => <AdminRoute component={CustomerManager} />} />
      <Route path="/admin/requests" component={() => <AdminRoute component={RequestsManager} />} />
      <Route path="/admin/inquiries" component={() => <AdminRoute component={InquiryManager} />} />
      <Route path="/admin/broadcast" component={() => <AdminRoute component={BroadcastManager} />} />
      <Route path="/admin/kyc" component={() => <AdminRoute component={KYCManager} />} />
      <Route path="/admin/feedback" component={() => <AdminRoute component={FeedbackManager} />} />
      <Route path="/admin/staff" component={() => <AdminRoute component={StaffManager} />} />
      <Route path="/admin/staff/print" component={() => <AdminRoute component={PrintStaffCards} />} />
      <Route path="/admin/print/spray-label" component={() => <AdminRoute component={PrintSprayLabel} />} />
      <Route path="/admin/print/id-card-svg" component={() => <AdminRoute component={PrintIdCardSVG} />} />
      <Route path="/admin/groups/:groupId/attendance/:eventId/scan" component={() => <AdminRoute component={AttendanceScanner} />} />
      <Route path="/admin/groups/:groupId/attendance/:eventId/report" component={() => <AdminRoute component={AttendanceReport} />} />
      <Route path="/admin/groups/:groupId/attendance" component={() => <AdminRoute component={AttendanceManager} />} />
      <Route path="/admin/operations" component={() => <AdminRoute component={OperationsDashboard} />} />
      <Route path="/admin/family-ledger" component={() => <AdminRoute component={FamilyLedger} />} />
      <Route path="/admin/hotels" component={() => <AdminRoute component={HotelManager} />} />
      <Route path="/admin/buses" component={() => <AdminRoute component={BusManager} />} />
      <Route path="/admin/medical" component={() => <AdminRoute component={MedicalManager} />} />
      <Route path="/admin/visa" component={() => <AdminRoute component={VisaTracker} />} />
      <Route path="/admin/ai" component={() => <AdminRoute component={AdminAIAssistant} />} />
      <Route path="/admin/expenses" component={() => <AdminRoute component={ExpenseManager} />} />
      <Route path="/admin/accounting" component={() => <AdminRoute component={AccountingDashboard} />} />
      <Route path="/admin/customer-ledger" component={() => <AdminRoute component={CustomerLedger} />} />
      <Route path="/admin/hajji-ledger" component={() => <AdminRoute component={HajjiLedger} />} />
      <Route path="/admin/vendors" component={() => <AdminRoute component={VendorManager} />} />
      <Route path="/admin/gst-reports" component={() => <AdminRoute component={GSTReports} />} />
      <Route path="/admin/payroll" component={() => <AdminRoute component={PayrollManager} />} />
      <Route path="/admin/assets" component={() => <AdminRoute component={AssetManager} />} />
      <Route path="/admin/support" component={() => <AdminRoute component={SupportManager} />} />
      <Route path="/admin/super" component={() => <AdminRoute component={SuperDashboard} />} />
      <Route path="/admin/pilgrim-reports" component={() => <AdminRoute component={PilgrimReports} />} />
      <Route path="/admin/bi" component={() => <AdminRoute component={BusinessIntelligence} />} />
      <Route path="/admin/certificates" component={() => <AdminRoute component={CertificateCenter} />} />
      <Route path="/admin/guide-panel" component={() => <AdminRoute component={GuidePanel} />} />
      <Route path="/admin/agreements" component={() => <AdminRoute component={AgreementCenter} />} />
      <Route path="/admin/audit-logs" component={() => <AdminRoute component={AuditLogs} />} />
      <Route path="/admin/system-health" component={() => <AdminRoute component={SystemHealth} />} />
      <Route path="/admin/otp-debug" component={() => <AdminRoute component={OTPDebug} />} />
      <Route path="/admin/user-roles" component={() => <AdminRoute component={UserRolesManager} />} />
      <Route path="/admin/notifications" component={() => <AdminRoute component={NotificationCenter} />} />
      <Route path="/admin/notification-logs" component={() => <AdminRoute component={NotificationLogs} />} />
      <Route path="/admin/notification-templates" component={() => <AdminRoute component={NotificationTemplates} />} />
      <Route path="/admin/billing-settings" component={() => <AdminRoute component={BillingSettings} />} />
      <Route path="/admin/api-settings" component={() => <AdminRoute component={ApiSettings} />} />
      <Route path="/admin/communication-center" component={() => <AdminRoute component={CommunicationCenter} />} />
      <Route path="/admin/botbee-dashboard" component={() => <AdminRoute component={BotBeeDashboard} />} />
      <Route path="/admin/whatsapp-templates" component={() => <AdminRoute component={WhatsAppTemplateManager} />} />
      <Route path="/admin/whatsapp-history" component={() => <AdminRoute component={WhatsAppHistory} />} />
      <Route path="/admin/sms-templates" component={() => <AdminRoute component={SMSTemplateManager} />} />
      <Route path="/admin/rcs-templates" component={() => <AdminRoute component={RCSTemplateManager} />} />
      <Route path="/admin/email-templates" component={() => <AdminRoute component={EmailTemplateManager} />} />
      <Route path="/admin/test-notifications" component={() => <AdminRoute component={TestNotifications} />} />
      <Route path="/admin/workflow-center" component={() => <AdminRoute component={WorkflowCenter} />} />
      <Route path="/admin/ziyarat" component={() => <AdminRoute component={ZiyaratManager} />} />
      <Route path="/admin/luggage" component={() => <AdminRoute component={LuggageManager} />} />
      <Route path="/admin/allocations" component={() => <AdminRoute component={AllocationsManager} />} />
      <Route path="/admin/automation-center" component={() => <AdminRoute component={AutomationCenter} />} />
      <Route path="/admin/loyalty" component={() => <AdminRoute component={LoyaltyManager} />} />
      <Route path="/admin/flights" component={() => <AdminRoute component={FlightManager} />} />
      <Route path="/admin/groups/:groupId/flights" component={() => <AdminRoute component={FlightManager} />} />
      <Route path="/admin/groups/:groupId/print/single-card/:pilgrimId"    component={() => <AdminRoute component={PrintSingleCard} />} />
      <Route path="/admin/groups/:groupId/print/id-card-front/:pilgrimId" component={() => <AdminRoute component={PrintSingleCard} />} />
      <Route path="/admin/groups/:groupId/print/id-card-back/:pilgrimId"  component={() => <AdminRoute component={PrintSingleCard} />} />
      <Route path="/admin/groups/:groupId/print/card-front/:pilgrimId" component={() => <AdminRoute component={PrintSingleCardPro} />} />
      <Route path="/admin/groups/:groupId/print/card-back/:pilgrimId"  component={() => <AdminRoute component={PrintSingleCardPro} />} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DeleteGuardProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </DeleteGuardProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
