# ⚽ FIFA World Cup 2026 API (Fork)

> **⚠️ Disclaimer:** This is a fork of the [original project](https://github.com/rezarahiminia/worldcup2026) with added **local mirroring capabilities**. It is specifically configured to keep data in sync with the live API and optimized for use with [**ravena-ai**](https://github.com/moothz/ravena-ai).
> 
> 🌐 **Live Fork URL:** [https://wc2026.moothz.win](https://wc2026.moothz.win)
> 📖 **Fork API Docs:** [https://wc2026.moothz.win/api-docs/](https://wc2026.moothz.win/api-docs/)

### 🛠️ Fork Improvements
- **Live Sync Service**: Includes `sync-live-data.js` to automatically mirror scores and standings from the upstream API every 5 minutes.
- **Automation**: Custom `update-from-upstream.sh` script to pull updates, re-apply local patches, and restart services.
- **PM2 Ready**: Pre-configured `ecosystem.config.js` for managing both the API and the sync service.

---
