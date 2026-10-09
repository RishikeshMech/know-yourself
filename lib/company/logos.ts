/**
 * Company logo sources.
 *
 * Historically every badge was rendered from Google's public favicon service
 * (`/s2/favicons`). That works for most brands but returns a blank or generic
 * tile for several of them — TCS, HCLTech, IBM, Dream11, Ola and LTIMindtree
 * among them — so those marks are now bundled with the app under
 * `/company-logos/<slug>.png` and served from our own origin (no third-party
 * request, no hotlink breakage, works offline).
 *
 * Every other company still falls back to the favicon service keyed off its
 * official domain, and `CompanyBadge` falls back to the brand-colour initials
 * if even that fails.
 */
export const COMPANY_LOGO_DOMAINS: Readonly<Record<string, string>> = {
  tcs: 'tcs.com',
  infosys: 'infosys.com',
  wipro: 'wipro.com',
  cognizant: 'cognizant.com',
  accenture: 'accenture.com',
  capgemini: 'capgemini.com',
  hcltech: 'hcltech.com',
  'tech-mahindra': 'techmahindra.com',
  ltimindtree: 'ltimindtree.com',
  deloitte: 'deloitte.com',
  ibm: 'ibm.com',
  'dxc-technology': 'dxc.com',
  mphasis: 'mphasis.com',
  hexaware: 'hexaware.com',
  'persistent-systems': 'persistent.com',
  google: 'google.com',
  microsoft: 'microsoft.com',
  amazon: 'amazon.com',
  meta: 'meta.com',
  apple: 'apple.com',
  adobe: 'adobe.com',
  linkedin: 'linkedin.com',
  nvidia: 'nvidia.com',
  uber: 'uber.com',
  atlassian: 'atlassian.com',
  salesforce: 'salesforce.com',
  oracle: 'oracle.com',
  sap: 'sap.com',
  cisco: 'cisco.com',
  'walmart-global-tech': 'walmart.com',
  flipkart: 'flipkart.com',
  phonepe: 'phonepe.com',
  razorpay: 'razorpay.com',
  swiggy: 'swiggy.com',
  zomato: 'zomato.com',
  meesho: 'meesho.com',
  cred: 'cred.club',
  groww: 'groww.in',
  zepto: 'zeptonow.com',
  dream11: 'dream11.com',
  paytm: 'paytm.com',
  juspay: 'juspay.io',
  ola: 'olacabs.com',
  myntra: 'myntra.com',
  inmobi: 'inmobi.com',
  navi: 'navi.com',
  udaan: 'udaan.com',
  zoho: 'zoho.com',
  freshworks: 'freshworks.com',
  postman: 'postman.com',
  browserstack: 'browserstack.com',
  chargebee: 'chargebee.com',
  druva: 'druva.com',
  'goldman-sachs': 'goldmansachs.com',
  'morgan-stanley': 'morganstanley.com',
  'jp-morgan': 'jpmorganchase.com',
  hsbc: 'hsbc.com',
  qualcomm: 'qualcomm.com',
  siemens: 'siemens.com',
  bosch: 'bosch.com',
}

export interface CompanyLogo {
  /** Image URL — either a root-relative path into `public/` or the favicon service. */
  src: string
  /**
   * Intrinsic pixel size of the mark. Stored alongside the file (rather than
   * measured after load) so `CompanyBadge` can pick the right plate shape on
   * the very first paint instead of snapping into place once the image loads.
   */
  width: number
  height: number
}

/**
 * Brand marks bundled in `public/company-logos/`.
 *
 * Sizes must match the files on disk — `lib/__tests__/companyCatalog.test.ts`
 * asserts it, so a resized asset fails CI instead of stretching in the UI.
 */
export const COMPANY_LOCAL_LOGOS: Readonly<Record<string, CompanyLogo>> = {
  tcs: { src: '/company-logos/tcs.png', width: 512, height: 450 },
  hcltech: { src: '/company-logos/hcltech.png', width: 512, height: 94 },
  ibm: { src: '/company-logos/ibm.png', width: 512, height: 194 },
  dream11: { src: '/company-logos/dream11.png', width: 512, height: 512 },
  ola: { src: '/company-logos/ola.png', width: 512, height: 182 },
  ltimindtree: { src: '/company-logos/ltimindtree.png', width: 512, height: 98 },
}

/** Google's public favicon service. Favicons are always square, hence 1×1. */
function faviconLogo(domain: string): CompanyLogo {
  return { src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, width: 1, height: 1 }
}

/** The best logo we have for a company: a bundled mark, else its site's favicon. */
export function companyLogo(slug: string): CompanyLogo | null {
  const local = COMPANY_LOCAL_LOGOS[slug]
  if (local) return local
  const domain = COMPANY_LOGO_DOMAINS[slug]
  return domain ? faviconLogo(domain) : null
}

/** @deprecated prefer {@link companyLogo} — it also reports the mark's shape. */
export function companyLogoUrl(slug: string): string | null {
  return companyLogo(slug)?.src ?? null
}
