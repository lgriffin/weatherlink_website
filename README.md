# Weather Station Website

A personal weather website that displays current conditions and historical trends from a Davis Weather Station via the WeatherLink API.

## Features

- **Current Conditions**: Real-time weather data including temperature, humidity, wind, pressure, and rainfall
- **All-Time Records**: High and low temperature records from the past year
- **Year-Over-Year Comparison**: Compare today's weather with the same date one year ago
- **Auto-Refresh**: Current conditions update automatically every 5 minutes
- **Responsive Design**: Works beautifully on desktop, tablet, and mobile devices

## Prerequisites

- Davis Weather Station with WeatherLink connection
- WeatherLink Pro or Pro+ subscription (required for historical data access)
- WeatherLink API credentials (API Key and API Secret)
- GitHub account
- Netlify account (free tier is sufficient)

## Getting Your API Credentials

1. Log in to your WeatherLink account at https://www.weatherlink.com
2. Go to your Account page
3. Click "Generate v2 Key" to get your API Key and API Secret
4. Save these credentials securely - you'll need them for deployment

## Local Development

### Install Netlify CLI

```bash
npm install -g netlify-cli
```

### Set Up Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```
   WEATHERLINK_API_KEY=your_actual_api_key
   WEATHERLINK_API_SECRET=your_actual_api_secret
   ```

### Run Locally

```bash
netlify dev
```

Open your browser to http://localhost:8888

## Deployment to Netlify

### 1. Create GitHub Repository

```bash
git init
git add .
git commit -m "Initial commit: Weather station website"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### 2. Deploy to Netlify

1. Log in to [Netlify](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Choose "GitHub" and select your repository
4. Netlify will auto-detect the settings from `netlify.toml`
5. Click "Deploy site"

### 3. Add Environment Variables

1. In Netlify dashboard, go to your site
2. Navigate to "Site settings" → "Environment variables"
3. Add the following variables:
   - `WEATHERLINK_API_KEY` = your API key
   - `WEATHERLINK_API_SECRET` = your API secret
4. Click "Save"

### 4. Redeploy

After adding environment variables, trigger a new deployment:
- Go to "Deploys" tab
- Click "Trigger deploy" → "Deploy site"

Your weather website will be live at `https://YOUR_SITE_NAME.netlify.app`!

## Project Structure

```
weather/
├── index.html              # Main HTML page
├── css/
│   └── style.css          # Styles and responsive design
├── js/
│   └── app.js             # Application logic and API calls
├── netlify/
│   └── functions/         # Serverless functions (API proxies)
│       ├── stations.js    # Get station information
│       ├── current.js     # Get current conditions
│       └── historic.js    # Get historical data
├── netlify.toml           # Netlify configuration
├── .env.example           # Environment variables template
├── .gitignore            # Git ignore rules
└── README.md             # This file
```

## How It Works

### Security Architecture

The website uses Netlify Functions (serverless) to keep your API credentials secure:

```
Browser → Netlify Functions → WeatherLink API
```

Your API key and secret are stored as environment variables in Netlify and are never exposed to the browser. The functions act as a secure proxy between your website and the WeatherLink API.

### Data Flow

1. **On page load**:
   - Fetches your station information
   - Loads current weather conditions
   - Queries historical data for records (past 12 months)
   - Queries data from the same date one year ago

2. **Auto-refresh**:
   - Current conditions refresh every 5 minutes
   - Year-ago comparison updates with new current data

### API Endpoints Used

- `GET /stations` - Get station information
- `GET /current/{station-id}` - Get current conditions
- `GET /historic/{station-id}` - Get historical observations

## Customization

### Change Refresh Interval

Edit `js/app.js` line ~22 to change the auto-refresh interval (in milliseconds):

```javascript
refreshInterval = setInterval(() => {
    loadCurrentConditions();
    loadYearAgoComparison();
}, 300000); // 300000 = 5 minutes
```

### Modify Color Scheme

Edit the CSS variables in `css/style.css` at the top of the file:

```css
:root {
    --primary-color: #2c3e50;
    --secondary-color: #3498db;
    --accent-color: #e74c3c;
    /* ... other colors ... */
}
```

### Change Temperature Units

The code currently uses Fahrenheit. To change to Celsius, you'll need to modify:
1. The display labels in `index.html`
2. The temperature calculations in `js/app.js`

## Troubleshooting

### "Error loading station info"
- Check that your environment variables are set correctly in Netlify
- Verify your API credentials at weatherlink.com

### "Error loading current conditions"
- Ensure your station is online and reporting data
- Check the browser console for detailed error messages

### No historical data
- Verify you have a WeatherLink Pro or Pro+ subscription
- Historical data may take time to accumulate after initial setup

### Functions not working locally
- Make sure you're running `netlify dev`, not a simple HTTP server
- Check that your `.env` file exists and has the correct credentials

## Future Enhancements

Potential features to add:
- Weather forecast integration (National Weather Service or OpenWeatherMap)
- Interactive charts and graphs
- Downloadable weather reports
- Weather alerts and notifications
- Additional historical comparisons
- Dark/light theme toggle

## Resources

- [WeatherLink v2 API Documentation](https://weatherlink.github.io/v2-api/)
- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Netlify CLI Documentation](https://docs.netlify.com/cli/get-started/)

## License

This project is free to use and modify for personal use.

## Support

For WeatherLink API issues, contact Davis Instruments support or consult their documentation.

For deployment issues, refer to Netlify's documentation or support.
