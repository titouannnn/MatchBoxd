import { loadModel, getRecommendations } from './recommendation.js';
import { TMDB_API_KEY } from './config.js';

let allRecommendations = [];
let imageCache = new Map();
let resizeTimeout;
let currentUserData = null; // Store fetched data for re-use
let idMapping = {}; // Store slug -> tmdb_id mapping

// --- UI Helpers ---
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function updateStatus(msg, isError = false) {
    const el = document.getElementById('statusText');
    el.textContent = msg;
    el.style.color = isError ? '#ff4444' : '#9ab';
}

function toggleLoader(show) {
    const loader = document.getElementById('loader');
    const results = document.getElementById('results-area');
    if (show) {
        loader.classList.remove('hidden');
        results.classList.remove('hidden');
        document.getElementById('recommendationsList').innerHTML = '';
    } else {
        loader.classList.add('hidden');
    }
}

function getQuantile(array, percentile) {
    if (array.length === 0) return 0;
    const sorted = [...array].sort((a, b) => a - b);
    const index = (sorted.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function formatTitle(slug) {
    if (!slug) return "";
    const parts = slug.split('-');
    let formattedParts = [];
    
    parts.forEach((part, index) => {
        if (index === parts.length - 1 && /^\d{4}$/.test(part)) {
            formattedParts.push(`(${part})`);
        } else {
            formattedParts.push(part.charAt(0).toUpperCase() + part.slice(1));
        }
    });
    
    return formattedParts.join(' ');
}

const POSTERS = [
    "12-years-a-slave.jpg", "1917.jpg", "a-clockwork-orange.jpg", "after-hours.jpg", "akira.jpg",
    "anatomy-of-a-fall.jpg", "apollo-13.jpg", "arrival-2016.jpg", "asterix-obelix-mission-cleopatra.jpg",
    "autumn-sonata.jpg", "barry-lyndon.jpg", "before-midnight.jpg", "before-sunrise.jpg", "before-sunset.jpg",
    "black-swan.jpg", "blade-runner-2049.jpg", "boogie-nights.jpg", "carlitos-way.jpg", "casino.jpg",
    "castle-in-the-sky.jpg", "chainsaw-man-the-movie-reze-arc.jpg", "children-of-men.jpg", "chungking-express.jpg",
    "conclave.jpg", "dead-poets-society.jpg", "decision-to-leave.jpg", "django-unchained.jpg", "dreams.jpg",
    "dune-part-two.jpg", "everything-everywhere-all-at-once.jpg", "eyes-wide-shut.jpg", "f1.jpg", "fight-club.jpg",
    "forrest-gump.jpg", "free-solo.jpg", "ghost-in-the-shell.jpg", "gladiator-2000.jpg", "gone-girl.jpg",
    "good-will-hunting.jpg", "goodfellas.jpg", "green-book.jpg", "harakiri.jpg", "heat-1995.jpg",
    "howls-moving-castle.jpg", "incendies.jpg", "inception.jpg", "inglourious-basterds.jpg", "interstellar.jpg",
    "kikis-delivery-service.jpg", "kill-bill-vol-1.jpg", "la-haine.jpg", "lawrence-of-arabia.jpg", "le-samourai.jpg",
    "leon-the-professional.jpg", "memento.jpg", "memories-of-murder.jpg", "memories.jpg", "million-dollar-baby.jpg",
    "mulholland-drive.jpg", "my-neighbor-totoro.jpg", "neon-genesis-evangelion-the-end-of-evangelion.jpg",
    "nightcrawler.jpg", "no-country-for-old-men.jpg", "oldboy.jpg", "one-battle-after-another.jpg",
    "one-flew-over-the-cuckoos-nest.jpg", "oss-117-cairo-nest-of-spies.jpg", "oss-117-lost-in-rio.jpg",
    "paprika-2006.jpg", "parasite-2019.jpg", "past-lives.jpg", "perfect-blue.jpg", "phantom-thread.jpg",
    "porco-rosso.jpg", "pretty-woman.jpg", "princess-mononoke.jpg", "prisoners.jpg", "pulp-fiction.jpg",
    "scarface-1983.jpg", "se7en.jpg", "shutter-island.jpg", "sicario-2015.jpg", "skyfall.jpg", "spirited-away.jpg",
    "spotlight.jpg", "stalker.jpg", "star-wars-episode-iii-revenge-of-the-sith.jpg", "star-wars.jpg",
    "taxi-driver.jpg", "the-apartment.jpg", "the-artist.jpg", "the-celebration.jpg", "the-dark-knight.jpg",
    "the-departed.jpg", "the-empire-strikes-back.jpg", "the-godfather-part-ii.jpg", "the-godfather.jpg",
    "the-grand-budapest-hotel.jpg", "the-handmaiden.jpg", "the-hateful-eight.jpg", "the-holdovers.jpg",
    "the-lives-of-others.jpg", "the-phoenician-scheme.jpg", "the-prestige.jpg", "the-shawshank-redemption.jpg",
    "the-social-network.jpg", "the-summit-of-the-gods.jpg", "the-usual-suspects.jpg", "the-wolf-of-wall-street.jpg",
    "there-will-be-blood.jpg", "tokyo-godfathers.jpg", "trainspotting.jpg", "v-for-vendetta.jpg",
    "whiplash-2014.jpg", "your-name.jpg", "zodiac.jpg"
];

// Fisher-Yates Shuffle pour mélange parfait
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    // Copie pour ne pas modifier l'original si besoin
    const deck = [...array];

    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [deck[currentIndex], deck[randomIndex]] = [deck[randomIndex], deck[currentIndex]];
    }
    return deck;
}

async function loadIdMapping() {
    try {
        const response = await fetch('data/id_mapping.json');
        idMapping = await response.json();
        console.log('ID Mapping loaded:', Object.keys(idMapping).length, 'entries');
    } catch (e) {
        console.error('Error loading ID mapping:', e);
    }
}

function initBackground() {
    const container = document.getElementById('background-posters');
    if (!container) return;
    container.innerHTML = ''; // Reset pour éviter accumulation

    // Configuration
    const isMobile = window.innerWidth < 768;
    const posterWidth = isMobile ? 80 : 140; 
    const gap = 15;
    const colWidth = posterWidth + gap;
    const screenWidth = window.innerWidth;
    const colCount = Math.ceil(screenWidth / colWidth) + 1; 

    // Deck global pour éviter les doublons sur l'écran
    let globalDeck = shuffle(POSTERS);

    for (let i = 0; i < colCount; i++) {
        const column = document.createElement('div');
        column.className = 'poster-column';
        
        // Vitesse très lente et fluide
        const duration = 60 + Math.random() * 60; // 60s à 120s
        column.style.animationDuration = `${duration}s`;
        
        // Décalage aléatoire
        const startOffset = Math.random() * -100;
        column.style.animationDelay = `${startOffset}s`;

        // Remplissage : 6 images uniques par set (suffisant pour > 60vh)
        const imagesPerSet = 6; 
        const setImages = [];

        for(let k=0; k<imagesPerSet; k++) {
            if (globalDeck.length === 0) {
                // Si le deck est vide, on le recharge et remélange
                globalDeck = shuffle(POSTERS);
            }
            setImages.push(globalDeck.pop());
        }

        // Duplication pour la boucle infinie (Set A + Set A)
        [...setImages, ...setImages].forEach(posterFile => {
            const img = document.createElement('img');
            img.src = `data/posters/${posterFile}`;
            img.className = 'bg-poster';
            img.alt = ""; // Decorative image
            // Pas de lazy loading pour éviter le "pop" visuel lors de la boucle
            column.appendChild(img);
        });

        container.appendChild(column);
    }
}

async function getMovieImage(slug, title, type = 'poster') {
    try {
        let movie = null;
        const tmdbId = idMapping[slug];

        // 1. Try by ID
        if (tmdbId) {
            try {
                const response = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}`);
                if (response.ok) {
                    movie = await response.json();
                }
            } catch (e) {
                console.warn(`Failed to fetch by ID for ${slug}:`, e);
            }
        }

        // Check if movie is valid (has image)
        const hasImage = movie && (movie.poster_path || movie.backdrop_path);

        // 2. Fallback to search if (No ID) OR (Fetch Failed) OR (Movie found but has NO image)
        if (!movie || !hasImage) {
            console.log(`Fallback to search for ${title} (${slug})`);
            
            // Strategy A: Search with provided title (likely contains year)
            let searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`);
            let data = await searchRes.json();
            
            if (data.results && data.results.length > 0) {
                movie = data.results[0];
            }

            // Strategy B: If still no movie, try removing the year from title (if present)
            // Example: "The Matrix (1999)" -> "The Matrix"
            if ((!movie || (!movie.poster_path && !movie.backdrop_path)) && title.match(/\(\d{4}\)$/)) {
                const cleanTitle = title.replace(/\s*\(\d{4}\)$/, '');
                console.log(`Second fallback: searching for "${cleanTitle}"`);
                searchRes = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}`);
                data = await searchRes.json();
                if (data.results && data.results.length > 0) {
                    movie = data.results[0];
                }
            }
        }

        // Check if we have a valid movie from TMDB with images
        const hasTmdbImage = movie && (movie.poster_path || movie.backdrop_path);

        // If NO valid TMDB image found, try Letterboxd Scraping via API (to avoid CORS)
        if (!hasTmdbImage) {
            console.log(`⚠️ No TMDB image for ${title}, trying Letterboxd scraping via API...`);
            try {
                // Slugify title: "DJ Mehdi: Made in France" -> "dj-mehdi-made-in-france"
                const lbSlug = title.toLowerCase()
                    .replace(/:/g, '')
                    .replace(/'/g, '')
                    .replace(/[^a-z0-9\s-]/g, '')
                    .trim()
                    .replace(/\s+/g, '-');

                // Call our own API endpoint
                const response = await fetch(`/api/get-movie-image?slug=${lbSlug}`);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.image) {
                        console.log(`✅ Found image via Letterboxd API for ${title}: ${data.image}`);
                        return {
                            id: 'lb-' + lbSlug,
                            backdrop: data.image,
                            poster: data.image,
                            overview: "Image retrieved from Letterboxd.",
                            release_date: null,
                            logo: null
                        };
                    }
                }
            } catch (e) {
                console.warn(`Letterboxd API scraping failed for ${title}:`, e);
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

// --- Main Logic ---
document.addEventListener('DOMContentLoaded', async () => {
    initBackground();
    loadIdMapping();

    // Navigation Logic
    const navBtns = document.querySelectorAll('.nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            navBtns.forEach(b => b.classList.remove('active'));
            // Add to clicked
            btn.classList.add('active');

            // Hide all views
            document.getElementById('engine-view').classList.add('hidden');
            document.getElementById('how-it-works').classList.add('hidden');

            // Show target
            const targetId = btn.dataset.target;
            document.getElementById(targetId).classList.remove('hidden');

            // Toggle background
            const bg = document.getElementById('background-posters');
            if (targetId === 'how-it-works') {
                bg.style.display = 'none';
            } else {
                bg.style.display = 'flex';
            }
        });
    });
    
    // UI Elements
    const fetchBtn = document.getElementById('fetchBtn');
    const usernameInput = document.getElementById('username');
    
    // Random Example User
    const examples = ['titouannnnnn', 'regelegorila', 'julieplhs', 'eliotgoarin', 'leo1507'];
    const randomExample = examples[Math.floor(Math.random() * examples.length)];
    usernameInput.placeholder = `ex: ${randomExample}`;
    usernameInput.value = ''; // Ensure empty to show placeholder

    const alphaInput = document.getElementById('alpha');
    const popInput = document.getElementById('popFactor');
    const ratingPowerInput = document.getElementById('ratingPower');
    const recCountInput = document.getElementById('recCount');
    const excludeWlInput = document.getElementById('excludeWatchlist');
    
    // Display Elements
    const alphaVal = document.getElementById('alphaVal');
    const popVal = document.getElementById('popVal');
    const ratingPowerVal = document.getElementById('ratingPowerVal');
    const recCountVal = document.getElementById('recCountVal');
    const recList = document.getElementById('recommendationsList');
    const statsDisplay = document.getElementById('statsDisplay');

    // 1. Init Sliders
    // Helper to get label text
    const getLabel = (id, val) => {
        val = parseFloat(val);
        if (id === 'alpha') {
            if (val < 1.5) return "Low";
            if (val > 3.5) return "High";
            return "Medium";
        }
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

    // Sync display with actual input values (browser might preserve values on reload)
    const updateDisplay = (input, displayEl, id) => {
        const val = input.value;
        const label = getLabel(id, val);
        displayEl.textContent = label ? `${val} (${label})` : val;
    };

    updateDisplay(alphaInput, alphaVal, 'alpha');
    updateDisplay(popInput, popVal, 'popFactor');
    updateDisplay(ratingPowerInput, ratingPowerVal, 'ratingPower');
    
    // Force default quantity to 30
    recCountInput.value = 30;
    recCountVal.textContent = recCountInput.value;

    alphaInput.addEventListener('input', (e) => updateDisplay(e.target, alphaVal, 'alpha'));
    popInput.addEventListener('input', (e) => updateDisplay(e.target, popVal, 'popFactor'));
    ratingPowerInput.addEventListener('input', (e) => updateDisplay(e.target, ratingPowerVal, 'ratingPower'));
    recCountInput.addEventListener('input', (e) => recCountVal.textContent = e.target.value);
    
    // 1.5 Init Input Enter Key
    usernameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            fetchBtn.click();
        }
    });

    // 2. Load Model
    updateStatus("Loading AI model...");
    const modelLoaded = await loadModel();
    if (modelLoaded) {
        updateStatus("Model loaded. Ready.");
    } else {
        updateStatus("Error loading model.", true);
        fetchBtn.disabled = true;
    }

    // 3. Action
    async function processAndRecommend() {
        if (!currentUserData) return;

        const recList = document.getElementById('recommendationsList');
        const statsDisplay = document.getElementById('statsDisplay');
        const alphaInput = document.getElementById('alpha');
        const popInput = document.getElementById('popFactor');
        const ratingPowerInput = document.getElementById('ratingPower');
        const recCountInput = document.getElementById('recCount');
        const excludeWlInput = document.getElementById('excludeWatchlist');

        toggleLoader(true);
        updateStatus("Computing recommendations...");
        recList.innerHTML = '';
        statsDisplay.textContent = '';

        try {
            // B. Process Data
            const ratedFilms = currentUserData.films.filter(f => f.rating !== null);
            const watchedFilms = currentUserData.films.filter(f => !f.username.startsWith('watchlist_'));
            
            if (ratedFilms.length === 0) {
                throw new Error("This profile hasn't rated any films.");
            }

            // Calcul Seuil (Top 5% par défaut)
            const allRatings = ratedFilms.map(f => f.rating);
            let percentile = 0.95;
            let threshold = getQuantile(allRatings, percentile);

            // Filtrage des films aimés
            let likedMovies = ratedFilms
                .filter(f => f.rating >= threshold)
                .map(f => ({ title: f.title, rating: f.rating }));

            // Si moins de 10 films, on élargit progressivement
            while (likedMovies.length < 10 && percentile > 0.05) {
                percentile -= 0.05;
                threshold = getQuantile(allRatings, percentile);
                likedMovies = ratedFilms
                    .filter(f => f.rating >= threshold)
                    .map(f => ({ title: f.title, rating: f.rating }));
            }

            // Gestion Exclusion
            let excludeTitles = new Set();
            
            // Toujours exclure ce qu'on a déjà vu (noté ou pas)
            watchedFilms.forEach(f => excludeTitles.add(f.title));

            // Optionnel : Exclure la watchlist
            if (excludeWlInput.checked) {
                const watchlist = currentUserData.films.filter(f => f.username.startsWith('watchlist_'));
                watchlist.forEach(f => excludeTitles.add(f.title));
            }

            // C. Run Algo
            const alpha = parseFloat(alphaInput.value);
            
            // Remapping popFactor to allow negative values (penalize popularity)
            // Input 0..1 -> Output -0.2..1
            // 0 -> -0.2 (Slight penalty for popular films)
            // 1 -> 1 (Strong boost for popular films)
            const rawPop = parseFloat(popInput.value);
            const popFactor = (rawPop * 1.2) - 0.2;

            const ratingPower = parseFloat(ratingPowerInput.value);
            
            // Default to Multi-Faceted (Max Pooling) which means useNegatives = false
            const useNegatives = false;

            allRecommendations = getRecommendations(
                likedMovies, 
                Array.from(excludeTitles), 
                alpha, 
                popFactor,
                ratingPower,
                useNegatives
            );

            // D. Render
            toggleLoader(false);
            updateStatus(`Done!`);
            
            statsDisplay.innerHTML = `
                <small>
                    Based on ${likedMovies.length} films (Rating ≥ ${threshold.toFixed(1)})<br>
                    ${excludeTitles.size} films excluded
                </small>
            `;

            if (allRecommendations.length === 0) {
                recList.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">No recommendations found (too many filters?)</p>';
                return;
            }

            await updateGrid();

            // Scroll smooth vers la grille de films une fois chargée
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

        toggleLoader(true);
        
        // Scroll smooth vers la zone de chargement
        document.getElementById('results-area').scrollIntoView({ behavior: 'smooth', block: 'start' });

        updateStatus(`Analyzing profile of ${username}...`);
        recList.innerHTML = '';
        statsDisplay.textContent = '';

        try {
            // A. Fetch Data
            const res = await fetch(`/api/scrape?username=${username}`);
            const data = await res.json();

            if (!data.films || data.films.length === 0) {
                throw new Error("No films found or private profile.");
            }
            
            currentUserData = data;
            await processAndRecommend();

        } catch (err) {
            toggleLoader(false);
            updateStatus("Error: " + err.message, true);
            console.error(err);
        }
    });

    // Watchlist Checkbox Handler
    excludeWlInput.addEventListener('change', () => {
        if (currentUserData) {
            processAndRecommend();
        }
    });

    // Resize Handler
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', debounce(() => {
        const currentWidth = window.innerWidth;
        // Only update if width changes (avoids mobile scroll resize issues)
        if (currentWidth !== lastWidth) {
            lastWidth = currentWidth;
            initBackground();
            if (allRecommendations.length > 0) updateGrid();
        }
    }, 200));

    // Slider Change Handler
    recCountInput.addEventListener('change', () => {
        if (allRecommendations.length > 0) updateGrid();
    });
});

async function updateGrid() {
    const recList = document.getElementById('recommendationsList');
    const recCountInput = document.getElementById('recCount');
    
    // Get col count (approximate if display:none, but here it should be visible)
    const gridStyle = window.getComputedStyle(recList);
    const colCount = gridStyle.gridTemplateColumns.split(' ').length;
    
    let count = parseInt(recCountInput.value, 10);
    
    // Cap at max available
    if (count > allRecommendations.length) count = allRecommendations.length;
    
    const moviesToDisplay = allRecommendations.slice(0, count);

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
        if (cached) {
            if (type === 'wide' && !cached.logo) {
                // Need to fetch logo, refetch
            } else {
                return { ...cached, slug, rank, type, score };
            }
        }
        
        const title = formatTitle(slug);
        const imgData = await getMovieImage(slug, title, type);
        const data = { title, ...imgData };
        imageCache.set(slug, data);
        return { ...data, slug, rank, type, score };
    }));

    recList.innerHTML = ''; // Clear list

    // No reordering needed, just display in rank order
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

        if (bgImage) {
            card.style.backgroundImage = `url('${bgImage}')`;
            card.style.backgroundSize = 'cover';
            card.style.backgroundPosition = 'center';
        }

        let logoHtml = '';
        if (movie.type === 'wide' && movie.logo) {
            logoHtml = `<img src="${movie.logo}" class="movie-logo" alt="${movie.title} Logo">`;
        }

        card.innerHTML = `
            ${logoHtml}
            <div class="match-score">
                ${movie.score}%
                <div class="score-tooltip">Relevance score based on your tastes</div>
            </div>
            <div class="movie-content">
                <div class="rank">#${movie.rank}</div>
                <div class="movie-info">
                    <div class="movie-title">${movie.title}</div>
                </div>
            </div>
        `;
        
        // Gestion du clic sur le score (Mobile)
        const badge = card.querySelector('.match-score');
        badge.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            badge.classList.toggle('active');
            // Auto-hide après 3s
            setTimeout(() => badge.classList.remove('active'), 3000);
        });

        recList.appendChild(card);
    });
}