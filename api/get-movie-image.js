import * as cheerio from 'cheerio';

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

async function fetchImage(slug) {
    const url = `https://letterboxd.com/film/${slug}/`;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.status !== 200) return null;
        
        const html = await res.text();
        const $ = cheerio.load(html);
        
        const scriptContent = $('script[type="application/ld+json"]').html();
        if (!scriptContent) return null;

        const jsonString = scriptContent
            .replace(/\/\* <!\[CDATA\[ \*\//, '')
            .replace(/\/\* \]\]> \*\//, '')
            .trim();

        const data = JSON.parse(jsonString);
        return data.image || null;
    } catch (e) {
        console.error(`Error fetching ${slug}:`, e);
        return null;
    }
}

export default async function handler(request, response) {
    // Cache Vercel Edge : 7 jours (604800s), car les images de films changent rarement
    response.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');

    const { slug, slugs } = request.query;

    // Mode Batch
    if (slugs) {
        const slugList = slugs.split(',').map(s => s.trim()).filter(s => s);
        // Limite de sécurité pour éviter le timeout Vercel (max 10 en parallèle)
        const limitedList = slugList.slice(0, 10); 
        
        const results = {};
        await Promise.all(limitedList.map(async (s) => {
            const img = await fetchImage(s);
            if (img) results[s] = img;
        }));
        
        return response.status(200).json(results);
    }

    if (!slug) {
        return response.status(400).json({ error: 'Slug manquant' });
    }

    const image = await fetchImage(slug);
    if (image) {
        return response.status(200).json({ image });
    } else {
        return response.status(404).json({ error: 'Image non trouvée' });
    }
}