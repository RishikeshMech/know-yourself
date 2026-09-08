/**
 * Curated directory of engineering colleges used to power the searchable
 * "College / University" picker in onboarding and edit-profile.
 *
 * Candidates overwhelmingly come from two clusters in Maharashtra — the Pune /
 * Pimpri-Chinchwad belt and the Amravati belt — so those two regions are
 * preloaded in full. Anything else (IITs, NITs, colleges in other states, or a
 * brand-new institute) is still allowed: the picker keeps a free-text fallback
 * so no candidate is ever blocked from saving their profile.
 *
 * Kept as plain data (not a database table) so it ships with the bundle and
 * the picker stays instant and offline-friendly.
 */

export type CollegeRegion = 'Pune' | 'Amravati'

export interface College {
  /** Full, human-readable name shown in the picker. */
  name: string
  /** Common abbreviation (COEP, PCCOE, …) — also matched during search. */
  alias?: string
  /** City / locality, shown as a muted hint. */
  city: string
  /** Grouping used for the region headers in the picker. */
  region: CollegeRegion
}

/** Display order + labels for the picker's region groups. */
export const COLLEGE_REGIONS: { id: CollegeRegion; label: string }[] = [
  { id: 'Pune', label: 'Pune & Pimpri-Chinchwad region' },
  { id: 'Amravati', label: 'Amravati region' },
]

export const COLLEGES: College[] = [
  /* ------------------------------------------------------------------ */
  /* Pune & Pimpri-Chinchwad region                                      */
  /* ------------------------------------------------------------------ */
  { name: 'College of Engineering, Pune', alias: 'COEP', city: 'Pune', region: 'Pune' },
  { name: 'Vishwakarma Institute of Technology', alias: 'VIT', city: 'Pune', region: 'Pune' },
  { name: 'Pune Institute of Computer Technology', alias: 'PICT', city: 'Pune', region: 'Pune' },
  { name: 'Pimpri Chinchwad College of Engineering', alias: 'PCCOE', city: 'Pimpri-Chinchwad', region: 'Pune' },
  { name: 'Pimpri Chinchwad College of Engineering & Research', alias: 'PCCOE&R', city: 'Ravet', region: 'Pune' },
  { name: 'Pimpri Chinchwad University', alias: 'PCU', city: 'Pimpri-Chinchwad', region: 'Pune' },
  { name: 'Dr. D. Y. Patil College of Engineering', alias: 'DYPCOE', city: 'Akurdi', region: 'Pune' },
  { name: 'Dr. D. Y. Patil Institute of Technology', alias: 'DYPIT', city: 'Pimpri', region: 'Pune' },
  { name: 'Dr. D. Y. Patil College of Engineering & Innovation', alias: 'DYPCET', city: 'Tathawade', region: 'Pune' },
  { name: 'Dr. D. Y. Patil Institute of Engineering, Management & Research', alias: 'DYPIEMR', city: 'Akurdi', region: 'Pune' },
  { name: 'Dr. D. Y. Patil Institute of Engineering & Technology', alias: 'DYPITE', city: 'Ambi (Maval)', region: 'Pune' },
  { name: 'Dr. D. Y. Patil Vidyapeeth (Deemed University)', city: 'Pimpri', region: 'Pune' },
  { name: 'Ajeenkya DY Patil University', alias: 'ADYPU', city: 'Lohegaon', region: 'Pune' },
  { name: 'Army Institute of Technology', alias: 'AIT', city: 'Dighi', region: 'Pune' },
  { name: 'College of Military Engineering', alias: 'CME', city: 'Pune', region: 'Pune' },
  { name: 'MIT World Peace University', alias: 'MIT-WPU', city: 'Pune', region: 'Pune' },
  { name: 'Maharashtra Institute of Technology', alias: 'MIT', city: 'Kothrud', region: 'Pune' },
  { name: 'MIT Academy of Engineering', alias: 'MITAOE', city: 'Alandi', region: 'Pune' },
  { name: 'MIT Art, Design & Technology University', alias: 'MIT ADT', city: 'Loni Kalbhor', region: 'Pune' },
  { name: "MKSSS's Cummins College of Engineering for Women", alias: 'CCOEW', city: 'Pune', region: 'Pune' },
  { name: "AISSMS College of Engineering", alias: 'AISSMS COE', city: 'Pune', region: 'Pune' },
  { name: "AISSMS Institute of Information Technology", alias: 'AISSMS IOIT', city: 'Pune', region: 'Pune' },
  { name: 'Sinhgad College of Engineering', alias: 'SCOE', city: 'Vadgaon', region: 'Pune' },
  { name: 'Smt. Kashibai Navale College of Engineering', alias: 'SKNCOE', city: 'Vadgaon', region: 'Pune' },
  { name: 'Sinhgad Institute of Technology & Science', alias: 'SITS', city: 'Narhe', region: 'Pune' },
  { name: 'Sinhgad Academy of Engineering', alias: 'SAE', city: 'Kondhwa', region: 'Pune' },
  { name: 'NBN Sinhgad Technical Institutes Campus', alias: 'NBNSTIC', city: 'Ambegaon', region: 'Pune' },
  { name: "Rasiklal M. Dhariwal Sinhgad Technical Institutes Campus", city: 'Ambegaon', region: 'Pune' },
  { name: 'Bharati Vidyapeeth College of Engineering', alias: 'BVCOE', city: 'Dhankawadi', region: 'Pune' },
  { name: 'Bharati Vidyapeeth Deemed University College of Engineering', alias: 'BVDU COE', city: 'Pune', region: 'Pune' },
  { name: "Bharati Vidyapeeth's College of Engineering", city: 'Lavale', region: 'Pune' },
  { name: "JSPM's Rajarshi Shahu College of Engineering", alias: 'RSCOE', city: 'Tathawade', region: 'Pune' },
  { name: "JSPM's Bhivarabai Sawant Institute of Technology & Research", alias: 'BSIOTR', city: 'Wagholi', region: 'Pune' },
  { name: 'JSPM Narhe Technical Campus', city: 'Narhe', region: 'Pune' },
  { name: "JSPM's Imperial College of Engineering & Research", city: 'Wagholi', region: 'Pune' },
  { name: "JSPM's Jayawantrao Sawant College of Engineering", alias: 'JSCOE', city: 'Hadapsar', region: 'Pune' },
  { name: "Marathwada Mitra Mandal's College of Engineering", alias: 'MMCOE', city: 'Karvenagar', region: 'Pune' },
  { name: "Marathwada Mitra Mandal's Institute of Technology", alias: 'MMIT', city: 'Lohgaon', region: 'Pune' },
  { name: "G. H. Raisoni College of Engineering & Management", alias: 'GHRCEM', city: 'Wagholi', region: 'Pune' },
  { name: 'G. H. Raisoni Institute of Engineering & Technology', alias: 'GHRIET', city: 'Wagholi', region: 'Pune' },
  { name: 'Indira College of Engineering & Management', alias: 'ICEM', city: 'Parandwadi', region: 'Pune' },
  { name: 'Zeal College of Engineering & Research', alias: 'ZCOER', city: 'Narhe', region: 'Pune' },
  { name: 'Alard College of Engineering & Management', alias: 'ACEM', city: 'Hinjawadi', region: 'Pune' },
  { name: 'Trinity College of Engineering & Research', city: 'Pisoli', region: 'Pune' },
  { name: 'Universal College of Engineering & Research', alias: 'UCER', city: 'Sasewadi', region: 'Pune' },
  { name: 'Dhole Patil College of Engineering', alias: 'DPCOE', city: 'Kharadi', region: 'Pune' },
  { name: "Modern Education Society's College of Engineering", alias: 'MESCOE', city: 'Pune', region: 'Pune' },
  { name: "Progressive Education Society's Modern College of Engineering", alias: 'MCOE', city: 'Pune', region: 'Pune' },
  { name: 'Vishwakarma Institute of Information Technology', alias: 'VIIT', city: 'Kondhwa', region: 'Pune' },
  { name: "Pune Vidyarthi Griha's College of Engineering & Technology", alias: 'PVG COET', city: 'Pune', region: 'Pune' },
  { name: 'Symbiosis Institute of Technology', alias: 'SIT', city: 'Lavale', region: 'Pune' },
  { name: 'Padmabhooshan Vasantdada Patil Institute of Technology', alias: 'PVPIT', city: 'Bavdhan', region: 'Pune' },
  { name: 'Keystone School of Engineering', city: 'Pune', region: 'Pune' },
  { name: 'Genba Sopanrao Moze College of Engineering', alias: 'G. S. Moze COE', city: 'Balewadi', region: 'Pune' },
  { name: 'Jaihind College of Engineering', alias: 'JCOE', city: 'Kuran', region: 'Pune' },
  { name: 'Sharadchandra Pawar College of Engineering', city: 'Otur', region: 'Pune' },
  { name: 'Sahyadri Valley College of Engineering & Technology', city: 'Rajuri', region: 'Pune' },
  { name: "TSSM's Bhivarabai Sawant College of Engineering & Research", city: 'Narhe', region: 'Pune' },
  { name: 'Dattakala Group of Institutions (Faculty of Engineering)', city: 'Bhigwan', region: 'Pune' },
  { name: 'ISB&M School of Technology', city: 'Pune', region: 'Pune' },
  { name: 'Siddhant College of Engineering', city: 'Sudumbre', region: 'Pune' },
  { name: "Vidya Pratishthan's Kamalnayan Bajaj Institute of Engineering & Technology", alias: 'VPKBIET', city: 'Baramati', region: 'Pune' },
  { name: "Vidya Prasarini Sabha's College of Engineering & Technology", city: 'Lonavala', region: 'Pune' },
  { name: 'Government College of Engineering & Research', alias: 'GCOEAR', city: 'Avasari Khurd', region: 'Pune' },
  { name: "Navsahyadri Education Society's Group of Institutions", city: 'Pune', region: 'Pune' },
  { name: 'Suman Ramesh Tulsiani Technical Campus', alias: 'SRTT', city: 'Pune', region: 'Pune' },
  { name: 'Institute of Knowledge College of Engineering', city: 'Pune', region: 'Pune' },
  { name: "SVPMS College of Engineering", city: 'Malegaon Bk (Baramati)', region: 'Pune' },
  { name: 'Nutan Maharashtra Institute of Engineering & Technology', alias: 'NMIET', city: 'Talegaon', region: 'Pune' },
  { name: 'Government Polytechnic, Pune', city: 'Pune', region: 'Pune' },
  { name: 'Cusrow Wadia Institute of Technology', alias: 'CWIT', city: 'Pune', region: 'Pune' },

  /* ------------------------------------------------------------------ */
  /* Amravati region                                                     */
  /* ------------------------------------------------------------------ */
  { name: 'Government College of Engineering, Amravati', alias: 'GCOEA', city: 'Amravati', region: 'Amravati' },
  { name: 'Sant Gadge Baba Amravati University', alias: 'SGBAU', city: 'Amravati', region: 'Amravati' },
  { name: 'Prof. Ram Meghe Institute of Technology & Research', alias: 'PRMIT&R', city: 'Badnera', region: 'Amravati' },
  { name: 'Prof. Ram Meghe College of Engineering & Management', alias: 'PRMCE&M', city: 'Badnera', region: 'Amravati' },
  { name: 'P. R. Pote Patil College of Engineering & Management', alias: 'PRPCEM', city: 'Amravati', region: 'Amravati' },
  { name: 'P. R. Pote Patil Institute of Engineering & Research', city: 'Amravati', region: 'Amravati' },
  { name: 'P. R. Patil College of Engineering & Technology', alias: 'PRPCET', city: 'Amravati', region: 'Amravati' },
  { name: 'Sipna College of Engineering & Technology', alias: 'Sipna COET', city: 'Amravati', region: 'Amravati' },
  { name: "Hanuman Vyayam Prasarak Mandal's College of Engineering & Technology", alias: 'HVPM COET', city: 'Amravati', region: 'Amravati' },
  { name: 'G. H. Raisoni College of Engineering & Management', alias: 'GHRCEM', city: 'Amravati', region: 'Amravati' },
  { name: 'G. H. Raisoni University', city: 'Amravati', region: 'Amravati' },
  { name: 'Dr. Rajendra Gode Institute of Technology & Research', alias: 'DRGITR', city: 'Amravati', region: 'Amravati' },
  { name: "Dhamangaon Education Society's College of Engineering & Technology", alias: 'DESCOET', city: 'Dhamangaon Rly', region: 'Amravati' },
  { name: 'Takshashila Institute of Engineering & Technology', city: 'Amravati', region: 'Amravati' },
  { name: 'Dr. Sau. Kamaltai Gawai Institute of Engineering & Technology', city: 'Darapur', region: 'Amravati' },
  { name: 'Nav Vidhya Niketan Institute of Technology', city: 'Amravati', region: 'Amravati' },
  { name: 'Vidya Bharati Mahavidyalaya', city: 'Amravati', region: 'Amravati' },
  { name: "College of Engineering & Technology, Mauli's Group of Institutions", city: 'Amravati', region: 'Amravati' },
  { name: 'Late Dr. D. B. Dod College of Engineering', city: 'Amravati', region: 'Amravati' },
  { name: 'Shri Shivaji College of Agricultural Biotechnology', city: 'Amravati', region: 'Amravati' },
  { name: 'Government Polytechnic, Amravati', city: 'Amravati', region: 'Amravati' },
  { name: 'Dr. Panjabrao Deshmukh Polytechnic', city: 'Amravati', region: 'Amravati' },
]

/**
 * Case-insensitive search across name, abbreviation and city. An empty query
 * returns every college (in curated order) so the picker can show the full,
 * grouped list before the candidate starts typing.
 */
export function searchColleges(query: string): College[] {
  const q = query.trim().toLowerCase()
  if (!q) return COLLEGES
  return COLLEGES.filter((c) =>
    `${c.name} ${c.alias ?? ''} ${c.city}`.toLowerCase().includes(q),
  )
}
