import { MainLayout } from "@/components/layout/MainLayout";

function LegalLayout({ title, lastUpdated, children }: { title: string, lastUpdated: string, children: React.ReactNode }) {
  return (
    <MainLayout>
      <div className="bg-primary pt-20 pb-20 text-center relative">
        <h1 className="text-3xl md:text-5xl font-serif font-bold text-white mb-4 relative z-10">{title}</h1>
        <p className="text-white/70">Last Updated: {lastUpdated}</p>
      </div>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="prose prose-stone prose-headings:font-serif prose-headings:text-primary max-w-none">
          {children}
        </div>
      </div>
    </MainLayout>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated="January 1, 2025">
      <p>Al Burhan Tours & Travels respects your privacy and is committed to protecting your personal information.</p>

      <h2>Information We Collect</h2>
      <p>We may collect the following information when you use our website or services:</p>
      <ul>
        <li>Name</li>
        <li>Contact details (phone number, email)</li>
        <li>Passport details for travel processing</li>
        <li>Address information</li>
        <li>Payment information</li>
        <li>Travel preferences and booking details</li>
      </ul>

      <h2>How We Use Your Information</h2>
      <p>Your information may be used for:</p>
      <ul>
        <li>Processing travel bookings</li>
        <li>Visa and travel documentation</li>
        <li>Customer support</li>
        <li>Sending booking confirmations and invoices</li>
        <li>Travel updates and notifications</li>
      </ul>

      <h2>Data Protection</h2>
      <p>We take appropriate security measures to protect your personal information from unauthorized access or misuse.</p>

      <h2>Third Party Services</h2>
      <p>Your information may be shared with:</p>
      <ul>
        <li>Airlines</li>
        <li>Hotels</li>
        <li>Visa authorities</li>
        <li>Government authorities where required for travel processing</li>
      </ul>

      <h2>Contact</h2>
      <p>If you have any questions about our privacy policy, you can contact us:</p>
      <ul>
        <li><strong>Email:</strong> info@alburhantravels.com</li>
        <li><strong>Phone:</strong> +91 9893989786</li>
      </ul>
    </LegalLayout>
  );
}

export function TermsAndConditions() {
  return (
    <LegalLayout title="Terms & Conditions" lastUpdated="January 1, 2025">
      <p>By using our website and booking our services, you agree to the following terms and conditions.</p>

      <h2>Booking Policy</h2>
      <ul>
        <li>All bookings must be confirmed with a deposit payment.</li>
        <li>Customers must provide accurate personal and travel details.</li>
        <li>Remaining balance must be paid before travel departure.</li>
      </ul>

      <h2>Travel Documents</h2>
      <p>Customers are responsible for:</p>
      <ul>
        <li>Valid passport</li>
        <li>Required travel documents</li>
        <li>Compliance with immigration regulations</li>
      </ul>

      <h2>Service Changes</h2>
      <p>Al Burhan Tours & Travels reserves the right to make necessary changes to itineraries, hotels, or transportation arrangements due to operational requirements or circumstances beyond our control.</p>

      <h2>Liability</h2>
      <p>We act as an intermediary between customers and travel service providers such as airlines, hotels, and transportation companies. We are not responsible for delays, cancellations, or changes caused by third-party providers.</p>

      <h2>Force Majeure</h2>
      <p>We are not liable for circumstances beyond our control including natural disasters, government restrictions, political unrest, or travel bans.</p>

      <h2>Dispute Resolution</h2>
      <p>In the event of any disputes, both parties agree to resolve the matter amicably. Any legal proceedings shall be subject to the jurisdiction of the courts in Burhanpur, Madhya Pradesh.</p>
    </LegalLayout>
  );
}

export function CancellationPolicy() {
  return (
    <LegalLayout title="Cancellation Policy" lastUpdated="January 1, 2025">
      <p>All cancellations must be made in writing via email or through our office.</p>
      <p>Cancellation charges may apply depending on the time of cancellation before the travel date.</p>

      <h2>General Cancellation Guidelines</h2>
      <ul>
        <li><strong>More than 60 days before departure</strong> – Minimal administrative charges may apply.</li>
        <li><strong>30 to 60 days before departure</strong> – Partial cancellation fee may apply.</li>
        <li><strong>Less than 30 days before departure</strong> – Higher cancellation charges may apply.</li>
        <li><strong>No-show or last-minute cancellation</strong> – Full package amount may be non-refundable.</li>
      </ul>

      <h2>Non-Refundable Charges</h2>
      <p>Visa processing fees, airline charges, and hotel booking fees may be non-refundable depending on service provider policies.</p>

      <h2>How to Cancel</h2>
      <p>To initiate a cancellation, please contact us in writing:</p>
      <ul>
        <li><strong>Email:</strong> info@alburhantravels.com</li>
        <li><strong>Phone:</strong> +91 9893989786</li>
        <li><strong>Office:</strong> 5/8 Khanka Masjid Complex, Shanwara Road, Burhanpur MP 450331</li>
      </ul>
    </LegalLayout>
  );
}

export function RefundPolicy() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="January 1, 2025">
      <p>Refunds will be processed according to the cancellation policy and service provider conditions.</p>

      <h2>When Refunds Are Issued</h2>
      <p>Refunds may be issued in the following cases:</p>
      <ul>
        <li>Approved cancellation requests</li>
        <li>Travel service unavailability</li>
        <li>Duplicate payments or billing errors</li>
      </ul>

      <h2>Refund Processing Time</h2>
      <p>Refund processing may take <strong>7 to 21 business days</strong> depending on banking and payment gateway processing.</p>

      <h2>Deductions</h2>
      <p>Certain charges such as visa fees, airline cancellation penalties, and administrative costs may be deducted before issuing refunds.</p>

      <h2>Payment Method</h2>
      <p>Refunds will be issued using the original payment method where possible.</p>

      <h2>Contact for Refunds</h2>
      <ul>
        <li><strong>Email:</strong> info@alburhantravels.com</li>
        <li><strong>Phone:</strong> +91 9893989786</li>
      </ul>
    </LegalLayout>
  );
}
