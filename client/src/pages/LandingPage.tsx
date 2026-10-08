import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { PublicNav, SiteFooter } from '../components/Layout'
import { useAuth } from '../hooks/useAuth'

const extensionUrl = import.meta.env.VITE_CHROME_EXTENSION_URL

const trackingValues = [
  {
    num: '01',
    title: 'Centralized Job Vault',
    problem: 'Jobs scattered across 10 different sites & tabs',
    solution:
      '1-click capture from LinkedIn, Indeed, Glassdoor, ZipRecruiter and 18 more job boards, or forwarded emails, into a single Kanban board.',
  },
  {
    num: '02',
    title: 'Locked CV Versions',
    problem: "Recruiter calls weeks later and you can't remember which CV version you sent",
    solution:
      'Exact document locking. Every tracked application saves the specific CV variant used for that role.',
  },
  {
    num: '03',
    title: 'Follow-Up Nudges',
    problem: 'Forgetting to follow up and letting warm leads go cold',
    solution:
      'Automated pipeline alerts. Get pinged when an application hits 7 or 14 days without a response.',
  },
  {
    num: '04',
    title: 'Contact & Recruiter CRM',
    problem: 'Losing recruiter names, email threads, and interview notes',
    solution:
      'Interaction timeline. Attach hiring managers, recruiters, outreach messages, and prep notes to any job card.',
  },
  {
    num: '05',
    title: 'Search Analytics',
    problem: "No idea why you aren't getting interviews",
    solution:
      'Funnel health metrics. See your application-to-interview conversion rate and pinpoint where your search stalls.',
  },
] as const

const steps = [
  { label: 'Scan', text: 'Run pre-submit test on your CV against job spec.' },
  { label: 'Fix', text: 'Apply bullet-level keyword recommendations.' },
  { label: 'Track', text: 'Auto-save job to Kanban board in 1 click.' },
  { label: 'Win', text: 'Get follow-up nudges, manage interview notes.' },
] as const

const stepDetails = [
  {
    title: 'Pre-Submit Scan',
    text: 'Upload your CV and paste any job posting to get an instant match score and keyword gap analysis.',
  },
  {
    title: 'One-Click Capture',
    text: 'Use our Chrome Extension or email forwarder (track@cvspec.com) to save external jobs instantly.',
  },
  {
    title: 'Pipeline Management',
    text: 'Move job cards across custom stages (Saved → Applied → Interviewing → Offer).',
  },
  {
    title: 'Never Miss a Touchpoint',
    text: 'Track recruiter contacts, schedule follow-ups, and store tailored resume versions for every role.',
  },
] as const

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const presubmitFeatures: { title: string; text: string; icon: ReactElement }[] = [
  {
    title: 'Instant Match Score',
    text: 'One clear number that tells you how well your CV fits this exact posting, in seconds.',
    icon: (
      <svg {...iconProps}>
        <path d="M12 3a9 9 0 1 0 9 9" />
        <path d="M12 12l5-5" />
        <path d="M16 3h5v5" />
      </svg>
    ),
  },
  {
    title: 'CV to Job Match Analysis',
    text: 'See which skills and keywords the job spec asks for, which you already show, and which are missing.',
    icon: (
      <svg {...iconProps}>
        <rect x="3" y="4" width="7" height="16" rx="1" />
        <rect x="14" y="4" width="7" height="16" rx="1" />
        <path d="M10 9h4M10 15h4" />
      </svg>
    ),
  },
  {
    title: 'Instant CV Fixes',
    text: 'Bullet-level rewrite suggestions you can paste straight into your CV before you apply.',
    icon: (
      <svg {...iconProps}>
        <path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4z" />
        <path d="M14 7l3 3" />
      </svg>
    ),
  },
  {
    title: 'ATS Friendly Scan',
    text: 'Catch the formatting traps, like tables, columns and odd headings, that make applicant tracking systems misread your CV.',
    icon: (
      <svg {...iconProps}>
        <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
        <path d="M8.5 12l2.5 2.5 4.5-5" />
      </svg>
    ),
  },
]

type Mark = 'yes' | 'no' | 'partial'

const markSymbol: Record<Mark, string> = { yes: '✓', no: '✕', partial: '!' }

const comparisonRows: {
  feature: string
  manual: [Mark, string]
  ai: [Mark, string]
  cvspec: [Mark, string]
}[] = [
  {
    feature: '1-Click Board Capture',
    manual: ['no', 'Manual typing'],
    ai: ['no', 'Copy-paste only'],
    cvspec: ['yes', 'Chrome Extension + Email Sync'],
  },
  {
    feature: 'ATS Match Scoring',
    manual: ['no', 'None'],
    ai: ['partial', 'Opaque guess'],
    cvspec: ['yes', 'Deterministic Rule Engine'],
  },
  {
    feature: 'Locked Resume History',
    manual: ['partial', 'Desktop clutter'],
    ai: ['no', 'Ephemeral chat'],
    cvspec: ['yes', 'Auto-linked to Application Record'],
  },
  {
    feature: 'Automated Follow-up Alerts',
    manual: ['no', 'Manual calendar'],
    ai: ['no', 'None'],
    cvspec: ['yes', 'Smart Pipeline Nudges'],
  },
  {
    feature: 'Recruiter & Contact CRM',
    manual: ['partial', 'Messy tables'],
    ai: ['no', 'None'],
    cvspec: ['yes', 'Native Contact & Log History'],
  },
  {
    feature: 'Funnel Analytics',
    manual: ['no', 'Math required'],
    ai: ['no', 'None'],
    cvspec: ['yes', 'Real-time Conversion Metrics'],
  },
]

function MarkCell({ value }: { value: [Mark, string] }): ReactElement {
  const [mark, label] = value
  return (
    <td>
      <span className={`mark mark--${mark}`}>
        <span className="mark__icon" aria-hidden>
          {markSymbol[mark]}
        </span>
        {label}
      </span>
    </td>
  )
}

function ExtensionButton({ className, label }: { className: string; label: string }): ReactElement {
  if (extensionUrl) {
    return (
      <a className={className} href={extensionUrl} target="_blank" rel="noreferrer">
        {label}
      </a>
    )
  }
  return (
    <Link className={className} to="/signup">
      {label}
    </Link>
  )
}

export function LandingPage(): ReactElement {
  const { user } = useAuth()
  const scanTo = user ? '/app/compare' : '/signup'

  return (
    <div className="shell">
      <div className="announce-bar" role="note">
        <span aria-hidden>⚡</span> <strong>Free Pre-Submit Scan + Universal Job Tracker:</strong>{' '}
        Score your CV fit and track all your applications in one dashboard.
      </div>
      <PublicNav />
      <main className="shell-main">
        <section className="hero">
          <div className="hero__grid">
            <div className="hero__copy">
              <p className="hero__eyebrow">ATS match engine + job search CRM</p>
              <h1 className="hero__title">
                Stop Applying Into a Black Hole. Scan Your Fit. Track Your Pipeline. Win the Offer.
              </h1>
              <p className="hero__support">
                CVSpec combines an instant ATS match engine with a universal job search CRM.
                Capture jobs in 1 click from LinkedIn or Indeed, tailor your CV before you hit
                apply, and track every application, interview, and follow-up in one centralized
                workspace.
              </p>
              <div className="hero__cta">
                <Link className="btn btn-primary" to={scanTo}>
                  Run Free Pre-Submit Scan
                </Link>
                <ExtensionButton className="btn btn-secondary" label="Install Free Chrome Extension" />
              </div>
              <ul className="hero__proof">
                <li>Instant ATS Match Score</li>
                <li>1-Click LinkedIn Tracking</li>
                <li>Automated Follow-up Nudges</li>
                <li>Free Forever</li>
              </ul>
            </div>

            <div className="hero__visual" aria-hidden>
              <div className="hero-stage">
                <div className="hero-stage__grain" />
                <div className="score-card">
                  <div className="score-card__top">
                    <div>
                      <div className="score-card__label">Match for this posting</div>
                      <h2 className="score-card__job">Senior Frontend Engineer</h2>
                    </div>
                    <div className="score-ring" style={{ ['--score' as string]: '72%' }}>
                      72%
                    </div>
                  </div>
                  <div className="score-card__list">
                    <div className="score-row score-row--ok">
                      <span>Matched skills</span>
                      <strong>TypeScript, React, CSS</strong>
                    </div>
                    <div className="score-row score-row--gap">
                      <span>Missing skills</span>
                      <strong>GraphQL, Testing Library</strong>
                    </div>
                    <div className="score-row">
                      <span>Next edit</span>
                      <strong>Add a GraphQL delivery bullet</strong>
                    </div>
                  </div>
                  <div className="pipeline-strip">
                    <div className="pipeline-strip__col">
                      <span>Saved</span>
                      <strong>6</strong>
                    </div>
                    <div className="pipeline-strip__col">
                      <span>Applied</span>
                      <strong>14</strong>
                    </div>
                    <div className="pipeline-strip__col">
                      <span>Interviewing</span>
                      <strong>3</strong>
                    </div>
                    <div className="pipeline-strip__col pipeline-strip__col--win">
                      <span>Offer</span>
                      <strong>1</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="presubmit" id="pre-submit">
          <div className="presubmit__glow" aria-hidden />
          <div className="container presubmit__grid">
            <div className="presubmit__copy">
              <p className="presubmit__eyebrow">
                <span className="presubmit__pulse" aria-hidden />
                Free pre-submit check
              </p>
              <h2 className="presubmit__title">
                Run your free pre-submit check before you hit{' '}
                <span className="presubmit__hl">apply</span> on your next job application.
              </h2>
              <p className="presubmit__lede">
                Know your chances. <strong>Don&apos;t apply into a black hole.</strong>
              </p>
              <ul className="presubmit__features">
                {presubmitFeatures.map((feature) => (
                  <li className="presubmit-feature" key={feature.title}>
                    <span className="presubmit-feature__icon" aria-hidden>
                      {feature.icon}
                    </span>
                    <div>
                      <h3>{feature.title}</h3>
                      <p>{feature.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="presubmit__cta">
                <Link className="btn btn-signal" to={scanTo}>
                  Run My Free Check
                </Link>
                <span className="presubmit__note">No credit card. Results in seconds.</span>
              </div>
            </div>

            <figure
              className="presubmit__shot"
              role="img"
              aria-label="Preview of a CVSpec pre-submit report showing an 84% match score, keyword gaps, a suggested CV fix and ATS checks"
            >
              <div className="shot-window" aria-hidden>
                <div className="shot-window__bar">
                  <span />
                  <span />
                  <span />
                  <div className="shot-window__url">cvspec.com/app/compare</div>
                </div>
                <div className="shot-window__body">
                  <div className="shot-cv">
                    <div className="shot-cv__beam" />
                    <div className="shot-cv__name">Alex Morgan</div>
                    <div className="shot-cv__role">Frontend Engineer</div>
                    <div className="shot-cv__heading">Experience</div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '38%' }} />
                      <span className="shot-cv__kw">React</span>
                      <span className="shot-cv__bar" style={{ width: '22%' }} />
                    </div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '64%' }} />
                      <span className="shot-cv__kw">TypeScript</span>
                    </div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '30%' }} />
                      <span className="shot-cv__kw shot-cv__kw--miss">GraphQL</span>
                      <span className="shot-cv__bar" style={{ width: '28%' }} />
                    </div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '82%' }} />
                    </div>
                    <div className="shot-cv__heading">Skills</div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__kw">CSS</span>
                      <span className="shot-cv__kw">Vite</span>
                      <span className="shot-cv__kw shot-cv__kw--miss">Testing Library</span>
                    </div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '56%' }} />
                    </div>
                    <div className="shot-cv__heading">Education</div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '70%' }} />
                    </div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '44%' }} />
                    </div>
                    <div className="shot-cv__row">
                      <span className="shot-cv__bar" style={{ width: '60%' }} />
                    </div>
                  </div>

                  <div className="shot-report">
                    <div className="shot-report__top">
                      <div className="score-ring" style={{ ['--score' as string]: '84%' }}>
                        84%
                      </div>
                      <div>
                        <div className="shot-report__label">Match score</div>
                        <div className="shot-report__job">Senior Frontend Engineer</div>
                        <span className="shot-report__delta">+18 pts with 3 fixes</span>
                      </div>
                    </div>

                    <div className="shot-meters">
                      <div className="shot-meter">
                        <span>Skills</span>
                        <div className="shot-meter__track">
                          <i style={{ width: '73%' }} />
                        </div>
                        <strong>8/11</strong>
                      </div>
                      <div className="shot-meter">
                        <span>Keywords</span>
                        <div className="shot-meter__track">
                          <i style={{ width: '64%' }} />
                        </div>
                        <strong>64%</strong>
                      </div>
                      <div className="shot-meter">
                        <span>Experience</span>
                        <div className="shot-meter__track">
                          <i style={{ width: '90%' }} />
                        </div>
                        <strong>90%</strong>
                      </div>
                    </div>

                    <div className="shot-fix">
                      <div className="shot-report__label">Instant fix</div>
                      <del>Worked on frontend features for the web app.</del>
                      <ins>Shipped 14 React and GraphQL features, cutting page load time by 32%.</ins>
                    </div>

                    <ul className="shot-ats">
                      <li className="shot-ats__ok">Standard section headings</li>
                      <li className="shot-ats__ok">Single-column, parser-safe layout</li>
                      <li className="shot-ats__warn">Use one date format (MMM YYYY)</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div className="shot-float shot-float--ats" aria-hidden>
                <span className="mark__icon">✓</span> ATS readable
              </div>
              <div className="shot-float shot-float--gap" aria-hidden>
                2 missing keywords found
              </div>
            </figure>
          </div>
        </section>

        <section className="section" id="why-crm">
          <div className="container">
            <div className="section__head">
              <h2 className="section__title">Why You Need a Job Search CRM (Not Just a Scanner)</h2>
            </div>
            <div className="value-grid">
              {trackingValues.map((value) => (
                <article className="value-card" key={value.num}>
                  <div className="value-card__head">
                    <span className="flow-step__num">{value.num}</span>
                    <h3>{value.title}</h3>
                  </div>
                  <div className="value-card__row">
                    <span className="value-card__label">What it solves</span>
                    <p>{value.problem}</p>
                  </div>
                  <div className="value-card__row value-card__row--fix">
                    <span className="value-card__label">How CVSpec does it</span>
                    <p>{value.solution}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="container">
            <div className="section__head">
              <h2 className="section__title">
                How It Works: From Single Scan to Full Pipeline Control
              </h2>
            </div>
            <ol className="flow-steps flow-steps--four">
              {steps.map((step, index) => (
                <li className="flow-step" key={step.label}>
                  <div className="flow-step__num">Step {index + 1}</div>
                  <h3 className="flow-step__label">{step.label}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
            <ol className="detail-list">
              {stepDetails.map((detail) => (
                <li key={detail.title}>
                  <h3>{detail.title}</h3>
                  <p>{detail.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="section" id="compare">
          <div className="container">
            <div className="section__head">
              <h2 className="section__title">
                Comparison: Manual Tracking vs. Generic AI vs. CVSpec CRM
              </h2>
            </div>
            <div className="compare-table-wrap">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col">Feature</th>
                    <th scope="col">Excel / Notion</th>
                    <th scope="col">ChatGPT / Copilot</th>
                    <th scope="col" className="compare-table__ours">
                      CVSpec Job Search CRM
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.feature}>
                      <th scope="row">{row.feature}</th>
                      <MarkCell value={row.manual} />
                      <MarkCell value={row.ai} />
                      <MarkCell value={row.cvspec} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="container">
            <div className="cta-band__inner">
              <div>
                <h2>Ready to Take Control of Your Job Search?</h2>
                <p>
                  Stop letting applications slip through the cracks. Scan your first job spec and
                  launch your free job tracking dashboard in under 2 minutes.
                </p>
              </div>
              <div className="cta-band__actions">
                <Link className="btn btn-signal" to={scanTo}>
                  Start Free Pre-Submit Scan
                </Link>
                <ExtensionButton className="btn btn-outline-light" label="Add Chrome Extension" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
