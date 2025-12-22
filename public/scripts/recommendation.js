// web/scripts/recommendation.js

let movieData = null; 
let titleToId = {};

export async function loadModel() {
    try {
        // Ajout d'un timestamp pour éviter le cache du navigateur si vous régénérez le JSON
        const response = await fetch('./data/model_data.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error("Erreur HTTP " + response.status);
        
        movieData = await response.json();
        
        // Création du mapping Titre -> Index
        // On utilise toLowerCase() et trim() pour maximiser les correspondances
        movieData.titles.forEach((title, index) => {
            titleToId[String(title).toLowerCase().trim()] = index;
        });
        
        console.log(`✅ Modèle chargé : ${movieData.titles.length} films.`);
        return true;
    } catch (error) {
        console.error("❌ Impossible de charger le modèle :", error);
        return false;
    }
}

/**
 * Produit Scalaire (Dot Product)
 */
function dotProduct(vecA, vecB) {
    let sum = 0;
    const len = vecA.length;
    for (let i = 0; i < len; i++) {
        sum += vecA[i] * vecB[i];
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
export function getRecommendations(likedMovies, excludeMovies, alpha = 3.0, popFactor = 0.4, ratingPower = 2.0, useNegatives = true) {    if (!movieData) return [];

    console.time("⏱️ Calcul Reco");
    
    const itemVectors = movieData.vectors;
    const itemNorms = movieData.norms;
    const vectorSize = itemVectors[0].length;

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
        
        const vec = itemVectors[idx];
        const norm = itemNorms[idx];

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
            const weightedVal = vec[dim] * totalWeight;
            
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
    const catalogSize = itemVectors.length;

    for (let i = 0; i < catalogSize; i++) {
        if (excludeSet.has(i)) continue;

        // A. Similarité Cosinus (Goût)
        // userVector est normé, itemVectors[i] est normé -> Produit Scalaire = Cosinus
        const similarity = dotProduct(userVector, itemVectors[i]);

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