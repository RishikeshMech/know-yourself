import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { COMPANIES, COMPANY_TAGS, companiesByTag, companyMockFacts, getCompany } from '../company/catalog.ts'
import { BLUEPRINTS } from '../company/blueprints.ts'
import { RESEARCH_STEPS, RESEARCH_TARGETS } from '../company/generated/researchSteps.ts'
import { COMPANY_LOCAL_LOGOS, COMPANY_LOGO_DOMAINS, companyLogo, companyLogoUrl } from '../company/logos.ts'
import { SECTION_BY_ID } from '../company/sections.ts'

test('catalog: every research target and every documented company is present (60 total)', () => {
  const names = new Set(COMPANIES.map((c) => c.name))
  for (const t of RESEARCH_TARGETS) assert.ok(names.has(t.name), `missing target ${t.name}`)
  for (const n of Object.keys(RESEARCH_STEPS)) assert.ok(names.has(n), `missing documented company ${n}`)
  assert.equal(RESEARCH_TARGETS.length, 50)
  assert.equal(Object.keys(RESEARCH_STEPS).length, 50)
  assert.equal(COMPANIES.length, 60)
})

test('catalog: slugs are unique, url-safe and resolvable', () => {
  const slugs = COMPANIES.map((c) => c.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const c of COMPANIES) {
    assert.match(c.slug, /^[a-z0-9-]+$/)
    assert.equal(getCompany(c.slug)?.name, c.name)
    assert.equal(getCompany(c.slug.toUpperCase())?.name, c.name)
  }
  assert.equal(getCompany('not-a-company'), undefined)
})

test('catalog: every company has a logo (bundled brand mark or favicon) with initials as fallback', () => {
  assert.deepEqual(Object.keys(COMPANY_LOGO_DOMAINS).sort(), COMPANIES.map((company) => company.slug).sort())
  for (const company of COMPANIES) {
    assert.ok(company.initials, `${company.name} needs initials for logo fallback`)
    const logo = companyLogo(company.slug)
    assert.ok(logo, `${company.name} has no logo at all`)
    assert.ok(logo!.width > 0 && logo!.height > 0, `${company.name} has a zero-size logo`)
    assert.equal(companyLogoUrl(company.slug), logo!.src)

    if (COMPANY_LOCAL_LOGOS[company.slug]) {
      // Bundled marks are served from our own origin so they can never break.
      assert.equal(logo!.src, `/company-logos/${company.slug}.png`, company.name)
      continue
    }

    const url = new URL(logo!.src)
    assert.equal(url.hostname, 'www.google.com', company.name)
    assert.equal(url.pathname, '/s2/favicons', company.name)
    assert.equal(url.searchParams.get('domain'), COMPANY_LOGO_DOMAINS[company.slug], company.name)
    assert.equal(url.searchParams.get('sz'), '128', company.name)
    // Favicons are square.
    assert.equal(logo!.width, logo!.height, company.name)
  }
})

test('logos: every bundled brand mark exists on disk at the declared size', () => {
  // These are the marks Google's favicon service does not return, so they are
  // shipped with the app instead — a missing/stale file is what made them
  // render as initials, so fail loudly if one disappears.
  for (const slug of Object.keys(COMPANY_LOCAL_LOGOS)) {
    assert.ok(COMPANIES.some((c) => c.slug === slug), `${slug} is not a company in the catalog`)
    const logo = COMPANY_LOCAL_LOGOS[slug]
    const file = join(process.cwd(), 'public', 'company-logos', `${slug}.png`)
    assert.ok(existsSync(file), `missing logo file for ${slug}: ${file}`)

    const bytes = readFileSync(file)
    // PNG signature + IHDR chunk: width and height are big-endian uint32s at offset 16/20.
    assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47], `${slug}.png is not a PNG`)
    assert.equal(bytes.readUInt32BE(16), logo.width, `${slug}.png width drifted from logos.ts`)
    assert.equal(bytes.readUInt32BE(20), logo.height, `${slug}.png height drifted from logos.ts`)
    assert.equal(bytes.readUInt8(24), 8, `${slug}.png must be 8-bit`)
    // Colour type 6 = RGBA — the mark needs a transparent background to sit on the plate.
    assert.equal(bytes.readUInt8(25), 6, `${slug}.png must be RGBA (transparent background)`)
  }
})

test('catalog: priorities follow the research document', () => {
  for (const t of RESEARCH_TARGETS) assert.equal(COMPANIES.find((c) => c.name === t.name)?.priority, t.priority, t.name)
  for (const c of COMPANIES.filter((x) => !RESEARCH_TARGETS.some((t) => t.name === x.name))) {
    assert.equal(c.priority, RESEARCH_STEPS[c.name].priority ?? 3, c.name)
  }
})

test('catalog: documented companies use the steps from the research document verbatim', () => {
  for (const c of COMPANIES) {
    const research = RESEARCH_STEPS[c.name]
    assert.equal(c.documented, !!research, c.name)
    if (research) assert.deepEqual(c.steps, research.steps, c.name)
    assert.ok(c.steps.length >= 6, c.name)
  }
})

test('catalog: every company is tagged and every tag has companies', () => {
  const grouped = companiesByTag()
  assert.equal(grouped.reduce((s, g) => s + g.companies.length, 0), COMPANIES.length)
  for (const g of grouped) assert.ok(g.companies.length > 0, g.tag.id)
  for (const c of COMPANIES) assert.ok(COMPANY_TAGS.some((t) => t.id === c.tag), c.name)
})

test('blueprints: every company maps to a blueprint whose rounds simulate real, assessable steps', () => {
  for (const c of COMPANIES) {
    const bp = BLUEPRINTS[c.blueprint]
    assert.ok(bp, `${c.name}: unknown blueprint ${c.blueprint}`)
    const stepNos = new Set(c.steps.map((s) => s.no))
    const last = Math.max(...stepNos)
    for (const r of bp.rounds) {
      assert.ok(stepNos.has(r.step), `${c.name}: round ${r.id} points at missing step ${r.step}`)
      assert.ok(r.step !== 1 && r.step !== last, `${c.name}: round ${r.id} simulates eligibility/final selection`)
    }
  }
})

test('blueprints: weights sum to 100, parts reference real sections, durations are sane', () => {
  for (const bp of Object.values(BLUEPRINTS)) {
    assert.equal(bp.rounds.reduce((s, r) => s + r.weight, 0), 100, bp.id)
    const minutes = bp.rounds.reduce((s, r) => s + r.minutes, 0)
    assert.ok(minutes >= 90 && minutes <= 120, `${bp.id}: ${minutes} min`)
    assert.equal(new Set(bp.rounds.map((r) => r.id)).size, bp.rounds.length, bp.id)
    for (const r of bp.rounds) {
      assert.ok(r.parts.length > 0, `${bp.id}/${r.id}`)
      for (const p of r.parts) {
        assert.ok(p.count > 0, `${bp.id}/${r.id}`)
        for (const s of p.sections) {
          assert.ok(SECTION_BY_ID[s], `${bp.id}/${r.id}: bad section ${s}`)
          for (const a of p.areas || []) assert.ok(SECTION_BY_ID[s].areas[a] || p.sections.some((x) => SECTION_BY_ID[x].areas[a]), `${bp.id}: area ${a}`)
        }
      }
    }
  }
})

test('blueprints: company mocks draw on all 11 master-bank sections between them', () => {
  const used = new Set<string>()
  for (const bp of Object.values(BLUEPRINTS)) for (const r of bp.rounds) for (const p of r.parts) p.sections.forEach((s) => used.add(s))
  assert.equal(used.size, 11)
})

test('catalog: mock facts are computed from the blueprint', () => {
  const tcs = companyMockFacts(getCompany('tcs')!)
  assert.equal(tcs.rounds, 4)
  assert.equal(tcs.minutes, 100)
  assert.ok(tcs.questions > 30)
})
