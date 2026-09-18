#!/usr/bin/env python3
"""Generate api/articles.json from docs/ markdown files for the Flutter app."""

import json
import os
import re
import sys
from datetime import datetime, timezone

DOCS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs")
SITE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
OUTPUT = os.path.join(SITE_DIR, "api", "articles.json")
CARDS_DIR = os.path.join(SITE_DIR, "assets", "cards")

CATEGORY_DIRS = {
    "herbs": "Herbs",
    "medicines": "Medicines",
    "yoga": "Yoga",
    "concepts": "Concepts",
    "physiology": "Physiology",
    "practices": "Practices",
    "traditions": "Traditions",
    "manufacturers": "Manufacturers",
    "institutions": "Institutions",
    "resources": "Resources",
}

SKIP_FILES = {"index.md", "contributing.md", "all-articles.md", "CNAME"}


def parse_frontmatter(content):
    """Extract YAML frontmatter and body from markdown content."""
    if not content.startswith("---"):
        return {}, content

    end = content.find("---", 3)
    if end == -1:
        return {}, content

    frontmatter_str = content[3:end].strip()
    body = content[end + 3:].strip()

    # Simple YAML parser for our frontmatter
    meta = {}
    current_key = None
    current_list = None
    for line in frontmatter_str.split("\n"):
        line = line.rstrip()
        if not line:
            continue

        # List item
        if line.startswith("  - "):
            if current_list is not None:
                val = line.strip("- ").strip().strip('"').strip("'")
                current_list.append(val)
            continue

        # Key-value pair
        if ":" in line:
            key, _, val = line.partition(":")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if val:
                meta[key] = val
                current_key = key
                current_list = None
            else:
                # Start of a list
                meta[key] = []
                current_key = key
                current_list = meta[key]

    return meta, body


def find_first_image(content):
    """Find the first image reference in markdown content."""
    match = re.search(r"!\[.*?\]\(([^)]+)\)", content)
    if match:
        img_path = match.group(1)
        # Normalize to just the filename
        return os.path.basename(img_path)
    return None


_INLINE_IMG = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
_MD_EMPH = re.compile(r"[*_`]+")
_MD_HTML = re.compile(r"<[^>]+>")
_BULLET = re.compile(r"^[-*+]\s")


def extract_summary(body):
    """First real prose paragraph in the lead region (before the first '## '),
    stripped of markdown; matches the web card summaries."""
    in_lead = True
    for line in body.split("\n"):
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            if s.startswith("## "):
                in_lead = False
            continue
        if not in_lead:
            break
        if s.lower() == "[toc]" or s.startswith("!["):
            continue
        if s.startswith(("|", ">")) or _BULLET.match(s):
            continue
        t = _INLINE_IMG.sub("", s)
        t = _MD_LINK.sub(r"\1", t)
        t = _MD_HTML.sub("", t)
        t = _MD_EMPH.sub("", t)
        t = " ".join(t.split()).lstrip(" ,;:.-–—")
        if sum(1 for c in t if c.isalpha()) < 4:
            continue
        return t[:177].rstrip() + "…" if len(t) > 180 else t
    return ""


def _read_cards(name):
    """Read a card-feed JSON produced by the MkDocs build (may be absent)."""
    try:
        with open(os.path.join(CARDS_DIR, name), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def generate():
    articles = []
    categories = {}

    # Process category directories
    for dir_name, cat_name in CATEGORY_DIRS.items():
        cat_dir = os.path.join(DOCS_DIR, dir_name)
        if not os.path.isdir(cat_dir):
            continue

        count = 0
        for root, dirs, files in os.walk(cat_dir):
            for fname in files:
                if fname == "index.md" or not fname.endswith(".md"):
                    continue

                fpath = os.path.join(root, fname)
                rel_dir = os.path.relpath(root, DOCS_DIR)
                article_id = os.path.join(rel_dir, fname[:-3])  # Remove .md

                with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                    content = f.read()

                meta, body = parse_frontmatter(content)
                title = meta.get("title", fname[:-3].replace("_", " "))
                image = find_first_image(body)

                articles.append({
                    "id": article_id,
                    "title": title,
                    "category": dir_name,
                    "content": body,
                    "image": image,
                    "summary": extract_summary(body),
                })
                count += 1

        categories[dir_name] = {"id": dir_name, "name": cat_name, "count": count}

    # Process root-level articles
    root_count = 0
    for fname in os.listdir(DOCS_DIR):
        fpath = os.path.join(DOCS_DIR, fname)
        if not os.path.isfile(fpath) or not fname.endswith(".md"):
            continue
        if fname in SKIP_FILES:
            continue

        article_id = fname[:-3]

        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        meta, body = parse_frontmatter(content)
        title = meta.get("title", fname[:-3].replace("_", " "))
        image = find_first_image(body)

        articles.append({
            "id": article_id,
            "title": title,
            "category": "general",
            "content": body,
            "image": image,
            "summary": extract_summary(body),
        })
        root_count += 1

    categories["general"] = {"id": "general", "name": "General", "count": root_count}

    # Sort articles by title
    articles.sort(key=lambda a: a["title"].lower())

    # Recently updated + latest images (reuse the MkDocs build's card data).
    valid_ids = {a["id"] for a in articles}
    recent = [c["s"] for c in _read_cards("_recent.json")
              if c.get("s") in valid_ids]
    latest_images = [{"id": c["s"], "image": c["i"]}
                     for c in _read_cards("_latest_images.json")
                     if c.get("s") in valid_ids and c.get("i")]

    # Build output
    output = {
        "version": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total": len(articles),
        "categories": sorted(categories.values(), key=lambda c: -c["count"]),
        "recent": recent,
        "latestImages": latest_images,
        "articles": articles,
    }

    # Write output
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Generated {OUTPUT}")
    print(f"  Articles: {len(articles)}")
    print(f"  Categories: {len(categories)}")
    print(f"  File size: {os.path.getsize(OUTPUT) / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    generate()
