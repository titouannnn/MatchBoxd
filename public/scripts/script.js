import { loadModel, getRecommendations } from './recommendation.js';
import { saveToCache, getFromCache, debounce, getQuantile, formatTitle } from './utils.js';
import { loadIdMapping, getMovieImageFromTMDB, fetchBatchImages } from './api.js';
import { updateStatus, toggleLoader, initBackground } from './ui.js';
import { USER_CACHE_DURATION } from './constants.js';

let allRecommendations = [];
let imageCache = new Map();
let currentUserData = null;

// Init Image Cache
const cachedImages = getFromCache('img_cache');
if (cachedImages) {
    imageCache = new Map(Object.entries(cachedImages));
}

const saveImageCache = debounce(() => {
    saveToCache('img_cache', Object.fromEntries(imageCache));
}, 2000);

/**
 * Updates the grid of recommended movies.
 * Handles layout calculation (Bento grid), image fetching (batch & individual), and rendering.
 */
async function updateGrid() {
    const recList = document.getElementById('recommendationsList');
    const recCountInput = document.getElementById('recCount');
    const excludeWlInput = document.getElementById('excludeWatchlist');
    
    if (!recList) return;

    // Get col count (approximate if display:none, but here it should be visible)
    const gridStyle = window.getComputedStyle(recList);
    // Fallback to 1 if computation fails (e.g. hidden)
    const colCount = (gridStyle.gridTemplateColumns.split(' ').length) || 1;

    let displayList = allRecommendations;

    if (excludeWlInput && excludeWlInput.checked && currentUserData) {
        const watchlistSlugs = new Set(
            currentUserData.films
                .filter(f => f.username.startsWith('watchlist_'))
                .map(f => f.title)
        );
        
        displayList = allRecommendations.filter(m => !watchlistSlugs.has(m.slug));
    }
    
    let count = parseInt(recCountInput.value, 10);
    
    // Cap at max available
    if (count > displayList.length) count = displayList.length;
    
    const moviesToDisplay = displayList.slice(0, count);

    // --- PRE-CALCULATE LAYOUT TO KNOW WHICH IMAGE TYPE TO FETCH ---
    // All items start as 1x1 (1 cell)
    let totalCells = count;

    const remainder = totalCells % colCount;
    const missing = remainder === 0 ? 0 : colCount - remainder;
    
    // Identify indices that will be promoted to fill gaps
    // We promote items from the end of the list.
    // Indices are 0 to count-1.
    const promotedIndices = new Set();
    if (missing > 0) {
        let needed = missing;
        let i = count - 1;
        while (needed > 0 && i >= 0) {
            promotedIndices.add(i);
            needed--;
            // Try to distribute promotions if possible
            if (needed > 0 && i > 0 && i - 1 >= needed) i--; 
            i--;
        }
    }

    // --- BATCH FETCHING LOGIC ---
    // 1. Identify missing slugs
    const slugsToFetch = [];
    moviesToDisplay.forEach(item => {
        if (!imageCache.has(item.slug)) {
            slugsToFetch.push(item.slug);
        }
    });

    // 2. Fetch in batches of 50
    if (slugsToFetch.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < slugsToFetch.length; i += BATCH_SIZE) {
            const batch = slugsToFetch.slice(i, i + BATCH_SIZE);
            const slugsParam = batch.join(',');
            
            const results = await fetchBatchImages(slugsParam);
            
            // Update Cache
            Object.entries(results).forEach(([slug, imgUrl]) => {
                const title = formatTitle(slug);
                imageCache.set(slug, { 
                    title: title, 
                    poster: imgUrl,
                    backdrop: null, 
                    logo: null 
                });
            });
            saveImageCache();
        }
    }

    // Fetch images (with cache)
    const moviesWithImages = await Promise.all(moviesToDisplay.map(async (item, index) => {
        const slug = item.slug;
        const score = item.score;
        const rank = index + 1;
        let type = 'poster'; // Default
        
        // Check if promoted
        if (promotedIndices.has(index)) {
            type = 'wide';
        }
        
        let cached = imageCache.get(slug);
        
        // If image is in cache, use it
        if (cached) {
            return { ...cached, slug, rank, type, score };
        }
        
        // Fallback: If batch failed for this movie, try individual fetch
        const title = formatTitle(slug);
        const imgData = await getMovieImageFromTMDB(slug, title, type);
        const data = { title, ...imgData };
        imageCache.set(slug, data);
        saveImageCache();
        return { ...data, slug, rank, type, score };
    }));

    recList.innerHTML = ''; // Clear list

    // Render
    moviesWithImages.forEach((movie) => {
        const card = document.createElement('a');
        card.href = `https://letterboxd.com/film/${movie.slug}/`;
        card.target = '_blank';
        
        let bentoClass = 'bento-item';
        if (movie.type === 'wide') {
            bentoClass += ' bento-medium'; // Promoted to 2x1
        } else {
            bentoClass += ' bento-small'; // Standard 1x1
        }

        card.className = `movie-card ${bentoClass}`;
        
        // Set background image
        let bgImage = null;

        if (movie.type === 'wide') {
             bgImage = movie.backdrop || movie.poster;
        } else {
             bgImage = movie.poster || movie.backdrop;
        }

        let logoHtml = '';
        if (movie.type === 'wide' && movie.logo) {
            logoHtml = `<img src="${movie.logo}" class="movie-logo" alt="${movie.title} Logo">`;
        }

        card.innerHTML = `
           <div class="poster-container" style="background-image: url('${bgImage || ''}'); background-size: cover; background-position: center;">
                ${logoHtml}
                <div class="match-score">
                    ${movie.score}%
                    <div class="score-tooltip">Relevance score based on your tastes</div>
                </div>
                <div class="rank">#${movie.rank}</div>
                <div class="shine-effect"></div>
            </div>
           <div class="movie-title">${movie.title}</div>
        `;
        
        // Click handler for score (Mobile)
        const badge = card.querySelector('.match-score');
        if (badge) {
            badge.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                badge.classList.toggle('active');
                // Auto-hide after 3s
                setTimeout(() => badge.classList.remove('active'), 3000);
            });
        }

        recList.appendChild(card);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    initBackground();
    loadIdMapping();

    // Navigation Logic
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.getElementById('engine-view').classList.add('hidden');
            document.getElementById('how-it-works').classList.add('hidden');

            const targetId = btn.dataset.target;
            document.getElementById(targetId).classList.remove('hidden');

            const bg = document.getElementById('background-posters');
            if (targetId === 'how-it-works') {
                bg.style.display = 'none';
                if (!document.getElementById('MathJax-script')) {
                    const script = document.createElement('script');
                    script.id = 'MathJax-script';
                    script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js';
                    script.async = true;
                    document.head.appendChild(script);
                }
            } else {
                bg.style.display = 'flex';
            }
        });
    });
    
    // UI Elements
    const fetchBtn = document.getElementById('fetchBtn');
    const usernameInput = document.getElementById('username');
    
    const examples = ['titouannnnnn', 'regelegorila', 'julieplhs', 'eliotgoarin', 'leo1507'];
    const randomExample = examples[Math.floor(Math.random() * examples.length)];
    usernameInput.placeholder = `ex: ${randomExample}`;
    usernameInput.value = '';

    const popInput = document.getElementById('popFactor');
    const ratingPowerInput = document.getElementById('ratingPower');
    const recCountInput = document.getElementById('recCount');
    const excludeWlInput = document.getElementById('excludeWatchlist');
    
    const popVal = document.getElementById('popVal');
    const ratingPowerVal = document.getElementById('ratingPowerVal');
    const recCountVal = document.getElementById('recCountVal');
    const recList = document.getElementById('recommendationsList');
    const statsDisplay = document.getElementById('statsDisplay');

    const getLabel = (id, val) => {
        val = parseFloat(val);
        if (id === 'popFactor') {
            if (val < 0.3) return "Indie";
            if (val > 0.7) return "Blockbuster";
            return "Balanced";
        }
        if (id === 'ratingPower') {
            if (val < 2.0) return "All Likes";
            if (val > 4.0) return "Masterpieces Only";
            return "Balanced";
        }
        return "";
    };

    const updateDisplay = (input, displayEl, id) => {
        const val = input.value;
        const label = getLabel(id, val);
        displayEl.textContent = label ? `${val} (${label})` : val;
    };

    updateDisplay(popInput, popVal, 'popFactor');
    updateDisplay(ratingPowerInput, ratingPowerVal, 'ratingPower');
    
    recCountInput.value = 30;
    recCountVal.textContent = recCountInput.value;

    popInput.addEventListener('input', (e) => updateDisplay(e.target, popVal, 'popFactor'));
    ratingPowerInput.addEventListener('input', (e) => updateDisplay(e.target, ratingPowerVal, 'ratingPower'));
    recCountInput.addEventListener('input', (e) => recCountVal.textContent = e.target.value);
    
    usernameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            fetchBtn.click();
        }
    });

    updateStatus("Loading AI model...");
    const modelLoaded = await loadModel();
    if (modelLoaded) {
        updateStatus("Model loaded. Ready.");
    } else {
        updateStatus("Error loading model.", true);
        fetchBtn.disabled = true;
    }

    async function processAndRecommend() {
        if (!currentUserData) return;

        toggleLoader(true);
        updateStatus("Computing recommendations...");
        recList.innerHTML = '';
        statsDisplay.textContent = '';

        try {
            const ratedFilms = currentUserData.films.filter(f => f.rating !== null);
            const watchedFilms = currentUserData.films.filter(f => !f.username.startsWith('watchlist_'));
            
            if (ratedFilms.length === 0) {
                throw new Error("This profile hasn't rated any films.");
            }

            const allRatings = ratedFilms.map(f => f.rating);
            let percentile = 0.95;
            let threshold = getQuantile(allRatings, percentile);

            let likedMovies = ratedFilms
                .filter(f => f.rating >= threshold)
                .map(f => ({ title: f.title, rating: f.rating }));

            while (likedMovies.length < 10 && percentile > 0.05) {
                percentile -= 0.05;
                threshold = getQuantile(allRatings, percentile);
                likedMovies = ratedFilms
                    .filter(f => f.rating >= threshold)
                    .map(f => ({ title: f.title, rating: f.rating }));
            }

            let excludeTitles = new Set();
            watchedFilms.forEach(f => excludeTitles.add(f.title));

            const rawPop = parseFloat(popInput.value);
            const popFactor = (rawPop * 1.2) - 0.2;
            const alpha = 5.0 * (1.0 - rawPop);
            const ratingPower = parseFloat(ratingPowerInput.value);
            const useNegatives = false;

            allRecommendations = getRecommendations(
                likedMovies, 
                Array.from(excludeTitles), 
                alpha, 
                popFactor,
                ratingPower,
                useNegatives
            );

            updateStatus(`Found ${allRecommendations.length} matches. Fetching posters...`);
            
            statsDisplay.innerHTML = `
                <small>
                    Based on ${likedMovies.length} films (Rating ≥ ${threshold.toFixed(1)})<br>
                    ${excludeTitles.size} films excluded
                </small>
            `;

            if (allRecommendations.length === 0) {
                recList.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No recommendations found (too many filters?)</p>';
                toggleLoader(false);
                return;
            }

            await updateGrid();
            toggleLoader(false);
            updateStatus(`Done!`);
            recList.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            toggleLoader(false);
            updateStatus("Error: " + err.message, true);
            console.error(err);
        }
    }

    fetchBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) return;

        if (fetchBtn.disabled) return;
        fetchBtn.disabled = true;
        usernameInput.disabled = true;

        toggleLoader(true);
        document.getElementById('results-area').scrollIntoView({ behavior: 'smooth', block: 'start' });

        updateStatus(`Analyzing profile of ${username}...`);
        recList.innerHTML = '';
        statsDisplay.textContent = '';

        try {
            let data = getFromCache('user_' + username, USER_CACHE_DURATION);
            
            if (!data) {
                console.log('[Edge Request] Fetching user data from /api/scrape');
                const res = await fetch(`/api/scrape?username=${username}`);
                data = await res.json();
                
                if (data.films && data.films.length > 0) {
                    saveToCache('user_' + username, data);
                }
            } else {
                console.log("Using cached user data");
            }

            if (!data.films || data.films.length === 0) {
                throw new Error("No films found or private profile.");
            }
            
            currentUserData = data;
            await processAndRecommend();

        } catch (err) {
            toggleLoader(false);
            updateStatus("Error: " + err.message, true);
            console.error(err);
        } finally {
            fetchBtn.disabled = false;
            usernameInput.disabled = false;
        }
    });

    excludeWlInput.addEventListener('change', () => {
        if (allRecommendations.length > 0) {
            updateGrid();
        }
    });

    let lastWidth = window.innerWidth;
    window.addEventListener('resize', debounce(() => {
        const currentWidth = window.innerWidth;
        if (currentWidth !== lastWidth) {
            lastWidth = currentWidth;
            initBackground();
            if (allRecommendations.length > 0) updateGrid();
        }
    }, 200));

    recCountInput.addEventListener('change', () => {
        if (allRecommendations.length > 0) updateGrid();
    });
});
