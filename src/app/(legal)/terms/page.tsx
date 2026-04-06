import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service — LiveShop Pro',
  description: 'Terms of Service for LiveShop Pro by Nazha Hatyai',
};

export default function TermsOfServicePage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 6, 2026</p>

      <p className="text-gray-700 mb-6">
        These Terms of Service ("Terms") govern your access to and use of the{' '}
        <strong>LiveShop Pro</strong> platform and services provided by{' '}
        <strong>Nazha Hatyai</strong> (also known as Master Nivest / 合艾哪吒三太子) at{' '}
        <strong>nazhahatyai.com</strong>. By accessing or using our services, you agree to be
        bound by these Terms.
      </p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
        <p className="text-gray-700">
          By creating an account, browsing our platform, or placing an order, you confirm that you
          have read, understood, and agree to these Terms, our{' '}
          <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>, and any
          additional terms that apply to specific features. If you do not agree, you must not use
          our services.
        </p>
        <p className="text-gray-700 mt-3">
          You must be at least 18 years of age (or the legal age of majority in your jurisdiction)
          to use our services. By using the platform, you represent that you meet this requirement.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. Account Registration</h2>
        <p className="text-gray-700 mb-3">
          Access to LiveShop Pro requires registration via Facebook Login. By connecting your
          Facebook account, you:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>
            Authorize us to access your Facebook profile information as described in our Privacy
            Policy.
          </li>
          <li>
            Agree to comply with{' '}
            <a
              href="https://www.facebook.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Facebook's Terms of Service
            </a>
            .
          </li>
          <li>Take responsibility for all activity that occurs under your account.</li>
          <li>
            Agree to notify us immediately of any unauthorized use of your account at{' '}
            <a href="mailto:contact@nazhahatyai.com" className="text-blue-600 hover:underline">
              contact@nazhahatyai.com
            </a>
            .
          </li>
        </ul>
        <p className="text-gray-700 mt-3">
          We reserve the right to suspend or terminate accounts that violate these Terms or are
          involved in fraudulent activity.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. Orders and Payments</h2>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">3.1 Placing Orders</h3>
        <p className="text-gray-700">
          Orders can be placed through our live commerce streams or product listings. By placing an
          order, you make a binding offer to purchase the selected product(s) at the listed price.
          Order confirmation constitutes our acceptance of your offer.
        </p>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">3.2 Payment Methods</h3>
        <p className="text-gray-700 mb-2">
          We currently accept the following payment methods:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>
            <strong>PromptPay QR Code:</strong> Scan the QR code and complete payment via your
            Thai banking app.
          </li>
          <li>
            <strong>Maybank Bank Transfer:</strong> Direct bank transfer to our Maybank account
            (Malaysia).
          </li>
        </ul>
        <p className="text-gray-700 mt-3">
          Prices are displayed in Malaysian Ringgit (MYR) unless otherwise stated. Payment must
          be completed within 24 hours of placing an order. Unpaid orders will be automatically
          cancelled.
        </p>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">3.3 Payment Confirmation</h3>
        <p className="text-gray-700">
          After completing payment, you must submit proof of payment (transaction screenshot or
          reference number) through the designated channel. Orders are processed only after
          payment is verified.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
          4. Product Descriptions and Pricing
        </h2>
        <p className="text-gray-700">
          We make every effort to ensure that product descriptions, images, and prices are accurate.
          Prices are fixed and displayed in MYR. All prices include applicable taxes unless
          otherwise stated.
        </p>
        <p className="text-gray-700 mt-3">
          We reserve the right to correct pricing errors. If a product is listed at an incorrect
          price, we will notify you and give you the option to proceed at the correct price or
          cancel your order.
        </p>
        <p className="text-gray-700 mt-3">
          Product availability is subject to change. We do not guarantee that products shown during
          live streams will remain in stock.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Shipping and Delivery</h2>
        <p className="text-gray-700">
          We ship to customers in Thailand and Malaysia. Estimated delivery times vary by location
          and shipping method selected at checkout. Delivery timelines are estimates and not
          guaranteed.
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-3">
          <li>Orders are processed within 1–3 business days after payment confirmation.</li>
          <li>Domestic shipping in Thailand: typically 2–5 business days.</li>
          <li>International shipping to Malaysia: typically 5–10 business days.</li>
        </ul>
        <p className="text-gray-700 mt-3">
          Risk of loss and title for products pass to you upon delivery. We are not responsible
          for delays caused by customs, weather, or carrier issues beyond our control.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Returns and Refunds</h2>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">6.1 Return Eligibility</h3>
        <p className="text-gray-700">
          Returns are accepted within 7 days of delivery for items that are:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-2">
          <li>Defective or damaged upon receipt</li>
          <li>Significantly different from the description</li>
          <li>Incorrect items delivered</li>
        </ul>
        <p className="text-gray-700 mt-3">
          Items must be returned in their original condition and packaging. Change-of-mind returns
          are at our discretion and may be subject to a restocking fee.
        </p>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">6.2 Refund Process</h3>
        <p className="text-gray-700">
          To initiate a return or refund, contact us at{' '}
          <a href="mailto:contact@nazhahatyai.com" className="text-blue-600 hover:underline">
            contact@nazhahatyai.com
          </a>{' '}
          with your order number, reason for return, and supporting photos if applicable. Approved
          refunds will be processed within 7–14 business days via the original payment method or
          an agreed alternative.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Intellectual Property</h2>
        <p className="text-gray-700">
          All content on the LiveShop Pro platform, including but not limited to text, images,
          logos, videos, and software, is owned by or licensed to Nazha Hatyai and protected by
          applicable intellectual property laws.
        </p>
        <p className="text-gray-700 mt-3">
          You may not copy, reproduce, distribute, or create derivative works from our content
          without our prior written consent. Personal, non-commercial use of our content is
          permitted, provided you do not remove any copyright or proprietary notices.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. Prohibited Conduct</h2>
        <p className="text-gray-700 mb-3">You agree not to:</p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Use our services for any unlawful purpose</li>
          <li>Place fraudulent orders or provide false information</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Interfere with or disrupt the operation of our services</li>
          <li>Use automated tools to scrape or interact with our platform without permission</li>
          <li>Impersonate any person or entity</li>
          <li>Engage in any activity that violates Facebook's Platform Policies</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
          9. Limitation of Liability
        </h2>
        <p className="text-gray-700">
          To the maximum extent permitted by applicable law, Nazha Hatyai and its operators,
          employees, and agents shall not be liable for any indirect, incidental, special,
          consequential, or punitive damages arising from your use of our services.
        </p>
        <p className="text-gray-700 mt-3">
          Our total liability for any claim related to our services shall not exceed the amount
          you paid for the transaction giving rise to the claim, or MYR 500, whichever is lower.
        </p>
        <p className="text-gray-700 mt-3">
          We are not responsible for the actions of third-party services including Facebook,
          payment processors, or shipping providers.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">10. Disclaimers</h2>
        <p className="text-gray-700">
          Our services are provided "as is" and "as available" without warranties of any kind,
          either express or implied. We do not warrant that our services will be uninterrupted,
          error-free, or free of viruses or other harmful components.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">11. Governing Law</h2>
        <p className="text-gray-700">
          These Terms shall be governed by and construed in accordance with the laws of the
          Kingdom of Thailand, without regard to its conflict of law provisions. Any disputes
          arising under these Terms shall be subject to the exclusive jurisdiction of the courts
          located in Hat Yai, Songkhla, Thailand.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">12. Changes to Terms</h2>
        <p className="text-gray-700">
          We reserve the right to modify these Terms at any time. Changes will be posted on this
          page with an updated date. Your continued use of our services after changes are posted
          constitutes your acceptance of the revised Terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">13. Contact Us</h2>
        <p className="text-gray-700">
          For questions or concerns about these Terms, please contact us:
        </p>
        <div className="mt-3 p-4 bg-gray-50 rounded-lg text-gray-700">
          <p><strong>Nazha Hatyai (Master Nivest / 合艾哪吒三太子)</strong></p>
          <p>Hat Yai, Songkhla, Thailand</p>
          <p>
            Email:{' '}
            <a href="mailto:contact@nazhahatyai.com" className="text-blue-600 hover:underline">
              contact@nazhahatyai.com
            </a>
          </p>
          <p>
            Website:{' '}
            <a
              href="https://nazhahatyai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              nazhahatyai.com
            </a>
          </p>
        </div>
      </section>
    </article>
  );
}
