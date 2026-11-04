# ExitAhead — Next 5 Highway Exits & Services

A mobile-responsive road trip web app that displays an interactive highway map alongside the **next 5 upcoming highway exits**, their distances/ETAs, and nearby services (**Gas, Food, Lodging, EV Charging, and Rest Areas**).

## Features
- **Live GPS Tracking**: Uses `navigator.geolocation.watchPosition` to detect your current highway, speed, and travel direction.
- **Next 5 Exits Feed**: Shows official exit numbers, highway sign destinations, live distance countdowns (`mi` / `km`), and estimated minutes away.
- **Categorized Services**: Automatically finds and groups businesses within ~0.8 miles of each upcoming exit ramp into Gas, Food, Lodging, EV, and Rest Areas, with one-tap turn-by-turn directions.
- **Demo Drive & Test Corridors**: Test the app from anywhere using curated US Interstate corridors (`I-35`, `I-95`, `I-70`, `I-80`, `I-5`, `I-40`) or by clicking any highway on the map.

## Deployment
This project is a standalone static web app configured for **Vercel** via `vercel.json` (zero build step or API keys required).
