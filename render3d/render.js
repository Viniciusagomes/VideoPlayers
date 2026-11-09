// Uso: node render.js timeline.json saida.mp4 [inicio_frame fim_frame]
// Renderiza a linha do tempo quadro a quadro no Chromium (WebGL) e codifica com ffmpeg.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
(async () => {
  const [tlPath, saida, a, b] = process.argv.slice(2);
  const tl = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
  const fps = tl.fps || 30;
  const total = Math.floor(tl.duracao * fps);
  const ini = a ? +a : 0, fim = b ? Math.min(+b, total) : total;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  page.on('pageerror', e => console.error('ERRO NA PÁGINA:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto('file://' + path.join(__dirname, 'cena.html'));
  await page.waitForFunction('window.pronto === true', null, { timeout: 60000 });
  await page.evaluate(t => window.preparar(t), tl);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=1080:1920:flags=lanczos', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', saida], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = ini; f < fim; f++) {
    const url = await page.evaluate(t => window.renderAt(t), f / fps);
    const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if ((f - ini) % 150 === 0) console.log(`  quadro ${f}/${fim} (${((Date.now() - t0) / Math.max(1, f - ini)).toFixed(0)} ms/quadro)`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
})();
