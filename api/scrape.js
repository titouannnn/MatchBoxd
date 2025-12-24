const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

/**
 * Fetches the HTML content of a URL.
 * 
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string|null>} The HTML content, or null if the request failed.
 */
async function getPage(url) {
    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.status === 200) return await res.text();
        return null;
    } catch (e) {
        console.error(`Error fetching ${url}:`, e);
        return null;
    }
}

/**
 * Parses the HTML of a Letterboxd page to extract film data.
 * Uses Regex and String splitting for performance instead of a DOM parser.
 * 
 * @param {string} html - The HTML content of the page.
 * @param {string} username - The username associated with the films.
 * @param {boolean} [isWatchlist=false] - Whether the films are from the watchlist.
 * @returns {Array<Object>} An array of film objects containing username, movie_id, title, and rating.
 */
function parseFilms(html, username, isWatchlist = false) {
    if (!html) return [];
    const films = [];
    
    // Split HTML by grid items to avoid full DOM parsing
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
            // Look for 'rated-X' class where X is rating * 2
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

/**
 * Vercel Serverless Function to scrape Letterboxd user data.
 * Retrieves watched films and watchlist for a given username.
 * Handles pagination and concurrent requests.
 * 
 * @param {Object} request - The HTTP request object.
 * @param {Object} response - The HTTP response object.
 */
export default async function handler(request, response) {
    // Polyfill for performance.now()
    const now = (typeof performance !== 'undefined' && performance.now) 
        ? () => performance.now() 
        : () => Date.now();

    const start = now();
    
    try {
        // Cache for 24h (86400s)
        response.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=43200');

        const { username } = request.query;

        if (!username) {
            return response.status(400).json({ error: 'Missing username' });
        }

        const tasks = [];
        let allFilms = [];
        let watchedCount = 0;
        let watchlistCount = 0;
        let cpuTime = 0; 

        // 1. Films Watched (Page 1)
        const filmsHtml = await getPage(`https://letterboxd.com/${username}/films/`);
        if (filmsHtml) {
            const tCpuStart = now();
            // Parse Page 1
            const page1Films = parseFilms(filmsHtml, username, false);
            allFilms.push(...page1Films);

            // Get Count from tooltip (e.g. "1,543 films")
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
            cpuTime += (now() - tCpuStart);

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
            const tCpuStart = now();
            // Parse Page 1
            const page1Watchlist = parseFilms(watchlistHtml, username, true);
            allFilms.push(...page1Watchlist);

            // Get Count
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
            cpuTime += (now() - tCpuStart);

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
                const tCpuStart = now();
                const res = parseFilms(html, username, task.type === 'watchlist');
                cpuTime += (now() - tCpuStart);
                return res;
            }));
            results.forEach(films => allFilms.push(...films));
        }

        const end = now();
        const totalDuration = end - start;
        const netDuration = totalDuration - cpuTime;
        
        response.setHeader('Server-Timing', `cpu;dur=${cpuTime.toFixed(2)};desc="Billable CPU", net;dur=${netDuration.toFixed(2)};desc="Network Wait"`);

        return response.status(200).json({
            username: username,
            watched_count: watchedCount,
            watchlist_count: watchlistCount,
            total_films_retrieved: allFilms.length,
            films: allFilms,
            source: "Vercel Serverless Function"
        });

    } catch (error) {
        console.error('[CRITICAL ERROR] api/scrape failed:', error);
        return response.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}
