/**
 * The company catalog — every company from
 * "Ques/50 Companies Steps Assessment Research.docx", grouped by tag.
 *
 * The research document is internally inconsistent: its prioritised target
 * list and its fifty numbered step sections differ by ten companies each
 * (Capgemini, HCLTech, Tech Mahindra, LTIMindtree, Deloitte, IBM, DXC,
 * Mphasis, Hexaware and Persistent are targets without a section; SAP, Cisco,
 * Qualcomm, Siemens, Bosch, Goldman Sachs, Morgan Stanley, JP Morgan, Walmart
 * Global Tech and HSBC have sections but are not on the target list). The
 * catalog is the union (60 companies) so that no priority target and no
 * documented flow is dropped. Companies without their own section use the
 * IT-services flow modelled on the five documented IT-services companies and
 * are marked `documented: false`.
 *
 * Client-safe: no questions here.
 */
import type { Company, CompanyTagId, HiringStep, Priority } from './types.ts'
import { RESEARCH_STEPS, RESEARCH_TARGETS } from './generated/researchSteps.ts'
import { BLUEPRINTS, blueprintMinutes, blueprintItemCount } from './blueprints.ts'

export interface CompanyTag {
  id: CompanyTagId
  label: string
  short: string
  description: string
  icon: string
}

export const COMPANY_TAGS: CompanyTag[] = [
  { id: 'it-services', label: 'IT Services & Consulting', short: 'IT Services', icon: '🏢', description: 'Mass campus hiring: aptitude, pseudocode, coding, technical and HR rounds.' },
  { id: 'big-tech', label: 'Global Product & Big Tech', short: 'Big Tech', icon: '🚀', description: 'DSA-heavy online assessments, technical interviews and design rounds.' },
  { id: 'product-startups', label: 'Indian Product Companies & Startups', short: 'Startups', icon: '⚡', description: 'Practical coding, APIs, databases and fast-paced design discussions.' },
  { id: 'saas', label: 'SaaS & Developer Tools', short: 'SaaS', icon: '🧰', description: 'Product engineering for APIs, testing and developer platforms.' },
  { id: 'bfsi', label: 'Banking & Financial Services', short: 'BFSI', icon: '🏦', description: 'Numerical reasoning, coding, SQL and a finance/domain round.' },
  { id: 'engineering', label: 'Semiconductors & Engineering', short: 'Engineering', icon: '🔧', description: 'Systems programming, OS and computer-organisation depth.' },
]

export const TAG_BY_ID: Record<CompanyTagId, CompanyTag> = Object.fromEntries(
  COMPANY_TAGS.map((t) => [t.id, t]),
) as Record<CompanyTagId, CompanyTag>

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Priority 1 · Highest',
  2: 'Priority 2 · High',
  3: 'Priority 3 · Medium',
}

/** Flow used for IT-services targets that have no dedicated research section. */
const MODELLED_SERVICE_STEPS: HiringStep[] = [
  { no: 1, title: 'Eligibility and Registration', detail: 'Check academic eligibility, graduation year, branch requirements and backlog rules.' },
  { no: 2, title: 'Online Aptitude Assessment', detail: 'Quantitative aptitude, logical reasoning and verbal ability.' },
  { no: 3, title: 'Technical & Pseudocode Assessment', detail: 'Pseudocode, programming fundamentals, CS fundamentals and SQL.' },
  { no: 4, title: 'Coding Assessment', detail: 'Coding problems in an online compiler within a fixed time limit.' },
  { no: 5, title: 'Technical Interview', detail: 'Programming, OOP, DBMS, projects and problem-solving.' },
  { no: 6, title: 'HR Interview', detail: 'Communication, relocation, shift flexibility and behavioural questions.' },
  { no: 7, title: 'Final Selection', detail: 'Assessment and interview results determine the final offer.' },
]

interface Seed {
  name: string
  slug: string
  tag: CompanyTagId
  blueprint: string
  track: string
  role: string
  focus: string[]
  color: string
}

const SEEDS: Seed[] = [
  // ---------------------------- IT services ---------------------------------
  { name: 'TCS', slug: 'tcs', tag: 'it-services', blueprint: 'tcs', track: 'TCS NQT — Ninja · Digital · Prime', role: 'Assistant System Engineer', color: '#0B5CAB', focus: ['Foundation: numerical, verbal, reasoning', 'Advanced quant + advanced coding', 'Technical and HR discussion'] },
  { name: 'Infosys', slug: 'infosys', tag: 'it-services', blueprint: 'infosys', track: 'Systems Engineer · DSE · Specialist Programmer', role: 'Systems Engineer', color: '#007CC3', focus: ['Reasoning, maths, verbal and pseudocode', 'Track-specific coding', 'OOP, DBMS and SQL interview'] },
  { name: 'Wipro', slug: 'wipro', tag: 'it-services', blueprint: 'wipro', track: 'Wipro NLTH / Elite', role: 'Project Engineer', color: '#4B2A85', focus: ['Aptitude assessment', 'Written communication essay', 'Two coding problems'] },
  { name: 'Cognizant', slug: 'cognizant', tag: 'it-services', blueprint: 'cognizant', track: 'GenC · GenC Next · GenC Pro', role: 'Programmer Analyst Trainee', color: '#1A4CA1', focus: ['Aptitude and cognitive ability', 'Communication assessment', 'GenC Next coding'] },
  { name: 'Accenture', slug: 'accenture', tag: 'it-services', blueprint: 'accenture', track: 'Associate Software Engineer (ASE)', role: 'Associate Software Engineer', color: '#A100FF', focus: ['Cognitive + technical assessment', 'Communication assessment', 'Coding and problem-solving'] },
  { name: 'Capgemini', slug: 'capgemini', tag: 'it-services', blueprint: 'service', track: 'Analyst · Senior Analyst', role: 'Analyst', color: '#0070AD', focus: ['Aptitude and pseudocode', 'Technical MCQs and coding', 'Technical + HR interview'] },
  { name: 'HCLTech', slug: 'hcltech', tag: 'it-services', blueprint: 'service', track: 'Graduate Engineer Trainee', role: 'Graduate Engineer Trainee', color: '#0F5FDC', focus: ['Aptitude and technical MCQs', 'Coding assessment', 'Technical + HR interview'] },
  { name: 'Tech Mahindra', slug: 'tech-mahindra', tag: 'it-services', blueprint: 'service', track: 'Associate Software Engineer', role: 'Associate Software Engineer', color: '#E31837', focus: ['Aptitude and pseudocode', 'Coding assessment', 'Technical + HR interview'] },
  { name: 'LTIMindtree', slug: 'ltimindtree', tag: 'it-services', blueprint: 'service-digital', track: 'Graduate Engineer Trainee', role: 'Graduate Engineer Trainee', color: '#1E3A8A', focus: ['Digital-track aptitude', 'Programming, DSA and cloud MCQs', 'Specialist-level coding'] },
  { name: 'Deloitte', slug: 'deloitte', tag: 'it-services', blueprint: 'service-digital', track: 'Analyst — Technology Consulting', role: 'Analyst', color: '#1F8A33', focus: ['Aptitude and technical MCQs', 'Coding assessment', 'Consulting-style technical discussion'] },
  { name: 'IBM', slug: 'ibm', tag: 'it-services', blueprint: 'service-digital', track: 'Associate Systems Engineer', role: 'Associate Systems Engineer', color: '#0F62FE', focus: ['Cognitive and technical MCQs', 'Coding assessment', 'Engineering-practice interview'] },
  { name: 'DXC Technology', slug: 'dxc-technology', tag: 'it-services', blueprint: 'service', track: 'Associate Professional — Software Engineer', role: 'Associate Professional', color: '#5F249F', focus: ['Aptitude and pseudocode', 'Coding assessment', 'Technical + HR interview'] },
  { name: 'Mphasis', slug: 'mphasis', tag: 'it-services', blueprint: 'service', track: 'Associate Software Engineer', role: 'Associate Software Engineer', color: '#00A3E0', focus: ['Aptitude and technical MCQs', 'Coding assessment', 'Technical + HR interview'] },
  { name: 'Hexaware', slug: 'hexaware', tag: 'it-services', blueprint: 'service', track: 'Graduate Engineer Trainee', role: 'Graduate Engineer Trainee', color: '#E4002B', focus: ['Aptitude and pseudocode', 'Coding assessment', 'Technical + HR interview'] },
  { name: 'Persistent Systems', slug: 'persistent-systems', tag: 'it-services', blueprint: 'service-digital', track: 'Software Engineer (campus)', role: 'Software Engineer', color: '#F58220', focus: ['Programming and DSA MCQs', 'Two coding problems', 'Technical depth interview'] },
  // ------------------------------ Big tech ----------------------------------
  { name: 'Google', slug: 'google', tag: 'big-tech', blueprint: 'product', track: 'Software Engineer — University Graduate', role: 'Software Engineer', color: '#4285F4', focus: ['DSA-heavy online assessment', 'CS depth interviews', 'System design round'] },
  { name: 'Microsoft', slug: 'microsoft', tag: 'big-tech', blueprint: 'product', track: 'Software Engineer — New Graduate', role: 'Software Engineer', color: '#00A4EF', focus: ['Online assessment with two coding problems', 'Technical interviews', 'Design and hiring-manager round'] },
  { name: 'Amazon', slug: 'amazon', tag: 'big-tech', blueprint: 'product-lp', track: 'SDE-1 / SDE Intern', role: 'Software Development Engineer', color: '#FF9900', focus: ['Coding OA + debugging judgement', 'Technical and design interviews', 'Leadership-principle stories'] },
  { name: 'Meta', slug: 'meta', tag: 'big-tech', blueprint: 'product', track: 'Software Engineer — University Graduate', role: 'Software Engineer', color: '#0866FF', focus: ['Coding-first screening', 'CS depth interviews', 'Product-oriented design'] },
  { name: 'Apple', slug: 'apple', tag: 'big-tech', blueprint: 'product-systems', track: 'Software Engineer — New Graduate', role: 'Software Engineer', color: '#555555', focus: ['Systems programming concepts', 'OS and architecture depth', 'Design round'] },
  { name: 'Adobe', slug: 'adobe', tag: 'big-tech', blueprint: 'product', track: 'Member of Technical Staff', role: 'Member of Technical Staff', color: '#FA0F00', focus: ['Aptitude-light, DSA-heavy OA', 'Technical interviews', 'Design round'] },
  { name: 'LinkedIn', slug: 'linkedin', tag: 'big-tech', blueprint: 'product', track: 'Software Engineer — New Graduate', role: 'Software Engineer', color: '#0A66C2', focus: ['Coding online assessment', 'Technical interviews', 'System design'] },
  { name: 'NVIDIA', slug: 'nvidia', tag: 'big-tech', blueprint: 'product-systems', track: 'System Software Engineer — New College Grad', role: 'System Software Engineer', color: '#76B900', focus: ['C and systems fundamentals', 'OS, memory and architecture', 'Design round'] },
  { name: 'Uber', slug: 'uber', tag: 'big-tech', blueprint: 'product', track: 'Software Engineer I', role: 'Software Engineer', color: '#111111', focus: ['Hard coding OA', 'Technical interviews', 'Real-time system design'] },
  { name: 'Atlassian', slug: 'atlassian', tag: 'big-tech', blueprint: 'product', track: 'Graduate Software Engineer', role: 'Software Engineer', color: '#0052CC', focus: ['Coding OA', 'Code design interviews', 'Values-based behavioural round'] },
  { name: 'Salesforce', slug: 'salesforce', tag: 'big-tech', blueprint: 'product-enterprise', track: 'Associate Member of Technical Staff', role: 'Associate MTS', color: '#00A1E0', focus: ['DSA + SQL online assessment', 'Web and database interviews', 'Design round'] },
  { name: 'Oracle', slug: 'oracle', tag: 'big-tech', blueprint: 'product-enterprise', track: 'Member of Technical Staff / Applications Engineer', role: 'Member of Technical Staff', color: '#C74634', focus: ['DSA + SQL online assessment', 'Database depth', 'Design round'] },
  { name: 'SAP', slug: 'sap', tag: 'big-tech', blueprint: 'product-enterprise', track: 'Associate Developer — SAP Labs', role: 'Associate Developer', color: '#0070F2', focus: ['DSA + SQL online assessment', 'Enterprise web/API interviews', 'Design round'] },
  { name: 'Cisco', slug: 'cisco', tag: 'big-tech', blueprint: 'product-systems', track: 'Software Engineer I — New Grad', role: 'Software Engineer', color: '#049FD9', focus: ['Networking and OS fundamentals', 'C and systems programming', 'Design round'] },
  { name: 'Walmart Global Tech', slug: 'walmart-global-tech', tag: 'big-tech', blueprint: 'product', track: 'Software Engineer (campus)', role: 'Software Engineer', color: '#0071CE', focus: ['DSA online assessment', 'Technical interviews', 'Scale-focused design'] },
  // --------------------------- Product startups -----------------------------
  { name: 'Flipkart', slug: 'flipkart', tag: 'product-startups', blueprint: 'product', track: 'SDE-1', role: 'Software Development Engineer', color: '#2874F0', focus: ['Hard coding OA', 'Machine-coding style interviews', 'High-scale design'] },
  { name: 'PhonePe', slug: 'phonepe', tag: 'product-startups', blueprint: 'product', track: 'Software Engineer', role: 'Software Engineer', color: '#5F259F', focus: ['DSA online assessment', 'Technical interviews', 'Payments-scale design'] },
  { name: 'Razorpay', slug: 'razorpay', tag: 'product-startups', blueprint: 'product', track: 'SDE-1', role: 'Software Development Engineer', color: '#0C2451', focus: ['Coding OA', 'Technical interviews', 'Reliable payments design'] },
  { name: 'Swiggy', slug: 'swiggy', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#FC8019', focus: ['Online test with coding', 'Practical API/database round', 'Delivery-scale design'] },
  { name: 'Zomato', slug: 'zomato', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#E23744', focus: ['Online test with coding', 'Practical technical round', 'Design discussion'] },
  { name: 'Meesho', slug: 'meesho', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#9F2089', focus: ['Coding and debugging test', 'Practical technical round', 'Design discussion'] },
  { name: 'CRED', slug: 'cred', tag: 'product-startups', blueprint: 'startup-fintech', track: 'Backend / Full-stack Engineer', role: 'Software Engineer', color: '#1C1C1C', focus: ['Coding online test', 'Secure APIs and transactions', 'Design for correctness'] },
  { name: 'Groww', slug: 'groww', tag: 'product-startups', blueprint: 'startup-fintech', track: 'SDE-1', role: 'Software Development Engineer', color: '#00D09C', focus: ['Coding online test', 'Databases and reliability', 'Fintech design'] },
  { name: 'Zepto', slug: 'zepto', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#5A189A', focus: ['Online test with coding', 'Practical round', 'Quick-commerce design'] },
  { name: 'Dream11', slug: 'dream11', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#D0021B', focus: ['Online test with coding', 'Practical round', 'Peak-traffic design'] },
  { name: 'Paytm', slug: 'paytm', tag: 'product-startups', blueprint: 'startup-fintech', track: 'Software Engineer', role: 'Software Engineer', color: '#00BAF2', focus: ['Coding online test', 'Payments reliability', 'Secure API design'] },
  { name: 'Juspay', slug: 'juspay', tag: 'product-startups', blueprint: 'startup-fintech', track: 'Software Engineer', role: 'Software Engineer', color: '#1E5BFF', focus: ['Problem-solving test', 'Transactions and security', 'Design for correctness'] },
  { name: 'Ola', slug: 'ola', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#7FB800', focus: ['Online test with coding', 'Practical round', 'Location-system design'] },
  { name: 'Myntra', slug: 'myntra', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#FF3F6C', focus: ['Online test with coding', 'Practical round', 'E-commerce design'] },
  { name: 'InMobi', slug: 'inmobi', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#E8175D', focus: ['Online test with coding', 'Practical round', 'Ad-tech scale design'] },
  { name: 'Navi', slug: 'navi', tag: 'product-startups', blueprint: 'startup-fintech', track: 'SDE-1', role: 'Software Development Engineer', color: '#3AB4A6', focus: ['Coding online test', 'Databases and reliability', 'Fintech design'] },
  { name: 'Udaan', slug: 'udaan', tag: 'product-startups', blueprint: 'startup', track: 'SDE-1', role: 'Software Development Engineer', color: '#1A73E8', focus: ['Online test with coding', 'Practical round', 'B2B commerce design'] },
  // ---------------------------------- SaaS ----------------------------------
  { name: 'Zoho', slug: 'zoho', tag: 'saas', blueprint: 'startup', track: 'Member Technical Staff', role: 'Member Technical Staff', color: '#E42527', focus: ['Programming-heavy test', 'Practical round', 'Design discussion'] },
  { name: 'Freshworks', slug: 'freshworks', tag: 'saas', blueprint: 'startup', track: 'Software Engineer', role: 'Software Engineer', color: '#25C16F', focus: ['Online test with coding', 'Practical API round', 'SaaS design'] },
  { name: 'Postman', slug: 'postman', tag: 'saas', blueprint: 'product-devtools', track: 'Software Engineer', role: 'Software Engineer', color: '#FF6C37', focus: ['DSA + API assessment', 'Debugging screening', 'API and testing depth'] },
  { name: 'BrowserStack', slug: 'browserstack', tag: 'saas', blueprint: 'product-devtools', track: 'Software Engineer', role: 'Software Engineer', color: '#F46530', focus: ['DSA + API assessment', 'Debugging screening', 'Testing and DevOps depth'] },
  { name: 'Chargebee', slug: 'chargebee', tag: 'saas', blueprint: 'product-devtools', track: 'Software Engineer', role: 'Software Engineer', color: '#FF7846', focus: ['DSA + API assessment', 'Debugging screening', 'Billing-system design'] },
  { name: 'Druva', slug: 'druva', tag: 'saas', blueprint: 'product-devtools', track: 'Software Engineer', role: 'Software Engineer', color: '#1D4AFF', focus: ['DSA + API assessment', 'Debugging screening', 'Storage and backup design'] },
  // ---------------------------------- BFSI ----------------------------------
  { name: 'Goldman Sachs', slug: 'goldman-sachs', tag: 'bfsi', blueprint: 'bfsi', track: 'Engineering Analyst', role: 'Engineering Analyst', color: '#6F9FD8', focus: ['Numerical reasoning + coding OA', 'SQL, DSA and debugging screening', 'Finance / domain round'] },
  { name: 'Morgan Stanley', slug: 'morgan-stanley', tag: 'bfsi', blueprint: 'bfsi', track: 'Technology Analyst', role: 'Technology Analyst', color: '#1F3B73', focus: ['Aptitude + coding OA', 'Technical screening', 'Business round'] },
  { name: 'JP Morgan', slug: 'jp-morgan', tag: 'bfsi', blueprint: 'bfsi', track: 'Software Engineer Program', role: 'Software Engineer', color: '#5C3317', focus: ['OA with coding', 'Technical screening', 'Domain and behavioural rounds'] },
  { name: 'HSBC', slug: 'hsbc', tag: 'bfsi', blueprint: 'bfsi', track: 'Graduate Software Engineer — Technology', role: 'Software Engineer', color: '#DB0011', focus: ['OA with coding', 'Technical screening', 'Banking domain round'] },
  // ------------------------------ Engineering -------------------------------
  { name: 'Qualcomm', slug: 'qualcomm', tag: 'engineering', blueprint: 'product-systems', track: 'Engineer — Software (New Grad)', role: 'Software Engineer', color: '#3253DC', focus: ['C and systems programming', 'OS, memory and architecture', 'Design round'] },
  { name: 'Siemens', slug: 'siemens', tag: 'engineering', blueprint: 'engineering', track: 'Graduate Engineer Trainee — Software', role: 'Graduate Engineer Trainee', color: '#009999', focus: ['Aptitude + C output', 'OS and testing depth', 'Object-oriented design'] },
  { name: 'Bosch', slug: 'bosch', tag: 'engineering', blueprint: 'engineering', track: 'Associate Software Engineer — BGSW', role: 'Associate Software Engineer', color: '#EA0016', focus: ['Aptitude + C output', 'Embedded/OS fundamentals', 'Object-oriented design'] },
]

function initialsOf(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function priorityOf(name: string): Priority {
  const target = RESEARCH_TARGETS.find((t) => t.name === name)
  if (target) return target.priority
  const section = RESEARCH_STEPS[name]
  return (section?.priority ?? 3) as Priority
}

export const COMPANIES: Company[] = SEEDS.map((s) => {
  const research = RESEARCH_STEPS[s.name]
  return {
    slug: s.slug,
    name: s.name,
    priority: priorityOf(s.name),
    tag: s.tag,
    track: s.track,
    role: s.role,
    blueprint: s.blueprint,
    steps: research ? research.steps : MODELLED_SERVICE_STEPS,
    documented: !!research,
    focus: s.focus,
    color: s.color,
    initials: initialsOf(s.name),
  }
})

export const COMPANY_BY_SLUG: Record<string, Company> = Object.fromEntries(COMPANIES.map((c) => [c.slug, c]))

export function getCompany(slug: string): Company | undefined {
  return COMPANY_BY_SLUG[String(slug || '').toLowerCase()]
}

/** Display facts for a company's mock (duration, rounds, question count). */
export function companyMockFacts(c: Company): { minutes: number; rounds: number; questions: number } {
  const b = BLUEPRINTS[c.blueprint]
  return { minutes: b ? blueprintMinutes(b) : 0, rounds: b ? b.rounds.length : 0, questions: b ? blueprintItemCount(b) : 0 }
}

/** Research-document order (the plan's own ranking), used to sort within a group. */
export const COMPANY_ORDER: Record<string, number> = Object.fromEntries(COMPANIES.map((c, i) => [c.slug, i]))

export function byPlanOrder(a: Company, b: Company): number {
  return a.priority - b.priority || COMPANY_ORDER[a.slug] - COMPANY_ORDER[b.slug]
}

export function companiesByTag(): Array<{ tag: CompanyTag; companies: Company[] }> {
  return COMPANY_TAGS.map((tag) => ({
    tag,
    companies: COMPANIES.filter((c) => c.tag === tag.id).sort(byPlanOrder),
  }))
}

/**
 * Candidate-facing description of a hiring step. The research document is
 * written for the research team ("Research …", "Record how …"), so assessed
 * steps show what the mock round covers and informational steps get a short
 * explanation; the document's own wording is kept as a secondary note.
 */
export function candidateStepText(step: HiringStep, isFirst: boolean, isLast: boolean, roundAbout?: string): string {
  if (roundAbout) return roundAbout
  if (isFirst) return 'The company checks eligibility (degree, graduation year, academic record) before inviting you — not scored in this mock.'
  if (isLast) return 'Round results and interviews are combined into the final decision — this mock gives you a readiness verdict instead.'
  return 'Informational step — not simulated in this mock.'
}
