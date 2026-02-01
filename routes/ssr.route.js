const express = require("express");
const axios = require("axios");
const router = express.Router();

const API_BASE = "https://justpaster.xyz/api/watchnsfw";

router.get("/watch-ssr", async (req, res) => {
  try {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send("Missing video ID");

    // Fetch video data from backend API
    const { data } = await axios.get(`${API_BASE}?ac=detail&ids=${videoId}`);
    const video = data?.list?.[0];
    if (!video) return res.status(404).send("Video not found");

    const title = (video.name || "Watch Video").replace(/"/g, '&quot;');
    const description = `Watch ${title} in HD for free on WatchNSFW.`;
    const thumb = video.thumb_url || video.poster_url || "https://www.watchnsfw.com/images/placeholder.png";
    const embedLink = video.embed_link || `https://www.watchnsfw.com/watch?id=${videoId}&embed=true`;
    const url = `https://www.watchnsfw.com/watch?id=${videoId}`;

    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} – WatchNSFW</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">

<!-- Open Graph -->
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="WatchNSFW">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${thumb}">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${thumb}">

<!-- JSON-LD Video Schema -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "${title}",
  "description": "${description}",
  "thumbnailUrl": "${thumb}",
  "uploadDate": "${video.created_at || new Date().toISOString()}",
  "duration": "${video.time ? `PT${video.time.replace(":", "M")}S` : ""}",
  "contentUrl": "${url}",
  "embedUrl": "${embedLink}",
  "publisher": {
    "@type": "Organization",
    "name": "WatchNSFW",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.watchnsfw.com/favicons/favicon-96x96.png"
    }
  }
}
</script>

<link rel="stylesheet" href="/assets/css/playback.css">
<link rel="stylesheet" href="/assets/css/header.css">
<link rel="stylesheet" href="/assets/css/style.css">
</head>
<body data-page="watch">
<div id="header"></div>

<div class="main-container">
  <div class="video-section">
    <div class="video-player" id="videoPlayerContainer">
      <div id="playerLoader" class="loader-spinner"></div>
      <iframe id="mainVideo" class="video-js" src="${embedLink}" frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen playsinline
      onload="document.getElementById('playerLoader').classList.add('hidden')">
      </iframe>
    </div>
    <h1 id="videoTitle">${title}</h1>
  </div>
</div>

<div id="footer"></div>

<script src="/assets/js/playback.js" defer></script>
<script src="/assets/js/header.js" defer></script>
<script src="/assets/js/ageVerification.js" defer></script>

</body>
</html>
`);
  } catch (err) {
    console.error("SSR /watch error:", err.message);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
