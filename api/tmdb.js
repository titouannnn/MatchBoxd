export default async function handler(request, response) {
    // API Key moved to server-side
    // In a real production environment, use process.env.TMDB_API_KEY
    const TMDB_API_KEY = process.env.TMDB_API_KEY || 'a5db7f3a5dc66cfe90bd039848c8a7ec';
    
    const { type, id, query } = request.query;

    if (!type) {
        return response.status(400).json({ error: 'Missing type parameter' });
    }

    let url = '';
    
    // Construct TMDB URL based on request type
    if (type === 'details' && id) {
        url = `https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_API_KEY}`;
    } else if (type === 'search' && query) {
        url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
    } else {
        return response.status(400).json({ error: 'Invalid parameters or missing required fields' });
    }

    try {
        const tmdbRes = await fetch(url);
        
        if (!tmdbRes.ok) {
            return response.status(tmdbRes.status).json({ error: 'TMDB Error' });
        }

        const data = await tmdbRes.json();
        
        // Cache the response to reduce API calls
        // Cache for 1 hour (3600s), allow stale for 24h
        response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        
        return response.status(200).json(data);
    } catch (error) {
        console.error('TMDB Proxy Error:', error);
        return response.status(500).json({ error: 'Internal Server Error' });
    }
}
