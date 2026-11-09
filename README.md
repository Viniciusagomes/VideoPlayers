# VideoPlayers — gerador automático de vídeos verticais

Gera vídeos 9:16 (Shorts / Reels / TikTok) a partir de um roteiro JSON:
narração com voz neural, legendas palavra por palavra no estilo viral, imagens com
efeito de filme antigo, trilha ambiente sintetizada e impactos graves nas viradas de cena.

Tudo gratuito: `edge-tts` (voz), acervo de imagens da NASA (domínio público), FFmpeg.

## Como usar

```bash
pip install -r requirements.txt   # precisa do ffmpeg instalado
python gerar_video.py roteiros/homem-na-lua.json
# saída: output/homem-na-lua.mp4
```

## Formato do roteiro

```json
{
  "titulo": "nome-do-arquivo",
  "voz": "pt-BR-AntonioNeural",
  "velocidade": "+15%",
  "tom": "-6Hz",
  "pausa_entre_cenas": 0.35,
  "cenas": [
    { "rotulo": "01 · TÍTULO NO TOPO", "texto": "Texto narrado.", "imagens": ["as11-40-5875"] },
    { "texto": "Chamada final.", "imagens": ["minha-foto.jpg"], "final": true }
  ]
}
```

- `imagens`: `nasa_id` do https://images.nasa.gov ou caminho de arquivo local.
  Para ajustar o enquadramento use `{"id": "...", "foco_x": 0.3}` (0 = esquerda, 1 = direita).
- `rotulo` (opcional): texto exibido no topo durante a cena.
- `final` (opcional): escurece a imagem para destacar a chamada final.
- Outras vozes masculinas: `pt-BR-AntonioNeural`; femininas: `pt-BR-FranciscaNeural`, `pt-BR-ThalitaNeural`.

## Histórias em 3D low-poly (`gerar_3d.py`)

Gera vídeos de animação 3D (personagens e cenários feitos de polígonos) com uma voz diferente para cada personagem.

```bash
cd render3d && npm install && cd ..   # three.js (o Chromium do Playwright faz o render)
python gerar_3d.py historias/alfredo-parte1.json
```

- `historias/*.json`: o roteiro. Cada fala tem `voz` (narrador, alfredo, alfredo2, alien, cleide, coro), `cena` e `texto`; opcionais: `sfx` (ufo, raio, scan) e `final`.
- `render3d/mundo.js`: o mundo 3D (cidade, nave, personagens) e as cenas/câmeras de cada `cena`.
- As vozes estão em `VOZES`, no início de `gerar_3d.py`.
