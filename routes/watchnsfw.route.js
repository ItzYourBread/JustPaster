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
// GET /home (INFINITE STYLE)
// =====================
const HOME_BATCH_SIZE = 100; // Number of videos per batch
const HOME_POOLS = {}; // Memory cache keyed by country

router.get("/home", async (req, res) => {
  try {
    if (!BASE) return res.status(500).json({ error: "API base not configured" });

    // 1️⃣ Params
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Number(req.query.limit) || 16; // what client requests per page

    // 2️⃣ Geo Detection
    const country =
      req.headers["cf-ipcountry"] ||
      req.headers["x-vercel-ip-country"] ||
      req.headers["x-country-code"] ||
      "DEFAULT";

    const prefs = GEO_PREFERENCES[country] || GEO_PREFERENCES.DEFAULT;
    const primaryKeyword = prefs.keywords[0] || "";

    // 3️⃣ Initialize pool if needed
    if (!HOME_POOLS[country]) HOME_POOLS[country] = [];

    const pool = HOME_POOLS[country];

    // 4️⃣ Determine if we need a new batch
    const totalRequested = page * pageSize;
    if (pool.length < totalRequested) {
      // Calculate which "upstream pages" to fetch
      let upstreamPage = Math.floor(pool.length / HOME_BATCH_SIZE) + 1;
      let remaining = totalRequested - pool.length;

      while (remaining > 0) {
        let url = `${BASE}?ac=videolist&pg=${upstreamPage}&limit=${HOME_BATCH_SIZE}`;
        if (country !== "DEFAULT" && primaryKeyword) {
          url += `&wd=${encodeURIComponent(primaryKeyword)}`;
        }

        console.log(`HOME FETCH [${country}] batch ${upstreamPage}: ${url}`);

        const { data } = await axios.get(url, { timeout: 15000 });

        if (!data || !Array.isArray(data.list) || data.list.length === 0) break;

        // Optional scoring
        const scored = data.list.map((v, i) => ({
          ...v,
          _score: scoreVideo(v, prefs, pool.length + i),
        })).sort((a, b) => b._score - a._score);

        pool.push(...scored);
        remaining -= scored.length;
        upstreamPage += 1;
      }
    }

    // 5️⃣ Slice the correct page for client
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = pool.slice(start, end);

    // 6️⃣ Send response
    res.json({
      page,
      pageSize,
      country,
      total: pool.length + 1000, // estimated total
      totalPages: Math.ceil((pool.length + 1000) / pageSize),
      list: pageItems
    });

    // 7️⃣ Optional: background fetch next batch if near the end
    if (end + pageSize >= pool.length) {
      const nextUpstreamPage = Math.floor(pool.length / HOME_BATCH_SIZE) + 1;
      const nextUrl = `${BASE}?ac=videolist&pg=${nextUpstreamPage}&limit=${HOME_BATCH_SIZE}` +
        (country !== "DEFAULT" && primaryKeyword ? `&wd=${encodeURIComponent(primaryKeyword)}` : "");

      axios.get(nextUrl, { timeout: 15000 })
        .then(({ data }) => {
          if (data && Array.isArray(data.list) && data.list.length > 0) {
            const scored = data.list.map((v, i) => ({
              ...v,
              _score: scoreVideo(v, prefs, pool.length + i),
            })).sort((a, b) => b._score - a._score);

            pool.push(...scored);
            console.log(`Background fetched ${scored.length} more videos for ${country}`);
          }
        })
        .catch(err => console.error("Background fetch failed:", err.message));
    }

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
// GET /related (FRONTEND PAGINATION)
// =====================
router.get("/related", async (req, res) => {
  try {
    if (!BASE) {
      return res.status(500).json({ error: "API base not configured" });
    }

    const fullQuery = (req.query.q || "").trim();
    const excludeId = req.query.exclude || "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const LIMIT = 200; // pool size

    let list = [];

    // HOME fallback
    if (!fullQuery || fullQuery === "undefined" || fullQuery === "Updating") {
      const home = await axios.get(`${BASE}?ac=videolist&pg=1&limit=${LIMIT}`);
      list = home.data.list || [];
    } else {
      const words = fullQuery.split(/\s+/);
      const attempts = [
        fullQuery,
        words.slice(0, 3).join(" "),
        words[0]
      ];

      for (const term of attempts) {
        if (!term || term.length < 3) continue;

        const url = `${BASE}?ac=videolist&wd=${encodeURIComponent(term)}&pg=1&limit=${LIMIT}`;
        const { data } = await axios.get(url, { timeout: 5000 });

        if (Array.isArray(data?.list) && data.list.length) {
          list = data.list;
          break;
        }
      }

      if (list.length === 0) {
        const fallback = await axios.get(`${BASE}?ac=videolist&pg=1&limit=${LIMIT}`);
        list = fallback.data.list || [];
      }
    }

    // Dedupe only (NO slicing)
    const related = list.filter(v => String(v.id) !== String(excludeId));

    res.json({
      list: related,
      total: related.length
    });

  } catch (err) {
    console.error("RELATED API ERROR:", err.message);
    res.json({ list: [], total: 0 });
  }
});

// =====================
// GET /search (HOME-style / pooled, safe batches)
// =====================
const SEARCH_BATCH_SIZE = 100; // safe per upstream request
const SEARCH_POOLS = {};       // in-memory pool keyed by query:sort

router.get("/search", async (req, res) => {
  try {
    if (!BASE) return res.status(500).json({ error: "API base not configured" });

    const query = (req.query.query || "").trim();
    const sort = req.query.sort || "relevance";
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Number(req.query.limit) || 16);

    if (!query) {
      return res.json({ page, pageSize, total: 0, totalPages: 0, list: [] });
    }

    // pool key
    const key = `${query}:${sort}`;
    if (!SEARCH_POOLS[key]) SEARCH_POOLS[key] = [];

    const pool = SEARCH_POOLS[key];

    // how many items required to satisfy this request
    const required = page * pageSize;

    // fetch batches until we have 'required' items or upstream returns no more
    if (pool.length < required) {
      let upstreamPage = Math.floor(pool.length / SEARCH_BATCH_SIZE) + 1;
      let remaining = required - pool.length;

      while (remaining > 0) {
        const url = `${BASE}?ac=videolist&wd=${encodeURIComponent(query)}&pg=${upstreamPage}&limit=${SEARCH_BATCH_SIZE}`;
        console.log(`SEARCH FETCH [${query}] batch ${upstreamPage}: ${url}`);

        try {
          const { data } = await axios.get(url, { timeout: 15000 });
          if (!data || !Array.isArray(data.list) || data.list.length === 0) break;

          // optional lightweight scoring/sort (same rules as before)
          let scored = data.list;
          if (sort === "relevance") {
            const lower = query.toLowerCase();
            scored = scored
              .map(v => ({ ...v, _score: (v.name || "").toLowerCase().includes(lower) ? 1 : 0 }))
              .sort((a, b) => b._score - a._score);
          } else if (sort === "latest") {
            scored.sort((a, b) => (b.time || 0) - (a.time || 0));
          }

          pool.push(...scored);
          remaining -= scored.length;
          upstreamPage += 1;

          // safety: avoid extremely large pools (memory cap)
          const POOL_CAP = 1000;
          if (pool.length >= POOL_CAP) break;

        } catch (err) {
          console.warn("SEARCH batch fetch failed:", err.message);
          break;
        }
      }
    }

    // slice page for response
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = pool.slice(start, end);

    // compute totalPages based on current pool (server-driven; client will use it)
    const totalPages = Math.max(1, Math.ceil(pool.length / pageSize));

    res.json({
      page,
      pageSize,
      total: pool.length,       // actual collected so far
      totalPages,
      list: pageItems
    });

    // background prefetch: if the client is near the end of the pool, fetch another batch
    if (end + pageSize >= pool.length) {
      const nextPage = Math.floor(pool.length / SEARCH_BATCH_SIZE) + 1;
      const nextUrl = `${BASE}?ac=videolist&wd=${encodeURIComponent(query)}&pg=${nextPage}&limit=${SEARCH_BATCH_SIZE}`;

      axios.get(nextUrl, { timeout: 15000 })
        .then(({ data }) => {
          if (data && Array.isArray(data.list) && data.list.length > 0) {
            let scored = data.list;
            if (sort === "relevance") {
              const lower = query.toLowerCase();
              scored = scored
                .map(v => ({ ...v, _score: (v.name || "").toLowerCase().includes(lower) ? 1 : 0 }))
                .sort((a, b) => b._score - a._score);
            } else if (sort === "latest") {
              scored.sort((a, b) => (b.time || 0) - (a.time || 0));
            }
            // apply pool cap check
            const POOL_CAP = 1000;
            const toPush = scored.slice(0, Math.max(0, POOL_CAP - pool.length));
            pool.push(...toPush);
            console.log(`Background fetched ${toPush.length} more items for search "${query}"`);
          }
        })
        .catch(err => console.warn("Background search fetch failed:", err.message));
    }

  } catch (err) {
    console.error("SEARCH API ERROR:", err.message);
    res.status(500).json({ error: "Failed to search videos" });
  }
});


module.exports = router;