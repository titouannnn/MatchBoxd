# MatchBoxd 🎬

**MatchBoxd** is an AI-powered movie recommendation engine designed specifically for [Letterboxd](https://letterboxd.com/) users. By analyzing your profile (watched films, ratings, and watchlist), it helps you discover your next favorite movie, from hidden gems to modern classics.

![MatchBoxd Preview](https://matchboxd.com/data/graph_web.png)

## ✨ Features

- **Personalized Analysis**: Scrapes your Letterboxd profile to understand your unique taste.
- **Customizable Engine**:
  - **Mainstream Factor**: Choose between popular hits or obscure indie films.
  - **Focus on Favorites**: Prioritize movies similar to your highest-rated films.
  - **Watchlist Filtering**: Option to exclude movies you've already marked to watch.
- **Modern UI/UX**:
  - **Glassmorphism Design**: Sleek, dark-themed interface with frosted glass effects.
  - **Parallax Background**: Immersive scrolling experience with movie posters.
  - **Bento Grid Layout**: Responsive and aesthetic presentation of recommendations.
- **High Performance**:
  - **Binary Vector Model**: Uses lightweight binary vectors for fast client-side similarity calculations.
  - **Edge Caching**: Optimized image delivery and API response caching via Vercel.

## 🚀 How It Works

1.  **Input**: You provide your Letterboxd username.
2.  **Scraping**: A serverless function retrieves your watched films and ratings.
3.  **Vectorization**: The app maps your films to a high-dimensional vector space based on a pre-trained model (content-based filtering).
4.  **Recommendation**: It calculates the cosine similarity between your profile vector and thousands of movies in the database to find the best matches.
5.  **Enrichment**: Movie metadata and posters are fetched via the TMDB API.

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), CSS3 (Variables, Flexbox, Grid), HTML5.
- **Backend**: Vercel Serverless Functions (Node.js) for scraping and API proxying.
- **Data Sources**:
  - **Letterboxd**: User data (via custom scraper).
  - **TMDB (The Movie Database)**: Movie images and metadata.
- **Deployment**: Vercel (Static hosting + Serverless Functions).

## 📦 Local Development

### Prerequisites

- Node.js & npm/pnpm
- A TMDB API Key

### Installation

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
    Create a `.env` file in the root directory and add your TMDB API key (required for the serverless proxy):
    ```env
    TMDB_API_KEY=your_tmdb_api_key_here
    ```

4.  **Run locally**
    Using Vercel CLI (recommended to simulate serverless functions):
    ```bash
    pnpm i -g vercel
    vercel dev
    ```
    Or simply serve the `public` folder for frontend-only changes (note: scraping won't work without the backend functions).

## 🚀 Deployment

This project is optimized for **Vercel**.

1.  Push your code to GitHub.
2.  Import the project in Vercel.
3.  Add the `TMDB_API_KEY` in the Vercel Project Settings > Environment Variables.
4.  Deploy!

## 📄 License

This project is licensed under the ISC License.

## 👤 Author

**Titouan**
- [GitHub](https://github.com/titouannnn)
- [Letterboxd](https://letterboxd.com/titouannnnnn/)
