import { loadModel, getRecommendations } from './recommendation.js';
import { TMDB_API_KEY } from './config.js';

let allRecommendations = [];
let imageCache = new Map();
let resizeTimeout;

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

function initBackground() {
    const container = document.getElementById('background-posters');
    if (!container) return;
    container.innerHTML = ''; // Reset pour éviter accumulation

    // Configuration
    const posterWidth = 140; 
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
            // Pas de lazy loading pour éviter le "pop" visuel lors de la boucle
            column.appendChild(img);
        });

        container.appendChild(column);
    }
}

async function getMovieImage(title, type = 'poster') {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`);
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            const movie = data.results[0];
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
    
    // UI Elements
    const fetchBtn = document.getElementById('fetchBtn');
    const usernameInput = document.getElementById('username');
    const alphaInput = document.getElementById('alpha');
    const popInput = document.getElementById('popFactor');
    const ratingPowerInput = document.getElementById('ratingPower');
    const recCountInput = document.getElementById('recCount');
    const useNegativesInput = document.getElementById('useNegatives');
    const excludeWlInput = document.getElementById('excludeWatchlist');
    
    // Display Elements
    const alphaVal = document.getElementById('alphaVal');
    const popVal = document.getElementById('popVal');
    const ratingPowerVal = document.getElementById('ratingPowerVal');
    const recCountVal = document.getElementById('recCountVal');
    const recList = document.getElementById('recommendationsList');
    const statsDisplay = document.getElementById('statsDisplay');

    // 1. Init Sliders
    // Sync display with actual input values (browser might preserve values on reload)
    alphaVal.textContent = alphaInput.value;
    popVal.textContent = popInput.value;
    ratingPowerVal.textContent = ratingPowerInput.value;
    recCountVal.textContent = recCountInput.value;

    alphaInput.addEventListener('input', (e) => alphaVal.textContent = e.target.value);
    popInput.addEventListener('input', (e) => popVal.textContent = e.target.value);
    ratingPowerInput.addEventListener('input', (e) => ratingPowerVal.textContent = e.target.value);
    recCountInput.addEventListener('input', (e) => recCountVal.textContent = e.target.value);

    // 1.5 Init Input Enter Key
    usernameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            fetchBtn.click();
        }
    });

    // 2. Load Model
    updateStatus("Chargement du modèle IA...");
    const modelLoaded = await loadModel();
    if (modelLoaded) {
        updateStatus("Modèle chargé. Prêt.");
    } else {
        updateStatus("Erreur chargement modèle.", true);
        fetchBtn.disabled = true;
    }

    // 3. Action
    fetchBtn.addEventListener('click', async () => {
        const username = usernameInput.value.trim();
        if (!username) return;

        toggleLoader(true);
        updateStatus(`Analyse du profil de ${username}...`);
        recList.innerHTML = '';
        statsDisplay.textContent = '';

        try {
            // A. Fetch Data
            const res = await fetch(`/api/scrape?username=${username}`);
            const data = await res.json();

            if (!data.films || data.films.length === 0) {
                throw new Error("Aucun film trouvé ou profil privé.");
            }

            // B. Process Data
            const ratedFilms = data.films.filter(f => f.rating !== null);
            
            if (ratedFilms.length === 0) {
                throw new Error("Ce profil n'a noté aucun film.");
            }

            // Calcul Seuil (Top 5% par défaut)
            const allRatings = ratedFilms.map(f => f.rating);
            const threshold = getQuantile(allRatings, 0.95);

            // Filtrage des films aimés
            const likedMovies = ratedFilms
                .filter(f => f.rating >= threshold)
                .map(f => ({ title: f.title, rating: f.rating }));

            // Gestion Exclusion
            let excludeTitles = new Set();
            
            // Toujours exclure ce qu'on a déjà vu (noté)
            ratedFilms.forEach(f => excludeTitles.add(f.title));

            // Optionnel : Exclure la watchlist
            if (excludeWlInput.checked) {
                const watchlist = data.films.filter(f => f.username.startsWith('watchlist_'));
                watchlist.forEach(f => excludeTitles.add(f.title));
            }

            // C. Run Algo
            const alpha = parseFloat(alphaInput.value);
            const popFactor = parseFloat(popInput.value);
            const ratingPower = parseFloat(ratingPowerInput.value);
            const recCount = parseInt(recCountInput.value, 10);
            const useNegatives = useNegativesInput.checked;

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
            updateStatus(`Terminé !`);
            
            statsDisplay.innerHTML = `
                <small>
                    Basé sur ${likedMovies.length} films (Note ≥ ${threshold.toFixed(1)})<br>
                    ${excludeTitles.size} films exclus
                </small>
            `;

            if (allRecommendations.length === 0) {
                recList.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Aucune recommandation trouvée (trop de filtres ?)</p>';
                return;
            }

            await updateGrid();

        } catch (err) {
            toggleLoader(false);
            updateStatus("Erreur : " + err.message, true);
            console.error(err);
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
    const moviesWithImages = await Promise.all(moviesToDisplay.map(async (slug, index) => {
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
                return { ...cached, slug, rank, type };
            }
        }
        
        const title = formatTitle(slug);
        const imgData = await getMovieImage(title, type);
        const data = { title, ...imgData };
        imageCache.set(slug, data);
        return { ...data, slug, rank, type };
    }));

    recList.innerHTML = ''; // Clear list

    // No reordering needed, just display in rank order
    moviesWithImages.forEach((movie) => {
        const card = document.createElement('div');
        
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
            logoHtml = `<img src="${movie.logo}" class="movie-logo" alt="Logo">`;
        }

        card.innerHTML = `
            ${logoHtml}
            <div class="movie-content">
                <div class="rank">#${movie.rank}</div>
                <div class="movie-info">
                    <div class="movie-title">${movie.title}</div>
                    <a href="https://letterboxd.com/film/${movie.slug}/" target="_blank" class="lb-link">Letterboxd ↗</a>
                </div>
            </div>
        `;
        recList.appendChild(card);
    });
}