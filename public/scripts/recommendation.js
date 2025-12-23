// web/scripts/recommendation.js

let movieData = null; 
let titleToId = {};
let vectorsBuffer = null; // Float32Array plat

export async function loadModel() {
    try {
        // 1. Charger les métadonnées (léger)
        const metaRes = await fetch('./data/model_metadata.json');
        if (!metaRes.ok) throw new Error("Erreur HTTP Meta " + metaRes.status);
        const meta = await metaRes.json();

        // 2. Charger les vecteurs binaires (lourd mais compact)
        // Utilisation de cache: 'force-cache' pour dire au navigateur de le garder le plus longtemps possible
        const binRes = await fetch('./data/model_vectors.bin', { cache: 'force-cache' });
        if (!binRes.ok) throw new Error("Erreur HTTP Bin " + binRes.status);
        const buffer = await binRes.arrayBuffer();
        
        // Reconstruction de l'objet movieData
        movieData = {
            titles: meta.titles,
            norms: meta.norms,
            vectorSize: meta.vectorSize,
            count: meta.titles.length
        };

        // Stockage optimisé : Float32Array
        vectorsBuffer = new Float32Array(buffer);
        
        // Création du mapping Titre -> Index
        movieData.titles.forEach((title, index) => {
            titleToId[String(title).toLowerCase().trim()] = index;
        });
        
        console.log(`✅ Modèle chargé : ${movieData.titles.length} films (Binary Mode).`);
        return true;
    } catch (error) {
        console.error("❌ Impossible de charger le modèle :", error);
        // Fallback JSON si besoin (optionnel)
        return false;
    }
}

/**
 * Produit Scalaire optimisé pour Float32Array plat
 * @param {Array} userVec - Vecteur utilisateur (Array standard ou Float32Array)
 * @param {Float32Array} allVectors - Le grand buffer contenant tous les films
 * @param {Number} idx - L'index du film (0..N)
 * @param {Number} size - La taille d'un vecteur (128)
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
 * Paramètres étendus :
 * @param {Number} alpha - (3.0) Snobisme (Poids des films rares).
 * @param {Number} popFactor - (0.4) Mainstream (Boost des films populaires en sortie).
 * @param {Number} ratingPower - (1.0) Sensibilité : 1.0 = Linéaire, 3.0 = Seuls les 5/5 comptent vraiment.
 * @param {Boolean} useNegatives - (false) Si true, les mauvaises notes repoussent les genres associés.
 */
export function getRecommendations(likedMovies, excludeMovies, alpha = 3.0, popFactor = 0.4, ratingPower = 2.0, useNegatives = true) {    if (!movieData || !vectorsBuffer) return [];

    console.time("⏱️ Calcul Reco");
    
    const itemNorms = movieData.norms;
    const vectorSize = movieData.vectorSize;

    // --- 1. IDENTIFICATION DES FILMS AIMÉS ---
    let targetIndices = [];
    let targetRatings = [];
    
    likedMovies.forEach(item => {
        // Nettoyage strict pour matcher la map titleToId
        const key = String(item.title).toLowerCase().trim();
        
        if (titleToId.hasOwnProperty(key)) {
            targetIndices.push(titleToId[key]);
            targetRatings.push(parseFloat(item.rating)); // S'assurer que c'est un nombre
        }
    });

    if (targetIndices.length === 0) {
        console.warn("⚠️ Aucun film correspondant trouvé dans le modèle.");
        return [];
    }

    // --- 2. CONSTRUCTION DU PROFIL (MAX POOLING PONDÉRÉ) ---
    // Initialisation à -Infinity pour le Max Pooling Arithmétique
   let userVector = new Array(vectorSize).fill(Number.NEGATIVE_INFINITY); 
    
    // Si on utilise les négatifs, on initialise à 0 pour permettre la soustraction
    if (useNegatives) userVector.fill(0);

    for (let i = 0; i < targetIndices.length; i++) {
        const idx = targetIndices[i];
        let rating = targetRatings[i]; // ex: 4.5
        
        const norm = itemNorms[idx];
        const offset = idx * vectorSize;

        // 1. Poids Rareté (Inchangé)
        const rarityWeight = 1.0 / (Math.pow(norm, alpha) + 1e-6);
        
        // 2. Poids Note (NOUVEAU : Puissance)
        // On normalise la note entre 0 et 1
        let normalizedRating = rating / 5.0; 
        
        // Gestion du signe (Positif vs Négatif)
        let sign = 1;
        
        if (useNegatives) {
            // Si la note est < 2.5 (la moyenne), c'est un vote négatif
            if (rating < 2.5) {
                sign = -1;
                // On inverse l'intensité : un 0.5/5 est un vote négatif "Fort" (intensité proche de 1)
                // 0.5 -> intensité forte négative
                // 2.0 -> intensité faible négative
                normalizedRating = (2.5 - rating) / 2.5; 
            } else {
                // 2.5 -> 5.0 ramené à 0 -> 1
                normalizedRating = (rating - 2.5) / 2.5;
            }
        }

        // On applique la puissance (ex: carré) pour favoriser les avis tranchés
        const ratingWeight = Math.pow(normalizedRating, ratingPower);
        
        // Poids final
        const totalWeight = rarityWeight * ratingWeight * sign;

        // 3. Agrégation (Adaptée aux négatifs)
        for (let dim = 0; dim < vectorSize; dim++) {
            // Accès direct au buffer plat
            const val = vectorsBuffer[offset + dim];
            const weightedVal = val * totalWeight;
            
            if (useNegatives) {
                // Somme pondérée (Mieux pour gérer le positif/négatif ensemble)
                // Le Max Pooling marche mal avec des poids négatifs explicites
                userVector[dim] += weightedVal;
            } else {
                // Max Pooling classique (Votre version actuelle)
                if (weightedVal > userVector[dim]) {
                    userVector[dim] = weightedVal;
                }
            }
        }
    }

    // --- 3. NORMALISATION DU VECTEUR UTILISATEUR ---
    let sumSq = 0;
    for (let i = 0; i < vectorSize; i++) {
        // Sécurité : si une dimension est restée à -Infinity (impossible normalement), on met 0
        if (userVector[i] === Number.NEGATIVE_INFINITY) userVector[i] = 0;
        sumSq += userVector[i] * userVector[i];
    }
    const userNorm = Math.sqrt(sumSq);
    
    // Division par la norme L2 (si > 0)
    if (userNorm > 1e-9) {
        for (let i = 0; i < vectorSize; i++) userVector[i] /= userNorm;
    }

    // --- 4. SCORING SUR TOUT LE CATALOGUE ---
    // Set d'exclusion pour rapidité O(1)
    let excludeSet = new Set();
    excludeMovies.forEach(t => {
        const key = String(t).toLowerCase().trim();
        if (titleToId.hasOwnProperty(key)) excludeSet.add(titleToId[key]);
    });

    let scores = [];
    const catalogSize = movieData.count;

    for (let i = 0; i < catalogSize; i++) {
        if (excludeSet.has(i)) continue;

        // A. Similarité Cosinus (Goût)
        // userVector est normé, itemVectors[i] est normé -> Produit Scalaire = Cosinus
        // Utilisation de la version optimisée "Flat"
        const similarity = dotProductFlat(userVector, vectorsBuffer, i, vectorSize);

        // B. Réinjection Popularité (Hype)
        // Score = Sim * (Norme ^ popFactor)
        const popularityBonus = Math.pow(itemNorms[i], popFactor);
        
        // Score Final
        scores.push({ 
            id: i, 
            score: similarity * popularityBonus 
        });
    }

    // --- 5. TRI ET RENDU ---
    // Tri décroissant
    scores.sort((a, b) => b.score - a.score);
    
    console.timeEnd("⏱️ Calcul Reco");
    
    // Renvoie les objets { slug, score }
    // On normalise le score par rapport au premier (le meilleur) pour avoir un % relatif
    const maxScore = scores.length > 0 ? scores[0].score : 1;

    return scores.slice(0, 150).map(s => ({
        slug: movieData.titles[s.id],
        score: Math.round((s.score / maxScore) * 100) // Score relatif en %
    }));
}