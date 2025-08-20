# 🚀 Deployment Checklist

## Pre-Deployment Setup

### 1. GitHub Repository Configuration
- [ ] Enable GitHub Pages in repository settings
  - Go to Settings → Pages
  - Source: "GitHub Actions"
- [ ] Ensure repository is public (for jsDelivr CDN)
- [ ] Verify GitHub Actions permissions are enabled

### 2. Replace Placeholder Tracker Code
- [ ] Replace `src/tracker.js` with your actual tracker implementation
- [ ] Ensure your tracker exposes the `window.oonly` object
- [ ] Test locally with `npm run release`

### 3. Update Configuration
- [ ] Update `obfuscator.config.json` reserved names if your API differs
- [ ] Add your domain to `domainLock` array if desired
- [ ] Verify `data-project-id` attribute in integration snippets

## First Deployment

### 1. Push to Main Branch
```bash
git add .
git commit -m "Initial CDN setup with obfuscation"
git push origin main
```

### 2. Monitor GitHub Actions
- [ ] Check Actions tab for build status
- [ ] Verify GitHub Pages deployment
- [ ] Test the Pages URL: `https://YOUR_USERNAME.github.io/oonly-cdn/oonly.min.js`

### 3. Create First Release
```bash
git tag v1.0.0
git push origin v1.0.0
```

- [ ] Verify GitHub Release was created
- [ ] Check jsDelivr CDN URL: `https://cdn.jsdelivr.net/gh/YOUR_USERNAME/oonly-cdn@v1.0.0/dist/oonly.min.js`

## Integration Testing

### 1. Test CDN URLs
- [ ] Verify GitHub Pages URL loads
- [ ] Verify jsDelivr URL loads
- [ ] Check file size and load time

### 2. Test Obfuscation
- [ ] Download obfuscated file
- [ ] Verify public API methods are callable
- [ ] Confirm internals are unreadable

### 3. Test Integration
- [ ] Use `test-integration.html` locally
- [ ] Test on different browsers
- [ ] Verify tracking events fire correctly

## Production Deployment

### 1. Update Integration Snippets
Replace placeholder URLs in your documentation:
```html
<!-- Before -->
<script async src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/oonly-cdn@v1.0.0/dist/oonly.min.js"
        data-project-id="YOUR_PROJECT_ID"></script>

<!-- After (with your actual username) -->
<script async src="https://cdn.jsdelivr.net/gh/yourusername/oonly-cdn@v1.0.0/dist/oonly.min.js"
        data-project-id="YOUR_PROJECT_ID"></script>
```

### 2. Customer Communication
- [ ] Share CDN URLs with customers
- [ ] Provide integration documentation
- [ ] Set up monitoring/alerting

## Ongoing Maintenance

### 1. Regular Updates
- [ ] Push tracker updates to main branch
- [ ] Create version tags for major releases
- [ ] Monitor CDN performance

### 2. Version Management
- [ ] Use semantic versioning (v1.0.0, v1.0.1, v1.1.0)
- [ ] Keep main branch stable
- [ ] Test obfuscated builds before tagging

### 3. Monitoring
- [ ] Check GitHub Actions for build failures
- [ ] Monitor GitHub Pages deployment status
- [ ] Verify jsDelivr CDN uptime

## Troubleshooting

### Common Issues
1. **Build fails**: Check Node.js version and dependencies
2. **Pages not deploying**: Verify GitHub Actions permissions
3. **CDN not accessible**: Ensure repository is public
4. **Obfuscation breaks functionality**: Check reserved names in config

### Support Resources
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [jsDelivr CDN](https://www.jsdelivr.com/)
- [JavaScript Obfuscator](https://github.com/javascript-obfuscator/javascript-obfuscator)
