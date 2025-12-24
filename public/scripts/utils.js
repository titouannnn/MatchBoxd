import { CACHE_VERSION } from './constants.js';

/**
 * Saves data to localStorage with a timestamp and version.
 * @param {string} key - The key to store the data under.
 * @param {any} data - The data to store.
 */
export function saveToCache(key, data) {
    try {
        const payload = {
            timestamp: Date.now(),
            version: CACHE_VERSION,
            data: data
        };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
        console.warn("LocalStorage full or disabled", e);
    }
}

/**
 * Retrieves data from localStorage if it exists and hasn't expired.
 * @param {string} key - The key to retrieve data from.
 * @param {number|null} [maxAge=null] - Maximum age in milliseconds. If null, no expiration check.
 * @returns {any|null} The stored data or null if not found/expired.
 */
export function getFromCache(key, maxAge = null) {
    try {
        const item = localStorage.getItem(key);
        if (!item) return null;
        
        const payload = JSON.parse(item);
        if (payload.version !== CACHE_VERSION) return null;
        
        if (maxAge && (Date.now() - payload.timestamp > maxAge)) {
            localStorage.removeItem(key);
            return null;
        }
        
        return payload.data;
    } catch (e) {
        return null;
    }
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds have elapsed.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {Function} The debounced function.
 */
export function debounce(func, wait) {
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

/**
 * Calculates the quantile of an array of numbers.
 * @param {number[]} array - The array of numbers.
 * @param {number} percentile - The percentile to calculate (0 to 1).
 * @returns {number} The calculated quantile value.
 */
export function getQuantile(array, percentile) {
    if (array.length === 0) return 0;
    const sorted = [...array].sort((a, b) => a - b);
    const index = (sorted.length - 1) * percentile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (upper >= sorted.length) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Formats a slug into a readable title.
 * @param {string} slug - The slug to format (e.g., "the-matrix-1999").
 * @returns {string} The formatted title (e.g., "The Matrix (1999)").
 */
export function formatTitle(slug) {
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

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * @param {any[]} array - The array to shuffle.
 * @returns {any[]} A new shuffled array.
 */
export function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    const deck = [...array];

    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [deck[currentIndex], deck[randomIndex]] = [deck[randomIndex], deck[currentIndex]];
    }
    return deck;
}
