const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

/**
 * Fetches the movie image URL from Letterboxd by parsing the JSON-LD data embedded in the page.
 * Uses Regex instead of a DOM parser for performance.
 * 
 * @param {string} slug - The Letterboxd slug of the movie.
 * @returns {Promise<string|null>} The URL of the movie image, or null if not found.
 */
async function fetchImage(slug) {
    const url = `https://letterboxd.com/film/${slug}/`;
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.status !== 200) return null;
        
        const html = await res.text();
        
        // Extract JSON-LD using Regex to avoid heavy DOM parsing
        const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
        if (!match) return null;

        const jsonString = match[1]
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

/**
 * Vercel Serverless Function to retrieve movie images.
 * Supports single slug or batch retrieval via comma-separated 'slugs' query parameter.
 * 
 * @param {Object} request - The HTTP request object.
 * @param {Object} response - The HTTP response object.
 */
export default async function handler(request, response) {
    // Cache for 7 days (604800s) as movie images rarely change
    response.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=86400');

    const { slug, slugs } = request.query;

    // Batch Mode
    if (slugs) {
        const slugList = slugs.split(',').map(s => s.trim()).filter(s => s);
        // Limit to 50 items to manage execution time
        const limitedList = slugList.slice(0, 50); 
        
        const results = {};
        // Process in chunks of 5 to be polite to the upstream server
        const CHUNK_SIZE = 5;
        
        for (let i = 0; i < limitedList.length; i += CHUNK_SIZE) {
            const chunk = limitedList.slice(i, i + CHUNK_SIZE);
            await Promise.all(chunk.map(async (s) => {
                const img = await fetchImage(s);
                if (img) results[s] = img;
            }));
        }
        
        return response.status(200).json(results);
    }

    if (!slug) {
        return response.status(400).json({ error: 'Missing slug' });
    }

    const image = await fetchImage(slug);
    if (image) {
        return response.status(200).json({ image });
    } else {
        return response.status(404).json({ error: 'Image not found' });
    }
}
