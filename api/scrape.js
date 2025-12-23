// import * as cheerio from 'cheerio'; // Removed to save CPU

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

async function getPage(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.status === 200) return await res.text();
        return null;
    } catch (e) {
        console.error(`Erreur fetch ${url}:`, e);
        return null;
    }
}

function parseFilms(html, username, isWatchlist = false) {
    if (!html) return [];
    const films = [];
    
    // Optimized: Use String.split and Regex instead of Cheerio
    // This avoids building the DOM tree for thousands of elements
    const items = html.split('<li class="griditem');
    
    // Skip the first chunk (header/nav before first item)
    for (let i = 1; i < items.length; i++) {
        const chunk = items[i];
        
        // Extract ID and Slug
        const idMatch = chunk.match(/data-film-id="(\d+)"/);
        const slugMatch = chunk.match(/data-item-slug="([^"]+)"/);
        
        if (idMatch && slugMatch) {
            const movieId = parseInt(idMatch[1], 10);
            const title = slugMatch[1];
            let rating = null;
            
            // Extract Rating (only if not watchlist, usually)
            // Look for 'rated-X' class
            const rateMatch = chunk.match(/rated-(\d+)/);
            if (rateMatch) {
                rating = parseInt(rateMatch[1], 10) / 2;
            }
            
            films.push({
                username: isWatchlist ? `watchlist_${username}` : username,
                movie_id: movieId,
                title: title,
                rating: rating
            });
        }
    }
    return films;
}

export default async function handler(request, response) {
    console.log('[Edge Request] Executing api/scrape');
    // Cache Vercel Edge : 24h (86400s) en cache partagé, revalidation en arrière-plan autorisée
    response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');

    const { username } = request.query;

    if (!username) {
        return response.status(400).json({ error: 'Username manquant' });
    }

    try {
        const tasks = [];
        let allFilms = [];
        let watchedCount = 0;
        let watchlistCount = 0;

        // 1. Films Watched (Page 1)
        const filmsHtml = await getPage(`https://letterboxd.com/${username}/films/`);
        if (filmsHtml) {
            // Parse Page 1
            const page1Films = parseFilms(filmsHtml, username, false);
            allFilms.push(...page1Films);

            // Get Count from tooltip (e.g. "153 films")
            // Optimized: Regex instead of Cheerio
            // <span class="tooltip" title="1,543 films">
            // Fix: Handle &nbsp; entity in title
            const tooltipMatch = filmsHtml.match(/class="tooltip"[^>]*title="(.+?)films"/);
            if (tooltipMatch) {
                const countStr = tooltipMatch[1]
                    .replace(/,/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\u00a0/g, ' ')
                    .trim();
                watchedCount = parseInt(countStr, 10);
            } else {
                watchedCount = page1Films.length;
            }

            // Generate tasks for remaining pages (72 films per page)
            if (watchedCount > 72) {
                const nbPages = Math.ceil(watchedCount / 72);
                for (let i = 2; i <= nbPages; i++) {
                    tasks.push({ url: `https://letterboxd.com/${username}/films/page/${i}/`, type: 'watched' });
                }
            }
        }

        // 2. Watchlist (Page 1)
        const watchlistHtml = await getPage(`https://letterboxd.com/${username}/watchlist/`);
        if (watchlistHtml) {
            // Parse Page 1
            const page1Watchlist = parseFilms(watchlistHtml, username, true);
            allFilms.push(...page1Watchlist);

            // Get Count
            // <span class="js-watchlist-count">123</span>
            const wlMatch = watchlistHtml.match(/class="[^"]*js-watchlist-count[^"]*">([^<]+)</);
            if (wlMatch) {
                const countStr = wlMatch[1]
                    .replace(/,/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\u00a0/g, ' ')
                    .trim();
                watchlistCount = parseInt(countStr, 10) || 0;
            } else {
                watchlistCount = page1Watchlist.length;
            }

            // Generate tasks for remaining pages (28 films per page)
            if (watchlistCount > 28) {
                const nbPages = Math.ceil(watchlistCount / 28);
                for (let i = 2; i <= nbPages; i++) {
                    tasks.push({ url: `https://letterboxd.com/${username}/watchlist/page/${i}/`, type: 'watchlist' });
                }
            }
        }

        // 3. Execute remaining tasks
        const BATCH_SIZE = 5;
        for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
            const batch = tasks.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(async (task) => {
                const html = await getPage(task.url);
                return parseFilms(html, username, task.type === 'watchlist');
            }));
            results.forEach(films => allFilms.push(...films));
        }

        return response.status(200).json({
            username: username,
            watched_count: watchedCount,
            watchlist_count: watchlistCount,
            total_films_retrieved: allFilms.length,
            films: allFilms,
            source: "Vercel Serverless Function (Optimized)"
        });

    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}
