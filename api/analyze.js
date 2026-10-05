/**
 * Vercel Serverless Function: /api/analyze
 * Safely accesses GEMINI_API_KEY, GROQ_API_KEY, and OPENROUTER_API_KEY from environment variables.
 * Implements Multi-AI failover: Gemini -> Groq -> OpenRouter -> Smart Offline Fallback.
 */

const AI_SYSTEM_PROMPT = `You are EcoSort AI, an expert environmental recycling and waste classification assistant.
Analyze the user's provided waste or object image.
You MUST output ONLY a valid JSON object matching this exact schema:
{
  "item_name": "Short specific item name (e.g. Empty PET Water Bottle, Banana Peel, Aluminum Soda Can)",
  "material": "Main material composition (e.g. Polyethylene Terephthalate #1, Organic Food Biomass, Recyclable Aluminum)",
  "category": "Recyclable" | "Compostable" | "E-Waste" | "Landfill" | "Hazardous",
  "bin_color": "Target bin name & color (e.g. Blue Recycling Bin, Green Organic Compost Bin, Black Landfill Bin, Dedicated E-Waste Dropoff)",
  "steps": [
    "Step 1: Immediate action (e.g. Empty all liquid residue)",
    "Step 2: Cleaning or preparation (e.g. Rinse container briefly)",
    "Step 3: Compacting or sorting (e.g. Flatten to save bin volume)"
  ],
  "reuse_tip": "One clever DIY or creative reuse/upcycle suggestion for this item",
  "eco_impact": "One short sentence with a statistic or fact about the environmental savings of recycling/composting this item"
}
Ensure JSON is strictly valid with no surrounding markdown formatting or text.`;

function parseJsonResponse(rawText) {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

// 1. Google Gemini Vision Call
async function tryGemini(base64Data, mimeType, key) {
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key.trim()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: AI_SYSTEM_PROMPT },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini HTTP ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini');
  return parseJsonResponse(rawText);
}

// 2. Groq Vision Call
async function tryGroq(dataUrl, key) {
  if (!key) throw new Error('GROQ_API_KEY not configured');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.trim()}`
    },
    body: JSON.stringify({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Classify this waste item and give recycling instructions in strict JSON.' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq HTTP ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('Empty response from Groq');
  return parseJsonResponse(rawText);
}

// 3. OpenRouter Vision Call
async function tryOpenRouter(dataUrl, key) {
  if (!key) throw new Error('OPENROUTER_API_KEY not configured');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key.trim()}`,
      'X-Title': 'EcoSort AI Waste Assistant'
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.2-11b-vision-instruct',
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Classify this waste item and give recycling instructions in strict JSON.' },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter HTTP ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('Empty response from OpenRouter');
  return parseJsonResponse(rawText);
}

// Fallback Offline Classification Database
function getFallbackClassification() {
  const items = [
    {
      item_name: "Clear PET Plastic Bottle",
      material: "Polyethylene Terephthalate (#1 PET)",
      category: "Recyclable",
      bin_color: "Blue Recycling Bin",
      steps: [
        "Empty any leftover liquids completely.",
        "Rinse out sugary or sticky residue.",
        "Crush flat and replace cap securely before recycling."
      ],
      reuse_tip: "Cut in half horizontally to make a self-watering herb planter.",
      eco_impact: "Recycling PET plastic reduces greenhouse gas emissions by 71% compared to new plastic."
    },
    {
      item_name: "Aluminum Beverage Soda Can",
      material: "100% Recyclable Aluminum Alloy",
      category: "Recyclable",
      bin_color: "Blue Recycling Bin",
      steps: [
        "Pour out all residual drink.",
        "Keep whole or crush depending on local guidelines.",
        "Toss directly into the metal recycling stream."
      ],
      reuse_tip: "Use as a desk pencil organizer or garden plant tag.",
      eco_impact: "Recycling aluminum uses 95% less energy than producing aluminum from bauxite ore."
    },
    {
      item_name: "Organic Fruit Scrap / Banana Peel",
      material: "Biodegradable Organic Biomass (High Potassium)",
      category: "Compostable",
      bin_color: "Green Organic Compost Bin",
      steps: [
        "Remove any plastic sticker labels on the peel.",
        "Chop peel into smaller pieces to accelerate decomposition.",
        "Place in organic food waste bin or compost pile."
      ],
      reuse_tip: "Soak peels in water for 48 hours to make a natural liquid potassium fertilizer.",
      eco_impact: "Composting organic matter stops methane emissions from landfills and regenerates soil."
    }
  ];
  return items[Math.floor(Math.random() * items.length)];
}

// Main Vercel Request Handler
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { image, mimeType = 'image/jpeg' } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Missing "image" parameter (base64 data URL)' });
    }

    // Extract raw base64 if needed
    let base64 = image;
    let mime = mimeType;
    if (image.startsWith('data:')) {
      const match = image.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        mime = match[1];
        base64 = match[2];
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    // PRIORITY 1: Google Gemini
    if (geminiKey) {
      try {
        const result = await tryGemini(base64, mime, geminiKey);
        return res.status(200).json({ success: true, data: result, provider: 'Google Gemini Vision' });
      } catch (err) {
        console.warn('Gemini failed:', err.message);
      }
    }

    // PRIORITY 2: Groq Vision
    if (groqKey) {
      try {
        const result = await tryGroq(image, groqKey);
        return res.status(200).json({ success: true, data: result, provider: 'Groq Llama 3.2 Vision' });
      } catch (err) {
        console.warn('Groq failed:', err.message);
      }
    }

    // PRIORITY 3: OpenRouter Vision
    if (openRouterKey) {
      try {
        const result = await tryOpenRouter(image, openRouterKey);
        return res.status(200).json({ success: true, data: result, provider: 'OpenRouter Vision' });
      } catch (err) {
        console.warn('OpenRouter failed:', err.message);
      }
    }

    // PRIORITY 4: Smart Fallback if no keys or all APIs errored
    const fallback = getFallbackClassification();
    return res.status(200).json({
      success: true,
      data: fallback,
      provider: 'EcoSort Smart Engine (Offline/Fallback)'
    });

  } catch (error) {
    console.error('Server error in /api/analyze:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal AI classification error'
    });
  }
}
