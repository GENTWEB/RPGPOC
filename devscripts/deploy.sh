cd server && npm test && cd ..
git add server/services/llmGateway.js client/src/components/TopBar.jsx
git commit -m "Add rich GM model picker with descriptions & speed icons, hamburger nav, and 21s timeout guard"
git push origin main
git push heroku main
cd client && npm run build && npx gh-pages -d dist && cd ..