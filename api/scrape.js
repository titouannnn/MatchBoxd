import * as cheerio from 'cheerio';

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
    const $ = cheerio.load(html);
    const res = [];

    $('li.griditem').each((_, el) => {
        const $el = $(el);
        const $div = $el.find('div[data-film-id]');
        const $rate = $el.find('.rating');

        if ($div.length) {
            let rVal = null;
            if ($rate.length) {
                const classes = $rate.attr('class').split(/\s+/);
                const ratingClass = classes.find(c => c.startsWith('rated-'));
                if (ratingClass) {
                    rVal = parseInt(ratingClass.split('-')[1], 10) / 2;
                }
            }

            res.push({
                username: isWatchlist ? `watchlist_${username}` : username,
                movie_id: parseInt($div.attr('data-film-id'), 10),
                title: $div.attr('data-item-slug'),
                rating: rVal
            });
        }
    });
    return res;
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
        // On récupère la première page des films vus pour avoir le total et les premiers films
        const filmsHtml = await getPage(`https://letterboxd.com/${username}/films/`);
        if (filmsHtml) {
            const $ = cheerio.load(filmsHtml);
            
            // Parse Page 1
            const page1Films = parseFilms(filmsHtml, username, false);
            allFilms.push(...page1Films);

            // Get Count from tooltip (e.g. "153 films")
            const tooltipText = $('.section-heading .tooltip').attr('title');
            if (tooltipText) {
                const match = tooltipText.replace(/,/g, '').replace(/\u00a0/g, ' ').match(/(\d+)/);
                if (match) watchedCount = parseInt(match[1], 10);
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
            const $ = cheerio.load(watchlistHtml);
            
            // Parse Page 1
            const page1Watchlist = parseFilms(watchlistHtml, username, true);
            allFilms.push(...page1Watchlist);

            // Get Count
            const wlEl = $('.js-watchlist-count');
            if (wlEl.length) {
                const text = wlEl.text().trim().replace(/,/g, '').replace(/\u00a0/g, ' ');
                watchlistCount = parseInt(text.split(' ')[0], 10) || 0;
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
            source: "Vercel Serverless Function"
        });

    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}
