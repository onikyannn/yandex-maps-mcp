# Yandex Maps MCP Server

MCP Server for the Yandex Maps API.

> "Show me the map of Berlin"

> "Show me location of ..."

<p align="center">
  <img src="https://raw.githubusercontent.com/peschinskiy/yandex-maps-mcp/main/example-usage.png" width="60%" alt="Yandex Maps MCP Screenshot">
</p>

## Tools

1. `maps_geocode`
   - Convert address to coordinates
   - Inputs:
     - `country` (string) - The country name
     - `lang` (string) - Language code (e.g., 'ru_RU', 'en_US')
     - `state` (string, optional) - The state, region or province name
     - `city` (string, optional) - The city or locality name
     - `district` (string, optional) - The district or neighborhood within the city
     - `street` (string, optional) - The street name
     - `house_number` (string, optional) - The house or building number
   - Returns: location, formatted_address, address_components

2. `maps_reverse_geocode`
   - Convert coordinates to address
   - Inputs:
     - `latitude` (number)
     - `longitude` (number)
     - `lang` (string) - Language code (e.g., 'ru_RU', 'en_US')
   - Returns: location, formatted_address, address_components

3. `maps_render`
   - Render a map as a png image
   - Inputs:
     - `latitude` (number) - Latitude coordinate of map center
     - `longitude` (number) - Longitude coordinate of map center
     - `latitude_span` (number) - Height of map image in degrees
     - `longitude_span` (number) - Width of map image in degrees
     - `lang` (string) - Language code (e.g., 'ru_RU', 'en_US')
     - `placemarks` (array, optional) - Array of placemarks to display on the map with style "pm2rdm"
       - Each placemark should have `latitude` and `longitude` properties
   - Returns: PNG image of the map

4. `maps_geosuggest`
   - Get Yandex Maps geosuggestions for geographic objects and organizations while the user types a search prefix
   - Inputs:
     - `text` (string) - User search input prefix
     - `lang` (string, optional) - Two-letter ISO 639-1 language code (e.g., `ru`, `en`)
     - `results` (integer, optional) - Maximum number of suggestions, from 1 to 10. Default is 7
     - `highlight` (boolean, optional) - Set `false` to disable highlight ranges
     - `latitude` (number, optional) - Latitude of the search window center
     - `longitude` (number, optional) - Longitude of the search window center
     - `latitude_span` (number, optional) - Search window height in degrees
     - `longitude_span` (number, optional) - Search window width in degrees
     - `bbox` (object, optional) - Search window bounds as `southwest` and `northeast` points
     - `user_latitude` (number, optional) - User GPS latitude for distance calculation
     - `user_longitude` (number, optional) - User GPS longitude for distance calculation
     - `strict_bounds` (boolean, optional) - Set `true` to restrict results to the search window
     - `countries` (array, optional) - Two-letter country codes (e.g., `["ru", "uz", "kz"]`)
     - `types` (array, optional) - Object types: `biz`, `geo`, `street`, `metro`, `district`, `locality`, `area`, `province`, `country`, `house`, `entrance`
     - `print_address` (boolean, optional) - Set `true` to include structured address components
     - `org_address_kind` (string, optional) - Use `house` to return organizations with an address down to house number
     - `include_uri` (boolean, optional) - Set `true` to include a `uri` usable with the Yandex Geocoder API
   - Returns: Yandex Geosuggest `results` array

## Setup

### API Keys
You'll need Yandex Maps API keys for the APIs you use:

1. "JavaScript and Geocoder API" key for geocoding functions
2. Static API key for map rendering
3. "API Geosuggest" key for `maps_geosuggest`

To generate API keys:
1. Open https://developer.tech.yandex.ru/ and authorize
2. Click "Connect APIs". Choose "JavaScript and Geocoder API" and fill the form
3. Navigate to API's dashboard page and copy API key there
4. Repeat from step 2 for Static API and API Geosuggest.

### Local Run

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set your API keys:
   ```bash
   export YANDEX_MAPS_API_KEY="your-geocoder-api-key"
   export YANDEX_MAPS_STATIC_API_KEY="your-static-api-key"
   export YANDEX_MAPS_SUGGEST_API_KEY="your-geosuggest-api-key"
   ```
4. Build server
   ```bash
   npm run build
   ```
4. Run the server:
   ```bash
   node dist/index.js
   ```

### Usage with Claude Desktop (stdio)

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yandex-maps": {
      "command": "node",
      "args": [
        "path/to/index.js"
      ],
      "env": {
        "YANDEX_MAPS_API_KEY": "<YOUR_GEOCODER_API_KEY>",
        "YANDEX_MAPS_STATIC_API_KEY": "<YOUR_STATIC_API_KEY>",
        "YANDEX_MAPS_SUGGEST_API_KEY": "<YOUR_GEOSUGGEST_API_KEY>"
      }
    }
  }
}
```

### Usage as HTTP Server

The server supports Streamable HTTP transport for remote access and web-based clients like n8n.

#### Starting the HTTP Server

```bash
# Set required environment variables
export YANDEX_MAPS_API_KEY="your-geocoder-api-key"
export YANDEX_MAPS_STATIC_API_KEY="your-static-api-key"
export YANDEX_MAPS_SUGGEST_API_KEY="your-geosuggest-api-key"
export MCP_TRANSPORT="http"
export MCP_PORT="3000"  # Optional, defaults to 3000
export MCP_AUTH_TOKEN="your-secret-token"  # Optional but recommended

# Run the server
node dist/index.js
```

#### Configuration

The HTTP server is **stateless** and uses the following environment variables:

- `MCP_TRANSPORT`: Set to `"http"` to enable HTTP mode (default: `"stdio"`)
- `MCP_PORT`: Port number for HTTP server (default: `3000`)
- `MCP_AUTH_TOKEN`: Optional Bearer token for authentication. If not set, the server runs without authentication (not recommended for production)
- `YANDEX_MAPS_API_KEY`: Your Yandex Geocoder API key (required)
- `YANDEX_MAPS_STATIC_API_KEY`: Your Yandex Static Maps API key (required)
- `YANDEX_MAPS_SUGGEST_API_KEY`: Your Yandex Geosuggest API key (required)

#### Authentication

When `MCP_AUTH_TOKEN` is set, clients must include it in the `Authorization` header:

```
Authorization: Bearer your-secret-token
```

#### Usage with n8n

To use with n8n, configure the MCP Client node with:
- **Server Transport**: `HTTP Streamable`
- **URL**: `http://your-server:3000` (adjust host and port as needed)
- **Authentication**: Add Bearer token if configured

## Known Limitations

Yandex Maps Places API has no free tier, which means that LLMs cannot retrieve organization addresses and coordinates through the Yandex Maps MCP. It can only geocode places whose addresses or coordinates are already known to the model or retrieved from other sources such as explicit user input, Web Search, or third-party MCPs.

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/peschinskiy/yandex-maps-mcp/blob/main/LICENSE) file for details.
