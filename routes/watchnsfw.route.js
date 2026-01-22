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
// GET /home
// =====================
router.get("/home", async (req, res) => {
  try {
    if (!BASE) {
      return res.status(500).json({ error: "API base not configured" });
    }

    const PAGE_SIZE = 32;
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    // -------------------
    // GEO DETECTION
    // -------------------
    const country =
      req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      "DEFAULT";

    const prefs = GEO_PREFERENCES[country] || GEO_PREFERENCES.DEFAULT;

    // -------------------
    // FETCH MULTIPLE PAGES
    // -------------------
    const FETCH_PAGES = 4; // 4 × ~30 = ~120 videos pool
    const requests = [];

    for (let i = 1; i <= FETCH_PAGES; i++) {
      requests.push(
        axios.get(`${BASE}?ac=videolist&page=${i}`, { timeout: 8000 })
      );
    }

    const responses = await Promise.all(requests);

    // -------------------
    // MERGE + DEDUPE
    // -------------------
    const map = new Map();

    for (const r of responses) {
      if (!Array.isArray(r.data?.list)) continue;

      for (const video of r.data.list) {
        if (!map.has(video.id)) {
          map.set(video.id, video);
        }
      }
    }

    const uniqueVideos = Array.from(map.values());

    // -------------------
    // GEO SCORING (STABLE)
    // -------------------
    const scored = uniqueVideos.map((video, index) => ({
      ...video,
      _score: scoreVideo(video, prefs) + index * 0.00001 // keeps order stable
    }));

    scored.sort((a, b) => b._score - a._score);

    // -------------------
    // PAGINATION (REAL)
    // -------------------
    const paged = scored.slice(offset, offset + PAGE_SIZE);

    res.json({
      page,
      pageSize: PAGE_SIZE,
      country,
      total: scored.length,
      list: paged
    });

  } catch (err) {
    console.error("HOME API ERROR:", err.message);
    res.status(500).json({ error: "Failed to load home videos" });
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

    const query = (req.query.query || "").toLowerCase().trim();
    const sort = req.query.sort || "relevance";
    const page = Math.max(1, Number(req.query.page) || 1);

    const PAGE_SIZE = 32;
    const offset = (page - 1) * PAGE_SIZE;

    if (!query) {
      return res.json({
        page,
        totalPages: 0,
        list: []
      });
    }

    // -------------------
    // GEO DETECTION
    // -------------------
    const country =
      req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      "DEFAULT";

    const prefs = GEO_PREFERENCES[country] || GEO_PREFERENCES.DEFAULT;

    // -------------------
    // FETCH MULTIPLE PAGES
    // -------------------
    const FETCH_PAGES = 5; // ~150 videos pool
    const requests = [];

    for (let i = 1; i <= FETCH_PAGES; i++) {
      requests.push(
        axios.get(`${BASE}?ac=videolist&page=${i}`, { timeout: 8000 })
      );
    }

    const responses = await Promise.allSettled(requests);

    // -------------------
    // MERGE + DEDUPE
    // -------------------
    const map = new Map();

    for (const r of responses) {
      if (r.status !== "fulfilled") continue;
      if (!Array.isArray(r.value.data?.list)) continue;

      for (const video of r.value.data.list) {
        if (!map.has(video.id)) {
          map.set(video.id, video);
        }
      }
    }

    const allVideos = Array.from(map.values());

    const scored = allVideos.map((video, index) => {
      let score = scoreVideo(video, prefs, index);

      const text = (
        (video.name || "") +
        " " +
        (video.type_name || "") +
        " " +
        (video.actor || []).join(" ")
      ).toLowerCase();

      // Strong match
      if (text.includes(query)) score += 4;

      // Partial word match
      for (const word of query.split(" ")) {
        if (text.includes(word)) score += 1.2;
      }

      return { ...video, _score: score };
    });


    // -------------------
    // SORTING
    // -------------------
    if (sort === "latest") {
      scored.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
    }
    else if (sort === "most_viewed") {
      scored.sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
    }
    else {
      // relevance (default)
      scored.sort((a, b) => b._score - a._score);
    }

    // -------------------
    // PAGINATION
    // -------------------
    const paged = scored.slice(offset, offset + PAGE_SIZE);
    const totalPages = Math.ceil(scored.length / PAGE_SIZE);

    res.json({
      page,
      country,
      sort,
      totalPages,
      list: paged
    });

    console.log(`SEARCH: "${query}" | Country: ${country} | Results: ${scored.length} | Page: ${page}/${totalPages}`);

  } catch (err) {
    console.error("SEARCH API ERROR:", err.message);
    res.status(500).json({ error: "Failed to search videos" });
  }
});

module.exports = router;