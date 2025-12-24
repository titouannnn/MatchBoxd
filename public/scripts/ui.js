import { POSTERS } from './constants.js';
import { shuffle } from './utils.js';

/**
 * Updates the status text displayed to the user.
 * 
 * @param {string} msg - The message to display.
 * @param {boolean} [isError=false] - Whether the message is an error (displayed in red).
 */
export function updateStatus(msg, isError = false) {
    const el = document.getElementById('statusText');
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? '#ff4444' : '#9ab';
    }
}

/**
 * Toggles the visibility of the loading indicator and results area.
 * 
 * @param {boolean} show - If true, shows the loader and clears previous results. If false, hides the loader.
 */
export function toggleLoader(show) {
    const loader = document.getElementById('loader');
    const results = document.getElementById('results-area');
    const recList = document.getElementById('recommendationsList');
    
    if (show) {
        if (loader) loader.classList.remove('hidden');
        if (results) results.classList.remove('hidden');
        if (recList) recList.innerHTML = '';
    } else {
        if (loader) loader.classList.add('hidden');
    }
}

/**
 * Initializes the animated background of movie posters.
 * Creates vertical columns of scrolling posters using CSS animations.
 * Uses GitHub Raw for image hosting to optimize bandwidth.
 */
export function initBackground() {
    const container = document.getElementById('background-posters');
    if (!container) return;
    
    const GITHUB_REPO_BASE = 'https://raw.githubusercontent.com/titouannnn/MatchBoxd/master/public/data/posters/';

    container.innerHTML = '';

    // Configuration
    const isMobile = window.innerWidth < 768;
    const posterWidth = isMobile ? 80 : 140; 
    const posterHeight = isMobile ? 120 : 210; // Approx 2:3 ratio
    const gap = 15;
    const colWidth = posterWidth + gap;
    const screenWidth = window.innerWidth;
    const colCount = Math.ceil(screenWidth / colWidth) + 1; 

    // Global deck to avoid duplicates on screen
    let globalDeck = shuffle(POSTERS);

    for (let i = 0; i < colCount; i++) {
        const column = document.createElement('div');
        column.className = 'poster-column';
        
        // Random speed and delay for organic feel
        const duration = 60 + Math.random() * 60; // 60s to 120s
        column.style.animationDuration = `${duration}s`;
        
        const startOffset = Math.random() * -100;
        column.style.animationDelay = `${startOffset}s`;

        // Fill column with unique images
        const imagesPerSet = 6; 
        const setImages = [];

        for(let k=0; k<imagesPerSet; k++) {
            if (globalDeck.length === 0) {
                globalDeck = shuffle(POSTERS);
            }
            setImages.push(globalDeck.pop());
        }

        // Duplicate for infinite loop (Set A + Set A)
        const fullList = [...setImages, ...setImages];
        fullList.forEach((posterFile, index) => {
            const img = document.createElement('img');
            img.src = `${GITHUB_REPO_BASE}${posterFile}`;
            img.className = 'bg-poster';
            img.alt = ""; // Decorative image
            img.width = posterWidth;
            img.height = posterHeight;
            
            // Eager load only the first 2 images of each column (visible on screen)
            if (index < 2) {
                img.loading = "eager";
            } else {
                img.loading = "lazy";
            }
            
            column.appendChild(img);
        });

        container.appendChild(column);
    }

    // Initialize Parallax Effect
    initParallax(container);
}

/**
 * Initializes the parallax scrolling effect for the background.
 * The background moves at half speed relative to the scroll for the first portion of the page.
 * 
 * @param {HTMLElement} element - The background element to animate.
 */
function initParallax(element) {
    let ticking = false;

    function updateParallax() {
        const scrollY = window.scrollY;
        // Limit the effect to the first 500px (responsive adjustment can be added here)
        // This corresponds roughly to the hero section height
        const limit = window.innerHeight * 0.8; 
        
        if (scrollY <= limit) {
            // Move the background down by 50% of the scroll distance
            // Since it's absolute positioned, this effectively makes it scroll up at 50% speed
            const offset = scrollY * 0.5;
            element.style.transform = `translate3d(0, ${offset}px, 0)`;
        }
        
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }, { passive: true });
}

