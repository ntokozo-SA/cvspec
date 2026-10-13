import type { ReactElement } from 'react'
import { BrandMark, CONTACT_EMAIL, SiteFooter } from '../components/Layout'

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
        <p className="legal-page__updated">Last updated: 13 October 2026</p>

        <p>
          This policy explains what data CV Spec (the web app and the CVSpec Chrome extension)
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
            <strong>Results:</strong> match scores, recommendations, the application status you
            set for saved jobs, and which recommendations you chose to apply for each job.
          </li>
          <li>
            <strong>Application profile:</strong> the contact details you save for filling job
            applications (name, email, phone, location, LinkedIn and website links).
          </li>
          <li>
            <strong>Saved answers:</strong> answers you save on your profile for common application
            questions, such as salary expectation, notice period and start date.
          </li>
          <li>
            <strong>Answers for each job:</strong> the text of each custom question on an
            application form you fill with the extension, and the answer you kept for it.
          </li>
          <li>
            <strong>Cover letters:</strong> the text of the cover letter for each saved job, as
            drafted and edited by you. The DOCX and PDF files are built when you download or attach
            them and are not stored.
          </li>
        </ul>

        <h2>Chrome extension</h2>
        <p>
          The extension only reads job pages on supported job boards (LinkedIn, Indeed, Glassdoor,
          ZipRecruiter, Google for Jobs, CareerBuilder, Monster, SimplyHired, Talention, FlexJobs, We
          Work Remotely, Remote.co, Dice, Wellfound, Hired, Built In, Handshake, Snagajob, Upwork,
          Fiverr, Idealist and People Curated) to show its buttons and to collect the posting
          details when you click Save to CVSpec or Tailor before applying. On Google it only acts on
          Google Jobs results. It does not record your browsing history, read other pages, or
          collect data from pages you have not acted on.
        </p>
        <p>
          Some sites are off until you turn them on: the South African job boards PNet, Careers24,
          CareerJunction and OfferZen, and the application systems SmartRecruiters, Workday, SAP
          SuccessFactors and Workable. Chrome asks for your permission for each site separately
          when you enable it, and you can remove access to any of them at any time on the
          extension&apos;s Sites page (or in Chrome&apos;s extension settings). OfferZen postings,
          and jobs you apply to through a board&apos;s own application form, are saved for tracking
          only; the extension does not fill those forms.
        </p>
        <p>
          When you choose Apply with tailored resume, the extension also runs on the application
          form you open from that job: Greenhouse, Lever and any application systems you have
          enabled, or any other form page where you click Fill this application in the extension
          menu. It fills your application profile, attaches your tailored resume, and attaches or
          pastes your cover letter for that job. The resume and cover letter files are generated on
          demand and not stored. It never submits an application for you, and it only notes that
          you submitted the form so it can mark the job as applied.
        </p>
        <p>
          Some employers (for example on Workday or SuccessFactors) ask you to sign in or create an
          account before you apply. You sign in yourself: CVSpec never signs in for you, never
          reads, fills or stores your passwords, and fills nothing on sign-in pages. On multi-step
          forms it fills only the step you are on, and you click Next yourself.
        </p>
        <p>
          If you use the apply queue, CVSpec stores which saved jobs are queued and in what order,
          and the address of each job&apos;s application form once the extension has filled it, so
          the queue can reopen it. The extension opens one job at a time in a tab and fills it; you
          still review and submit every application yourself, and it moves to the next job only
          after you submit or skip. Preparing a queued job uses the same scoring, tailoring and
          cover letter features described above. Jobs that use a board&apos;s own application form
          (such as LinkedIn Easy Apply or Indeed Apply) are never queued or filled. Clearing the
          queue removes the queue order; deleting a job removes everything stored for it.
        </p>
        <p>
          To help with the form&apos;s own questions, the extension reads each question&apos;s
          label and answer options (not what you type into the form). It sends those, together with
          your parsed resume, the job posting and your saved answers, to OpenAI to draft answers.
          You review and edit every answer before the extension fills it in. CV Spec stores the
          answers you keep for that job, and any you choose to save to your profile.
        </p>

        <h2>Sensitive personal information (POPIA)</h2>
        <p>
          The extension never reads, sends, stores or fills ID or passport numbers, or questions
          about race or population group, gender, disability or health, criminal record, religion,
          trade union membership, political views or other special personal information under the
          Protection of Personal Information Act. These include employment-equity and voluntary
          self-identification questions. It outlines those fields in purple so you can answer them
          yourself, and the CV Spec API rejects any attempt to save them or an SA ID number.
        </p>
        <p>
          Under POPIA you may ask what personal information we hold about you, ask us to correct or
          delete it, and object to its processing, by emailing{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you are not satisfied with our
          response, you can complain to the Information Regulator (South Africa) at{' '}
          <a href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer">
            inforegulator.org.za
          </a>
          .
        </p>
        <p>
          The extension stores your CV Spec login session and your last selected resume in
          Chrome&apos;s local extension storage so you stay signed in. Signing out of the web app or
          the extension removes the session.
        </p>

        <h2>How we use your data</h2>
        <p>
          We use your data only to provide CV Spec: storing your resumes and saved jobs, scoring
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
            extract requirements, generate recommendations, draft cover letters and draft answers
            to application questions.
          </li>
          <li>
            <strong>resumeparser.app:</strong> resume files you upload are sent to this service to
            extract their text, skills and experience.
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
      <SiteFooter />
    </div>
  )
}
