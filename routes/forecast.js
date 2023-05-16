/**
 * Framework used to handle requests,
 */
const express = require("express");
const router = express.Router();

const { isStringProvided, isLatLong, isZipCode } = require("../utilities/exports").validation;
const getLatLong = require("../utilities/exports").getLatLong;

let location = '';

/**
 * @api {get} /forecast/:location Request to daily and hourly forecast for a location
 * @apiName GetForecast
 * @apiGroup Forecast
 *
 * @apiParam {String} [location] the lat,long or zipcode to look up. If no location provided, default location returned
 *
 * @apiSuccess {String} city The city name of the location
 * @apiSuccess {String} state The state name of the location
 * @apiSuccess {Object} forecast The 7-day forecast at the location
 * @apiSuccess {Object} hourlyForecast The 24 hour forecast at the location
 *
 * @apiUse JSONError
 * @apiError (400: Invalid Parameters) {String} message "Location must be either a valid comma-separated lat,long pair, or a zipcode"
 */
router.get("/:location?", async (request, response, next) => {
    location = request.params.location;
    console.log('initial location', location);
    if (!isStringProvided(location)) { // No location was sent so use default location (Tacoma, WA)
        location = { lat: 47.2529, lng: -122.4443 };
        next();
    } else if (isZipCode(request.params.location)) { // A zipcode was sent, so get the lat/long
        location = await getLatLong(request.params.location);
        next();
    } else if (isLatLong(request.params.location)) {
        const [lat, lng] = location.split(',');
        location = { lat: lat, lng: lng };
        next();
    } else {
        response.status(400).send({
            message: "Location must be either a valid comma-separated lat,long pair, or a zipcode",
        });
    }
},
(request, response) => {
    const {lat, lng} = location;
    // Split the lat/long pair into two variables
    fetch(`https://api.weather.gov/points/${lat},${lng}`)
        .then((response) => response.json())
        .then(async (result) => {
            const {city, state} = result.properties.relativeLocation.properties;
            let forecast = {};
            let hourlyForecast = {};
            await fetch(result.properties.forecast)
                .then((response) => response.json())
                .then((result) => { // Format the daily forecast data
                    let { day, temperatureLow, temperatureHigh, temperatureUnit, shortForecast } = -1;
                    Object.keys(result.properties.periods).forEach((num) => {
                        const { name, temperature } = result.properties.periods[num];
                        if (name === 'Tonight' || name === 'Today') return;
                        if (!name.includes('Night')) {
                            temperatureUnit = result.properties.periods[num].temperatureUnit;
                            shortForecast = result.properties.periods[num].shortForecast;
                            temperatureHigh = temperature;
                            day = name;
                        } else {
                            temperatureLow = temperature;
                            forecast[day] = { temperatureHigh, temperatureLow, temperatureUnit, shortForecast };
                        }
                    });
                });
            await fetch(result.properties.forecastHourly)
                .then((response) => response.json())
                .then((result) => { // Format the hourly forecast data
                    Object.keys(result.properties.periods).filter(num => num <= 24 && num >= 1).forEach((num) => {
                        const { startTime, isDaytime, temperature, temperatureUnit, shortForecast } = result.properties.periods[num];
                        hourlyForecast[new Date(startTime).toLocaleTimeString()] = { isDaytime, temperature, temperatureUnit, shortForecast };
                    });
                });
            return {city, state, forecast, hourlyForecast};
        }).then((info) => {
            console.log('sending response');
            response.send({
                city: info.city,
                state: info.state,
                forecast: info.forecast,
                hourlyForecast: info.hourlyForecast,
            })
        });
});

module.exports = router;