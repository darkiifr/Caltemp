# Privacy Policy

**Last updated: April 26, 2026**

## Overview

Caltemp is a free and open source calendar application developed by darkiifr.
This privacy policy explains how the application handles user data.

## Data Collection

Caltemp does **not** collect, store, or transmit any personal data.

- No analytics or telemetry are included in the application.
- No user accounts or registration are required.
- No data is sent to external servers.

## Local Storage

All data created by the user (calendar events, preferences, etc.) is stored **locally** on the user's device only and is never shared with third parties.

## Third-party Services

Caltemp does not integrate any third-party tracking, advertising, or analytics services.

Some features contact external services, only when you use them:

- **ICS subscriptions**: Caltemp downloads the calendar URLs you subscribe to, from the servers that host them.
- **Reminders map**: map tiles are loaded from OpenStreetMap (`tile.openstreetmap.org`) or, if you choose "Plan IGN", from the French Géoplateforme (`data.geopf.fr`). Like any image download, this reveals the area of the map being viewed and your IP address to the tile server.
- **Place lookup (geocoding)**: when you click "Localiser" in the event editor or on the map, or enable "Localiser automatiquement les nouveaux lieux", the **text of the event location only** (never the title, description or date) is sent to OpenStreetMap Nominatim (`nominatim.openstreetmap.org`) to find its coordinates. Automatic lookup is off by default. Results are cached locally in `geocache.json`.


## Contact

For any questions regarding this privacy policy, please open an issue on the [GitHub repository](https://github.com/darkiifr/Caltemp).
