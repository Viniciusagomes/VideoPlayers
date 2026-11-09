#!/usr/bin/env python3
"""Gera um vídeo de história em 3D low-poly (Reels/Shorts) a partir de um roteiro.

Uso:
    python gerar_3d.py historias/alfredo-parte1.json

Etapas: vozes por personagem (edge-tts) -> linha do tempo -> render 3D (three.js no
Chromium, render3d/) -> legendas, nome de quem fala, títulos -> trilha e efeitos -> MP4.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import gerar_video as gv

RAIZ = gv.RAIZ
W, H, FPS, SR = gv.W, gv.H, gv.FPS, gv.SR

VOZES = {
    "narrador": {"voz": "pt-BR-AntonioNeural", "vel": "+15%", "tom": "+0Hz"},
    "alfredo": {"voz": "pt-BR-AntonioNeural", "vel": "+4%", "tom": "-14Hz", "nome": "SEU ALFREDO", "cor": (255, 140, 0)},
    "alfredo2": {"voz": "pt-BR-AntonioNeural", "vel": "+4%", "tom": "-9Hz", "nome": "SEU ALFREDO", "cor": (255, 140, 0)},
    "alien": {"voz": "pt-BR-ThalitaMultilingualNeural", "vel": "-8%", "tom": "-4Hz", "fx": "robo", "nome": "ALIENÍGENA", "cor": (90, 220, 90)},
    "cleide": {"voz": "pt-BR-FranciscaNeural", "vel": "+14%", "tom": "+4Hz", "nome": "DONA CLEIDE", "cor": (255, 46, 147)},
    "coro": {"vozes": [("pt-BR-AntonioNeural", "-2%", "-18Hz"), ("pt-BR-FranciscaNeural", "+0%", "-6Hz"),
                       ("pt-BR-ThalitaMultilingualNeural", "+0%", "+2Hz")],
             "nome": "PADRE, PASTOR E MÃE DE SANTO", "cor": (120, 170, 255)},
}


def robo(x):
    t = np.arange(len(x)) / SR
    y = 0.55 * x + 0.75 * x * np.sin(2 * np.pi * 70 * t)
    d = int(0.028 * SR)
    y[d:] += 0.35 * y[:-d]
    return (y / (np.abs(y).max() + 1e-9) * np.abs(x).max()).astype(np.float32)


def gerar_fala(f):
    cfg = VOZES[f["voz"]]
    if "vozes" in cfg:
        partes = [gv.narrar(f["texto"], v, vel, tom) for v, vel, tom in cfg["vozes"]]
        n = max(len(p[0]) for p in partes) + int(0.06 * SR) * len(partes)
        mix = np.zeros(n, dtype=np.float32)
        for i, (pcm, _) in enumerate(partes):
            o = int(0.03 * SR) * i
            mix[o:o + len(pcm)] += pcm * 0.6
        return mix, partes[0][1]
    pcm, palavras = gv.narrar(f["texto"], cfg["voz"], cfg["vel"], cfg["tom"])
    if cfg.get("fx") == "robo":
        pcm = robo(pcm)
    return pcm, palavras


# ---------------------------------------------------------------- som
def corda(freq, dur, amp, rng):
    """Karplus-Strong: som de corda dedilhada (violão/cavaquinho)."""
    n = int(dur * SR)
    p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p)
    out = np.empty(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.996
    return out * amp


def trilha_alegre(dur, rng):
    n = int(dur * SR)
    mus = np.zeros(n)
    bpm = 104
    colcheia = 60 / bpm / 2
    nota = lambda m: 440 * 2 ** ((m - 69) / 12)
    acordes = [[55, 59, 62, 67], [50, 54, 57, 62], [52, 55, 59, 64], [48, 52, 55, 60]]  # G D Em C
    cache = {}
    t, k = 0.0, 0
    while t < dur:
        ac = acordes[(k // 8) % 4]
        padrao = [0, 2, 1, 3, 2, 1, 3, 2]
        m = ac[padrao[k % 8]] + 12
        chave = (m, k % 2)
        if chave not in cache:
            cache[chave] = corda(nota(m), 0.9, 0.5 if k % 2 == 0 else 0.35, rng)
        s = cache[chave]
        i = int(t * SR)
        mus[i:i + len(s)] += s[: max(0, n - i)]
        if k % 4 == 0:
            b = cache.setdefault(("b", ac[0]), corda(nota(ac[0] - 12), 1.2, 0.7, rng))
            mus[i:i + len(b)] += b[: max(0, n - i)]
        t += colcheia * (1.12 if k % 2 == 0 else 0.88)  # leve balanço
        k += 1
    return mus / (np.abs(mus).max() + 1e-9)


def efeito(tipo, rng):
    if tipo == "ufo":
        d = 2.0; t = np.arange(int(d * SR)) / SR
        f = 520 + 140 * np.sin(2 * np.pi * 7 * t)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t * 4) * np.exp(-t * 1.2)
        return s * 0.35
    if tipo == "raio":
        d = 1.4; t = np.arange(int(d * SR)) / SR
        f = 180 + 1400 * (t / d) ** 1.5
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-((t - 0.9) ** 2) * 3) + rng.standard_normal(len(t)) * 0.08 * np.exp(-t * 2)
        return s * 0.3
    if tipo == "scan":
        s = np.zeros(int(1.6 * SR))
        for j in range(6):
            t = np.arange(int(0.07 * SR)) / SR
            i = int(j * 0.25 * SR)
            s[i:i + len(t)] += np.sin(2 * np.pi * (1200 + 300 * (j % 2)) * t) * 0.25
        return s
    if tipo == "plim":
        t = np.arange(int(0.6 * SR)) / SR
        return (np.sin(2 * np.pi * 1318 * t) + 0.5 * np.sin(2 * np.pi * 1975 * t)) * np.exp(-t * 7) * 0.22
    return np.zeros(1)


# ---------------------------------------------------------------- sobreposições
def etiqueta(nome, cor, fonte):
    lw = int(fonte.getlength(nome))
    img = Image.new("RGBA", (lw + 80, 112), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((4, 4, lw + 76, 108), 50, fill=cor + (255,), outline=(0, 0, 0, 255), width=6)
    d.text((40, 56), nome, font=fonte, fill=(255, 255, 255), anchor="lm", stroke_width=4, stroke_fill=(0, 0, 0))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("roteiro")
    ap.add_argument("--so-render", action="store_true", help="reaproveita o render 3D se já existir")
    args = ap.parse_args()
    rot = json.loads(Path(args.roteiro).read_text(encoding="utf-8"))
    titulo = rot["titulo"]
    pasta = gv.CACHE / "3d" / titulo
    pasta.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(3)

    print("1/5 Vozes")
    falas, cursor, prev_cena = [], 0.5, None
    for f in rot["falas"]:
        pcm, palavras = gerar_fala(f)
        if prev_cena is not None:
            cursor += 0.32 if f["cena"] != prev_cena else 0.14
        dur = len(pcm) / SR
        falas.append({**f, "inicio": round(cursor, 3), "fim": round(cursor + dur, 3), "pcm": pcm,
                      "palavras": [{"t": p["t"], "d": p["d"], "texto": p["texto"]} for p in palavras]})
        cursor += dur
        prev_cena = f["cena"]
    total = cursor + 1.6
    segs = []
    for f in falas:
        if segs and segs[-1]["cena"] == f["cena"]:
            continue
        segs.append({"cena": f["cena"], "inicio": f["inicio"] if segs else 0.0})
    for i, s in enumerate(segs):
        s["fim"] = segs[i + 1]["inicio"] if i + 1 < len(segs) else total
    tl = {"fps": FPS, "duracao": total, "segmentos": segs,
          "falas": [{k: f[k] for k in ("voz", "inicio", "fim", "palavras")} for f in falas]}
    (pasta / "timeline.json").write_text(json.dumps(tl, ensure_ascii=False))
    print(f"   duração: {total:.1f}s, {len(segs)} cenas")

    print("2/5 Render 3D")
    bruto = pasta / "bruto.mp4"
    if not (args.so_render and bruto.exists()):
        subprocess.run(["node", str(RAIZ / "render3d" / "render.js"), str(pasta / "timeline.json"), str(bruto)], check=True)

    print("3/5 Áudio")
    n = int(total * SR)
    voz = np.zeros(n)
    for f in falas:
        i = int(f["inicio"] * SR)
        voz[i:i + len(f["pcm"])] += f["pcm"][: n - i]
    voz *= 0.9 / (np.abs(voz).max() + 1e-9)
    mus = trilha_alegre(total, rng) * 0.075
    fade = int(1.2 * SR)
    mus[-fade:] *= np.linspace(1, 0, fade)
    sfx = np.zeros(n)
    for f in falas:
        tipos = [f["sfx"]] if f.get("sfx") else []
        if f["voz"] == "cleide":
            tipos.append("plim")
        for tp in tipos:
            e = efeito(tp, rng)
            i = int(max(0, f["inicio"] - (0.15 if tp == "plim" else 0)) * SR)
            sfx[i:i + len(e)] += e[: max(0, n - i)]
    mix = np.tanh((voz + mus + sfx) * 1.05).astype(np.float32)
    audio = pasta / "mix.f32"
    np.stack([mix, mix], axis=1).astype(np.float32).tofile(audio)

    print("4/5 Legendas e títulos")
    leg = gv.Legendas()
    fonte_tag = ImageFont.truetype(str(gv.FONTE), 74)
    tags = {k: etiqueta(v["nome"], v["cor"], fonte_tag) for k, v in VOZES.items() if v.get("nome")}
    blocos = []
    for f in falas:
        for b in gv.agrupar(f["palavras"], f["fim"] - f["inicio"]):
            blocos.append({**b, "inicio": b["inicio"] + f["inicio"], "fim": b["fim"] + f["inicio"], "voz": f["voz"],
                           "rel": f["inicio"]})
    final = next((f for f in falas if f.get("final")), falas[-1])

    gv.SAIDA.mkdir(exist_ok=True)
    saida = gv.SAIDA / f"{titulo}.mp4"
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(bruto), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen([
        "ffmpeg", "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", str(audio),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", "10M", "-bufsize", "20M",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(saida),
    ], stdin=subprocess.PIPE)
    tam = W * H * 3
    fi = 0
    print("5/5 Montagem final")
    while True:
        raw = dec.stdout.read(tam)
        if len(raw) < tam:
            break
        t = fi / FPS
        quadro = Image.frombytes("RGB", (W, H), raw).convert("RGBA")
        # título de abertura
        if t < 3.2:
            a = gv.suave(t / 0.4) * (1 - gv.suave((t - 2.7) / 0.5))
            if a > 0:
                d = leg.destaque(rot["abertura"]).copy()
                d.putalpha(d.getchannel("A").point(lambda v: int(v * a)))
                quadro.alpha_composite(d, ((W - d.width) // 2, int(H * 0.11)))
        # chamada final
        if t >= final["inicio"]:
            a = gv.suave((t - final["inicio"]) / 0.4)
            d = leg.destaque(rot["cta"]).copy()
            d.putalpha(d.getchannel("A").point(lambda v: int(v * a)))
            quadro.alpha_composite(d, ((W - d.width) // 2, int(H * 0.11)))
        # legenda + etiqueta de quem fala
        for b in blocos:
            if b["inicio"] <= t < b["fim"]:
                tv = t - b["rel"]
                ativa = max(i for i, p in enumerate(b["palavras"]) if p["t"] <= tv or i == 0)
                li = leg.render(b["palavras"], ativa)
                pop = 1.0 + 0.12 * (1 - gv.suave((t - b["inicio"]) / 0.12))
                if pop > 1.001:
                    li = li.resize((int(li.width * pop), int(li.height * pop)), Image.BILINEAR)
                y = int(H * 0.76) - li.height // 2
                quadro.alpha_composite(li, ((W - li.width) // 2, y))
                if b["voz"] in tags:
                    tg = tags[b["voz"]]
                    quadro.alpha_composite(tg, ((W - tg.width) // 2, y - tg.height + 10))
                break
        dd = ImageDraw.Draw(quadro)
        dd.rectangle((0, H - 12, int(W * t / total), H), fill=(255, 212, 0, 255))
        if t > total - 0.6:
            quadro = Image.blend(quadro, Image.new("RGBA", (W, H), (0, 0, 0, 255)), gv.suave((t - (total - 0.6)) / 0.6))
        enc.stdin.write(quadro.convert("RGB").tobytes())
        fi += 1
        if fi % (FPS * 10) == 0:
            print(f"   {t:5.1f}s / {total:.1f}s", flush=True)
    enc.stdin.close()
    dec.wait()
    if enc.wait() != 0:
        sys.exit("ffmpeg falhou")
    print(f"Pronto: {saida}")


if __name__ == "__main__":
    main()
