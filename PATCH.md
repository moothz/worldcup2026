# PATCH.md — Modificações locais pós-pull

Este documento descreve as alterações feitas **localmente** no repositório
`worldcup2026` (fork do [rezarahiminia/worldcup2026](https://github.com/rezarahiminia/worldcup2026))
para adaptá-lo ao servidor **citadel** (`wc2026.moothz.win`).

Toda alteração é **revertida por `git checkout -- .`** e reaplicada pelo script
`~/worldcup2026-patch.py` — sem conflitos com o upstream.

---

## O que foi modificado

### 1. Domínio — `wc2026.moothz.win`

Substituído `worldcup26.ir` por `wc2026.moothz.win` em **7 arquivos**:

| Arquivo | O quê mudou |
|---------|-------------|
| `README.md` | URLs de exemplo, badges, links |
| `public/sitemap.xml` | URLs do sitemap |
| `public/robots.txt` | Sitemap URL |
| `swagger.js` | Servidores OpenAPI (`development` + `production`) |
| `controllers/seoController.js` | Sitemap dinâmico |
| `public/index.html` | Meta tags, canonical, JSON-LD, Open Graph |
| `index.js` | Canonical URL no handler de idioma |

### 2. Endpoints `/donate` — removidos

O arquivo `controllers/donationController.js` foi **substituído por um no-op**.
Ele não registra mais nenhuma rota, e o `swagger-jsdoc` não encontra JSDoc de
donate, então a categoria **Donation** sumiu do Swagger.

**Endpoints removidos:**
- `POST /donate/create`
- `POST /donate/ipn`
- `GET /donate/status/{orderId}`
- `GET /donate/recent`
- `GET /donate/currencies`

### 3. Landing page `/` — removida

O handler `app.get('/')` em `index.js` foi substituído por um JSON simples
com info da API. O arquivo `public/index.html` foi deletado para evitar que o
`express.static` o sirva antes do handler.

```json
{
  "name": "FIFA World Cup 2026 API",
  "version": "1.0.5",
  "docs": "/api-docs",
  "endpoints": { ... }
}
```

### 4. Seção donate no HTML — removida

- Link de navegação `#donate` removido
- Bloco `<!-- Donate Section -->` até `</section>` removido
- Todas as entradas i18n relacionadas a donate removidas (fa + en)

### 5. Arquivos auxiliares — removidos

- `test-donate.js` deletado

---

## Fluxo pós-pull

Sempre que der `git pull` no repositório:

```bash
cd /home/moothz/worldcup2026
git pull
python3 ~/worldcup2026-patch.py
pm2 restart worldcup2026
```

O script `~/worldcup2026-patch.py`:

1. Substitui `worldcup26.ir` → `wc2026.moothz.win` em todos os arquivos
2. Neutraliza `controllers/donationController.js` (no-op)
3. Remove seção donate + i18n do HTML
4. Substitui landing `/` por JSON + deleta `public/index.html`
5. Remove `test-donate.js`

> ⚠️ O script é **idempotente** — pode rodar quantas vezes quiser sem efeito
> colateral. Se um arquivo já estava modificado, ele simplesmente ignora.

---

## Resumo do diff

```diff
 9 files changed, 54 insertions(+), 3154 deletions(-)

 README.md                         |  22 +--
 controllers/donationController.js | 474 +-----------------------------
 controllers/seoController.js      |  24 +--
 index.js                          |  63 +---
 public/index.html                 |  2554 -----------------------------
 public/robots.txt                 |   2 +-
 public/sitemap.xml                |  24 +--
 swagger.js                        |   4 +-
 test-donate.js                    |  41 --
```

---

## Revertendo

Para voltar ao estado original do upstream:

```bash
cd /home/moothz/worldcup2026
git checkout -- .
# Arquivos deletados (test-donate.js, public/index.html) precisam ser
# restaurados via git:
git checkout -- test-donate.js public/index.html
pm2 restart worldcup2026
```