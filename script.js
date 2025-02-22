// Replace the suburbs array and add new functions
let suburbs = [];

let currentLat = null;
let currentLng = null;
let currentHeading = null;

// Initialize the app
function init() {
    // Request permission for geolocation
    if ("geolocation" in navigator) {
        // First check if we're on HTTPS or localhost
        if (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            navigator.geolocation.watchPosition(handlePosition, handleError, {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            });
        } else {
            showError("Geolocation requires HTTPS. Please use a secure connection.");
            // Provide instructions to the user
            document.getElementById("error").innerHTML = `
                Error: Geolocation requires HTTPS. <br>
                <br>
                To test this app, either:<br>
                1. Use it locally on your computer with: http://localhost:9000<br>
                2. Host it with HTTPS (recommended for production)<br>
                3. For testing only, you can enable location permissions in your browser settings
            `;
        }
    } else {
        showError("Geolocation is not supported by your browser");
    }

    // Request permission for device orientation
    if ("DeviceOrientationEvent" in window) {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            // iOS 13+ requires explicit permission
            const button = document.createElement('button');
            button.innerHTML = '🧭 Allow Compass Access';
            button.style.padding = '15px 30px';
            button.style.margin = '20px auto';
            button.style.display = 'block';
            button.style.fontSize = '18px';
            button.style.backgroundColor = '#4CAF50';
            button.style.color = 'white';
            button.style.border = 'none';
            button.style.borderRadius = '5px';
            button.style.cursor = 'pointer';
            button.onclick = function() {
                DeviceOrientationEvent.requestPermission()
                    .then(response => {
                        if (response === 'granted') {
                            // Try different event listeners
                            window.addEventListener('deviceorientation', handleOrientation, true);
                            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
                            button.style.display = 'none';
                        } else {
                            showError('Permission to access device orientation was denied');
                        }
                    })
                    .catch(error => showError(error));
            };
            document.body.insertBefore(button, document.body.firstChild);
        } else {
            // Non-iOS devices
            window.addEventListener('deviceorientation', handleOrientation, true);
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        }
    } else {
        showError("Device orientation is not supported by your browser");
    }
}

// Handle position updates
function handlePosition(position) {
    currentLat = position.coords.latitude;
    currentLng = position.coords.longitude;
    
    document.getElementById("current-coords").textContent = 
        `${currentLat.toFixed(4)}, ${currentLng.toFixed(4)}`;
    
    // Fetch suburbs when position is updated
    fetchSuburbs(currentLat, currentLng).then(() => {
        updateSuburbInfo();
    });
}

// Handle orientation updates
function handleOrientation(event) {
    let heading = null;
    
    // Try to get the heading from different possible sources
    if (event.webkitCompassHeading) {
        // iOS compass heading (inverted)
        heading = 360 - event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        // Standard compass heading
        heading = event.alpha;
    }

    if (heading !== null) {
        currentHeading = heading;
        document.getElementById("heading").textContent = Math.round(heading);
        updateSuburbInfo();
    }
}

// Calculate bearing between two points
function calculateBearing(lat1, lon1, lat2, lon2) {
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    bearing = (bearing + 360) % 360;
    
    return bearing;
}

// Calculate distance between two points in kilometers
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

// Function to fetch suburbs from OpenStreetMap
async function fetchSuburbs(lat, lng, radius = 5000) {
    const bbox = calculateBoundingBox(lat, lng, radius);
    const query = `
        [out:json][timeout:25];
        (
            way["place"="suburb"]
                (${bbox.south},${bbox.west},${bbox.north},${bbox.east});
            relation["place"="suburb"]
                (${bbox.south},${bbox.west},${bbox.north},${bbox.east});
        );
        out center tags;
    `;

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: query
        });
        const data = await response.json();
        
        suburbs = data.elements.map(element => ({
            name: element.tags.name,
            lat: element.center ? element.center.lat : element.lat,
            lng: element.center ? element.center.lon : element.lon
        }));
    } catch (error) {
        showError("Failed to fetch suburb data: " + error.message);
    }
}

// Calculate bounding box for given coordinates and radius
function calculateBoundingBox(lat, lng, radius) {
    // Convert radius from meters to degrees (approximate)
    const latDegrees = radius / 111320;
    const lngDegrees = radius / (111320 * Math.cos(lat * Math.PI / 180));

    return {
        north: lat + latDegrees,
        south: lat - latDegrees,
        east: lng + lngDegrees,
        west: lng - lngDegrees
    };
}

// Add function to calculate horizon distance (in km)
function calculateHorizonDistance(heightMeters = 1.7) {  // Default human height
    // Formula: distance = √(2Rh)
    // where R is Earth's radius in km, h is height in km
    const R = 6371; // Earth's radius in km
    const h = heightMeters / 1000; // convert to km
    return Math.sqrt(2 * R * h);
}

// Update the updateSuburbInfo function
function updateSuburbInfo() {
    if (currentLat === null || currentLng === null || currentHeading === null) {
        return;
    }

    const suburbsDiv = document.getElementById("suburbs");
    suburbsDiv.innerHTML = "";
    
    const horizonDist = calculateHorizonDistance();

    const suburbsWithDistance = suburbs.map(suburb => {
        const distance = calculateDistance(currentLat, currentLng, suburb.lat, suburb.lng);
        const bearing = calculateBearing(currentLat, currentLng, suburb.lat, suburb.lng);
        const horizonPercent = Math.min((distance / horizonDist) * 100, 100).toFixed(1);
        return { ...suburb, distance, bearing, horizonPercent };
    }).sort((a, b) => a.distance - b.distance);

    suburbsWithDistance.forEach(suburb => {
        let relativeBearing = suburb.bearing - currentHeading;
        relativeBearing = ((relativeBearing + 360) % 360) - 180;

        if (Math.abs(relativeBearing) < 45) {
            const suburbElement = document.createElement("div");
            suburbElement.className = "suburb-info";
            suburbElement.innerHTML = `
                <strong>${suburb.name}</strong>
                <span>${suburb.distance.toFixed(1)} km ${getDirectionText(suburb.bearing)}</span>
                <span class="horizon-info">${suburb.horizonPercent}% to horizon</span>
            `;
            suburbsDiv.appendChild(suburbElement);
        }
    });
}

// Add a function to convert bearing to cardinal directions
function getDirectionText(bearing) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
}

// Handle errors
function showError(message) {
    document.getElementById("error").textContent = `Error: ${message}`;
}

function handleError(error) {
    showError(error.message);
}

// Start the app when the page loads
window.onload = init; 