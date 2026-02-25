'use strict';

const PROVIDER_DOCS = {
  openai: 'https://platform.openai.com/docs/models',
  anthropic: 'https://docs.anthropic.com/en/docs/models-overview',
  google: 'https://ai.google.dev/gemini-api/docs/models/gemini',
  groq: 'https://console.groq.com/docs/models',
  cerebras: 'https://docs.cerebras.ai/api-reference/models',
  nvidia: 'https://docs.api.nvidia.com/nim/reference/models'
};

async function scrapeProviderModels(providerId) {
  const url = PROVIDER_DOCS[providerId];
  if (!url) return [];

  try {
    const playwright = await import('playwright');
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const content = await page.content();
    await browser.close();

    return extractModelsFromHtml(providerId, content);
  } catch (error) {
    console.warn(`[DocsScraper] Playwright unavailable or failed for ${providerId}:`, error.message || error);
    return [];
  }
}

function extractModelsFromHtml(providerId, html) {
  const matches = new Set();
  const patterns = [
    /[a-z0-9-]+\/[a-z0-9-_.]+/gi,
    /[a-z]+-[0-9.]+[a-z0-9-_.]*/gi
  ];

  for (const pattern of patterns) {
    const list = html.match(pattern) || [];
    list.forEach((item) => {
      if (item.toLowerCase().includes(providerId)) {
        matches.add(item);
      }
    });
  }

  return Array.from(matches).map((id) => ({ id, contextTokens: 128000, deprecated: false }));
}

module.exports = { scrapeProviderModels };
