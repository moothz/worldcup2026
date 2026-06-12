const Game = require('../models/game');
const Team = require('../models/team');

module.exports = (app) => {

    // Dynamic sitemap - includes all matches for maximum SEO coverage
    app.get('/sitemap.xml', async (req, res) => {
        try {
            const teams = await Team.find({}, 'id name_en').lean();
            const games = await Game.find({}, 'id date').lean();

            const now = new Date().toISOString().split('T')[0];

            let urls = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">

  <url>
    <loc>https://wc2026.moothz.win/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="https://wc2026.moothz.win/?lang=fa"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://wc2026.moothz.win/?lang=en"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://wc2026.moothz.win/"/>
  </url>

  <url>
    <loc>https://wc2026.moothz.win/?lang=en</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="fa" href="https://wc2026.moothz.win/?lang=fa"/>
    <xhtml:link rel="alternate" hreflang="en" href="https://wc2026.moothz.win/?lang=en"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="https://wc2026.moothz.win/"/>
  </url>

  <url>
    <loc>https://wc2026.moothz.win/#matches</loc>
    <lastmod>${now}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>https://wc2026.moothz.win/#groups</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>https://wc2026.moothz.win/#teams</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>

  <url>
    <loc>https://wc2026.moothz.win/#stadiums</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;

            urls += '\n</urlset>';

            res.header('Content-Type', 'application/xml');
            res.header('Cache-Control', 'public, max-age=3600'); // 1 hour cache
            return res.send(urls);
        } catch (err) {
            // Fallback: serve static sitemap if DB fails
            const path = require('path');
            return res.sendFile(path.join(__dirname, '../public/sitemap.xml'));
        }
    });

};
