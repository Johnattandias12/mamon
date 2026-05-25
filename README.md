# Mamon

A privacy first personal finance dashboard. Drop in your bank statement CSV and Mamon reads it entirely in your browser to show balances, spending breakdowns and charts. Nothing is uploaded, nothing is stored, your data never leaves your machine.

Live: https://mamon-azure.vercel.app

## How it works

1. Export your statement as a CSV from your bank
2. Drag and drop the file onto the page
3. Everything is parsed client side with Papa Parse and rendered with Chart.js

## Features

- Drag and drop CSV import
- Spending by category, income vs expense, balance over time
- Export a cleaned CSV back out
- Dark, responsive UI

## Privacy

All processing happens locally in your browser. No server, no upload, no tracking. CSV files are gitignored, so personal data never gets committed.

## Stack

Vanilla JavaScript, Papa Parse, Chart.js. Static site, no build step.
