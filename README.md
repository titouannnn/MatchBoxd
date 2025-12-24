# MatchBoxd

**MatchBoxd** is an AI-powered movie recommendation engine designed for [Letterboxd](https://letterboxd.com/) users. By analyzing your profile, it helps you discover your next favorite movie, from hidden gems to the biggest classics.


## How it Works

MatchBoxd uses a custom content-based filtering system that runs entirely in your browser for maximum privacy and speed.

1.  **Vector Embeddings**: Every movie in our database is mapped to a 128-dimensional vector representing its themes, genres, and style.
2.  **User Profiling**: The engine analyzes your history to build a unique "taste vector". It weighs your highly-rated and rare finds more heavily, while treating low ratings as negative signals to refine the search.
3.  **Similarity Search**: It calculates the mathematical distance (Cosine Similarity) between your profile and thousands of movies to find the closest matches.
4.  **Re-Ranking**: Final results are adjusted based on your preference for popularity (Mainstream Factor) or obscurity.

## Code Architecture

The project follows a lightweight serverless architecture, separating the static frontend from the backend API functions.

```text
.
├── api/                # Serverless functions (Node.js) for data fetching and proxying
├── public/             # Static assets, CSS styles, and client-side JavaScript
│   ├── data/           # Model data and mappings
│   ├── scripts/        # Core logic (recommendation engine, UI, API handling)
│   └── styles/         # Modular CSS components
└── scripts/            # Offline utility scripts for data processing
```

## Local Development

1.  **Clone the repository**
    ```bash
    git clone https://github.com/titouannnn/MatchBoxd.git
    cd MatchBoxd
    ```

2.  **Install dependencies**
    ```bash
    pnpm install
    ```

3.  **Environment Setup**
    Create a `.env` file in the root directory and add your TMDB API key:
    ```env
    TMDB_API_KEY=your_tmdb_api_key_here
    ```

4.  **Run locally**
    ```bash
    vercel dev
    ```

## Author

**Titouan Mokrani**
- [GitHub](https://github.com/titouannnn)
- [Letterboxd](https://letterboxd.com/titouannnnnn/)
