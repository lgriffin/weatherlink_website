const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const apiKey = process.env.WEATHERLINK_API_KEY;
  const apiSecret = process.env.WEATHERLINK_API_SECRET;

  if (!apiKey || !apiSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API credentials not configured' })
    };
  }

  try {
    const url = `https://api.weatherlink.com/v2/stations?api-key=${apiKey}`;

    const response = await fetch(url, {
      headers: {
        'X-Api-Secret': apiSecret
      }
    });

    if (!response.ok) {
      throw new Error(`WeatherLink API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error fetching stations:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
