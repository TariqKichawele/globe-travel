# GlobeTravel: interactive 3D travel globe

A travel-agency landing page built around a real-time 3D Earth (three.js r160, no build step).
Visitors rotate and zoom the globe, click destination pins, and get a holiday card with photo,
description, price and a booking flow. Flight paths and an aircraft animate between selected places.

## Run it

The page loads textures over HTTP, so open it through a local web server rather than `file://`:

```bash
cd globe-travel
python3 -m http.server 8000
```

Then visit http://localhost:8000. Any static host (Netlify, GitHub Pages, S3, nginx) works as-is.

## What's included

| Requirement | Where |
| --- | --- |
| Realistic Earth with day texture, bump relief and ocean specular | `js/globe.js` → `EARTH_FRAG` |
| Atmospheric glow (limb scattering, twilight tint, sun-side forward scatter) | `ATMO_FRAG` + surface Fresnel |
| Drag to rotate, scroll/pinch to zoom, +/− and recentre buttons | `OrbitControls` + `zoomBy` / `resetView` |
| Auto-rotation that eases back in after ~2.5 s idle (9 s if a destination is open) | `_updateCamera` |
| 12 destinations placed by real latitude/longitude | `js/data.js`, `latLonToVector3()` |
| Click a pin (HTML label or 3D marker) → globe flies to it | `flyTo()` (spherical interpolation, ease-in-out) |
| Destination card: photo, rating, description, inclusions, flight time, local time, price | `renderCard()` in `js/main.js` |
| Search (name, country, region, tags, highlights) and category chips | `matches()` / `renderList()` |
| Selected destination highlighted: light beam, pulse ring, gold label, active list row | `_updateMarkers()` |
| Animated flight paths: great-circle arcs with flowing dashes and draw-in | `setRoute()` + `ARC_FRAG` |
| Multi-stop trips: “Add to trip” chains London → A → B …; next leg previews in white | `toggleTrip()` / `updateRoute()` |
| Book Holiday on every destination, plus “Book trip” for multi-stop | booking `<dialog>` |
| Responsive: 3-column desktop, compact mid-size, bottom sheet on phones | `css/style.css` media queries |
| **Bonus:** Day / Night / Live lighting (Live = real sun position for the current UTC time) | `_updateSun()`, `subsolarPoint()` |
| **Bonus:** clouds on their own sphere, drifting, casting soft shadows on the ground | `CLOUD_FRAG`, `uCloudOffset` |
| **Bonus:** city lights on the night side, dimmed under clouds | night branch of `EARTH_FRAG` |
| **Bonus:** aircraft flying along the selected route, banking, with blinking nav lights | `buildPlane()`, `_updateRoutes()` |

Extras: a “Flying from” picker with 11 departure airports (routes, flight times and prices follow it), saved destinations (heart, persisted in `localStorage`), deep links (`#tokyo`), keyboard shortcuts
(`/` search, `Esc` close, `[` `]` previous/next), swipe-down to close the phone sheet, reduced-motion support.

## Performance notes

- One draw call each for Earth, clouds, atmosphere and the 5,000-star field; markers share geometry.
- Labels are plain DOM elements positioned with `translate3d` (GPU composited), hidden when they face away.
- Flight-path geometry is rebuilt only when the route actually changes.
- Device pixel ratio is capped at 2, and `_adaptQuality()` lowers it in 0.25 steps if frames take longer than 25 ms,
  then raises it again once things are smooth.
- Lower sphere/star counts are used on narrow screens. The render loop pauses automatically in background tabs.

## Customising

- **Destinations:** edit `js/data.js`. Add `assets/images/<id>.jpg` (880×560) and `<id>-thumb.jpg` (240×172),
  plus a credits entry in `assets/images/credits.json`.
- **Departure airports:** visitors pick one from the “Flying from” menu (remembered between visits).
  Edit the `DEPARTURES` list in `js/data.js` to add or remove airports; the first entry is the default.
  Base prices are set from London and `priceFrom()` adjusts them by flight distance
  (`FARE_PER_KM`, about £0.05 per extra km, never below 55% of the base price).
- **Currency:** prices show in the departure airport's currency (GBP, EUR, USD, CAD, ZAR, INR, SGD).
  Each airport's `currency` and the exchange rates live in `CURRENCIES` in `js/data.js`. The rates are
  approximate fixed values, so update them (or load live rates) before taking real bookings.
  `step` controls price rounding, e.g. £899, R 26 799, ₹1,04,999.
- **Brand colours and fonts:** tokens at the top of `css/style.css`.
- **Default lighting:** `prefs` in `js/main.js` (`'night'`, `'day'` or `'live'`).

## Credits

- Earth textures (NASA Blue Marble / Black Marble derived) from the
  [three-globe](https://github.com/vasturiano/three-globe) examples (MIT).
- [three.js](https://threejs.org) r160, MIT licence (`js/vendor/three.LICENSE`).
- Destination photos from Wikimedia Commons under Creative Commons licences. Author and licence for each are
  in `assets/images/credits.json` and shown on each card and in the About dialog.
- Prices, ratings and reviews are sample data, and the booking form is a demo that sends nothing.
