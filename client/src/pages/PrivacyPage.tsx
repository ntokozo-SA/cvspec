import type { ReactElement } from 'react'
import { BrandMark } from '../components/Layout'

const CONTACT_EMAIL = 'admin@peoplecurated.com'

export function PrivacyPage(): ReactElement {
  return (
    <div className="shell">
      <header className="site-nav">
        <div className="site-nav__inner">
          <BrandMark />
        </div>
      </header>
      <main className="legal-page">
        <h1>Privacy policy</h1>
        <p className="legal-page__updated">Last updated: 5 October 2026</p>

        <p>
          This policy explains what data CV Specs (the web app and the CVSpec Chrome extension)
          collects, how it is used, and the choices you have.
        </p>

        <h2>Data we collect</h2>
        <ul>
          <li>
            <strong>Account information:</strong> your email address and a hashed password, managed
            by our authentication provider.
          </li>
          <li>
            <strong>Resumes:</strong> the files you upload and the text, skills and experience we
            extract from them.
          </li>
          <li>
            <strong>Job postings:</strong> job specs you add in the web app, and postings you choose
            to save with the extension (title, company, location, description and page URL).
          </li>
          <li>
            <strong>Results:</strong> match scores, recommendations and the application status you
            set for saved jobs.
          </li>
        </ul>

        <h2>Chrome extension</h2>
        <p>
          The extension only reads a job board page (LinkedIn, Indeed or Glassdoor) to show its
          buttons and to collect the posting details when you click Save to CVSpec or Tailor before
          applying. It does not record your browsing history, read other pages, or collect data from
          pages you have not acted on.
        </p>
        <p>
          The extension stores your CV Specs login session and your last selected resume in
          Chrome&apos;s local extension storage so you stay signed in. Signing out of the web app or
          the extension removes the session.
        </p>

        <h2>How we use your data</h2>
        <p>
          We use your data only to provide CV Specs: storing your resumes and saved jobs, scoring
          them against each other, generating resume recommendations, and tracking your
          applications. We do not sell your data, use it for advertising, or use it to determine
          creditworthiness or for lending.
        </p>

        <h2>Service providers</h2>
        <p>We share data only with the providers needed to run the service:</p>
        <ul>
          <li>
            <strong>Supabase:</strong> authentication, database and file storage.
          </li>
          <li>
            <strong>OpenAI:</strong> resume and job posting text is sent to OpenAI&apos;s API to
            extract requirements and generate recommendations.
          </li>
          <li>
            <strong>Amazon Web Services:</strong> hosting for the web app and API.
          </li>
        </ul>

        <h2>Retention and deletion</h2>
        <p>
          Your data is kept while your account is active. You can delete individual resumes, job
          specs and saved applications at any time in the app. To delete your account and all
          associated data, email us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <h2>Security</h2>
        <p>
          Data is transmitted over HTTPS, and access to stored data is restricted to your account.
        </p>

        <h2>Changes</h2>
        <p>If we change this policy, we will update the date at the top of this page.</p>

        <h2>Contact</h2>
        <p>
          Questions about this policy: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </main>
    </div>
  )
}
