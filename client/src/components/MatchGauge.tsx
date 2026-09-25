import type { ReactElement } from 'react'

export function MatchGauge({
  score,
  size = 'lg',
}: {
  score: number
  size?: 'sm' | 'lg'
}): ReactElement {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  if (size === 'sm') {
    return (
      <div
        className="score-ring"
        style={{ ['--score' as string]: `${clamped}%` }}
        aria-label={`Match score ${clamped} percent`}
      >
        {clamped}%
      </div>
    )
  }

  return (
    <div
      className="match-score-lg"
      style={{ ['--score' as string]: `${clamped}%` }}
      aria-label={`Match score ${clamped} percent`}
    >
      <div>
        {clamped}
        <span>%</span>
      </div>
    </div>
  )
}

export function SkillList({
  skills,
  variant,
}: {
  skills: string[]
  variant: 'matched' | 'missing'
}): ReactElement {
  if (skills.length === 0) {
    return <p className="field-hint">None listed.</p>
  }

  return (
    <div className="skill-grid">
      {skills.map((skill) => (
        <span key={skill} className={`skill skill-${variant}`}>
          {skill}
        </span>
      ))}
    </div>
  )
}
