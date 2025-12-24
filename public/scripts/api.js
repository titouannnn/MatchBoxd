// import { TMDB_API_KEY } from './config.js';

let idMapping = {};

/**
 * Loads the Letterboxd slug to TMDB ID mapping from a JSON file.
 * This mapping is used to quickly find TMDB IDs without searching.
 */
export async function loadIdMapping() {
    try {
        const response = await fetch('data/id_mapping.json');
        idMapping = await response.json();
    } catch (e) {
        console.error('Error loading ID mapping:', e);
    }
}

/**
 * Fetches movie images (poster, backdrop, logo) from TMDB.
 * Tries to use the ID mapping first, then falls back to search by title.
 * 
 * @param {string} slug - The Letterboxd slug of the movie.
 * @param {string} title - The title of the movie (used for search fallback).
 * @param {string} [type='poster'] - The type of display ('poster' or 'wide'). 'wide' fetches logos.
 * @returns {Promise<Object|null>} An object containing image URLs and metadata, or null if not found.
 */
export async function getMovieImageFromTMDB(slug, title, type = 'poster') {
    try {
        let movie = null;
        const tmdbId = idMapping[slug];

        // 1. Try by ID via Proxy
        if (tmdbId) {
            try {
                const response = await fetch(`/api/tmdb?type=details&id=${tmdbId}`);
                if (response.ok) {
                    movie = await response.json();
                }
            } catch (e) {
                console.warn(`Failed to fetch by ID for ${slug}:`, e);
            }
        }

        // Check if movie is valid (has image)
        const hasImage = movie && (movie.poster_path || movie.backdrop_path);

        // 2. Fallback to search via Proxy if (No ID) OR (Fetch Failed) OR (Movie found but has NO image)
        if (!movie || !hasImage) {
            // Strategy A: Search with provided title (likely contains year)
            let searchRes = await fetch(`/api/tmdb?type=search&query=${encodeURIComponent(title)}`);
            let data = await searchRes.json();
            
            if (data.results && data.results.length > 0) {
                movie = data.results[0];
            }

            // Strategy B: If still no movie, try removing the year from title (if present)
            // Example: "The Matrix (1999)" -> "The Matrix"
            if ((!movie || (!movie.poster_path && !movie.backdrop_path)) && title.match(/\(\d{4}\)$/)) {
                const cleanTitle = title.replace(/\s*\(\d{4}\)$/, '');
                searchRes = await fetch(`/api/tmdb?type=search&query=${encodeURIComponent(cleanTitle)}`);
                data = await searchRes.json();
                if (data.results && data.results.length > 0) {
                    movie = data.results[0];
                }
            }
        }

        if (movie) {
            const result = {
                id: movie.id,
                backdrop: movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : null,
                poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
                overview: movie.overview,
                release_date: movie.release_date,
                logo: null
            };

            // If we need a logo (for 'wide' type), fetch images
            if (type === 'wide') {
                try {
                    const imgRes = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null`);
                    const imgData = await imgRes.json();
                    if (imgData.logos && imgData.logos.length > 0) {
                        // Pick the first logo (usually the best rated)
                        result.logo = `https://image.tmdb.org/t/p/w300${imgData.logos[0].file_path}`;
                    }
                } catch (e) {
                    console.warn("Could not fetch logo for", title);
                }
            }
            return result;
        }
    } catch (e) {
        console.error("Error fetching image for", title, e);
    }
    return null;
}

/**
 * Fetches images for a batch of slugs using the internal API.
 * This is used to reduce the number of requests to TMDB/Letterboxd.
 * 
 * @param {string} slugs - Comma-separated list of slugs.
 * @returns {Promise<Object>} A map of slug -> image URL.
 */
export async function fetchBatchImages(slugs) {
    try {
        const res = await fetch(`/api/get-movie-image?slugs=${encodeURIComponent(slugs)}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (e) {
        console.error("Batch fetch error:", e);
    }
    return {};
}
