# SES Sales Resources Portal

A centralized, branded portal system for managing multiple HTML analytics widgets with AI-powered search capabilities.

## 🚀 Quick Start

1. **Open** `index.html` in your web browser
2. **Customize** branding in Settings
3. **Replace** the 3 example widgets with your actual HTML portals
4. **Deploy** to GitHub

## 📁 File Structure

```
SESSalesResources/
├── index.html              # Main portal
├── README.md               # This file
├── QUICKSTART.md           # 5-minute setup guide
├── .gitignore              # Git ignore rules
│
├── styles/
│   └── main.css           # All styling
│
├── scripts/
│   ├── main.js            # Core portal functionality
│   ├── ai-search.js       # AI search feature
│   └── widgets.js         # Widget management
│
└── widgets/
    ├── lmp-portal.html            # Example widget 1
    ├── commission-tracker.html    # Example widget 2
    └── utility-data.html          # Example widget 3
```

## 🎯 Features

- **Widget Framework** - Iframe-based integration for existing HTML portals
- **AI-Powered Search** - Natural language email search (template ready)
- **Customizable Branding** - Full control through Settings UI
- **GitHub Ready** - One-command deployment
- **Responsive Design** - Works on desktop and mobile
- **No Dependencies** - Pure HTML/CSS/JS

## 📝 Replacing Example Widgets

### Method 1: Direct Replacement (Easiest)

Simply copy your HTML portals to replace the examples:

```bash
cp your-lmp-portal.html widgets/lmp-portal.html
cp your-commission-tracker.html widgets/commission-tracker.html
cp your-utility-data.html widgets/utility-data.html
```

### Method 2: Add New Widgets

1. Add your HTML file to `widgets/` folder
2. Update `index.html` to add a widget card
3. Follow the template structure in existing widgets

## ⚙️ Customizing Branding

### Via Settings UI (Easiest)

1. Open portal and click "Settings"
2. Update Portal Title, Subtitle, Colors
3. Click "Save Settings"

### Via Code

Edit `index.html`:
```html
<h1 class="brand-title">Your Company Name</h1>
<p class="brand-subtitle">Your Subtitle</p>
```

Edit `styles/main.css`:
```css
:root {
    --primary-color: #YOUR_COLOR;
    --secondary-color: #YOUR_COLOR;
}
```

## 🌐 GitHub Deployment

### Step 1: Create Repository on GitHub.com

1. Go to github.com and log in
2. Click "+" → "New repository"
3. Name: `SESSalesResources`
4. Create repository

### Step 2: Using GitHub Desktop (Mac)

1. Open GitHub Desktop
2. File → Add Local Repository
3. Select your `SESSalesResources` folder
4. Commit with message: "Initial commit"
5. Click "Publish repository"

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub.com
2. Settings → Pages
3. Source: "main" branch, "/ (root)" folder
4. Save
5. Wait 2-5 minutes
6. Your portal will be live at: `https://YOUR-USERNAME.github.io/SESSalesResources/`

## 🤖 AI Search Setup (Optional)

1. Get API key from [Anthropic Console](https://console.anthropic.com/)
2. Edit `scripts/ai-search.js`
3. Add your API key in the `performSearch()` function
4. Test the search functionality

## 🔧 Making Updates

After initial deployment:

1. Edit files locally
2. Open GitHub Desktop (it detects changes)
3. Commit changes with a message
4. Push to GitHub
5. Wait 1-2 minutes for live site to update

## 📚 Documentation

- **QUICKSTART.md** - 5-minute setup guide
- **README.md** - This file (comprehensive guide)

## 🆘 Troubleshooting

**Widgets not loading?**
- Check file paths are correct
- Verify widget files exist in `widgets/` folder
- Open browser console (F12) for errors

**Settings not saving?**
- Check browser localStorage is enabled
- Try a different browser

**GitHub Pages not working?**
- Wait 5-10 minutes after first push
- Verify GitHub Pages is enabled in Settings
- Check repository is public (or you have GitHub Pro for private repos)

## ✅ Checklist

Before deploying:
- [ ] Replaced example widgets with your actual portals
- [ ] Tested locally (opened index.html in browser)
- [ ] Customized branding (company name, colors)
- [ ] Created GitHub repository
- [ ] Pushed files to GitHub
- [ ] Enabled GitHub Pages
- [ ] Verified live site works

## 📞 Support

- Check QUICKSTART.md for step-by-step instructions
- Review browser console for errors (F12)
- Ensure all files are in correct locations

## 📄 License

Copyright © 2025 Secure Energy. All rights reserved.

---

**Version**: 1.0.0  
**Last Updated**: January 2025
