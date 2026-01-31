const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const router = express.Router();
const BASE = process.env.XVID_API_BASE;

// =====================
// 🚫 GLOBAL BAN LIST
// =====================
const BAN_LIST = [
  // Sexual orientation / gender terms (your existing)
  "gay", "lesbian", "shemale", "trans", "ladyboy",
  "futa", "yaoi", "yuri", "sissy", "trap",

  // 🚫 Underage / age-restricted terms
  "teen", "teens", "teenage", "teenager",
  "minor", "minors",
  "underage", "under-age",
  "young girl", "young boy",
  "schoolgirl", "schoolboy",
  "highschool", "high school",
  "college girl", "college boy", // often misused
  "barely legal", "barely-legal",

  // Explicit age flags
  "-18", "under 18", "under18", "below 18",
  "17yo", "16yo", "15yo", "14yo",
  "17 y", "16 y", "15 y", "14 y",

  // Short numeric patterns (handled via includes)
  "18-", "<18"
];

function isSafe(video) {
  if (!video) return false;

  // collect many possible text fields (handles arrays, objects, different keys)
  const parts = [];

  const pushValue = v => {
    if (!v && v !== 0) return;
    if (Array.isArray(v)) return v.forEach(pushValue);
    if (typeof v === "object") {
      // common shapes: { name: "..." } or nested objects
      if (v.name) return pushValue(v.name);
      return Object.values(v).forEach(pushValue);
    }
    parts.push(String(v));
  };

  pushValue(video.name);
  pushValue(video.vod_name);
  pushValue(video.vod_title);
  pushValue(video.type_name);
  pushValue(video.description);
  pushValue(video.tag || video.tags || video.vod_tag);
  pushValue(video.actor);
  pushValue(video.actors);
  pushValue(video.cast);
  pushValue(video.category);
  pushValue(video.categories);
  pushValue(video.director);

  const text = parts.join(" ").toLowerCase();

  // Use word-boundary match to avoid accidental substring hits
  const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !BAN_LIST.some(word => {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "i");
    return re.test(text);
  });
}

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

        // New code: Filter first!
        const safeList = data.list.filter(isSafe); // <--- ADD THIS LINE

        const scored = safeList.map((v, i) => ({ // <--- Use safeList here
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

    if (!isSafe(videoRaw)) {
      return res.status(403).json({ error: "Content unavailable." });
    }

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
    const related = list
      .filter(v => String(v.id) !== String(excludeId))
      .filter(isSafe);

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

    if (BAN_LIST.some(w => query.toLowerCase().includes(w))) {
      return res.json({
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        list: []
      });
    }

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

          const safeVideos = scored.filter(isSafe);

          // ❗ HARD STOP if nothing safe found (prevents infinite loading)
          if (safeVideos.length === 0) break;

          pool.push(...safeVideos);
          remaining -= safeVideos.length;
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

            // 1. FILTER
            let scored = data.list.filter(isSafe);
            if (scored.length === 0) return;

            // 2. Sorting Logic (remains the same)
            if (sort === "relevance") {
              const lower = query.toLowerCase();
              scored = scored
                .map(v => ({ ...v, _score: (v.name || "").toLowerCase().includes(lower) ? 1 : 0 }))
                .sort((a, b) => b._score - a._score);
            } else if (sort === "latest") {
              scored.sort((a, b) => (b.time || 0) - (a.time || 0));
            }

            // 3. Pool Cap Check (remains the same)
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

// =====================
// GET /category (SAFE + PAGINATED)
// =====================
const CATEGORY_BATCH_SIZE = 100;
const CATEGORY_POOLS = {}; // key: categoryId

router.get("/category", async (req, res) => {
  try {
    if (!BASE) return res.status(500).json({ error: "API base not configured" });

    const categoryId = String(req.query.id || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.max(1, Number(req.query.limit) || 16);

    if (!categoryId) {
      return res.json({
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        list: []
      });
    }

    // Init pool
    if (!CATEGORY_POOLS[categoryId]) CATEGORY_POOLS[categoryId] = [];
    const pool = CATEGORY_POOLS[categoryId];

    const required = page * pageSize;

    if (pool.length < required) {
      let upstreamPage = Math.floor(pool.length / CATEGORY_BATCH_SIZE) + 1;
      let remaining = required - pool.length;

      while (remaining > 0) {
        const url = `${BASE}?ac=videolist&t=${categoryId}&pg=${upstreamPage}&limit=${CATEGORY_BATCH_SIZE}`;
        console.log(`CATEGORY FETCH [${categoryId}] page ${upstreamPage}`);

        const { data } = await axios.get(url, { timeout: 15000 });

        if (!data || !Array.isArray(data.list) || data.list.length === 0) break;

        // 🔐 SAFETY FILTER
        const safeVideos = data.list.filter(isSafe);
        if (safeVideos.length === 0) break;

        pool.push(...safeVideos);
        remaining -= safeVideos.length;
        upstreamPage += 1;

        // 🧠 Memory cap
        const POOL_CAP = 1000;
        if (pool.length >= POOL_CAP) break;
      }
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = pool.slice(start, end);

    res.json({
      page,
      pageSize,
      total: pool.length,
      totalPages: Math.max(1, Math.ceil(pool.length / pageSize)),
      list: pageItems
    });

  } catch (err) {
    console.error("CATEGORY API ERROR:", err.message);
    res.status(500).json({ error: "Failed to load category videos" });
  }
});


// =====================
// GET /sitemap-video.xml (Dynamic Generator)
// =====================
router.get("/sitemap-video.xml", async (req, res) => {
  try {
    // 1. Fetch the list (Make sure your API returns the full detail/episodes in the list)
    // If the list view doesn't include 'episodes', use 'ac=detail' instead of 'ac=videolist'
    const { data } = await axios.get(`${BASE}?ac=videolist&pg=1&limit=100`);
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
            xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">`;

    data.list.filter(isSafe).forEach(video => {
      // 2. Extract the actual link_embed correctly
      let playerUrl = "";
      try {
        const serverData = video.episodes.server_data;
        const firstKey = Object.keys(serverData)[0]; // Usually "Full"
        playerUrl = serverData[firstKey].link_embed;
      } catch (e) {
        // Fallback if structure is missing
        playerUrl = `https://www.watchnsfw.com/watch.html?id=${video.id}&embed=true`;
      }

      const pageUrl = `https://www.watchnsfw.com/watch.html?id=${video.id}`;
      const title = (video.name || "Video").replace(/&/g, '&amp;');
      const thumb = video.thumb_url || video.poster_url || "";

      xml += `
        <url>
            <loc>${pageUrl}</loc>
            <video:video>
                <video:thumbnail_loc>${thumb}</video:thumbnail_loc>
                <video:title>${title}</video:title>
                <video:description>Watch ${title} in HD on WatchNSFW.</video:description>
                <video:player_loc>${playerUrl}</video:player_loc> 
                <video:duration>600</video:duration>
                <video:publication_date>${video.created_at || new Date().toISOString()}</video:publication_date>
                <video:family_friendly>no</video:family_friendly>
            </video:video>
        </url>`;
    });

    xml += `</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).send("Sitemap Error");
  }
});

// =====================
// GET /bot-meta/:id 
// =====================
router.get("/bot-meta/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { data } = await axios.get(`${BASE}?ac=detail&ids=${id}`);
    
    if (!data?.list?.[0]) return res.status(404).send("Video Not Found");

    const video = data.list[0];
    const title = (video.name || "Watch Video").replace(/"/g, '&quot;');
    const thumb = video.thumb_url || video.poster_url || "";
    const pageUrl = `https://www.watchnsfw.com/watch.html?id=${id}`;

    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <meta property="og:title" content="${title}">
        <meta property="og:image" content="${thumb}">
        <meta property="og:description" content="Watch ${title} in HD on WatchNSFW.">
        <meta property="og:url" content="${pageUrl}">
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:image" content="${thumb}">
      </head>
      <body style="background:#000;"></body>
      </html>
    `);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

module.exports = router;