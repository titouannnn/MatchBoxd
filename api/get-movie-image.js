import * as cheerio from 'cheerio';

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

export default async function handler(request, response) {
    // Cache Vercel Edge : 7 jours (604800s), car les images de films changent rarement
    response.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');

    const { slug } = request.query;

    if (!slug) {
        return response.status(400).json({ error: 'Slug manquant' });
    }

    const url = `https://letterboxd.com/film/${slug}/`;

    try {
        const res = await fetch(url, { headers: HEADERS });
        
        if (res.status !== 200) {
            return response.status(404).json({ error: 'Film non trouvé sur Letterboxd' });
        }

        const html = await res.text();
        const $ = cheerio.load(html);
        
        // Extraction du script JSON-LD
        const scriptContent = $('script[type="application/ld+json"]').html();
        
        if (!scriptContent) {
             return response.status(404).json({ error: 'Métadonnées introuvables' });
        }

        // Nettoyage du CDATA pour parser le JSON
        // Le contenu ressemble à : /* <![CDATA[ */ ...json... /* ]]> */
        const jsonString = scriptContent
            .replace(/\/\* <!\[CDATA\[ \*\//, '')
            .replace(/\/\* \]\]> \*\//, '')
            .trim();

        try {
            const data = JSON.parse(jsonString);
            if (data.image) {
                return response.status(200).json({ image: data.image });
            } else {
                return response.status(404).json({ error: 'Pas d\'image dans les métadonnées' });
            }
        } catch (e) {
            return response.status(500).json({ error: 'Erreur parsing JSON-LD' });
        }

    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}