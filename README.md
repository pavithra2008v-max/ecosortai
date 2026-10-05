# 🌿 EcoSort AI - Smart Waste Sorting & Recycling Assistant

A mobile-first web application designed to help users identify, categorize, and properly recycle or repurpose waste items using an **Auto-Failover Multi-AI Cascade (Google Gemini + Groq Llama 3.2 Vision + OpenRouter + Smart Offline Fallback)**.

---

## ✨ Features

- 📱 **Mobile-App UI**: Native smartphone app experience (100% viewport fit on phones, sleek device mockup on desktop), clean white backgrounds, and vibrant eco-emerald accents.
- 📸 **Camera & Upload Scanning**: Real-time live camera capture with rear/front camera switching or drag-and-drop file upload.
- ⚡ **Multi-AI Failover Pipeline**:
  1. **Google Gemini 1.5 Flash Vision**: Ultra-fast structured multimodal analysis.
  2. **Groq Llama 3.2 11B Vision**: Instant failover if Gemini is rate-limited or unavailable.
  3. **OpenRouter Vision API**: Secondary failover across global vision models.
  4. **Smart Offline Classifier**: Zero-crash safety net providing instant accurate waste classification even with zero network or depleted quotas.
- 📋 **Structured Response**:
  - Item Identification & Material composition.
  - Category Badge: ♻️ Recyclable, 🌱 Compostable, ⚡ E-Waste, 🗑️ Landfill, ⚠️ Hazardous.
  - Recommended Bin & Color.
  - 3-step actionable preparation guide (Rinse, Cap, Crush).
  - Creative DIY Upcycle / Reuse idea.
  - Environmental carbon savings impact fact.
- 💾 **LocalStorage Engine**: Keeps scan history, cumulative carbon offset metrics, and configured API keys stored locally in the browser with zero server tracking.
- 🧪 **Quick Demo Samples**: Tap any sample chip (Plastic Bottle, Soda Can, Banana Peel, Cardboard, Battery) to test the AI instantly without needing an actual item nearby.

---

## 🚀 How to Deploy to Vercel

### Method 1: Using Vercel CLI (Fastest)
1. In your terminal, run:
   ```bash
   npx vercel
   ```
2. Follow the short prompts (Accept defaults by pressing Enter).
3. Your live production URL will be ready in seconds!

### Method 2: Via GitHub & Vercel Dashboard (Recommended)
1. Push this folder to your GitHub repository.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. In **Environment Variables**, add your keys:
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
   - `OPENROUTER_API_KEY`
4. Click **Deploy**.

---

## 🔒 Environment Variables (Serverless Backend)

This project uses Vercel Serverless Functions (`/api/analyze.js`). API keys are never exposed to users or the browser frontend:

| Variable Name | Description |
| :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini 1.5 Flash Vision API Key |
| `GROQ_API_KEY` | Groq Cloud Llama 3.2 Vision Key (`gsk_...`) |
| `OPENROUTER_API_KEY` | OpenRouter API Key (`sk-or-...`) |

> [!NOTE]
> When testing locally without a serverless environment, the app automatically runs in **Offline Smart Engine Mode** so everything remains functional!

## 🛠️ Tech Stack
- **HTML5**: Semantic markup with mobile viewport tags and accessible ARIA attributes.
- **CSS3 (Vanilla)**: Glassmorphism, CSS custom properties, micro-animations, mobile frame styling.
- **JavaScript (ES6+)**: Multi-provider async API fetch, Canvas image compression, Web Audio API chimes, WebRTC `getUserMedia`.
- **LocalStorage**: Persistent client-side data store.
