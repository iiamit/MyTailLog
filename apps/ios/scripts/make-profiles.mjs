// Ensure the two IOS_APP_STORE provisioning profiles the app + widget need exist
// and are installed locally, so manual-signing export works headlessly. Creates
// them via the App Store Connect API (the key can create profiles even though it
// cannot create cloud-managed distribution certs), tying each to every team
// distribution cert so signing uses whichever private key is in the keychain.
// Idempotent by profile name. Run before an App Store export.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import crypto from 'node:crypto'

const KEY_ID = process.env.APP_STORE_CONNECT_KEY_ID
const ISSUER = process.env.APP_STORE_CONNECT_ISSUER_ID
const KEY_PATH = process.env.APP_STORE_CONNECT_KEY_PATH
if (!KEY_ID || !ISSUER || !KEY_PATH) throw new Error('APP_STORE_CONNECT_KEY_ID, _ISSUER_ID and _KEY_PATH must be set')
const pem = readFileSync(KEY_PATH, 'utf8')
const TARGETS = [
  { identifier: 'com.mytaillog.app', name: 'MyTailLog App Store' },
  { identifier: 'com.mytaillog.app.widgets', name: 'MyTailLog Widgets App Store' },
]

const b64u = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const input = `${b64u({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64u({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })}`
const jwt = `${input}.${crypto.sign('sha256', Buffer.from(input), { key: pem, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`

const api = async (method, path, body) => {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method, headers: { Authorization: `Bearer ${jwt}`, ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { body: JSON.stringify(body) }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok && method === 'GET') throw new Error(`ASC ${method} ${path}: HTTP ${r.status} ${JSON.stringify(j.errors || j)}`)
  return { status: r.status, j }
}

const distCerts = (await api('GET', '/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=200')).j.data || []
if (!distCerts.length) throw new Error('No team distribution certificate. Import the Apple Distribution .p12 (cert + private key) first.')
const certData = distCerts.map(c => ({ type: 'certificates', id: c.id }))

const bundleId = async id => {
  const d = (await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(id)}`)).j.data || []
  if (!d[0]) throw new Error(`Bundle ID ${id} not registered in the Apple Developer portal.`)
  return d[0].id
}

const dir = `${homedir()}/Library/MobileDevice/Provisioning Profiles`
mkdirSync(dir, { recursive: true })
const byName = Object.fromEntries(((await api('GET', '/v1/profiles?limit=200')).j.data || []).map(p => [p.attributes.name, p]))

for (const t of TARGETS) {
  let prof = byName[t.name]
  if (prof) {
    prof = (await api('GET', `/v1/profiles/${prof.id}?fields[profiles]=name,uuid,profileContent`)).j.data
  } else {
    const res = await api('POST', '/v1/profiles', {
      data: {
        type: 'profiles',
        attributes: { name: t.name, profileType: 'IOS_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: await bundleId(t.identifier) } },
          certificates: { data: certData },
        },
      },
    })
    if (res.status !== 201) throw new Error(`Create profile "${t.name}" failed: HTTP ${res.status} ${JSON.stringify(res.j.errors || res.j)}`)
    prof = res.j.data
  }
  writeFileSync(`${dir}/${prof.attributes.uuid}.mobileprovision`, Buffer.from(prof.attributes.profileContent, 'base64'))
  console.log(`ready: "${t.name}" -> ${t.identifier}`)
}
