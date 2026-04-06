import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — LiveShop Pro',
  description: 'Privacy Policy for LiveShop Pro by Nazha Hatyai',
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 6, 2026</p>

      <p className="text-gray-700 mb-6">
        This Privacy Policy describes how <strong>Nazha Hatyai</strong> (also known as Master Nivest /
        合艾哪吒三太子), operating the <strong>LiveShop Pro</strong> application at{' '}
        <strong>nazhahatyai.com</strong>, collects, uses, and protects your personal information
        when you use our services, including our Facebook-integrated live commerce platform.
      </p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">1.1 Information You Provide</h3>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Name and display name</li>
          <li>Email address</li>
          <li>Shipping address and phone number (for order fulfillment)</li>
          <li>Order details and purchase history</li>
        </ul>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">1.2 Information from Facebook Login</h3>
        <p className="text-gray-700 mb-2">
          When you authenticate via Facebook Login, we receive the following information from Facebook
          (Facebook App ID: 780277861568430):
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Facebook User ID</li>
          <li>Public profile information (name, profile picture)</li>
          <li>Email address (if you grant permission)</li>
          <li>Facebook Page access tokens (for page administrators managing live streams)</li>
        </ul>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">1.3 Information We Collect Automatically</h3>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Log data (IP address, browser type, pages visited, timestamps)</li>
          <li>Device information (device type, operating system)</li>
          <li>Cookies and similar tracking technologies (see Section 7)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">2. How We Use Your Information</h2>
        <p className="text-gray-700 mb-3">We use the information we collect to:</p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Process and fulfill your orders</li>
          <li>Communicate with you about your orders via Facebook Messenger and email</li>
          <li>Authenticate your identity and maintain your account</li>
          <li>Provide customer support</li>
          <li>Operate and improve our live commerce features</li>
          <li>Detect and prevent fraud or unauthorized activity</li>
          <li>Comply with legal obligations</li>
          <li>Send order confirmations, shipping updates, and important service notices</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">3. Data Sharing and Disclosure</h2>
        <p className="text-gray-700 mb-3">
          <strong>We do not sell your personal data.</strong> We may share your information only in
          the following limited circumstances:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>
            <strong>Payment processors:</strong> We share transaction data with payment processors
            (e.g., PromptPay, Maybank) solely to process payments. These processors are bound by
            their own privacy policies and applicable law.
          </li>
          <li>
            <strong>Shipping and logistics providers:</strong> Your name, address, and order details
            are shared with delivery services to fulfill your orders.
          </li>
          <li>
            <strong>Facebook:</strong> Our application interacts with the Facebook platform. Please
            review{' '}
            <a
              href="https://www.facebook.com/privacy/policy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Facebook's Privacy Policy
            </a>{' '}
            for information on how Facebook handles your data.
          </li>
          <li>
            <strong>Legal requirements:</strong> We may disclose your information if required by law,
            court order, or governmental authority.
          </li>
          <li>
            <strong>Business transfers:</strong> In the event of a merger or acquisition, your
            information may be transferred to the successor entity.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">4. Data Retention</h2>
        <p className="text-gray-700 mb-3">We retain your personal data for the following periods:</p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>
            <strong>Account data:</strong> Retained for as long as your account is active. Upon
            account deletion, data is removed within 30 days, except where retention is required
            by law.
          </li>
          <li>
            <strong>Order data:</strong> Retained for 7 years to comply with tax and accounting
            regulations.
          </li>
          <li>
            <strong>Log data:</strong> Retained for up to 90 days for security and debugging
            purposes.
          </li>
          <li>
            <strong>Facebook access tokens:</strong> Stored only for the duration required to operate
            the connected Facebook Page features. Tokens are invalidated upon disconnecting your
            Facebook account.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">5. Your Rights</h2>
        <p className="text-gray-700 mb-3">
          Depending on your location, you may have the following rights regarding your personal data:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>
            <strong>Access:</strong> Request a copy of the personal data we hold about you.
          </li>
          <li>
            <strong>Correction:</strong> Request that we correct inaccurate or incomplete data.
          </li>
          <li>
            <strong>Deletion:</strong> Request that we delete your personal data (see our{' '}
            <a href="/data-deletion" className="text-blue-600 hover:underline">
              Data Deletion page
            </a>{' '}
            for instructions).
          </li>
          <li>
            <strong>Portability:</strong> Request your data in a machine-readable format.
          </li>
          <li>
            <strong>Objection:</strong> Object to the processing of your data for certain purposes.
          </li>
          <li>
            <strong>Withdraw consent:</strong> Where processing is based on consent, you may
            withdraw it at any time.
          </li>
        </ul>
        <p className="text-gray-700 mt-3">
          To exercise any of these rights, please contact us at{' '}
          <a href="mailto:contact@nazhahatyai.com" className="text-blue-600 hover:underline">
            contact@nazhahatyai.com
          </a>
          . We will respond within 30 days.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">6. Data Security</h2>
        <p className="text-gray-700">
          We implement appropriate technical and organizational measures to protect your personal
          data against unauthorized access, alteration, disclosure, or destruction. These measures
          include encrypted data transmission (HTTPS), access controls, and regular security reviews.
          However, no method of transmission over the internet is 100% secure, and we cannot
          guarantee absolute security.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">7. Cookies</h2>
        <p className="text-gray-700 mb-3">
          We use cookies and similar technologies to operate our service. Types of cookies we use:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>
            <strong>Essential cookies:</strong> Required for authentication and session management.
            These cannot be disabled.
          </li>
          <li>
            <strong>Functional cookies:</strong> Remember your preferences and settings.
          </li>
          <li>
            <strong>Analytics cookies:</strong> Help us understand how users interact with our
            service to improve functionality.
          </li>
        </ul>
        <p className="text-gray-700 mt-3">
          You can control cookies through your browser settings. Disabling essential cookies may
          prevent you from using certain features of our service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">8. Children's Privacy</h2>
        <p className="text-gray-700">
          Our services are not directed to children under the age of 13. We do not knowingly collect
          personal data from children under 13. If you believe we have inadvertently collected such
          data, please contact us and we will delete it promptly.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">9. International Data Transfers</h2>
        <p className="text-gray-700">
          Our business operates primarily in Thailand and the Malaysian market. Your data may be
          processed in Thailand, Malaysia, and countries where our service providers are located.
          We ensure that any such transfers are conducted in accordance with applicable data
          protection laws and with appropriate safeguards in place.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">10. Changes to This Policy</h2>
        <p className="text-gray-700">
          We may update this Privacy Policy from time to time. We will notify you of significant
          changes by posting the new policy on this page with an updated "Last updated" date. Your
          continued use of the service after changes constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">11. Contact Us</h2>
        <p className="text-gray-700">
          If you have any questions, concerns, or requests regarding this Privacy Policy or our
          data practices, please contact us:
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
