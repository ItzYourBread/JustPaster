const express = require("express");
const fs = require("fs");
const path = require("path");
const { marked } = require("marked");

const router = express.Router();

const ARTICLES_DIR = path.join(__dirname, "../articles");

/* =========================
   HELPER: GET ALL ARTICLES
========================= */
function getAllArticles() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];

  return fs
    .readdirSync(ARTICLES_DIR)
    .filter(file => file.endsWith(".md"))
    .map(file => {
      const name = path.basename(file, ".md");

      // title-case from slug
      const title = name
        .replace(/-/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());

      return { name, title };
    });
}

/* =========================
   GET /api/articles
   (List all articles)
========================= */
router.get("/articles", (req, res) => {
  try {
    const articles = getAllArticles();

    res.json({
      total: articles.length,
      list: articles
    });
  } catch (err) {
    console.error("ARTICLES LIST ERROR:", err.message);
    res.status(500).json({ error: "Failed to load articles" });
  }
});

/* =========================
   GET /api/articles/:name
   (Single article)
========================= */
router.get("/articles/:name", (req, res) => {
  try {
    const name = req.params.name;
    const filePath = path.join(ARTICLES_DIR, `${name}.md`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Article not found" });
    }

    const markdown = fs.readFileSync(filePath, "utf8");
    const html = marked(markdown);

    const title = name
      .replace(/-/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());

    res.json({
      name,
      title,
      content: html
    });

  } catch (err) {
    console.error("ARTICLE READ ERROR:", err.message);
    res.status(500).json({ error: "Failed to load article" });
  }
});

module.exports = router;
