#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";
import { createServer, IncomingMessage, ServerResponse } from "http";

// Response interfaces
interface YandexMapsResponse {
  status: string;
  error_message?: string;
}

interface GeocodeResponse extends YandexMapsResponse {
  response: {
    GeoObjectCollection: {
      metaDataProperty: {
        GeocoderResponseMetaData: {
          request: string;
          results: string;
          found: string;
        };
      };
      featureMember: Array<{
        GeoObject: {
          metaDataProperty: {
            GeocoderMetaData: {
              precision: string;
              text: string;
              kind: string;
              Address: {
                country_code: string;
                formatted: string;
                Components: Array<{
                  kind: string;
                  name: string;
                }>;
              };
              AddressDetails: {
                Country: {
                  AddressLine: string;
                  CountryNameCode: string;
                  CountryName: string;
                  AdministrativeArea?: {
                    AdministrativeAreaName: string;
                    Locality?: {
                      LocalityName: string;
                      Thoroughfare?: {
                        ThoroughfareName: string;
                        Premise?: {
                          PremiseNumber: string;
                        };
                      };
                    };
                  };
                };
              };
            };
          };
          description: string;
          name: string;
          boundedBy: {
            Envelope: {
              lowerCorner: string;
              upperCorner: string;
            };
          };
          Point: {
            pos: string;
          };
        };
      }>;
    };
  };
}

interface SuggestHighlightRange {
  begin: number;
  end: number;
}

interface SuggestText {
  text: string;
  hl?: SuggestHighlightRange[];
}

interface SuggestResponse {
  results?: Array<{
    title: SuggestText;
    subtitle?: SuggestText;
    tags?: string[];
    distance?: {
      text: string;
      value: number;
    };
    address?: {
      formatted_address?: string;
      component?: Array<{
        name: string;
        kind: string[];
      }>;
    };
    uri?: string;
  }>;
  error?: string;
  message?: string;
}

type SuggestObjectType =
  | "biz"
  | "geo"
  | "street"
  | "metro"
  | "district"
  | "locality"
  | "area"
  | "province"
  | "country"
  | "house"
  | "entrance";

interface SuggestBBox {
  southwest: {
    latitude: number;
    longitude: number;
  };
  northeast: {
    latitude: number;
    longitude: number;
  };
}

interface SuggestRequestArgs {
  text: string;
  lang?: string;
  results?: number;
  highlight?: boolean;
  latitude?: number;
  longitude?: number;
  latitude_span?: number;
  longitude_span?: number;
  bbox?: SuggestBBox;
  user_latitude?: number;
  user_longitude?: number;
  strict_bounds?: boolean;
  countries?: string[];
  types?: SuggestObjectType[];
  print_address?: boolean;
  org_address_kind?: "house";
  include_uri?: boolean;
}

function getApiKey(): string {
    const apiKey = process.env.YANDEX_MAPS_API_KEY;
    if (!apiKey) {
      console.error("YANDEX_MAPS_API_KEY environment variable is not set");
      process.exit(1);
    }
    return apiKey;
}

function getStaticApiKey(): string {
  const apiKey = process.env.YANDEX_MAPS_STATIC_API_KEY;
  if (!apiKey) {
    console.error("YANDEX_MAPS_STATIC_API_KEY environment variable is not set");
    process.exit(1);
  }
  return apiKey;
}

function getSuggestApiKey(): string {
  const apiKey = process.env.YANDEX_MAPS_SUGGEST_API_KEY;
  if (!apiKey) {
    console.error("YANDEX_MAPS_SUGGEST_API_KEY environment variable is not set");
    process.exit(1);
  }
  return apiKey;
}

const YANDEX_MAPS_API_KEY = getApiKey();
const YANDEX_MAPS_STATIC_API_KEY = getStaticApiKey();
const YANDEX_MAPS_SUGGEST_API_KEY = getSuggestApiKey();

// Tool definitions
const GEOCODE_TOOL: Tool = {
  name: "maps_geocode",
  description: "Convert an address into geographic coordinates using individual address components",
  inputSchema: {
    type: "object",
    properties: {
      country: {
        type: "string",
        description: "The country name"
      },
      state: {
        type: "string",
        description: "The state, region or province name"
      },
      city: {
        type: "string",
        description: "The city or locality name"
      },
      district: {
        type: "string",
        description: "The district or neighborhood within the city"
      },
      street: {
        type: "string",
        description: "The street name"
      },
      house_number: {
        type: "string",
        description: "The house or building number"
      },
      lang: {
        type: "string",
        description: "Language code, e.g. 'ru_RU', 'en_US'"
      }
    },
    required: ["country", "lang"]
  }
};

const REVERSE_GEOCODE_TOOL: Tool = {
  name: "maps_reverse_geocode",
  description: "Convert coordinates into an address",
  inputSchema: {
    type: "object",
    properties: {
      latitude: {
        type: "number",
        description: "Latitude coordinate"
      },
      longitude: {
        type: "number",
        description: "Longitude coordinate"
      },
      lang: {
        type: "string",
        description: "Language code, e.g. 'ru_RU', 'en_US'"
      }
    },
    required: ["latitude", "longitude", "lang"]
  }
};

const RENDER_MAP_TOOL: Tool = {
  name: "maps_render",
  description: "Render a map as a png image",
  inputSchema: {
    type: "object",
    properties: {
      latitude: {
        type: "number",
        description: "Latitude coordinate of map center"
      },
      longitude: {
        type: "number",
        description: "Longitude coordinate of map center"
      },
      latitude_span: {
        type: "number",
        description: "Height of map image in degrees"
      },
      longitude_span: {
        type: "number",
        description: "Width of map image in degrees"
      },
      lang: {
        type: "string",
        description: "Language code, e.g. 'ru_RU', 'en_US'"
      },
      placemarks: {
        type: "array",
        description: "Array of placemarks to display on the map",
        items: {
          type: "object",
          properties: {
            latitude: {
              type: "number",
              description: "Latitude coordinate of the placemark"
            },
            longitude: {
              type: "number",
              description: "Longitude coordinate of the placemark"
            }
          },
          required: ["latitude", "longitude"]
        }
      }
    },
    required: ["latitude", "longitude", "latitude_span", "longitude_span", "lang"]
  }
}

const GEOSUGGEST_TOOL: Tool = {
  name: "maps_geosuggest",
  description: "Get Yandex Maps geosuggestions for geographic objects and organizations while the user types a search prefix",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "User search input prefix. Must be a non-empty UTF-8 string"
      },
      lang: {
        type: "string",
        description: "Two-letter ISO 639-1 language code for results, e.g. 'ru', 'en'"
      },
      results: {
        type: "integer",
        minimum: 1,
        maximum: 10,
        description: "Maximum number of suggestions to return, from 1 to 10. Default is 7"
      },
      highlight: {
        type: "boolean",
        description: "Set false to disable highlight ranges in title/subtitle text. Omit or set true to use the API default"
      },
      latitude: {
        type: "number",
        description: "Latitude of the search window center"
      },
      longitude: {
        type: "number",
        description: "Longitude of the search window center"
      },
      latitude_span: {
        type: "number",
        description: "Search window height in degrees when latitude/longitude center is used"
      },
      longitude_span: {
        type: "number",
        description: "Search window width in degrees when latitude/longitude center is used"
      },
      bbox: {
        type: "object",
        description: "Search window bounds. Use either bbox or latitude/longitude center, not both",
        properties: {
          southwest: {
            type: "object",
            properties: {
              latitude: { type: "number" },
              longitude: { type: "number" }
            },
            required: ["latitude", "longitude"]
          },
          northeast: {
            type: "object",
            properties: {
              latitude: { type: "number" },
              longitude: { type: "number" }
            },
            required: ["latitude", "longitude"]
          }
        },
        required: ["southwest", "northeast"]
      },
      user_latitude: {
        type: "number",
        description: "User GPS latitude used for distance calculation"
      },
      user_longitude: {
        type: "number",
        description: "User GPS longitude used for distance calculation"
      },
      strict_bounds: {
        type: "boolean",
        description: "Set true to return only objects inside the search window"
      },
      countries: {
        type: "array",
        description: "Two-letter ISO country codes used to restrict results, e.g. ['ru', 'uz', 'kz']",
        items: {
          type: "string"
        }
      },
      types: {
        type: "array",
        description: "Object types to return. Multiple values work as OR, with broader types absorbing narrower ones",
        items: {
          type: "string",
          enum: ["biz", "geo", "street", "metro", "district", "locality", "area", "province", "country", "house", "entrance"]
        }
      },
      print_address: {
        type: "boolean",
        description: "Set true to include structured address components in the response"
      },
      org_address_kind: {
        type: "string",
        enum: ["house"],
        description: "Use 'house' to return only organizations with an address down to house number"
      },
      include_uri: {
        type: "boolean",
        description: "Set true to include the uri field that can be used with the Yandex Geocoder API"
      }
    },
    required: ["text"]
  }
};

const MAPS_TOOLS = [
  GEOCODE_TOOL,
  REVERSE_GEOCODE_TOOL,
  RENDER_MAP_TOOL,
  GEOSUGGEST_TOOL,
] as const;

const YANDEX_MAPS_GEOCODER_BASE_URL = "https://geocode-maps.yandex.ru/1.x/";
const YANDEX_MAPS_STATIC_BASE_URL = "https://static-maps.yandex.ru/v1";
const YANDEX_MAPS_SUGGEST_BASE_URL = "https://suggest-maps.yandex.ru/v1/suggest";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateCoordinate(value: number | undefined, name: string, min: number, max: number): string | null {
  if (!isFiniteNumber(value)) {
    return `${name} must be a finite number`;
  }

  if (value < min || value > max) {
    return `${name} must be between ${min} and ${max}`;
  }

  return null;
}

function validationError(message: string) {
  return {
    content: [{
      type: "text",
      text: message
    }],
    isError: true
  };
}

// API handlers
async function handleGeocode(country: string, lang: string, state?: string, city?: string, district?: string, street?: string, house_number?: string) {
  // Combine the address components into a single string, filtering out undefined values
  const addressParts = [
    house_number,
    street,
    district,
    city,
    state,
    country
  ].filter(part => part !== undefined && part !== '');
  
  const address = addressParts.join(', ');

  const url = new URL(YANDEX_MAPS_GEOCODER_BASE_URL);
  url.searchParams.append("geocode", address);
  url.searchParams.append("format", "json");
  url.searchParams.append("results", "1");
  url.searchParams.append("lang", lang);
  url.searchParams.append("apikey", YANDEX_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as GeocodeResponse;

  // Check for API errors
  if ('error' in data) {
    return {
      content: [{
        type: "text",
        text: `Geocoding failed: ${(data as any).message || 'Unknown error'}`
      }],
      isError: true
    };
  }

  if (!data.response || data.response.GeoObjectCollection.featureMember.length === 0) {
    return {
      content: [{
        type: "text",
        text: `Geocoding failed: No results found`
      }],
      isError: true
    };
  }

  const geoObject = data.response.GeoObjectCollection.featureMember[0].GeoObject;
  const point = geoObject.Point?.pos.split(' ').map(Number); // Format: "longitude latitude"
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        location: point ? { lng: point[0], lat: point[1] } : null,
        formatted_address: geoObject.metaDataProperty.GeocoderMetaData.text,
        address_components: geoObject.metaDataProperty.GeocoderMetaData.Address.Components
      }, null, 2)
    }],
    isError: false
  };
}

async function handleReverseGeocode(latitude: number, longitude: number, lang: string) {
  const url = new URL(YANDEX_MAPS_GEOCODER_BASE_URL);
  url.searchParams.append("geocode", `${longitude},${latitude}`);
  url.searchParams.append("format", "json");
  url.searchParams.append("results", "1");
  url.searchParams.append("lang", lang);
  url.searchParams.append("apikey", YANDEX_MAPS_API_KEY);

  const response = await fetch(url.toString());
  const data = await response.json() as GeocodeResponse;

  // Check for API errors
  if ('error' in data) {
    return {
      content: [{
        type: "text",
        text: `Reverse geocoding failed: ${(data as any).message || 'Unknown error'}`
      }],
      isError: true
    };
  }

  if (!data.response || data.response.GeoObjectCollection.featureMember.length === 0) {
    return {
      content: [{
        type: "text",
        text: `Reverse geocoding failed: No results found`
      }],
      isError: true
    };
  }

  const geoObject = data.response.GeoObjectCollection.featureMember[0].GeoObject;
  const point = geoObject.Point?.pos.split(' ').map(Number); // Format: "longitude latitude"
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        location: point ? { lng: point[0], lat: point[1] } : null,
        formatted_address: geoObject.metaDataProperty.GeocoderMetaData.text,
        address_components: geoObject.metaDataProperty.GeocoderMetaData.Address.Components
      }, null, 2)
    }],
    isError: false
  };
}

async function handleGeosuggest(args: SuggestRequestArgs) {
  const {
    text,
    lang,
    results,
    highlight,
    latitude,
    longitude,
    latitude_span,
    longitude_span,
    bbox,
    user_latitude,
    user_longitude,
    strict_bounds,
    countries,
    types,
    print_address,
    org_address_kind,
    include_uri
  } = args;

  if (typeof text !== "string" || text.trim().length === 0) {
    return validationError("Geosuggest failed: text must be a non-empty string");
  }

  if (results !== undefined && (!Number.isInteger(results) || results < 1 || results > 10)) {
    return validationError("Geosuggest failed: results must be an integer from 1 to 10");
  }

  const hasCenter = latitude !== undefined || longitude !== undefined;
  const hasSpan = latitude_span !== undefined || longitude_span !== undefined;
  const hasBBox = bbox !== undefined;

  if (hasCenter && hasBBox) {
    return validationError("Geosuggest failed: use either bbox or latitude/longitude center, not both");
  }

  if ((latitude === undefined) !== (longitude === undefined)) {
    return validationError("Geosuggest failed: latitude and longitude must be provided together");
  }

  if (hasSpan && (!hasCenter || latitude_span === undefined || longitude_span === undefined)) {
    return validationError("Geosuggest failed: latitude_span and longitude_span require latitude and longitude center");
  }

  if (hasCenter) {
    const latitudeError = validateCoordinate(latitude, "latitude", -90, 90);
    if (latitudeError) {
      return validationError(`Geosuggest failed: ${latitudeError}`);
    }

    const longitudeError = validateCoordinate(longitude, "longitude", -180, 180);
    if (longitudeError) {
      return validationError(`Geosuggest failed: ${longitudeError}`);
    }
  }

  if (hasSpan) {
    if (!isFiniteNumber(latitude_span) || latitude_span <= 0) {
      return validationError("Geosuggest failed: latitude_span must be a positive finite number");
    }

    if (!isFiniteNumber(longitude_span) || longitude_span <= 0) {
      return validationError("Geosuggest failed: longitude_span must be a positive finite number");
    }
  }

  if (bbox) {
    const { southwest, northeast } = bbox;

    if (!southwest || !northeast) {
      return validationError("Geosuggest failed: bbox must include southwest and northeast points");
    }

    const coordinateChecks = [
      validateCoordinate(southwest.latitude, "bbox.southwest.latitude", -90, 90),
      validateCoordinate(southwest.longitude, "bbox.southwest.longitude", -180, 180),
      validateCoordinate(northeast.latitude, "bbox.northeast.latitude", -90, 90),
      validateCoordinate(northeast.longitude, "bbox.northeast.longitude", -180, 180)
    ].filter((error): error is string => error !== null);

    if (coordinateChecks.length > 0) {
      return validationError(`Geosuggest failed: ${coordinateChecks[0]}`);
    }
  }

  if ((user_latitude === undefined) !== (user_longitude === undefined)) {
    return validationError("Geosuggest failed: user_latitude and user_longitude must be provided together");
  }

  if (user_latitude !== undefined && user_longitude !== undefined) {
    const userLatitudeError = validateCoordinate(user_latitude, "user_latitude", -90, 90);
    if (userLatitudeError) {
      return validationError(`Geosuggest failed: ${userLatitudeError}`);
    }

    const userLongitudeError = validateCoordinate(user_longitude, "user_longitude", -180, 180);
    if (userLongitudeError) {
      return validationError(`Geosuggest failed: ${userLongitudeError}`);
    }
  }

  if (countries !== undefined && !Array.isArray(countries)) {
    return validationError("Geosuggest failed: countries must be an array of two-letter country codes");
  }

  if (types !== undefined && !Array.isArray(types)) {
    return validationError("Geosuggest failed: types must be an array of supported object types");
  }

  const url = new URL(YANDEX_MAPS_SUGGEST_BASE_URL);
  url.searchParams.append("apikey", YANDEX_MAPS_SUGGEST_API_KEY);
  url.searchParams.append("text", text);

  if (lang) {
    url.searchParams.append("lang", lang);
  }

  if (results !== undefined) {
    url.searchParams.append("results", String(results));
  }

  if (highlight === false) {
    url.searchParams.append("highlight", "0");
  }

  if (latitude !== undefined && longitude !== undefined) {
    url.searchParams.append("ll", `${longitude},${latitude}`);
  }

  if (latitude_span !== undefined && longitude_span !== undefined) {
    url.searchParams.append("spn", `${longitude_span},${latitude_span}`);
  }

  if (bbox) {
    url.searchParams.append(
      "bbox",
      `${bbox.southwest.longitude},${bbox.southwest.latitude}~${bbox.northeast.longitude},${bbox.northeast.latitude}`
    );
  }

  if (user_latitude !== undefined && user_longitude !== undefined) {
    url.searchParams.append("ull", `${user_longitude},${user_latitude}`);
  }

  if (strict_bounds) {
    url.searchParams.append("strict_bounds", "1");
  }

  const normalizedCountries = countries
    ?.map(country => country.trim())
    .filter(country => country.length > 0);

  if (normalizedCountries && normalizedCountries.length > 0) {
    url.searchParams.append("countries", normalizedCountries.join(","));
  }

  if (types && types.length > 0) {
    url.searchParams.append("types", types.join(","));
  }

  if (print_address) {
    url.searchParams.append("print_address", "1");
  }

  if (org_address_kind) {
    url.searchParams.append("org_address_kind", org_address_kind);
  }

  if (include_uri) {
    url.searchParams.append("attrs", "uri");
  }

  const response = await fetch(url.toString());
  const responseText = await response.text();
  let data: SuggestResponse | undefined;

  if (responseText.length > 0) {
    try {
      data = JSON.parse(responseText) as SuggestResponse;
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Geosuggest failed: invalid JSON response (${error instanceof Error ? error.message : String(error)})`
        }],
        isError: true
      };
    }
  }

  if (!response.ok) {
    const errorMessage = data?.message || data?.error || responseText || "Unknown error";

    return {
      content: [{
        type: "text",
        text: `Geosuggest failed: ${response.status} ${response.statusText}\n${errorMessage}`
      }],
      isError: true
    };
  }

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        results: data?.results ?? []
      }, null, 2)
    }],
    isError: false
  };
}

async function handleRenderMap(
  latitude: number,
  longitude: number,
  latitude_span: number,
  longitude_span: number,
  lang: string,
  placemarks?: Array<{ latitude: number, longitude: number }>
) {
  // Calculate bounds based on center and span
  const ll = `${longitude},${latitude}`; // Center point (lon,lat)
  const spn = `${longitude_span},${latitude_span}`; // Span (lon_span,lat_span)

  const url = new URL(YANDEX_MAPS_STATIC_BASE_URL);
  url.searchParams.append("ll", ll);
  url.searchParams.append("spn", spn);
  url.searchParams.append("l", "map"); // Default layer type
  url.searchParams.append("lang", lang);
  url.searchParams.append("apikey", YANDEX_MAPS_STATIC_API_KEY);
  
  // Add placemarks if provided
  if (placemarks && placemarks.length > 0) {
    // Format: pt=lon1,lat1,pm2rdm~lon2,lat2,pm2rdm~...
    const placemarksParam = placemarks
      .map(mark => `${mark.longitude},${mark.latitude},pm2rdm`)
      .join('~');
    
    url.searchParams.append("pt", placemarksParam);
  }

  try {
    // Fetch the actual image data
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        content: [{
          type: "text",
          text: `Failed to fetch map image: ${response.status} ${response.statusText}\n${errorText}`
        }],
        isError: true
      };
    }
    
    // Get the image as buffer
    const arrayBuffer = await response.arrayBuffer();
    const imageBuffer = Buffer.from(arrayBuffer);
    
    // Convert to base64 for transmission
    const base64Data = imageBuffer.toString('base64');
    const contentType = response.headers.get('content-type') || 'image/png';
    
    // Return as proper MCP image content
    return {
      content: [{
        type: "image",
        data: base64Data,
        mimeType: contentType
      }],
      isError: false
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error rendering map: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

// Server setup
function createMCPServer() {
  const server = new Server(
    {
      name: "mcp-server/yandex-maps",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Set up request handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: MAPS_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      switch (request.params.name) {
        case "maps_geocode": {
          const { country, lang, state, city, district, street, house_number } = request.params.arguments as {
            country: string;
            lang: string;
            state?: string;
            city?: string;
            district?: string;
            street?: string;
            house_number?: string;
          };
          return await handleGeocode(country, lang, state, city, district, street, house_number);
        }

        case "maps_reverse_geocode": {
          const { latitude, longitude, lang } = request.params.arguments as {
            latitude: number;
            longitude: number;
            lang: string;
          };
          return await handleReverseGeocode(latitude, longitude, lang);
        }

        case "maps_render": {
          const { latitude, longitude, latitude_span, longitude_span, lang, placemarks } = request.params.arguments as {
            latitude: number;
            longitude: number;
            latitude_span: number;
            longitude_span: number;
            lang: string;
            placemarks?: Array<{ latitude: number, longitude: number }>;
          };
          return await handleRenderMap(latitude, longitude, latitude_span, longitude_span, lang, placemarks);
        }

        case "maps_geosuggest": {
          return await handleGeosuggest(request.params.arguments as unknown as SuggestRequestArgs);
        }

        default:
          return {
            content: [{
              type: "text",
              text: `Unknown tool: ${request.params.name}`
            }],
            isError: true
          };
      }
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  });

  return server;
}

// Authentication helper for HTTP mode
function authenticateRequest(req: IncomingMessage): boolean {
  const authToken = process.env.MCP_AUTH_TOKEN;

  // If no auth token is configured, allow all requests
  if (!authToken) {
    return true;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return false;
  }

  // Support Bearer token format
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  return token === authToken;
}

// HTTP request handler
async function handleHTTPRequest(req: IncomingMessage, res: ServerResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed. Use POST.'
      },
      id: null
    }));
    return;
  }

  // Authenticate request
  if (!authenticateRequest(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Unauthorized. Valid Bearer token required.'
      },
      id: null
    }));
    return;
  }

  // Read request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const parsedBody = JSON.parse(body);

      // Create fresh server and transport instances for stateless operation
      const server = createMCPServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless mode
      });

      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);

      // Clean up on request close
      res.on('close', () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error'
          },
          id: null
        }));
      }
    }
  });
}

// Run HTTP server
async function runHTTPServer() {
  const port = parseInt(process.env.MCP_PORT || '3000', 10);
  const server = createServer(handleHTTPRequest);

  server.listen(port, () => {
    console.error(`Yandex Maps MCP Server running on HTTP port ${port}`);
    if (process.env.MCP_AUTH_TOKEN) {
      console.error('Authentication enabled');
    } else {
      console.error('WARNING: No authentication token set. Set MCP_AUTH_TOKEN for production use.');
    }
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down HTTP server...');
    server.close();
    process.exit(0);
  });
}

// Run stdio server
async function runStdioServer() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Yandex Maps MCP Server running on stdio");
}

// Main entry point
async function main() {
  const transportMode = process.env.MCP_TRANSPORT || 'stdio';

  if (transportMode === 'http') {
    await runHTTPServer();
  } else if (transportMode === 'stdio') {
    await runStdioServer();
  } else {
    console.error(`Unknown transport mode: ${transportMode}. Use 'stdio' or 'http'.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
