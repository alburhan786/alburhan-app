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
      <h2>Introduction</h2>
      <p>At Al Burhan Tours & Travels, we respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website or book our services.</p>
      
      <h2>Data We Collect</h2>
      <p>We may collect, use, store and transfer different kinds of personal data about you including:</p>
      <ul>
        <li><strong>Identity Data:</strong> First name, last name, username, passport details, date of birth.</li>
        <li><strong>Contact Data:</strong> Billing address, email address and telephone numbers.</li>
        <li><strong>Financial Data:</strong> Bank account and payment card details (processed securely via our payment gateways).</li>
      </ul>

      <h2>How We Use Your Data</h2>
      <p>We will only use your personal data when the law allows us to. Most commonly, we will use your personal data to process your booking, manage your travel arrangements, visa processing, and communicate with you regarding your journey.</p>
    </LegalLayout>
  );
}

export function TermsConditions() {
  return (
    <LegalLayout title="Terms & Conditions" lastUpdated="January 1, 2025">
      <h2>Agreement to Terms</h2>
      <p>By booking a package with Al Burhan Tours & Travels, you agree to be bound by these Terms and Conditions. Please read them carefully.</p>

      <h2>Booking and Payment</h2>
      <p>A booking is confirmed only when the initial deposit is received. The full payment must be cleared prior to the departure date as specified in your booking confirmation.</p>

      <h2>Visa Processing</h2>
      <p>While we assist in processing visas for Hajj, Umrah, and Ziyarat, the final approval rests solely with the respective embassies and ministries. Al Burhan is not liable for visa rejections.</p>
      
      <h2>Travel Documents</h2>
      <p>Pilgrims are responsible for ensuring their passports are valid for at least 6 months from the date of travel and contain sufficient blank pages.</p>
    </LegalLayout>
  );
}

export function CancellationPolicy() {
  return (
    <LegalLayout title="Cancellation Policy" lastUpdated="January 1, 2025">
      <h2>Cancellation by Pilgrim</h2>
      <p>If you need to cancel your booking, you must notify us in writing. The following cancellation charges typically apply:</p>
      <ul>
        <li>45+ days before departure: Loss of initial deposit</li>
        <li>30-44 days before departure: 50% of total package cost</li>
        <li>15-29 days before departure: 75% of total package cost</li>
        <li>Less than 15 days before departure: 100% of total package cost</li>
      </ul>

      <h2>Cancellation by Al Burhan</h2>
      <p>In rare circumstances, we may need to cancel a tour. If we do, you will receive a full refund or the option to transfer to an alternative date/package.</p>
    </LegalLayout>
  );
}

export function RefundPolicy() {
  return (
    <LegalLayout title="Refund Policy" lastUpdated="January 1, 2025">
      <h2>Processing Refunds</h2>
      <p>Approved refunds will be processed within 14-21 business days. Refunds are strictly processed to the original method of payment or a designated bank account in the pilgrim's name.</p>
      
      <h2>Non-refundable Items</h2>
      <p>Certain items are strictly non-refundable once processed:</p>
      <ul>
        <li>Visa processing fees</li>
        <li>Issued flight tickets (subject to airline policy)</li>
        <li>Specific hotel reservations during peak seasons (e.g., last 10 days of Ramadan, Hajj days)</li>
      </ul>
      <p>We advise all pilgrims to obtain comprehensive travel insurance to cover unforeseen cancellations.</p>
    </LegalLayout>
  );
}
