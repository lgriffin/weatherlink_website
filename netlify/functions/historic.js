const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const apiKey = process.env.WEATHERLINK_API_KEY;
  const apiSecret = process.env.WEATHERLINK_API_SECRET;
  const stationId = event.queryStringParameters?.station_id;
  const startTimestamp = event.queryStringParameters?.start_timestamp;
  const endTimestamp = event.queryStringParameters?.end_timestamp;

  if (!apiKey || !apiSecret) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'API credentials not configured' })
    };
  }

  if (!stationId || !startTimestamp || !endTimestamp) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'station_id, start_timestamp, and end_timestamp parameters are required'
      })
    };
  }

  try {
    const url = `https://api.weatherlink.com/v2/historic/${stationId}?api-key=${apiKey}&start-timestamp=${startTimestamp}&end-timestamp=${endTimestamp}`;

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
    console.error('Error fetching historic data:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
