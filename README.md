# Transit Duty Selector

A 100% in-browser tool for senior bus operators to filter, compare, and shortlist their preferred shifts (duties) by joining driver Signup Reference PDFs with the matching Block Report PDFs. No backend, no uploads — your PDFs never leave your browser.

The app source lives under [`app/`](./app). See [`app/README.md`](./app/README.md) for component-level details.

## Quick start

```bash
cd app
npm install
npm run dev          # http://localhost:5173
```

## Deploying to GitHub Pages

This repo includes a GitHub Actions workflow that builds the `app/` and publishes `app/dist` to GitHub Pages on every push to `main`.

1. Create a new public repo on GitHub (e.g. `transit-duty-selector`).
2. From this directory, push:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Transit Duty Selector"
   git branch -M main
   git remote add origin git@github.com:<your-username>/transit-duty-selector.git
   git push -u origin main
   ```

3. In your repo on GitHub, go to **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. The next push to `main` runs `.github/workflows/deploy.yml`, which builds `app/dist` and deploys it. Your site will be available at `https://<your-username>.github.io/<your-repo>/`.

The Vite config already sets `base: './'`, so assets resolve correctly from any subpath GitHub Pages serves the site under.

## What's tracked vs. what's gitignored

The root `.gitignore` excludes:
- `node_modules/`, `dist/`, build artefacts
- `.DS_Store`, editor settings, local env files
- **`*.pdf`** — the sample schedule PDFs in this folder are real operator data and should not be committed. If you genuinely want to commit sample PDFs, delete the `*.pdf` line from `.gitignore`.
