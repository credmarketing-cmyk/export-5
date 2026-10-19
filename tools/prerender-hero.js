// Regenerates the static copy of the nav + hero (#dc-pre) inside index.html.
//
// The page is rendered client-side by React, so without this the phone shows a blank
// screen until the scripts have run. #dc-pre paints straight from the HTML and is removed
// as soon as the live page mounts (componentDidMount in index.html).
//
// Run it after any change to the nav or hero copy:
//   npm i -g playwright   (once)
//   node tools/prerender-hero.js
const fs = require('fs');
const path = require('path');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); }

const FILE = path.join(__dirname, '..', 'index.html');
const START = '<!-- prerender:start -->', END = '<!-- prerender:end -->';

(async () => {
  const html = fs.readFileSync(FILE, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) throw new Error('prerender markers not found in index.html');

  // Serve the folder over http so fonts load exactly as they do on the live site.
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };
  const dir = path.dirname(FILE);
  const server = require('http').createServer((req, res) => {
    const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = server.address().port;

  const browser = await playwright.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route(/\.mp4$/, r => r.abort());
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#dc-root section#top h1');
  await page.evaluate(() => document.fonts.ready);

  const pre = await page.evaluate(() => {
    const root = document.getElementById('dc-root');
    const shell = root.querySelector('section#top').closest('main').parentElement;
    const header = root.querySelector('header').cloneNode(true);
    const hero = root.querySelector('section#top').cloneNode(true);

    // Trade pill: only the first trade, sized naturally (the pill's font size changes on small phones).
    const box = hero.querySelector('[data-trade-pill] > span:nth-child(2)');
    const list = box.firstElementChild;
    while (list.children.length > 1) list.lastElementChild.remove();
    box.style.width = 'auto';
    list.style.transform = 'translateY(0em)';

    header.querySelector('[data-nav-menu]').remove();
    hero.querySelectorAll('video').forEach(v => v.remove());
    hero.removeAttribute('id');
    hero.querySelectorAll('[data-line]').forEach((el, i) => el.style.setProperty('--d', (120 + i * 140) + 'ms'));
    hero.querySelectorAll('[data-fade]').forEach((el, i) => el.style.setProperty('--d', (300 + i * 130) + 'ms'));
    for (const n of [header, hero]) {
      n.querySelectorAll('.sc-interp').forEach(s => s.replaceWith(...s.childNodes));
      [n, ...n.querySelectorAll('*')].forEach(el => {
        el.removeAttribute('data-dc-tpl');
        if (/^scp\d+$/.test(el.getAttribute('class') || '')) el.removeAttribute('class');
      });
    }
    // Out of normal flow, so the live page can render underneath it without anything moving.
    const style = shell.getAttribute('style').replace('position: relative;', 'position: absolute; top: 0px; left: 0px; right: 0px; z-index: 50;');
    return '<div id="dc-pre" style="' + style.replace(/"/g, '&quot;') + '">\n' +
      header.outerHTML + '\n<main>\n' + hero.outerHTML + '\n</main>\n</div>\n' +
      '<script>requestAnimationFrame(function () { window.__preT0 = document.timeline.currentTime; });</script>';
  });
  await browser.close();
  server.close();

  fs.writeFileSync(FILE, html.slice(0, a) + START + '\n' + pre + '\n' + html.slice(b));
  console.log('prerendered hero: ' + pre.length + ' bytes');
})().catch(e => { console.error(e); process.exit(1); });
