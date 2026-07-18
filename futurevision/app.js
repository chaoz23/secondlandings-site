import mediaInfoFactory from './vendor/mediainfo.min.js'

// ---------------------------------------------------------------------------
// Future Vision XPRIZE — submission spec, encoded as data.
// Every requirement below is CITED to the official rules
// (https://futurevisionxprize.com/rules, read 2026-07-18). This tool checks
// only what the rules actually state. The rules do NOT specify aspect ratio,
// frame rate, codec, or file size — so this tool deliberately does not check
// those (it will not invent a requirement).
// ---------------------------------------------------------------------------
const RULES_URL = 'https://futurevisionxprize.com/rules'
const DEADLINE = 'August 15, 2026 — 11:59 PM PST'

// non-file requirements the entrant must confirm themselves (can't be read
// from the file) — shown as a checklist.
const CHECKLIST = [
  'Includes the provided 15-second sponsor end card (from the official Google Drive asset).',
  'English dialogue, or English subtitles.',
  'Uploaded as an <strong>unlisted YouTube</strong> link and submitted via the competition Slack workspace.',
  '<strong>#FutureVisionXPRIZE</strong> in the video title or description.',
  'Competition website link in the description.',
  'Submitted before the deadline: <strong>' + DEADLINE + '</strong>.',
  'Entrant is 18+ (or has guardian consent to claim a prize).',
]

// ---- helpers ---------------------------------------------------------------
const $ = (s) => document.querySelector(s)
const fmtDur = (s) => {
  if (s == null || isNaN(s)) return '—'
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

let mediainfo = null
async function getMediaInfo () {
  if (!mediainfo) {
    mediainfo = await mediaInfoFactory({
      format: 'object',
      locateFile: () => new URL('./vendor/MediaInfoModule.wasm', import.meta.url).href,
    })
  }
  return mediainfo
}

// read a File through MediaInfo entirely on-device
async function analyze (file) {
  const mi = await getMediaInfo()
  const getSize = () => file.size
  const readChunk = (chunkSize, offset) =>
    new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = (e) => resolve(new Uint8Array(e.target.result))
      r.onerror = (e) => reject(e)
      r.readAsArrayBuffer(file.slice(offset, offset + chunkSize))
    })
  return mi.analyzeData(getSize, readChunk)
}

// pull the fields we need out of the MediaInfo track list
function extract (result, file) {
  const tracks = (result && result.media && result.media.track) || []
  const general = tracks.find((t) => t['@type'] === 'General') || {}
  const video = tracks.find((t) => t['@type'] === 'Video') || {}
  const audios = tracks.filter((t) => t['@type'] === 'Audio')
  const num = (v) => (v == null ? null : Number(v))
  return {
    containerFormat: general.Format || '',
    ext: (file.name.split('.').pop() || '').toLowerCase(),
    duration: num(general.Duration), // seconds
    width: num(video.Width),
    height: num(video.Height),
    hasVideo: !!video['@type'],
    audioCount: audios.length,
  }
}

// evaluate the cited requirements -> list of checks
function evaluate (m) {
  const checks = []
  const short = m.width && m.height ? Math.min(m.width, m.height) : null

  // 1. container MP4 / MOV
  const okContainer =
    /MPEG-4|QuickTime/i.test(m.containerFormat) || ['mp4', 'mov'].includes(m.ext)
  checks.push({
    ok: okContainer, label: 'File format is MP4 or MOV',
    rule: 'Rules: “MP4 or MOV”.',
    found: `${m.containerFormat || 'unknown container'} (.${m.ext})`,
  })

  // 2. resolution >= 1080p (shorter side >= 1080, so vertical also counts)
  const okRes = short != null && short >= 1080
  checks.push({
    ok: m.hasVideo ? okRes : false,
    label: 'Resolution is at least 1080p',
    rule: 'Rules: “1080p minimum”.',
    found: m.width && m.height ? `${m.width}×${m.height}` : 'no video track found',
  })

  // 3. duration <= 3:00 film (+15s sponsor end card allowance = 3:15 total)
  let durOk, durNote
  if (m.duration == null) { durOk = false; durNote = 'could not read duration' }
  else if (m.duration <= 180) { durOk = true; durNote = 'within the 3:00 limit' }
  else if (m.duration <= 195) { durOk = true; durNote = 'within 3:00 + the 15s end-card allowance — make sure the film itself is ≤ 3:00' }
  else { durOk = false; durNote = 'over 3:00 + 15s end card' }
  checks.push({
    ok: durOk, label: 'Runtime within 3:00 (+15s sponsor end card)',
    rule: 'Rules: “3 minutes max (+15-sec sponsor trailer).”',
    found: `${fmtDur(m.duration)} — ${durNote}`,
  })

  // 4. audio present (English dialogue/subtitles is a checklist item)
  checks.push({
    ok: m.audioCount > 0, label: 'Has an audio track',
    rule: 'Rules require English dialogue or subtitles — this only confirms audio exists.',
    found: m.audioCount > 0 ? `${m.audioCount} audio track(s)` : 'no audio track',
  })

  return checks
}

// ---- UI --------------------------------------------------------------------
function render (checks) {
  const failed = checks.filter((c) => !c.ok).length
  const verdict = $('#verdict')
  verdict.className = 'verdict ' + (failed === 0 ? 'pass' : 'fail')
  verdict.innerHTML =
    failed === 0
      ? '✅ <strong>The file passes every technical rule we can read.</strong> Now run through the checklist below before you submit.'
      : `⛔ <strong>${failed} issue${failed > 1 ? 's' : ''} to fix</strong> before submitting.`

  $('#checks').innerHTML = checks
    .map(
      (c) => `<li class="${c.ok ? 'ok' : 'bad'}">
        <span class="mark">${c.ok ? '✓' : '✗'}</span>
        <div><div class="cl-label">${c.label}</div>
        <div class="cl-found">Your file: ${c.found}</div>
        <div class="cl-rule">${c.rule}</div></div></li>`
    )
    .join('')

  $('#checklist').innerHTML = CHECKLIST.map((c) => `<li>${c}</li>`).join('')
  $('#results').hidden = false
  $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function handleFile (file) {
  if (!file) return
  $('#status').hidden = false
  $('#status').textContent = 'Reading file header on your device…'
  $('#results').hidden = true
  try {
    const result = await analyze(file)
    const m = extract(result, file)
    render(evaluate(m))
  } catch (err) {
    $('#status').textContent = 'Could not read that file. Is it a video (MP4/MOV)? ' + (err?.message || '')
    return
  }
  $('#status').hidden = true
}

// wire up drop zone + picker
const drop = $('#drop')
const input = $('#file')
drop.addEventListener('click', () => input.click())
input.addEventListener('change', (e) => handleFile(e.target.files[0]))
;['dragover', 'dragenter'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over') })
)
;['dragleave', 'drop'].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over') })
)
drop.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]))
