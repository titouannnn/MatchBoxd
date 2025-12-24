// web/scripts/recommendation.js

let movieData = null; 
let titleToId = {};
let vectorsBuffer = null; // Flat Float32Array

/**
 * Loads the recommendation model (metadata and binary vectors).
 * Uses GitHub Raw for bandwidth optimization and caching.
 * 
 * @returns {Promise<boolean>} True if loaded successfully, false otherwise.
 */
export async function loadModel() {
    try {
        // 1. Load metadata (lightweight)
        const metaRes = await fetch('./data/model_metadata.json');
        if (!metaRes.ok) throw new Error("HTTP Error Meta " + metaRes.status);
        const meta = await metaRes.json();

        // 2. Load binary vectors (heavy but compact)
        // Use 'force-cache' to tell the browser to keep it as long as possible
        const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/titouannnn/MatchBoxd/master/public/data/';
        const binRes = await fetch(GITHUB_RAW_BASE + 'model_vectors.bin', { cache: 'force-cache' });
        if (!binRes.ok) throw new Error("HTTP Error Bin " + binRes.status);
        const buffer = await binRes.arrayBuffer();
        
        // Reconstruct movieData object
        movieData = {
            titles: meta.titles,
            norms: meta.norms,
            vectorSize: meta.vectorSize,
            count: meta.titles.length
        };

        // Optimized storage: Float32Array
        vectorsBuffer = new Float32Array(buffer);
        
        // Create Title -> Index mapping
        movieData.titles.forEach((title, index) => {
            titleToId[String(title).toLowerCase().trim()] = index;
        });
        
        console.log(`✅ Model loaded: ${movieData.titles.length} movies (Binary Mode).`);
        return true;
    } catch (error) {
        console.error("❌ Unable to load model:", error);
        return false;
    }
}

/**
 * Optimized Dot Product for flat Float32Array.
 * 
 * @param {Array|Float32Array} userVec - User vector.
 * @param {Float32Array} allVectors - The large buffer containing all movie vectors.
 * @param {number} idx - The index of the movie (0..N).
 * @param {number} size - The size of a vector (128).
 * @returns {number} The dot product result.
 */
function dotProductFlat(userVec, allVectors, idx, size) {
    let sum = 0;
    const offset = idx * size;
    for (let i = 0; i < size; i++) {
        sum += userVec[i] * allVectors[offset + i];
    }
    return sum;
}

/**
 * Generates movie recommendations based on liked movies.
 * 
 * @param {Array<Object>} likedMovies - List of movies liked by the user.
 * @param {Array<string>} excludeMovies - List of movie titles to exclude (e.g., already watched).
 * @param {number} [alpha=3.0] - Rarity weight (Snob factor). Higher values favor rare movies.
 * @param {number} [popFactor=0.4] - Popularity weight (Mainstream factor). Boosts popular movies.
 * @param {number} [ratingPower=2.0] - Rating sensitivity. 1.0 = Linear, 3.0 = Only 5/5 count significantly.
 * @param {boolean} [useNegatives=true] - If true, low ratings repel associated genres.
 * @returns {Array<Object>} List of recommended movies with scores.
 */
export function getRecommendations(likedMovies, excludeMovies, alpha = 3.0, popFactor = 0.4, ratingPower = 2.0, useNegatives = true) {
    if (!movieData || !vectorsBuffer) return [];

    console.time("⏱️ Reco Calculation");
    
    const itemNorms = movieData.norms;
    const vectorSize = movieData.vectorSize;

    // --- 1. IDENTIFY LIKED MOVIES ---
    let targetIndices = [];
    let targetRatings = [];
    
    likedMovies.forEach(item => {
        // Strict cleanup to match titleToId map
        const key = String(item.title).toLowerCase().trim();
        
        if (titleToId.hasOwnProperty(key)) {
            targetIndices.push(titleToId[key]);
            targetRatings.push(parseFloat(item.rating));
        }
    });

    if (targetIndices.length === 0) {
        console.warn("⚠️ No matching movies found in the model.");
        return [];
    }

    // --- 2. BUILD USER PROFILE (WEIGHTED POOLING) ---
    // Initialize to -Infinity for Arithmetic Max Pooling
   let userVector = new Array(vectorSize).fill(Number.NEGATIVE_INFINITY); 
    
    // If using negatives, initialize to 0 to allow subtraction
    if (useNegatives) userVector.fill(0);

    for (let i = 0; i < targetIndices.length; i++) {
        const idx = targetIndices[i];
        let rating = targetRatings[i];
        
        const norm = itemNorms[idx];
        const offset = idx * vectorSize;

        // 1. Rarity Weight
        const rarityWeight = 1.0 / (Math.pow(norm, alpha) + 1e-6);
        
        // 2. Rating Weight (Power)
        // Normalize rating between 0 and 1
        let normalizedRating = rating / 5.0; 
        
        // Sign Management (Positive vs Negative)
        let sign = 1;
        
        if (useNegatives) {
            // If rating < 2.5 (average), it's a negative vote
            if (rating < 2.5) {
                sign = -1;
                // Invert intensity: 0.5/5 is a "Strong" negative vote (intensity close to 1)
                normalizedRating = (2.5 - rating) / 2.5; 
            } else {
                // 2.5 -> 5.0 mapped to 0 -> 1
                normalizedRating = (rating - 2.5) / 2.5;
            }
        }

        // Apply power (e.g., square) to favor strong opinions
        const ratingWeight = Math.pow(normalizedRating, ratingPower);
        
        // Final Weight
        const totalWeight = rarityWeight * ratingWeight * sign;

        // 3. Aggregation
        for (let dim = 0; dim < vectorSize; dim++) {
            // Direct access to flat buffer
            const val = vectorsBuffer[offset + dim];
            const weightedVal = val * totalWeight;
            
            if (useNegatives) {
                // Weighted Sum (Better for handling positive/negative together)
                userVector[dim] += weightedVal;
            } else {
                // Classic Max Pooling
                if (weightedVal > userVector[dim]) {
                    userVector[dim] = weightedVal;
                }
            }
        }
    }

    // --- 3. NORMALIZE USER VECTOR ---
    let sumSq = 0;
    for (let i = 0; i < vectorSize; i++) {
        // Safety: if a dimension remained -Infinity, set to 0
        if (userVector[i] === Number.NEGATIVE_INFINITY) userVector[i] = 0;
        sumSq += userVector[i] * userVector[i];
    }
    const userNorm = Math.sqrt(sumSq);
    
    // Divide by L2 norm (if > 0)
    if (userNorm > 1e-9) {
        for (let i = 0; i < vectorSize; i++) userVector[i] /= userNorm;
    }

    // --- 4. SCORING ACROSS CATALOG ---
    // Exclusion set for O(1) lookup
    let excludeSet = new Set();
    excludeMovies.forEach(t => {
        const key = String(t).toLowerCase().trim();
        if (titleToId.hasOwnProperty(key)) excludeSet.add(titleToId[key]);
    });

    let scores = [];
    const catalogSize = movieData.count;

    for (let i = 0; i < catalogSize; i++) {
        if (excludeSet.has(i)) continue;

        // A. Cosine Similarity (Taste)
        // userVector is normalized, itemVectors[i] is normalized -> Dot Product = Cosine
        const similarity = dotProductFlat(userVector, vectorsBuffer, i, vectorSize);

        // B. Popularity Reinjection (Hype)
        // Score = Sim * (Norm ^ popFactor)
        const popularityBonus = Math.pow(itemNorms[i], popFactor);
        
        // Final Score
        scores.push({ 
            id: i, 
            score: similarity * popularityBonus 
        });
    }

    // --- 5. SORT AND RENDER ---
    // Sort descending
    scores.sort((a, b) => b.score - a.score);
    
    console.timeEnd("⏱️ Reco Calculation");
    
    // Return objects { slug, score }
    // Normalize score relative to the first (best) to get a relative %
    const maxScore = scores.length > 0 ? scores[0].score : 1;

    return scores.slice(0, 150).map(s => ({
        slug: movieData.titles[s.id],
        score: Math.round((s.score / maxScore) * 100) // Relative score in %
    }));
}
