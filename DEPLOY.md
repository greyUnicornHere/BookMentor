# 🚀 BookMentor — Deployment Guide

## What you have
A complete Next.js web app with:
- Beautiful landing page with PDF upload
- AI coaching chat interface
- Gap Assessment cards
- Session memory (localStorage)
- Secure API key handling (server-side only)

---

## Step 1 — Get your Gemini API Key

1. Go to https://aistudio.google.com/app/apikey
2. Sign in with your Google account (free)
3. Click **Create API Key**
4. Copy the key
5. Add billing at https://console.cloud.google.com — start with $5, enough for thousands of sessions

**Cost estimate:** Gemini 2.5 Flash costs ~$0.30/M input + $2.50/M output tokens. A typical coaching session costs less than $0.01.

---

## Step 2 — Set up GitHub

1. Go to https://github.com and create a free account if you don't have one
2. Click **New repository**
3. Name it `bookmentor`
4. Set to **Private**
5. Click **Create repository**

Then on your computer:
```bash
# Install Node.js first from https://nodejs.org (LTS version)

# Navigate to the bookmentor folder
cd bookmentor

# Initialize git and push
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bookmentor.git
git push -u origin main
```

---

## Step 3 — Deploy to Vercel

1. Go to https://vercel.com and sign up with your GitHub account
2. Click **Add New Project**
3. Import your `bookmentor` repository
4. In the **Environment Variables** section, add:
   - Key: `GEMINI_API_KEY`
   - Value: your key from Step 1
5. Click **Deploy**

✅ In 2-3 minutes, your app is live at a public URL like:
`https://bookmentor-yourname.vercel.app`

---

## Step 4 — Test it

1. Open your URL
2. Upload a PDF book
3. Start coaching

---

## Estimated Costs

| Usage | Monthly Cost |
|-------|-------------|
| 100 sessions | ~$3-5 |
| 500 sessions | ~$15-25 |
| 1000 sessions | ~$30-50 |

Vercel hosting is **free** for this scale.

---

## Updates (after changes)

```bash
git add .
git commit -m "Update"
git push
```
Vercel auto-deploys every push. ✅

---

## Need help?
Every step above is standard and well-documented. 
- Vercel docs: https://vercel.com/docs
- Anthropic docs: https://docs.anthropic.com
