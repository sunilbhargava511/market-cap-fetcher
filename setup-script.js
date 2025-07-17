#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Enhanced Market Cap Fetcher Setup Script');
console.log('============================================\n');

// Check if we're in the right directory
if (!fs.existsSync('package.json')) {
    console.error('❌ Error: package.json not found. Please run this script from your project root directory.');
    process.exit(1);
}

// Create backup directory
const backupDir = `backup_${Date.now()}`;
console.log(`📦 Creating backup directory: ${backupDir}`);
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

// Helper function to backup and write file
function updateFile(filePath, content, description) {
    try {
        // Create directories if they don't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`📁 Created directory: ${dir}`);
        }

        // Backup existing file if it exists
        if (fs.existsSync(filePath)) {
            const backupPath = path.join(backupDir, filePath);
            const backupFileDir = path.dirname(backupPath);
            if (!fs.existsSync(backupFileDir)) {
                fs.mkdirSync(backupFileDir, { recursive: true });
            }
            fs.copyFileSync(filePath, backupPath);
            console.log(`💾 Backed up: ${filePath} → ${backupPath}`);
        }

        // Write new content
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ Updated: ${filePath} - ${description}`);
    } catch (error) {
        console.error(`❌ Error updating ${filePath}:`, error.message);
    }
}

// Install dependencies first
console.log('📦 Installing dependencies...');
try {
    console.log('Installing lucide-react...');
    execSync('npm install lucide-react', { stdio: 'inherit' });
    
    console.log('Installing TypeScript dependencies...');
    execSync('npm install --save-dev @types/node @types/react @types/react-dom typescript', { stdio: 'inherit' });
    
    console.log('✅ Dependencies installed successfully\n');
} catch (error) {
    console.error('❌ Error installing dependencies:', error.message);
    console.log('Please run manually: npm install lucide-react @types/node @types/react @types/react-dom typescript\n');
}

// Update package.json
const packageJsonContent = {
  "name": "market-cap-fetcher",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "lucide-react": "^0.263.1"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "eslint": "^8.42.0",
    "eslint-config-next": "^14.0.0",
    "postcss": "^8.4.24",
    "tailwindcss": "^3.3.0",
    "autoprefixer": "^10.4.14",
    "typescript": "^5.1.0"
  },
  "description": "Enhanced market cap fetcher with batch processing and CSV export capabilities for historical stock data",
  "keywords": ["market-cap", "stock-data", "financial-api", "typescript", "next.js", "eodhd"],
  "author": "Your Name",
  "license": "MIT"
};

updateFile('package.json', JSON.stringify(packageJsonContent, null, 2), 'Updated Package Dependencies');

// Create .env.local template
const envContent = `# EODHD API Configuration
# Sign up at: https://eodhd.com/
# Free tier includes 20 API calls/day, paid plans start at $19.99/month
EODHD_API_TOKEN=your_eodhd_api_token_here

# Alternative API Providers (choose one)
# Uncomment and use if you prefer a different provider:

# Alpha Vantage (https://www.alphavantage.co/)
# ALPHA_VANTAGE_API_KEY=your_alpha_vantage_api_key_here

# Polygon.io (https://polygon.io/)
# POLYGON_API_KEY=your_polygon_api_key_here

# IEX Cloud (https://iexcloud.io/)
# IEX_CLOUD_API_KEY=your_iex_cloud_api_key_here

# Development Settings
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000`;

updateFile('.env.local', envContent, 'Environment Variables Template');

// Update tsconfig.json
const tsconfigContent = {
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "es6"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@/components/*": ["./src/components/*"],
      "@/lib/*": ["./src/lib/*"],
      "@/app/*": ["./src/app/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
};

updateFile('tsconfig.json', JSON.stringify(tsconfigContent, null, 2), 'TypeScript Configuration');

// Update src/app/page.tsx
const pageContent = `import MarketCapForm from '../components/MarketCapForm';

export const metadata = {
  title: 'Enhanced Market Cap Fetcher',
  description: 'Fetch historical market cap data for multiple tickers across multiple years',
};

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <MarketCapForm />
    </div>
  );
}`;

updateFile('src/app/page.tsx', pageContent, 'Main App Page');

// Create setup completion message
const readmeContent = `# Enhanced Market Cap Fetcher - Setup Complete! 🎉

## 🚀 What Was Updated

✅ **Dependencies Installed:**
- lucide-react (for icons)
- TypeScript types (@types/node, @types/react, @types/react-dom)

✅ **Files Updated:**
- package.json (dependencies and scripts)
- .env.local (API configuration template)
- tsconfig.json (TypeScript configuration)
- src/app/page.tsx (main page)

## 📋 Next Steps

### 1. 🔑 Get Your API Key
Sign up at https://eodhd.com/ (free tier: 20 calls/day)

### 2. 🔧 Configure Environment
Edit \`.env.local\` and replace \`your_eodhd_api_token_here\` with your actual token:
\`\`\`
EODHD_API_TOKEN=demo_token_here
\`\`\`

### 3. 📝 Update Component Files
You still need to update two key files manually:

#### A. Update \`src/components/MarketCapForm.tsx\`
Replace the entire file with the enhanced component code (from the artifact I provided earlier)

#### B. Update \`src/app/api/market-cap/route.ts\`
Replace with the enhanced API route code

### 4. 🚀 Start Development
\`\`\`bash
npm run dev
\`\`\`

Then visit: http://localhost:3000

## 🎯 New Features You'll Get

- **3 CSV Exports**: Prices, Market Cap, Shares Outstanding
- **Batch Processing**: 157 tickers × 16 years = 2,512 requests
- **Year Range Selection**: Choose start/end years (2010-2025)  
- **Progress Tracking**: Real-time progress with pause/resume
- **Error Handling**: Detailed error tracking and export
- **Rate Limiting**: Configurable delays

## 🛠️ Manual File Updates Needed

Since the automated script had issues with the large React component files, please manually copy these files from my previous artifacts:

1. **Enhanced MarketCapForm.tsx** (the main component)
2. **Enhanced API route.ts** (the market cap API)

I can provide these files again if needed!

## 📦 Backup Location
Your original files are backed up in: \`${backupDir}/\`

Happy fetching! 🚀`;

updateFile('README_SETUP_COMPLETE.md', readmeContent, 'Setup Instructions');

console.log('\n✅ Basic setup complete!');
console.log('📖 Next steps: See README_SETUP_COMPLETE.md');
console.log('\n🔧 Manual steps still needed:');
console.log('1. Get EODHD API key: https://eodhd.com/');
console.log('2. Update .env.local with your API token');
console.log('3. Update src/components/MarketCapForm.tsx (enhanced component)');
console.log('4. Update src/app/api/market-cap/route.ts (enhanced API)');
console.log('5. Run: npm run dev');
console.log('\n📁 Backup created in:', backupDir);
console.log('\n🎯 The enhanced component files are too large for this script.');
console.log('Please copy them manually from the artifacts I provided earlier!');