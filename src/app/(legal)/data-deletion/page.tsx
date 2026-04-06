import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Data Deletion Request — LiveShop Pro',
  description: 'How to request deletion of your personal data from LiveShop Pro',
};

export default function DataDeletionPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Data Deletion Request</h1>
      <p className="text-sm text-gray-500 mb-8">Last updated: April 6, 2026</p>

      <p className="text-gray-700 mb-6">
        <strong>LiveShop Pro</strong> is committed to respecting your privacy and your right to
        control your personal data. This page explains how to request the deletion of your personal
        data from our systems, in compliance with{' '}
        <a
          href="https://developers.facebook.com/terms/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Facebook's Platform Terms
        </a>{' '}
        and applicable privacy laws.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 mb-8">
        <p className="text-blue-900 font-medium mb-1">Facebook Login Users</p>
        <p className="text-blue-800 text-sm">
          If you used Facebook Login to access LiveShop Pro, you can also revoke our app's access
          via your{' '}
          <a
            href="https://www.facebook.com/settings?tab=applications"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Facebook App Settings
          </a>
          . However, to fully delete all data we hold about you, please follow the instructions
          below.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
          How to Request Data Deletion
        </h2>
        <p className="text-gray-700 mb-4">
          To request deletion of your personal data, send an email to us using the instructions
          below. We do not require you to create an account or log in to submit a deletion request.
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <p className="font-semibold text-gray-900 mb-3">Step-by-step instructions:</p>
          <ol className="list-decimal pl-6 text-gray-700 space-y-3">
            <li>
              Send an email to{' '}
              <a href="mailto:contact@nazhahatyai.com" className="text-blue-600 hover:underline">
                contact@nazhahatyai.com
              </a>
            </li>
            <li>
              Use the subject line: <strong>Data Deletion Request — [Your Name or Facebook Name]</strong>
            </li>
            <li>
              In the body of the email, include:
              <ul className="list-disc pl-5 mt-2 space-y-1">
                <li>Your full name</li>
                <li>The email address or Facebook account name associated with your account</li>
                <li>A brief statement: "I request deletion of all personal data associated with my account."</li>
              </ul>
            </li>
          </ol>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
          What Data Will Be Deleted
        </h2>
        <p className="text-gray-700 mb-3">
          Upon receiving a valid deletion request, we will delete or anonymize the following data:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>Your account profile (name, email, Facebook User ID, profile picture)</li>
          <li>Facebook access tokens stored for your account</li>
          <li>Your saved addresses and contact details</li>
          <li>Your session and authentication data</li>
          <li>Preferences and settings associated with your account</li>
          <li>Any messages or communications stored in our system</li>
        </ul>

        <h3 className="text-base font-semibold text-gray-800 mt-6 mb-2">Data We May Retain</h3>
        <p className="text-gray-700 mb-3">
          We may retain certain data where required by law or for legitimate business purposes:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1">
          <li>
            <strong>Order and transaction records:</strong> Retained for up to 7 years to comply
            with tax, accounting, and legal obligations. This data will be anonymized where
            possible.
          </li>
          <li>
            <strong>Fraud prevention records:</strong> If your account was involved in suspected
            fraud, we may retain limited records as required by law.
          </li>
          <li>
            <strong>Legal holds:</strong> Data subject to a legal hold or pending investigation
            will be retained until the matter is resolved.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Deletion Timeline</h2>
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-sm text-gray-700">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Step</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-900">Timeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="px-4 py-3">Acknowledgment of your request</td>
                <td className="px-4 py-3">Within 3 business days</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3">Identity verification (if required)</td>
                <td className="px-4 py-3">Up to 5 business days</td>
              </tr>
              <tr>
                <td className="px-4 py-3">Data deletion completed</td>
                <td className="px-4 py-3">Within 30 days of request</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="px-4 py-3">Deletion confirmation sent to you</td>
                <td className="px-4 py-3">Within 30 days of request</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">
          Facebook Platform Compliance
        </h2>
        <p className="text-gray-700">
          LiveShop Pro complies with{' '}
          <a
            href="https://developers.facebook.com/terms/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Facebook's Platform Terms
          </a>{' '}
          and{' '}
          <a
            href="https://developers.facebook.com/policy/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            Developer Policies
          </a>
          . In particular:
        </p>
        <ul className="list-disc pl-6 text-gray-700 space-y-1 mt-3">
          <li>
            We honor data deletion requests from users who connected their Facebook account to
            our application.
          </li>
          <li>
            We provide this Data Deletion page as required by Facebook's App Review process.
          </li>
          <li>
            We do not retain Facebook user data beyond what is necessary to operate our service.
          </li>
          <li>
            Revoking our app's permissions on Facebook will prevent future data collection, but
            you must submit a deletion request to remove data we have already collected.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Contact Us</h2>
        <p className="text-gray-700">
          For data deletion requests or questions about your personal data, please contact us:
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
        <p className="text-gray-500 text-sm mt-4">
          For general privacy inquiries, see our{' '}
          <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>.
        </p>
      </section>
    </article>
  );
}
