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
    const { username } = request.query;

    if (!username) {
        return response.status(400).json({ error: 'Username manquant' });
    }

    try {
        // 1. Infos Profil (Compteur Notes)
        const profileHtml = await getPage(`https://letterboxd.com/${username}/`);
        let ratingsCount = 0;
        
        if (profileHtml) {
            const $ = cheerio.load(profileHtml);
            const ratingsEl = $('section.ratings-histogram-chart a.all-link');
            if (ratingsEl.length) {
                ratingsCount = parseInt(ratingsEl.text().trim().replace(/,/g, ''), 10) || 0;
            }
        }

        // 2. Infos Watchlist (Compteur Watchlist)
        const watchlistHtml = await getPage(`https://letterboxd.com/${username}/watchlist/`);
        let watchlistCount = 0;
        if (watchlistHtml) {
            const $ = cheerio.load(watchlistHtml);
            const wlEl = $('.js-watchlist-count');
            if (wlEl.length) {
                const text = wlEl.text().trim().replace(/,/g, '').replace(/\u00a0/g, ' ');
                watchlistCount = parseInt(text.split(' ')[0], 10) || 0;
            }
        }

        // 3. Génération des URLs à scraper
        const tasks = [];

        // Pages des films notés (72 par page)
        if (ratingsCount > 0) {
            const nbPages = Math.ceil(ratingsCount / 72);
            for (let i = 1; i <= nbPages; i++) {
                tasks.push({ url: `https://letterboxd.com/${username}/films/page/${i}/`, type: 'rated' });
            }
        }

        // Pages de la watchlist (28 par page environ)
        if (watchlistCount > 0) {
            const nbPages = Math.ceil(watchlistCount / 28);
            for (let i = 1; i <= nbPages; i++) {
                tasks.push({ url: `https://letterboxd.com/${username}/watchlist/page/${i}/`, type: 'watchlist' });
            }
        }

        // 4. Exécution par lots (Batching) pour éviter de surcharger Vercel/Letterboxd
        const BATCH_SIZE = 5;
        let allFilms = [];

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
            ratings_count: ratingsCount,
            watchlist_count: watchlistCount,
            total_films_retrieved: allFilms.length,
            films: allFilms, // La liste complète des films
            source: "Vercel Serverless Function"
        });

    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}
