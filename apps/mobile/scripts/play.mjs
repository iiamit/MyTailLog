import assert from 'node:assert/strict'
import { createSign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

const packageName = 'com.mytaillog.app'
const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/edits`
const keyFile = process.env.MYTAILLOG_PLAY_CREDENTIALS || `${homedir()}/.config/mytaillog/android/play-service-account.json`
const bundleFile = resolve('android/app/build/outputs/bundle/release/app-release.aab')

function draftReleases(releases, versionCode) {
  return [
    ...releases.filter(release => release.status !== 'draft'),
    { status: 'draft', versionCodes: [String(versionCode)] },
  ]
}

function promoteDraft(releases, versionCode) {
  const draft = releases.find(release => release.status === 'draft' && release.versionCodes?.includes(String(versionCode)))
  if (!draft) throw new Error(`No internal draft for versionCode ${versionCode}`)
  return [{ ...draft, status: 'completed' }]
}

async function accessToken() {
  const key = JSON.parse(await readFile(keyFile, 'utf8'))
  assert.equal(key.type, 'service_account')
  assert.ok(key.client_email && key.private_key)
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  const assertion = `${unsigned}.${signer.sign(key.private_key).toString('base64url')}`
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(`Google authentication failed: ${result.error_description || result.error || response.status}`)
  return result.access_token
}

async function main(mode) {
  if (mode === 'self-check') {
    assert.deepEqual(draftReleases([{ status: 'completed', versionCodes: ['1'] }, { status: 'draft', versionCodes: ['2'] }], 3), [
      { status: 'completed', versionCodes: ['1'] }, { status: 'draft', versionCodes: ['3'] },
    ])
    assert.deepEqual(promoteDraft([{ status: 'draft', versionCodes: ['3'] }, { status: 'completed', versionCodes: ['2'] }], 3), [
      { status: 'completed', versionCodes: ['3'] },
    ])
    assert.throws(() => promoteDraft([{ status: 'completed', versionCodes: ['2'] }], 3), /No internal draft/)
    console.log('Play draft release check passed')
    return
  }
  if (!['check', 'draft', 'internal'].includes(mode)) throw new Error('Use: node scripts/play.mjs check|draft|internal')
  const token = await accessToken()
  const api = async (method, url, body) => {
    const response = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && { 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' }) },
      ...(body && { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
      signal: AbortSignal.timeout(body && Buffer.isBuffer(body) ? 300000 : 30000),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(`Play API ${response.status}: ${result.error?.message || response.statusText}`)
    return result
  }

  const edit = await api('POST', base, {})
  const editUrl = `${base}/${encodeURIComponent(edit.id)}`
  let committed = false
  try {
    const tracks = await api('GET', `${editUrl}/tracks`)
    if (mode === 'check') {
      const bundles = await api('GET', `${editUrl}/bundles`)
      console.log(`Play access confirmed for ${packageName}; bundle versions: ${(bundles.bundles || []).map(bundle => bundle.versionCode).join(', ') || 'none'}`)
      const internal = (tracks.tracks || []).find(track => track.track === 'internal')
      console.log(`Internal releases: ${(internal?.releases || []).map(release => `${release.status} (${release.versionCodes.join(', ')})`).join('; ') || 'none'}`)
      const listings = await api('GET', `${editUrl}/listings`).catch(() => ({ listings: [] }))
      for (const listing of listings.listings || []) {
        const images = await Promise.all(['featureGraphic', 'phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots'].map(async type => {
          const result = await api('GET', `${editUrl}/listings/${encodeURIComponent(listing.language)}/${type}`).catch(() => ({}))
          return `${type}: ${(result.images || []).length}`
        }))
        console.log(`Listing ${listing.language}: ${listing.title || 'untitled'}; ${images.join(', ')}`)
      }
      return
    }

    const gradle = await readFile('android/app/build.gradle', 'utf8')
    const versionCode = gradle.match(/\bversionCode\s+(\d+)/)?.[1]
    if (!versionCode) throw new Error('Could not find Android versionCode')
    const internal = (tracks.tracks || []).find(track => track.track === 'internal')
    if (!internal) throw new Error('Play has no internal testing track')
    if (mode === 'internal') {
      await api('PUT', `${editUrl}/tracks/internal`, { track: 'internal', releases: promoteDraft(internal.releases || [], versionCode) })
      await api('POST', `${editUrl}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, {})
      committed = true
      console.log(`Released versionCode ${versionCode} to the internal-testing track.`)
      return
    }
    const bundles = await api('GET', `${editUrl}/bundles`)
    if ((bundles.bundles || []).some(bundle => String(bundle.versionCode) === versionCode)) {
      throw new Error(`versionCode ${versionCode} is already on Play; increase it in android/app/build.gradle before building again`)
    }

    const bundle = await api('POST', `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${packageName}/edits/${encodeURIComponent(edit.id)}/bundles?uploadType=media`, await readFile(bundleFile))
    if (String(bundle.versionCode) !== versionCode) throw new Error(`Bundle versionCode ${bundle.versionCode} differs from build.gradle ${versionCode}`)
    await api('PUT', `${editUrl}/tracks/internal`, { track: 'internal', releases: draftReleases(internal.releases || [], versionCode) })
    await api('POST', `${editUrl}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, {})
    committed = true
    console.log(`Uploaded versionCode ${versionCode} as an internal-testing draft. No testers received it.`)
  } finally {
    if (!committed) await api('DELETE', editUrl).catch(() => {})
  }
}

main(process.argv[2]).catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
