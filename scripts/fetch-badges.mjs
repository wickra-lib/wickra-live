/*
 * Snapshot the repo-status badge SVGs into public/badges/ and write a manifest
 * (src/badges.json) with each badge's intrinsic width/height.
 *
 * Why: the footer badge row used to hot-link shields.io / GitHub / codecov at
 * page load. Those are separate cross-origin requests that resolve at different
 * times, so the badges popped in one by one and reflowed the centred row. Served
 * from our own origin (Cloudflare) with known dimensions, the row paints with
 * the page and never shifts.
 *
 * This script is run by .github/workflows/refresh-badges.yml on a schedule
 * (commit-if-changed). The site BUILD never calls it, so an upstream badge-host
 * outage can never break a deploy — the last committed snapshot is always used.
 *
 * Fault-tolerant: if a single badge can't be fetched, the previous committed
 * snapshot for it is kept rather than dropping it from the row.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// Source of truth for the footer badge row. Mirrors the GitHub wickra README.
const badges = [
  { alt: 'CI', slug: 'ci', src: 'https://github.com/wickra-lib/wickra/actions/workflows/ci.yml/badge.svg', href: 'https://github.com/wickra-lib/wickra/actions/workflows/ci.yml' },
  { alt: 'CodeQL', slug: 'codeql', src: 'https://github.com/wickra-lib/wickra/actions/workflows/codeql.yml/badge.svg', href: 'https://github.com/wickra-lib/wickra/actions/workflows/codeql.yml' },
  { alt: 'codecov', slug: 'codecov', src: 'https://codecov.io/gh/wickra-lib/wickra/branch/main/graph/badge.svg', href: 'https://codecov.io/gh/wickra-lib/wickra' },
  { alt: 'GitHub release', slug: 'release', src: 'https://img.shields.io/github/v/release/wickra-lib/wickra?logo=github&color=green', href: 'https://github.com/wickra-lib/wickra/releases/latest' },
  { alt: 'crates.io', slug: 'crates', src: 'https://img.shields.io/crates/v/wickra.svg?logo=rust&color=orange', href: 'https://crates.io/crates/wickra' },
  { alt: 'PyPI', slug: 'pypi', src: 'https://img.shields.io/pypi/v/wickra.svg?logo=pypi&color=blue', href: 'https://pypi.org/project/wickra/' },
  { alt: 'npm', slug: 'npm', src: 'https://img.shields.io/npm/v/wickra.svg?logo=npm&color=red', href: 'https://www.npmjs.com/package/wickra' },
  { alt: 'NuGet', slug: 'nuget', src: 'https://img.shields.io/nuget/v/Wickra.svg?logo=nuget&color=blue', href: 'https://www.nuget.org/packages/Wickra' },
  { alt: 'Maven Central', slug: 'maven', src: 'https://img.shields.io/maven-central/v/org.wickra/wickra.svg?logo=apachemaven&color=blue', href: 'https://central.sonatype.com/artifact/org.wickra/wickra' },
  { alt: 'Go module', slug: 'go', src: 'https://img.shields.io/github/v/tag/wickra-lib/wickra-go.svg?logo=go&logoColor=white&color=00ADD8&label=go', href: 'https://pkg.go.dev/github.com/wickra-lib/wickra-go' },
  { alt: 'r-universe', slug: 'r-universe', src: 'https://wickra-lib.r-universe.dev/badges/wickra', href: 'https://wickra-lib.r-universe.dev' },
  { alt: 'License: MIT OR Apache-2.0', slug: 'license', src: 'https://img.shields.io/badge/license-MIT_OR_Apache--2.0-blue', href: 'https://github.com/wickra-lib/wickra#license' },
  { alt: 'OpenSSF Scorecard', slug: 'scorecard', src: 'https://api.securityscorecards.dev/projects/github.com/wickra-lib/wickra/badge', href: 'https://scorecard.dev/viewer/?uri=github.com/wickra-lib/wickra' },
  { alt: 'OpenSSF Best Practices', slug: 'best-practices', src: 'https://www.bestpractices.dev/projects/13094/badge', href: 'https://www.bestpractices.dev/projects/13094' },
  { alt: 'Build provenance', slug: 'provenance', src: 'https://img.shields.io/badge/provenance-attested-brightgreen?logo=github', href: 'https://github.com/wickra-lib/wickra/attestations' },
  { alt: 'Verified across 10 languages', slug: 'verified', src: 'https://img.shields.io/badge/verified-10_languages-brightgreen', href: 'https://docs.wickra.org/FAQ#do-all-the-language-bindings-compute-the-same-values' },
]

const outDir = resolve(root, 'public/badges')
mkdirSync(outDir, { recursive: true })
const manifestPath = resolve(root, 'src/badges.json')
const prev = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf-8')) : []
const prevByAlt = new Map(prev.map((b) => [b.alt, b]))

function dimsOf(svg) {
  const w = svg.match(/<svg[^>]*?\bwidth="([\d.]+)"/)
  const h = svg.match(/<svg[^>]*?\bheight="([\d.]+)"/)
  return {
    width: w ? Math.round(parseFloat(w[1])) : null,
    height: h ? Math.round(parseFloat(h[1])) : null,
  }
}

// The release and go badges are sourced from shields.io's github/v/* endpoints,
// which share one GitHub token pool that frequently answers "Unable to select
// next GitHub token from pool" instead of a value; the error-marker guard then
// keeps the last good snapshot, freezing the badge (release stuck at 0.8.6 while
// 0.8.8 was live). Resolve both versions ourselves with the workflow's
// authenticated token and point the badges at a static shields render, so they
// no longer depend on shields' pool. On failure the shields URL in the array
// stays as a fallback; the monotonic and error-marker guards still apply.
const ghJson = async (path) => {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: {
      'user-agent': 'wickra-badges',
      accept: 'application/vnd.github+json',
      ...(process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return res.json()
}
// shields static-badge message escaping: '-' -> '--', '_' -> '__', ' ' -> '_'.
const escBadge = (s) => String(s).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '_')
for (const b of badges) {
  try {
    if (b.slug === 'release') {
      const v = (await ghJson('repos/wickra-lib/wickra/releases/latest')).tag_name
      b.src = `https://img.shields.io/badge/release-${escBadge(v)}-green?logo=github`
    } else if (b.slug === 'go') {
      const v = (await ghJson('repos/wickra-lib/wickra-go/tags'))[0]?.name
      if (!v) throw new Error('no tags')
      b.src = `https://img.shields.io/badge/go-${escBadge(v)}-00ADD8?logo=go&logoColor=white`
    }
  } catch (err) {
    console.warn(`fetch-badges: resolve ${b.slug} failed (${err.message}); keeping shields fallback`)
  }
}

const manifest = []
let failures = 0
for (const b of badges) {
  const file = `/badges/${b.slug}.svg`
  try {
    const res = await fetch(b.src, { redirect: 'follow' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const svg = await res.text()
    if (!svg.includes('<svg')) throw new Error('response is not an SVG')
    // A badge host (shields.io especially) can answer HTTP 200 with a
    // well-formed SVG whose *text* is an error — "unable to select next github
    // token from pool", "invalid", "inaccessible", ... — instead of a value.
    // Snapshotting that would replace a real version with an error string, so
    // detect it and fall through to keeping the previous good snapshot below.
    const valueText = ((svg.match(/<text[^>]*>([^<]*)<\/text>/g) || []).pop() || '')
      .replace(/<[^>]+>/g, '')
      .trim()
    const valueLower = valueText.toLowerCase()
    const errorMarkers = ['unable to select', 'token from pool', 'inaccessible', 'invalid', 'no response', 'not found']
    if (errorMarkers.some((m) => valueLower.includes(m))) {
      throw new Error(`badge value is an upstream error: "${valueText}"`)
    }
    // Version badges must read like a version (e.g. "v0.5.8"); anything else is
    // an upstream error that slipped past the marker list above.
    if (['release', 'crates', 'pypi', 'npm', 'nuget', 'maven', 'go', 'r-universe'].includes(b.slug) && !/^v?\d/.test(valueText)) {
      throw new Error(`version badge value is not a version: "${valueText}"`)
    }
    // Version badges are monotonic: a value lower than the committed snapshot is
    // a stale badge-host cache, not a real downgrade — reject it so the badge can
    // never move backwards (e.g. shields serving 0.8.4 over a committed 0.8.5).
    const verTarget = resolve(outDir, `${b.slug}.svg`)
    if (['release', 'crates', 'pypi', 'npm', 'nuget', 'maven', 'go', 'r-universe'].includes(b.slug) && existsSync(verTarget)) {
      const toTuple = (t) => { const m = String(t).match(/(\d+)\.(\d+)\.(\d+)/); return m ? m.slice(1).map(Number) : null }
      const next = toTuple(valueText)
      const prevText = ((readFileSync(verTarget, 'utf-8').match(/<text[^>]*>([^<]*)<\/text>/g) || []).pop() || '').replace(/<[^>]+>/g, '').trim()
      const prev = toTuple(prevText)
      if (next && prev && (next[0] < prev[0] || (next[0] === prev[0] && (next[1] < prev[1] || (next[1] === prev[1] && next[2] < prev[2]))))) {
        throw new Error(`version went backwards: "${valueText}" < committed "${prev.join('.')}" (stale cache)`)
      }
    }
    writeFileSync(resolve(outDir, `${b.slug}.svg`), svg)
    const { width, height } = dimsOf(svg)
    manifest.push({ alt: b.alt, href: b.href, file, width, height })
    console.log(`fetch-badges: ${b.slug} ${width}x${height}`)
  } catch (err) {
    failures++
    const old = prevByAlt.get(b.alt)
    if (old) {
      manifest.push(old)
      console.warn(`fetch-badges: ${b.slug} failed (${err.message}); kept previous snapshot`)
    } else {
      console.warn(`fetch-badges: ${b.slug} failed (${err.message}); no previous snapshot, skipped`)
    }
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`fetch-badges: wrote ${manifest.length} badge(s), ${failures} failure(s)`)
