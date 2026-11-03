#!/usr/bin/env python3
"""Gerador automático de vídeos verticais (Shorts / Reels / TikTok).

Uso:
    python gerar_video.py roteiros/homem-na-lua.json

O roteiro (JSON) define a voz, a velocidade e uma lista de cenas. Cada cena tem
o texto narrado, um rótulo opcional exibido no topo e imagens do acervo público
da NASA (pelo nasa_id) ou caminhos de arquivos locais.

Tudo é gratuito: narração com edge-tts, imagens da NASA (domínio público),
trilha sonora sintetizada aqui mesmo e montagem com FFmpeg.
"""
import argparse
import asyncio
import hashlib
import json
import math
import os
import ssl
import subprocess
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parent
CACHE = RAIZ / "cache"
SAIDA = RAIZ / "output"
FONTE = RAIZ / "assets" / "fonts" / "Anton-Regular.ttf"

W, H, FPS = 1080, 1920, 30
SR = 44100
AMARELO = (255, 212, 0)
VERMELHO = (200, 20, 20)


def ssl_ctx():
    cafile = os.environ.get("SSL_CERT_FILE")
    return ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()


# ---------------------------------------------------------------- imagens
def baixar_imagem(ref: str) -> Path:
    local = Path(ref)
    if local.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp") and local.exists():
        return local
    destino = CACHE / "imagens" / f"{ref}.jpg"
    if destino.exists():
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    ctx = ssl_ctx()
    with urllib.request.urlopen(f"https://images-api.nasa.gov/asset/{ref}", context=ctx, timeout=30) as r:
        itens = [i["href"] for i in json.load(r)["collection"]["items"]]
    url = next((u for u in itens if "~large" in u), None) or next(u for u in itens if "~orig" in u)
    url = url.replace("http://", "https://")
    print(f"  baixando {ref}")
    with urllib.request.urlopen(url, context=ctx, timeout=60) as r:
        destino.write_bytes(r.read())
    return destino


def preparar_base(caminho: Path, foco_x=0.5, folga=1.16) -> Image.Image:
    """Recorta para 9:16 (com folga para o zoom), aplica tratamento de 'filme antigo'."""
    img = Image.open(caminho).convert("RGB")
    bw, bh = int(W * folga), int(H * folga)
    escala = max(bw / img.width, bh / img.height)
    img = img.resize((math.ceil(img.width * escala), math.ceil(img.height * escala)), Image.LANCZOS)
    x0 = int((img.width - bw) * foco_x)
    y0 = (img.height - bh) // 2
    img = img.crop((x0, y0, x0 + bw, y0 + bh))
    a = np.asarray(img).astype(np.float32) / 255.0
    cinza = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    a = a * 0.35 + cinza[..., None] * 0.65            # dessatura
    a = a * np.array([1.04, 0.98, 0.90], dtype=np.float32)  # tom levemente quente
    a = np.clip((a - 0.5) * 1.18 + 0.47, 0, 1)        # contraste
    return Image.fromarray((a * 255).astype(np.uint8))


# ---------------------------------------------------------------- narração
async def _tts(texto, voz, velocidade, tom, mp3: Path):
    import edge_tts
    import edge_tts.communicate as ec
    ec._SSL_CTX = ssl_ctx()
    com = edge_tts.Communicate(texto, voz, rate=velocidade, pitch=tom, boundary="WordBoundary")
    palavras = []
    with open(mp3, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                palavras.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "texto": ch["text"]})
    return palavras


def narrar(texto, voz, velocidade, tom):
    chave = hashlib.sha1(f"{voz}|{velocidade}|{tom}|{texto}".encode()).hexdigest()[:16]
    pasta = CACHE / "audio"
    pasta.mkdir(parents=True, exist_ok=True)
    mp3, js = pasta / f"{chave}.mp3", pasta / f"{chave}.json"
    if not (mp3.exists() and js.exists()):
        palavras = asyncio.run(_tts(texto, voz, velocidade, tom, mp3))
        js.write_text(json.dumps(palavras, ensure_ascii=False))
    palavras = json.loads(js.read_text())
    pcm = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(mp3), "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(pcm, dtype=np.float32).copy(), palavras


# ---------------------------------------------------------------- trilha
def trilha(dur, impactos, rng):
    n = int(dur * SR)
    t = np.arange(n) / SR
    drone = np.zeros(n, dtype=np.float64)
    for f, a, lfo in [(55, 1.0, 0.07), (82.4, 0.55, 0.05), (110, 0.4, 0.11), (164.8, 0.18, 0.09), (220.6, 0.08, 0.13)]:
        drone += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * (0.75 + 0.25 * np.sin(2 * np.pi * lfo * t))
    vento = rng.standard_normal(n)
    for _ in range(3):  # passa-baixa simples
        vento = np.convolve(vento, np.ones(400) / 400, mode="same")
    vento *= 0.6 + 0.4 * np.sin(2 * np.pi * 0.03 * t)
    drone = drone / np.abs(drone).max() * 0.055 + vento / (np.abs(vento).max() + 1e-9) * 0.02
    # pulso grave lento (batida de coração), bem discreto
    for inicio in np.arange(0.5, dur, 1.6):
        for d in (0.0, 0.28):
            i = int((inicio + d) * SR)
            k = np.arange(int(0.25 * SR)) / SR
            s = np.sin(2 * np.pi * 48 * k) * np.exp(-k * 18) * 0.05
            drone[i:i + len(s)] += s[: max(0, n - i)]
    # impactos graves nas viradas de cena (ênfase)
    for ti in impactos:
        i = int(ti * SR)
        k = np.arange(int(1.6 * SR)) / SR
        freq = 35 + 70 * np.exp(-k * 6)
        boom = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-k * 2.6) * 0.30
        boom[: int(0.02 * SR)] += rng.standard_normal(int(0.02 * SR)) * 0.08
        drone[i:i + len(boom)] += boom[: max(0, n - i)]
    fade = int(1.5 * SR)
    drone[:fade] *= np.linspace(0, 1, fade)
    drone[-fade:] *= np.linspace(1, 0, fade)
    return drone


# ---------------------------------------------------------------- legendas
def agrupar(palavras, fim_cena, max_palavras=3):
    grupos, atual = [], []
    for i, p in enumerate(palavras):
        atual.append(p)
        prox = palavras[i + 1]["t"] if i + 1 < len(palavras) else None
        pausa = prox is not None and prox - (p["t"] + p["d"]) > 0.25
        if len(atual) >= max_palavras or pausa or prox is None:
            grupos.append(atual)
            atual = []
    blocos = []
    for gi, g in enumerate(grupos):
        fim = grupos[gi + 1][0]["t"] if gi + 1 < len(grupos) else fim_cena
        fim = min(fim, g[-1]["t"] + g[-1]["d"] + 0.6)
        blocos.append({"inicio": g[0]["t"], "fim": fim, "palavras": g})
    return blocos


class Legendas:
    def __init__(self):
        self.cache = {}

    def fonte(self, tam):
        return ImageFont.truetype(str(FONTE), tam)

    def render(self, palavras, ativa):
        chave = (tuple(p["texto"] for p in palavras), ativa)
        if chave in self.cache:
            return self.cache[chave]
        textos = [p["texto"].upper() for p in palavras]
        tam = 132
        while True:
            f = self.fonte(tam)
            esp = f.getlength(" ")
            larg = [f.getlength(x) for x in textos]
            total = sum(larg) + esp * (len(textos) - 1)
            if total <= W - 120 or tam <= 70:
                break
            tam -= 6
        alt = int(tam * 1.5)
        img = Image.new("RGBA", (int(total) + 60, alt + 40), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        x = 30
        for i, (txt, lw) in enumerate(zip(textos, larg)):
            cor = AMARELO if i == ativa else (255, 255, 255)
            d.text((x, 20), txt, font=f, fill=cor, stroke_width=9, stroke_fill=(0, 0, 0))
            x += lw + esp
        sombra = Image.new("RGBA", img.size, (0, 0, 0, 0))
        sombra.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(10)).point(lambda v: v * 0.6))
        final = Image.alpha_composite(sombra, img)
        self.cache[chave] = final
        return final

    def rotulo(self, texto):
        chave = ("rotulo", texto)
        if chave not in self.cache:
            f = self.fonte(74)
            lw = int(f.getlength(texto))
            img = Image.new("RGBA", (lw + 70, 125), (0, 0, 0, 0))
            d = ImageDraw.Draw(img)
            d.rectangle((0, 14, 12, 112), fill=VERMELHO)
            d.text((34, 10), texto, font=f, fill=(255, 255, 255), stroke_width=5, stroke_fill=(0, 0, 0))
            self.cache[chave] = img
        return self.cache[chave]


# ---------------------------------------------------------------- montagem
def suave(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("roteiro")
    ap.add_argument("--saida")
    args = ap.parse_args()

    rot = json.loads(Path(args.roteiro).read_text(encoding="utf-8"))
    voz = rot.get("voz", "pt-BR-AntonioNeural")
    vel, tom = rot.get("velocidade", "+0%"), rot.get("tom", "+0Hz")
    pausa = rot.get("pausa_entre_cenas", 0.4)
    rng = np.random.default_rng(7)

    print("1/4 Narração")
    cenas, cursor, voz_pcm = [], 0.35, []
    for c in rot["cenas"]:
        pcm, palavras = narrar(c["texto"], voz, vel, tom)
        dur = len(pcm) / SR
        cenas.append({**c, "inicio": cursor, "dur_voz": dur, "palavras": palavras})
        voz_pcm.append((cursor, pcm))
        cursor += dur + pausa
    total = cursor + 1.2
    for i, c in enumerate(cenas):
        c["fim"] = cenas[i + 1]["inicio"] if i + 1 < len(cenas) else total
        c["blocos"] = agrupar(c["palavras"], c["fim"] - c["inicio"])
    print(f"   duração total: {total:.1f}s")

    print("2/4 Trilha e mixagem")
    n = int(total * SR)
    voz_mix = np.zeros(n)
    for ini, pcm in voz_pcm:
        i = int(ini * SR)
        voz_mix[i:i + len(pcm)] += pcm[: n - i]
    voz_mix *= 0.89 / (np.abs(voz_mix).max() + 1e-9)
    musica = trilha(total, [c["inicio"] - 0.05 for c in cenas[1:]], rng)
    mix = np.tanh((voz_mix + musica) * 1.05)
    estereo = np.stack([mix, mix], axis=1).astype(np.float32)
    SAIDA.mkdir(exist_ok=True)
    wav = CACHE / "mix.f32"
    wav.parent.mkdir(exist_ok=True)
    estereo.tofile(wav)

    print("3/4 Imagens")
    for c in cenas:
        c["bases"] = [preparar_base(baixar_imagem(r if isinstance(r, str) else r["id"]),
                                    0.5 if isinstance(r, str) else r.get("foco_x", 0.5))
                      for r in c["imagens"]]

    print("4/4 Renderizando vídeo")
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
    vinheta = np.clip(1.15 - 0.55 * r ** 2, 0.25, 1)[..., None].astype(np.float32)
    graos = [np.asarray(Image.fromarray((rng.standard_normal((H // 2, W // 2)) * 26 + 128).clip(0, 255).astype(np.uint8))
                        .resize((W, H), Image.BILINEAR)).astype(np.float32)[..., None] - 128 for _ in range(6)]
    leg = Legendas()

    saida = Path(args.saida) if args.saida else SAIDA / f"{rot.get('titulo', 'video')}.mp4"
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(wav),
        "-c:v", "libx264", "-preset", "medium", "-crf", "23", "-maxrate", "9M", "-bufsize", "18M", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(saida),
    ], stdin=subprocess.PIPE)

    nframes = int(total * FPS)
    ci = 0
    for fi in range(nframes):
        t = fi / FPS
        while ci + 1 < len(cenas) and t >= cenas[ci + 1]["inicio"]:
            ci += 1
        c = cenas[ci]
        tl = t - c["inicio"] if ci > 0 else t
        dur_cena = c["fim"] - (c["inicio"] if ci > 0 else 0)
        nb = len(c["bases"])
        seg = dur_cena / nb
        bi = min(int(tl / seg), nb - 1)

        def quadro(idx):
            base = c["bases"][idx]
            prog = suave((tl - idx * seg) / seg) if seg > 0 else 0
            sentido = (ci + idx) % 2
            z = 1.0 + 0.13 * (prog if sentido == 0 else 1 - prog)
            cw, ch = base.width / (1.16 * z) * 1.0, base.height / (1.16 * z)
            cx = base.width / 2 + (prog - 0.5) * (base.width - cw) * 0.5 * (1 if sentido else -1)
            cy = base.height / 2
            box = (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)
            return np.asarray(base.resize((W, H), Image.BILINEAR, box=box)).astype(np.float32)

        img = quadro(bi)
        tc = tl - bi * seg  # crossfade entre imagens da mesma cena
        if bi > 0 and tc < 0.35:
            a = suave(tc / 0.35)
            img = img * a + quadro(bi - 1) * (1 - a)

        brilho = 1.0 + rng.uniform(-0.035, 0.035)
        if c.get("final"):
            brilho *= 0.55 + 0.45 * (1 - suave(tl / 1.5))
        img = img * vinheta * brilho + graos[(fi // 2) % len(graos)]
        if ci > 0 and tl < 0.22:  # flash na virada de cena
            img += 255 * 0.55 * (1 - tl / 0.22)
        if fi < 12:  # entrada a partir do preto
            img *= fi / 12
        if t > total - 0.8:
            img *= max(0.0, (total - t) / 0.8)
        if rng.random() < 0.08:  # risco de filme
            x = int(rng.uniform(80, W - 80))
            img[:, x:x + 2] += 60
        quadro_img = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert("RGBA")

        if c.get("rotulo"):
            rimg = leg.rotulo(c["rotulo"])
            a = suave((tl - 0.1) / 0.3)
            if a > 0:
                camada = rimg.copy()
                camada.putalpha(camada.getchannel("A").point(lambda v: int(v * a)))
                quadro_img.alpha_composite(camada, (60 - int((1 - a) * 40), 230))

        tv = t - c["inicio"]
        for b in c["blocos"]:
            if b["inicio"] <= tv < b["fim"]:
                ativa = max(i for i, p in enumerate(b["palavras"]) if p["t"] <= tv or i == 0)
                li = leg.render(b["palavras"], ativa)
                pop = 1.0 + 0.14 * (1 - suave((tv - b["inicio"]) / 0.12))
                if pop > 1.001:
                    li = li.resize((int(li.width * pop), int(li.height * pop)), Image.BILINEAR)
                quadro_img.alpha_composite(li, ((W - li.width) // 2, int(H * 0.66) - li.height // 2))
                break

        d = ImageDraw.Draw(quadro_img)  # barra de progresso
        d.rectangle((0, H - 10, int(W * t / total), H), fill=VERMELHO + (255,))

        ff.stdin.write(quadro_img.convert("RGB").tobytes())
        if fi % (FPS * 5) == 0:
            print(f"   {t:5.1f}s / {total:.1f}s", flush=True)

    ff.stdin.close()
    if ff.wait() != 0:
        sys.exit("ffmpeg falhou")
    print(f"Pronto: {saida}")


if __name__ == "__main__":
    main()
