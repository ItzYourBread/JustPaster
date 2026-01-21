const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const router = express.Router();
const BASE = "https://xvidapi.com/api.php/provide/vod";

/**
 * GET /api/watchnsfw/home?page=1
 * Homepage feed (semi-random, paginated)
 */
router.get("/home", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;

    if (!BASE) {
      console.error("XVID_API_BASE is missing");
      return res.status(500).json({ error: "API base not configured" });
    }

    const url = `${BASE}?ac=videolist&page=${page}`;
    console.log("FETCHING:", url);

    const { data } = await axios.get(url);

    if (!data || !Array.isArray(data.list)) {
      return res.status(500).json({ error: "Invalid API response" });
    }

    // Shuffle the list
    const shuffled = [...data.list].sort(() => 0.5 - Math.random());

    res.json({
      page,
      total: data.total || shuffled.length,
      list: shuffled.slice(0, 24)
    });
  } catch (err) {
    console.error("HOME API ERROR:", err.message);
    res.status(500).json({ error: "Failed to load home videos" });
  }
});

/**
 * GET /api/watchnsfw/watch/:id
 * Returns video details for watch.html
 */
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

module.exports = router;
