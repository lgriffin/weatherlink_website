// State
let stationId = null;
let currentWeatherData = null;
let refreshInterval = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    try {
        await loadStationInfo();
        await loadCurrentConditions();
        await loadHistoricalRecords();
        await loadYearAgoComparison();

        // Set up auto-refresh every 5 minutes (300000ms)
        refreshInterval = setInterval(() => {
            loadCurrentConditions();
            loadYearAgoComparison(); // Update comparison with new current data
        }, 300000);
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

// Fetch station information
async function loadStationInfo() {
    try {
        const response = await fetch('/.netlify/functions/stations');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.stations && data.stations.length > 0) {
            stationId = data.stations[0].station_id;
            const stationName = data.stations[0].station_name || 'Weather Station';
            document.getElementById('station-info').textContent = stationName;
        } else {
            throw new Error('No stations found in account');
        }
    } catch (error) {
        console.error('Error loading station info:', error);
        document.getElementById('station-info').textContent = 'Error loading station info';
        throw error;
    }
}

// Fetch and display current conditions
async function loadCurrentConditions() {
    if (!stationId) return;

    const loadingEl = document.getElementById('current-loading');
    const errorEl = document.getElementById('current-error');
    const dataEl = document.getElementById('current-data');

    try {
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';
        dataEl.style.display = 'none';

        const response = await fetch(`/.netlify/functions/current?station_id=${stationId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        currentWeatherData = data;

        displayCurrentConditions(data);

        loadingEl.style.display = 'none';
        dataEl.style.display = 'block';
    } catch (error) {
        console.error('Error loading current conditions:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = `Error loading current conditions: ${error.message}`;
        errorEl.style.display = 'block';
    }
}

// Display current conditions
function displayCurrentConditions(data) {
    if (!data.sensors || data.sensors.length === 0) {
        console.error('No sensor data available');
        return;
    }

    // Find the ISS (Integrated Sensor Suite) data
    const issData = data.sensors.find(sensor =>
        sensor.data && sensor.data.length > 0 && sensor.data[0].temp !== undefined
    );

    if (!issData || !issData.data || issData.data.length === 0) {
        console.error('No valid sensor data found');
        return;
    }

    const sensorData = issData.data[0];

    // Temperature
    if (sensorData.temp !== undefined) {
        document.getElementById('current-temp').textContent = Math.round(sensorData.temp);
    }

    // Feels like (use heat index or wind chill if available, otherwise temp)
    let feelsLike = sensorData.temp;
    if (sensorData.heat_index !== undefined && sensorData.heat_index > sensorData.temp) {
        feelsLike = sensorData.heat_index;
    } else if (sensorData.wind_chill !== undefined && sensorData.wind_chill < sensorData.temp) {
        feelsLike = sensorData.wind_chill;
    }
    document.getElementById('feels-like').textContent = `${Math.round(feelsLike)}°F`;

    // Humidity
    if (sensorData.hum !== undefined) {
        document.getElementById('humidity').textContent = `${Math.round(sensorData.hum)}%`;
    }

    // Wind
    if (sensorData.wind_speed_avg_last_10_min !== undefined) {
        const windSpeed = Math.round(sensorData.wind_speed_avg_last_10_min);
        const windDir = getWindDirection(sensorData.wind_dir_scalar_avg_last_10_min);
        document.getElementById('wind').textContent = `${windSpeed} mph ${windDir}`;
    }

    // Pressure
    if (sensorData.bar_sea_level !== undefined) {
        document.getElementById('pressure').textContent = `${sensorData.bar_sea_level.toFixed(2)} inHg`;
    }

    // Rain today
    if (sensorData.rainfall_daily !== undefined) {
        document.getElementById('rain-today').textContent = `${sensorData.rainfall_daily.toFixed(2)} in`;
    }

    // Dew Point
    if (sensorData.dew_point !== undefined) {
        document.getElementById('dew-point').textContent = `${Math.round(sensorData.dew_point)}°F`;
    }

    // Conditions (simple description based on temp and humidity)
    const conditions = getConditionsDescription(sensorData);
    document.getElementById('current-conditions').textContent = conditions;

    // Last update time
    if (sensorData.ts !== undefined) {
        const updateTime = new Date(sensorData.ts * 1000);
        document.getElementById('last-update').textContent = updateTime.toLocaleString();
    }
}

// Get wind direction from degrees
function getWindDirection(degrees) {
    if (degrees === undefined) return '';

    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                       'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
}

// Get simple conditions description
function getConditionsDescription(data) {
    if (data.temp === undefined) return 'Unknown';

    const temp = data.temp;
    const humidity = data.hum || 0;

    if (temp >= 85) {
        return humidity > 70 ? 'Hot & Humid' : 'Hot';
    } else if (temp >= 75) {
        return humidity > 70 ? 'Warm & Humid' : 'Warm';
    } else if (temp >= 60) {
        return 'Mild';
    } else if (temp >= 40) {
        return 'Cool';
    } else if (temp >= 32) {
        return 'Cold';
    } else {
        return 'Very Cold';
    }
}

// Load historical records
async function loadHistoricalRecords() {
    if (!stationId) return;

    const loadingEl = document.getElementById('records-loading');
    const errorEl = document.getElementById('records-error');
    const dataEl = document.getElementById('records-data');

    try {
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';
        dataEl.style.display = 'none';

        // Query last 12 months of data to find records
        const endTimestamp = Math.floor(Date.now() / 1000);
        const startTimestamp = endTimestamp - (365 * 24 * 60 * 60); // 1 year ago

        const response = await fetch(
            `/.netlify/functions/historic?station_id=${stationId}&start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        findAndDisplayRecords(data);

        loadingEl.style.display = 'none';
        dataEl.style.display = 'block';
    } catch (error) {
        console.error('Error loading historical records:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = `Error loading records: ${error.message}`;
        errorEl.style.display = 'block';
    }
}

// Find and display temperature records
function findAndDisplayRecords(data) {
    if (!data.sensors || data.sensors.length === 0) {
        console.error('No historical sensor data available');
        return;
    }

    let highTemp = -Infinity;
    let lowTemp = Infinity;
    let highDate = null;
    let lowDate = null;

    // Iterate through all sensors and their data points
    data.sensors.forEach(sensor => {
        if (!sensor.data) return;

        sensor.data.forEach(reading => {
            if (reading.temp_hi !== undefined && reading.temp_hi > highTemp) {
                highTemp = reading.temp_hi;
                highDate = reading.ts;
            }
            if (reading.temp_lo !== undefined && reading.temp_lo < lowTemp) {
                lowTemp = reading.temp_lo;
                lowDate = reading.ts;
            }
            // Also check regular temp if hi/lo not available
            if (reading.temp !== undefined) {
                if (reading.temp > highTemp) {
                    highTemp = reading.temp;
                    highDate = reading.ts;
                }
                if (reading.temp < lowTemp) {
                    lowTemp = reading.temp;
                    lowDate = reading.ts;
                }
            }
        });
    });

    // Display records
    if (highTemp !== -Infinity) {
        document.getElementById('record-high-temp').textContent = `${Math.round(highTemp)}°F`;
        if (highDate) {
            const date = new Date(highDate * 1000);
            document.getElementById('record-high-date').textContent = date.toLocaleDateString();
        }
    }

    if (lowTemp !== Infinity) {
        document.getElementById('record-low-temp').textContent = `${Math.round(lowTemp)}°F`;
        if (lowDate) {
            const date = new Date(lowDate * 1000);
            document.getElementById('record-low-date').textContent = date.toLocaleDateString();
        }
    }
}

// Load data from one year ago
async function loadYearAgoComparison() {
    if (!stationId) return;

    const loadingEl = document.getElementById('year-ago-loading');
    const errorEl = document.getElementById('year-ago-error');
    const dataEl = document.getElementById('year-ago-data');

    try {
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';
        dataEl.style.display = 'none';

        // Calculate timestamps for same date last year (± 1 day for flexibility)
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

        const startTimestamp = Math.floor(oneYearAgo.getTime() / 1000) - (24 * 60 * 60); // -1 day
        const endTimestamp = Math.floor(oneYearAgo.getTime() / 1000) + (24 * 60 * 60); // +1 day

        const response = await fetch(
            `/.netlify/functions/historic?station_id=${stationId}&start_timestamp=${startTimestamp}&end_timestamp=${endTimestamp}`
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        displayYearAgoComparison(data);

        loadingEl.style.display = 'none';
        dataEl.style.display = 'block';
    } catch (error) {
        console.error('Error loading year ago data:', error);
        loadingEl.style.display = 'none';
        errorEl.textContent = `Error loading comparison: ${error.message}`;
        errorEl.style.display = 'block';
    }
}

// Display year ago comparison
function displayYearAgoComparison(data) {
    if (!data.sensors || data.sensors.length === 0 || !currentWeatherData) {
        console.error('Missing data for comparison');
        return;
    }

    // Find average values from year ago data
    let tempSum = 0, humSum = 0, rainSum = 0;
    let tempCount = 0, humCount = 0;

    data.sensors.forEach(sensor => {
        if (!sensor.data) return;

        sensor.data.forEach(reading => {
            if (reading.temp !== undefined) {
                tempSum += reading.temp;
                tempCount++;
            }
            if (reading.hum !== undefined) {
                humSum += reading.hum;
                humCount++;
            }
            if (reading.rainfall_daily !== undefined) {
                rainSum += reading.rainfall_daily;
            }
        });
    });

    const yearAgoTemp = tempCount > 0 ? tempSum / tempCount : null;
    const yearAgoHum = humCount > 0 ? humSum / humCount : null;
    const yearAgoRain = rainSum / (data.sensors.length || 1);

    // Get current values
    const currentSensor = currentWeatherData.sensors.find(s => s.data && s.data[0]);
    const currentData = currentSensor ? currentSensor.data[0] : null;

    if (!currentData) return;

    // Display temperature comparison
    if (yearAgoTemp !== null && currentData.temp !== undefined) {
        document.getElementById('year-ago-temp').textContent = `${Math.round(yearAgoTemp)}°F`;
        document.getElementById('current-temp-compare').textContent = `${Math.round(currentData.temp)}°F`;

        const tempArrow = document.getElementById('temp-comparison');
        if (currentData.temp > yearAgoTemp + 5) {
            tempArrow.textContent = '↑';
            tempArrow.className = 'comparison-arrow warmer';
        } else if (currentData.temp < yearAgoTemp - 5) {
            tempArrow.textContent = '↓';
            tempArrow.className = 'comparison-arrow cooler';
        } else {
            tempArrow.textContent = '→';
            tempArrow.className = 'comparison-arrow';
        }
    }

    // Display humidity comparison
    if (yearAgoHum !== null && currentData.hum !== undefined) {
        document.getElementById('year-ago-humidity').textContent = `${Math.round(yearAgoHum)}%`;
        document.getElementById('current-humidity-compare').textContent = `${Math.round(currentData.hum)}%`;

        const humArrow = document.getElementById('humidity-comparison');
        if (currentData.hum > yearAgoHum + 10) {
            humArrow.textContent = '↑';
        } else if (currentData.hum < yearAgoHum - 10) {
            humArrow.textContent = '↓';
        } else {
            humArrow.textContent = '→';
        }
    }

    // Display rain comparison
    document.getElementById('year-ago-rain').textContent = `${yearAgoRain.toFixed(2)} in`;
    const currentRain = currentData.rainfall_daily || 0;
    document.getElementById('current-rain-compare').textContent = `${currentRain.toFixed(2)} in`;

    const rainArrow = document.getElementById('rain-comparison');
    if (currentRain > yearAgoRain + 0.5) {
        rainArrow.textContent = '↑';
    } else if (currentRain < yearAgoRain - 0.5) {
        rainArrow.textContent = '↓';
    } else {
        rainArrow.textContent = '→';
    }
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});
