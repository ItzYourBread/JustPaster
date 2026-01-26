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
// 🚫 GLOBAL BAN LIST
// =====================
const BAN_LIST = [
  "gay", "lesbian", "shemale", "trans", "ladyboy",
  "futa", "yaoi", "yuri", "sissy", "trap"
];

/**
 * Checks if a video is "safe" (does not contain banned keywords).
 * Returns true if safe, false if banned.
 */
function isSafe(video) {
  if (!video) return false;
  
  // Combine all searchable text fields into one string for checking
  const text = (
    (video.name || "") + " " +
    (video.type_name || "") + " " +
    (video.actor || []).join(" ") + " " +
    (video.quality || "")
  ).toLowerCase();

  // Check against ban list
  for (const word of BAN_LIST) {
    if (text.includes(word)) {
      return false; // Found a banned word
    }
  }
  
  return true; // No banned words found
}

// =====================
// HELPER: SCORE VIDEO
// =====================
function scoreVideo(video, prefs, index = 0) {
  let score = 0;
  const text = ((video.name || "") + " " + (video.type_name || "")).toLowerCase();

  for (const kw of prefs.keywords || []) if (text.includes(kw)) score += prefs.boost;
  for (const lang of prefs.languages || []) if (text.includes(lang)) score += 1.2;
  for (const cat of prefs.categories || []) if (text.includes(cat)) score += 1.5;
  for (const bad of prefs.penalty || []) if (text.includes(bad)) score -= 2;

  // Pagination entropy
  score += (index % 7) * 0.15;
  score += Math.random() * 0.3;

  return score;
}

// =====================
// GET /home (INFINITE STYLE + BAN FILTER)
// =====================
const HOME_BATCH_SIZE = 100;
const HOME_POOLS = {};

router.get("/home", async (req, res) => {
  try {
    if (!BASE) return res.status(500).json({ error: "API base not configured" });

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Number(req.query.limit) || 16;
    const country = req.headers["cf-ipcountry"] || "DEFAULT";
    const prefs = GEO_PREFERENCES[country] || GEO_PREFERENCES.DEFAULT;
    const primaryKeyword = prefs.keywords[0] || "";

    if (!HOME_POOLS[country]) HOME_POOLS[country] = [];
    const pool = HOME_POOLS[country];

    const totalRequested = page * pageSize;
    
    // Fetch more if needed
    if (pool.length < totalRequested) {
      let upstreamPage = Math.floor(pool.length / HOME_BATCH_SIZE) + 1;
      let remaining = totalRequested - pool.length;
      let attempts = 0; // Safety break to prevent infinite loops

      while (remaining > 0 && attempts < 10) {
        attempts++;
        let url = `${BASE}?ac=videolist&pg=${upstreamPage}&limit=${HOME_BATCH_SIZE}`;
        if (country !== "DEFAULT" && primaryKeyword) {
          url += `&wd=${encodeURIComponent(primaryKeyword)}`;
        }

        console.log(`HOME FETCH [${country}] batch ${upstreamPage}`);

        const { data } = await axios.get(url, { timeout: 15000 });

        if (!data || !Array.isArray(data.list) || data.list.length === 0) break;

        // 🛡️ 1. FILTER BANNED CONTENT
        const safeList = data.list.filter(isSafe);

        // 2. Score only the safe videos
        const scored = safeList.map((v, i) => ({
          ...v,
          _score: scoreVideo(v, prefs, pool.length + i),
        })).sort((a, b) => b._score - a._score);

        pool.push(...scored);
        
        // Only decrease remaining by how many SAFE videos we actually added
        remaining -= scored.length; 
        upstreamPage += 1;
      }
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = pool.slice(start, end);

    res.json({
      page,
      pageSize,
      country,
      total: pool.length + 1000,
      totalPages: Math.ceil((pool.length + 1000) / pageSize),
      list: pageItems
    });

  } catch (err) {
    console.error("HOME API ERROR:", err.message);
    res.status(500).json({ error: "Failed to load home videos" });
  }
});

// =====================
// GET /watch/:id (WITH BAN CHECK)
// =====================
router.get("/watch/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const url = `${BASE}?ac=detail&ids=${id}`;
    const { data } = await axios.get(url);

    if (!data || !data.list || !data.list[0]) {
      return res.status(404).json({ error: "Video not found" });
    }

    const videoRaw = data.list[0];

    // 🛡️ BLOCK if specific video is banned (even if linked directly)
    if (!isSafe(videoRaw)) {
         return res.status(403).json({ error: "Content unavailable." });
    }

    let embedLink = "";
    if (videoRaw.episodes && videoRaw.episodes.server_data) {
      const serverData = videoRaw.episodes.server_data;
      const episodeKeys = Object.keys(serverData);
      if (episodeKeys.length > 0) {
        embedLink = serverData[episodeKeys[0]].link_embed || "";
      }
    }

    const video = {
      id: videoRaw.id,
      name: videoRaw.name,
      description: videoRaw.description || "No description",
      thumb_url: videoRaw.thumb_url || videoRaw.poster_url || "",
      time: videoRaw.time || "00:00",
      embed_link: embedLink,
      actors: videoRaw.actor || [],
      likes: videoRaw.likes || 0
    };
    res.json(video);

  } catch (err) {
    console.error("WATCH API ERROR:", err.message);
    res.status(500).json({ error: "Failed to load video" });
  }
});

// =====================
// GET /related (WITH BAN FILTER)
// =====================
router.get("/related", async (req, res) => {
  try {
    const fullQuery = (req.query.q || "").trim();
    const excludeId = req.query.exclude || "";
    const LIMIT = 200;
    let list = [];

    // 🛡️ Pre-check: If query itself contains banned words, return empty immediately
    if (!isSafe({ name: fullQuery })) {
        return res.json({ list: [], total: 0 });
    }

    if (!fullQuery || fullQuery === "undefined" || fullQuery === "Updating") {
      const home = await axios.get(`${BASE}?ac=videolist&pg=1&limit=${LIMIT}`);
      list = home.data.list || [];
    } else {
      const words = fullQuery.split(/\s+/);
      const attempts = [fullQuery, words.slice(0, 3).join(" "), words[0]];

      for (const term of attempts) {
        if (!term || term.length < 3) continue;
        const url = `${BASE}?ac=videolist&wd=${encodeURIComponent(term)}&pg=1&limit=${LIMIT}`;
        const { data } = await axios.get(url, { timeout: 5000 });

        if (Array.isArray(data?.list) && data.list.length) {
          list = data.list;
          break;
        }
      }
    }

    // 🛡️ FILTER LIST
    const related = list
      .filter(v => String(v.id) !== String(excludeId))
      .filter(isSafe); // Apply ban filter here

    res.json({ list: related, total: related.length });

  } catch (err) {
    console.error("RELATED API ERROR:", err.message);
    res.json({ list: [], total: 0 });
  }
});

// =====================
// GET /search (WITH BAN FILTER)
// =====================
const SEARCH_POOLS = {};

router.get("/search", async (req, res) => {
  try {
    const query = (req.query.query || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Number(req.query.limit) || 16);

    // 🛡️ Instant block if search query contains banned words
    if (!query || !isSafe({ name: query })) {
      return res.json({ page, pageSize, total: 0, totalPages: 0, list: [] });
    }

    const key = `${query}`; // Simple key
    if (!SEARCH_POOLS[key]) SEARCH_POOLS[key] = [];
    const pool = SEARCH_POOLS[key];
    const required = page * pageSize;

    if (pool.length < required) {
      let upstreamPage = Math.floor(pool.length / 100) + 1;
      let remaining = required - pool.length;
      let attempts = 0;

      while (remaining > 0 && attempts < 10) {
        attempts++;
        const url = `${BASE}?ac=videolist&wd=${encodeURIComponent(query)}&pg=${upstreamPage}&limit=100`;
        console.log(`SEARCH FETCH [${query}] batch ${upstreamPage}`);

        try {
          const { data } = await axios.get(url, { timeout: 15000 });
          if (!data || !Array.isArray(data.list) || data.list.length === 0) break;

          // 🛡️ FILTER & ADD TO POOL
          const safeVideos = data.list.filter(isSafe);
          
          pool.push(...safeVideos);
          remaining -= safeVideos.length; // Decrement only if we found safe videos
          upstreamPage += 1;

          if (pool.length >= 1000) break; // Memory cap

        } catch (err) { break; }
      }
    }

    const pageItems = pool.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      page,
      pageSize,
      total: pool.length,
      totalPages: Math.max(1, Math.ceil(pool.length / pageSize)),
      list: pageItems
    });

  } catch (err) {
    res.status(500).json({ error: "Failed to search" });
  }
});

module.exports = router;