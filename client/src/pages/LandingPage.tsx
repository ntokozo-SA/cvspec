import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { PublicNav } from '../components/Layout'

export function LandingPage(): ReactElement {
  return (
    <div className="shell">
      <PublicNav />
      <main className="shell-main">
        <section className="hero">
          <div className="hero__grid">
            <div className="hero__copy">
              <p className="hero__brand">CV Specs</p>
              <h1 className="hero__headline">
                Score your resume against one job posting, then fix the gaps.
              </h1>
              <p className="hero__support">
                Upload a resume, add a job spec, and get a reproducible match score plus
                bullet-level edit recommendations for that role.
              </p>
              <div className="hero__cta">
                <Link className="btn btn-primary" to="/signup">
                  Start a comparison
                </Link>
                <Link className="btn btn-secondary" to="/login">
                  Log in
                </Link>
              </div>
            </div>

            <div className="hero__visual" aria-hidden>
              <div className="hero-stage">
                <div className="hero-stage__grain" />
                <div className="score-card">
                  <div className="score-card__top">
                    <div>
                      <div className="score-card__label">Match for this posting</div>
                      <h2 style={{ fontSize: '1.35rem', marginTop: '0.35rem' }}>
                        Senior Frontend Engineer
                      </h2>
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
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <div className="container">
            <div className="section__head">
              <h2 className="section__title">Three inputs. One explainable score.</h2>
              <p className="section__text">
                The match percentage comes from deterministic scoring against the parsed job
                requirements, not from an opaque model guess.
              </p>
            </div>
            <div className="flow-steps">
              <article className="flow-step">
                <div className="flow-step__num">01</div>
                <h3>Upload your resume</h3>
                <p>PDF or DOCX. We parse skills, roles, and bullets into structured data.</p>
              </article>
              <article className="flow-step">
                <div className="flow-step__num">02</div>
                <h3>Add the job spec</h3>
                <p>Paste text, upload a document, or provide a posting link when it is scrapeable.</p>
              </article>
              <article className="flow-step">
                <div className="flow-step__num">03</div>
                <h3>Review gaps and edits</h3>
                <p>
                  See matched vs missing requirements, then get specific resume edits for that role.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="container">
            <div className="cta-band__inner">
              <div>
                <h2>Ready to check fit for a real posting?</h2>
                <p>Create an account and run your first comparison in a few minutes.</p>
              </div>
              <Link className="btn btn-signal" to="/signup">
                Create account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <span>CV Specs</span>
          <span>Resume and job-spec comparison for targeted applications.</span>
        </div>
      </footer>
    </div>
  )
}
