# Oonly Tracker CDN

Privacy-focused analytics tracker with session replay capabilities, automatically obfuscated and deployed via CDN.

## 🚀 Quick Start

### For Customers (Integration)

Add this snippet to your website:

```html
<script async src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/oonly-cdn@v1.0.0/dist/oonly.min.js"
        data-project-id="YOUR_PROJECT_ID"></script>
```

Replace:
- `YOUR_USERNAME` with your GitHub username
- `YOUR_PROJECT_ID` with your Oonly project ID

### For Developers (Deployment)

1. **Push to main branch** → Auto-deploys to GitHub Pages
2. **Create a tag** (e.g., `v1.0.1`) → Creates GitHub Release with jsDelivr CDN URL

## 📁 Project Structure

```
oonly-cdn/
├── src/
│   └── tracker.js          # Your tracker source code
├── dist/                   # Build outputs (auto-generated)
├── scripts/
│   └── build.mjs          # Build script
├── obfuscator.config.json # Obfuscation settings
├── .github/workflows/
│   └── deploy.yml         # CI/CD pipeline
└── package.json
```

## 🔧 Development

### Local Build

```bash
# Install dependencies
npm install

# Build and obfuscate
npm run release

# Or just build
npm run build
```

### Build Outputs

- `dist/oonly.raw.js` - Original source (for debugging)
- `dist/oonly.min.js` - Obfuscated production build

## 🌐 CDN URLs

### GitHub Pages (Auto-updates on main push)
```
https://YOUR_USERNAME.github.io/oonly-cdn/oonly.min.js
```

### jsDelivr (Main branch - cached)
```
https://cdn.jsdelivr.net/gh/YOUR_USERNAME/oonly-cdn/dist/oonly.min.js
```

### jsDelivr (Version-pinned - recommended for production)
```
https://cdn.jsdelivr.net/gh/YOUR_USERNAME/oonly-cdn@v1.0.0/dist/oonly.min.js
```

## 🛡️ Obfuscation

The tracker is automatically obfuscated using [javascript-obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator) with:

- **Public API preserved**: `window.oonly.*` methods remain callable
- **Internals obfuscated**: Core logic becomes unreadable
- **Performance optimized**: Safe obfuscation levels for production

### Reserved Names (Protected from obfuscation)
- `oonly`
- `track`
- `identify`
- `set`
- `getUserProperties`
- `getActiveSegments`
- `isInSegment`
- `updateSegmentCache`
- `refreshSegments`
- `getSegmentAnalytics`
- `trackSegmentInteraction`

## 🔄 CI/CD Pipeline

### Automatic Deployment
- **On push to main**: Builds, obfuscates, and deploys to GitHub Pages
- **On tag push**: Creates GitHub Release with CDN-ready files

### Manual Release
```bash
# Create and push a new version tag
git tag v1.0.1
git push origin v1.0.1
```

## 📊 Monitoring

- **GitHub Actions**: View build status and deployment logs
- **GitHub Pages**: Monitor deployment status
- **jsDelivr**: Check CDN performance and uptime

## 🔒 Security Features

- **Domain Locking**: Optional domain restriction (configure in `obfuscator.config.json`)
- **Source Maps**: Disabled for production builds
- **Console Output**: Disabled in production
- **Self-Defending**: Code formatting protection

## 🚨 Troubleshooting

### Build Issues
1. Check Node.js version (requires 18+)
2. Verify `obfuscator.config.json` syntax
3. Check GitHub Actions logs

### Integration Issues
1. Verify CDN URL is accessible
2. Check browser console for errors
3. Ensure `data-project-id` is set correctly

### Performance Issues
- Lower obfuscation thresholds in `obfuscator.config.json`
- Disable `numbersToExpressions` if needed
- Reduce `controlFlowFlatteningThreshold`

## 📝 License

UNLICENSED - Private repository
