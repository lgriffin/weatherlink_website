const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const apiKey = process.env.WEATHERLINK_API_KEY;
  const apiSecret = process.env.WEATHERLINK_API_SECRET;
  const stationId = event.queryStringParameters?.station_id;

  if (!apiKey || !apiSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API credentials not configured' })
    };
  }

  if (!stationId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'station_id parameter is required' })
    };
  }

  try {
    const url = `https://api.weatherlink.com/v2/current/${stationId}?api-key=${apiKey}`;

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
    console.error('Error fetching current conditions:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
