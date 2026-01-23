const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const router = express.Router();
const BASE = process.env.XVID_API_BASE;

// =====================
// ADVANCED GEO PREFERENCES MAP
// =====================
const GEO_PREFERENCES = {
  IN: {
    keywords: [
      "indian", "desi", "hindi", "bhabhi", "aunty",
      "kolkata", "mumbai", "delhi", "chennai",
      "south indian", "north indian"
    ],
    languages: ["hindi", "tamil", "telugu", "bengali"],
    categories: ["desi", "homemade"],
    boost: 3.5,
    penalty: ["latin", "japanese"]
  },

  BD: {
    keywords: [
      "bangla", "bengali", "bangladesh", "desi",
      "dhaka", "kolkata"
    ],
    languages: ["bangla", "bengali"],
    categories: ["desi", "homemade"],
    boost: 3.5,
    penalty: ["korean", "japanese"]
  },

  PK: {
    keywords: [
      "pakistani", "urdu", "desi", "lahore", "karachi"
    ],
    languages: ["urdu"],
    categories: ["desi"],
    boost: 3.2,
    penalty: ["japanese"]
  },

  US: {
    keywords: [
      "american", "white", "ebony", "latina",
      "college", "stepmom", "milf"
    ],
    languages: ["english"],
    categories: ["professional", "studio"],
    boost: 2.2,
    penalty: ["desi"]
  },

  UK: {
    keywords: [
      "british", "uk", "english", "european"
    ],
    languages: ["english"],
    categories: ["studio"],
    boost: 2.1
  },

  DE: {
    keywords: [
      "german", "european", "blonde"
    ],
    languages: ["german", "english"],
    categories: ["studio"],
    boost: 2.0
  },

  FR: {
    keywords: [
      "french", "european", "paris"
    ],
    languages: ["french"],
    categories: ["studio"],
    boost: 2.0
  },

  BR: {
    keywords: [
      "brazilian", "latina", "brazil"
    ],
    languages: ["portuguese"],
    categories: ["latina"],
    boost: 2.6
  },

  MX: {
    keywords: [
      "mexican", "latina", "mexico"
    ],
    languages: ["spanish"],
    categories: ["latina"],
    boost: 2.5
  },

  JP: {
    keywords: [
      "japanese", "jav", "asian", "tokyo"
    ],
    languages: ["japanese"],
    categories: ["jav"],
    boost: 3.0,
    penalty: ["ebony"]
  },

  KR: {
    keywords: [
      "korean", "asian", "korea"
    ],
    languages: ["korean"],
    categories: ["asian"],
    boost: 2.8
  },

  PH: {
    keywords: [
      "filipina", "pinay"
    ],
    languages: ["tagalog", "english"],
    categories: ["asian"],
    boost: 2.7
  },

  DEFAULT: {
    keywords: [
      "asian", "latina", "ebony", "milf"
    ],
    boost: 1.5
  }
};

// =====================
// HELPER: SCORE VIDEO (Deterministic)
// =====================
function scoreVideo(video, prefs, index = 0) {
  let score = 0;

  const text = (
    (video.name || "") +
    " " +
    (video.type_name || "") +
    " " +
    (video.actor || []).join(" ")
  ).toLowerCase();

  // Keyword boost
  for (const kw of prefs.keywords || []) {
    if (text.includes(kw)) score += prefs.boost;
  }

  // Language bonus
  for (const lang of prefs.languages || []) {
    if (text.includes(lang)) score += 1.2;
  }

  // Category bias
  for (const cat of prefs.categories || []) {
    if (text.includes(cat)) score += 1.5;
  }

  // Penalty keywords
  for (const bad of prefs.penalty || []) {
    if (text.includes(bad)) score -= 2;
  }

  // Pagination entropy (VERY IMPORTANT)
  score += (index % 7) * 0.15;

  // Small randomness only
  score += Math.random() * 0.3;

  return score;
}

// =====================
// GET /home (REVAMPED)
// =====================
router.get("/home", async (req, res) => {
  try {
    if (!BASE) {
      return res.status(500).json({ error: "API base not configured" });
    }

    // 1. Params
    const pg = Math.max(1, Number(req.query.pg) || Number(req.query.page) || 1);
    const LIMIT = 32;

    // 2. Geo Detection
    const country =
      req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      "DEFAULT";

    const prefs = GEO_PREFERENCES[country] || GEO_PREFERENCES.DEFAULT;

    // 3. Selection Strategy
    // We pick the first keyword from your Geo list to use as a "Search-based Home"
    // This ensures that an Indian user sees Indian videos from page 1 to 1000.
    const primaryKeyword = prefs.keywords[0]; 

    // 4. API Request
    // We use 'wd' just like the search route, but it's automated for the home page.
    let url = `${BASE}?ac=videolist&pg=${pg}&limit=${LIMIT}`;
    
    // If the country has specific keywords, we inject the primary one to "force" local content
    if (country !== "DEFAULT" && primaryKeyword) {
        url += `&wd=${encodeURIComponent(primaryKeyword)}`;
    }

    console.log(`HOME FETCH [${country}]: ${url}`);

    const { data } = await axios.get(url, { timeout: 10000 });

    if (!data || !Array.isArray(data.list)) {
      return res.json({ page: pg, totalPages: 0, list: [] });
    }

    let videos = data.list;

    // 5. Fine-Tune Scoring (Optional)
    // Since the API already filtered by the primary keyword, we just do a 
    // quick sort to ensure the HIGHEST boost items within this list are top.
    const finalScored = videos.map((v, i) => ({
      ...v,
      _score: scoreVideo(v, prefs, i)
    })).sort((a, b) => b._score - a._score);

    // 6. Response
    res.json({
      page: pg,
      pageSize: LIMIT,
      country: country,
      total: data.total || 1000,
      totalPages: data.total ? Math.ceil(data.total / LIMIT) : 100,
      list: finalScored.slice(0, LIMIT)
    });

  } catch (err) {
    console.error("HOME API ERROR:", err.message);
    // Fallback: If search-based home fails, try a generic list
    try {
        const fallback = await axios.get(`${BASE}?ac=videolist&pg=${req.query.pg || 1}&limit=32`);
        res.json({ page: Number(req.query.pg) || 1, list: fallback.data.list });
    } catch (e) {
        res.status(500).json({ error: "Failed to load home videos" });
    }
  }
});

// =====================
// GET /watch/:id
// =====================
router.get("/watch/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!BASE) return res.status(500).json({ error: "API base not configured" });

    const url = `${BASE}?ac=detail&ids=${id}`;
    console.log("FETCHING WATCH:", url);

    const { data } = await axios.get(url);

    if (!data || !data.list || !data.list[0]) {
      return res.status(404).json({ error: "Video not found" });
    }

    const videoRaw = data.list[0];

    // --- FIXED EMBED LINK EXTRACTION ---
    let embedLink = "";
    if (videoRaw.episodes && videoRaw.episodes.server_data) {
      const serverData = videoRaw.episodes.server_data;
      const episodeKeys = Object.keys(serverData);
      if (episodeKeys.length > 0) {
        embedLink = serverData[episodeKeys[0]].link_embed || "";
      }
    }

    if (!embedLink) console.warn("No embed link found for video", id);

    const video = {
      id: videoRaw.id,
      name: videoRaw.name,
      description: videoRaw.description || "No description available",
      thumb_url: videoRaw.thumb_url || videoRaw.poster_url || "",
      time: videoRaw.time || "00:00",
      embed_link: embedLink,
      actors: videoRaw.actor || [],
      director: videoRaw.director || [],
      year: videoRaw.year || "",
      quality: videoRaw.quality || "",
      likes: videoRaw.likes || 0
    };
    res.json(video);

  } catch (err) {
    console.error("WATCH API ERROR:", err.message);
    res.status(500).json({ error: "Failed to load video" });
  }
});


// =====================
// GET /search
// =====================
router.get("/search", async (req, res) => {
  try {
    if (!BASE) {
      return res.status(500).json({ error: "API base not configured" });
    }

    const query = (req.query.query || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const sort = req.query.sort || "relevance";
    const LIMIT = 32;

    // 1. If no query, return empty list
    if (!query) {
      return res.json({
        page,
        totalPages: 0,
        list: []
      });
    }

    // 2. SEARCH DIRECTLY VIA API
    // - 'wd' = the search keyword (searches the whole DB)
    // - 'limit' = requests 32 items per page from the API
    const url = `${BASE}?ac=videolist&wd=${encodeURIComponent(query)}&pg=${page}&limit=${LIMIT}`;
    
    console.log(`SEARCHING API: ${url}`);

    const { data } = await axios.get(url, { timeout: 10000 });

    if (!data || !Array.isArray(data.list)) {
      return res.json({
        page,
        totalPages: 0,
        list: []
      });
    }

    let videos = data.list;

    // 3. RE-SORT RESULTS (Optional but recommended)
    // The API might return results loosely. We push exact matches to the top.
    if (sort === "relevance") {
      const lowerQuery = query.toLowerCase();
      videos.sort((a, b) => {
        const nameA = (a.name || "").toLowerCase();
        const nameB = (b.name || "").toLowerCase();
        
        const exactA = nameA.includes(lowerQuery) ? 1 : 0;
        const exactB = nameB.includes(lowerQuery) ? 1 : 0;
        
        return exactB - exactA;
      });
    } else if (sort === "latest") {
        // If the API supports sorting params, use them. Otherwise, we sort the page.
        videos.sort((a, b) => (b.time || 0) - (a.time || 0));
    }

    // 4. STRICT LIMIT (Safety check)
    // Ensure we send exactly max 32 items, even if API ignores the limit param.
    const finalVideos = videos.slice(0, LIMIT);

    // 5. CALCULATE TOTAL PAGES
    // If API provides 'total', use it. Otherwise, estimate based on current list.
    const totalItems = data.total || finalVideos.length;
    const totalPages = Math.ceil(totalItems / LIMIT);

    res.json({
      page,
      totalPages: totalPages || 1,
      total: totalItems,
      list: finalVideos
    });

  } catch (err) {
    console.error("SEARCH API ERROR:", err.message);
    res.status(500).json({ error: "Failed to search videos" });
  }
});

module.exports = router;