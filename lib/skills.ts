/**
 * Curated "trending skills" catalogue used by the Skills picker (onboarding
 * step 3 and /edit-profile). Grouped by discipline so the UI can show a
 * friendly, scannable list the candidate can click to add, and searched to
 * narrow down.
 *
 * The picker stores the user's selection as a plain comma-separated string
 * (`form.skills`), so this catalogue is only a suggestion source — a candidate
 * can still type any skill not listed here.
 */

export type SkillGroup = { label: string; skills: string[] }

export const SKILL_GROUPS: SkillGroup[] = [
  {
    label: 'Programming languages',
    skills: ['Python', 'Java', 'C', 'C++', 'JavaScript', 'TypeScript', 'SQL', 'Kotlin', 'Go', 'Rust', 'PHP'],
  },
  {
    label: 'Web & app development',
    skills: [
      'React', 'Node.js', 'Next.js', 'Express.js', 'HTML', 'CSS', 'Tailwind CSS',
      'REST API', 'GraphQL', 'Flutter', 'React Native', 'Firebase',
    ],
  },
  {
    label: 'Data & AI',
    skills: [
      'Machine Learning', 'Deep Learning', 'Data Structures', 'Algorithms',
      'Pandas', 'NumPy', 'TensorFlow', 'PyTorch', 'Power BI', 'Tableau', 'Excel',
    ],
  },
  {
    label: 'Cloud & DevOps',
    skills: [
      'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Linux', 'Git', 'GitHub',
      'CI/CD', 'Jenkins', 'Redis', 'MySQL', 'PostgreSQL', 'MongoDB',
    ],
  },
  {
    label: 'Design & quality',
    skills: ['Figma', 'Selenium', 'Postman', 'Jira'],
  },
]

/** Flat, de-duplicated list of every suggested skill (for quick lookups). */
export const TOP_SKILLS: string[] = SKILL_GROUPS.flatMap((g) => g.skills)
