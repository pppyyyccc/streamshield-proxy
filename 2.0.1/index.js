const http = require('http');
const https = require('https');
const url = require('url');
const fetch = require('node-fetch');
const { Headers } = require('node-fetch');
const LRU = require('lru-cache');
const fs = require('fs').promises;
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

// Configuration
const config = {
    PORT: process.env.PORT || 4994,
    CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN || 'default-domain.com',
    SECURITY_TOKEN: process.env.SECURITY_TOKEN || 'test123',
    VPS_HOST: process.env.VPS_HOST,
    INCLUDE_MYTVSUPER: process.env.INCLUDE_MYTVSUPER === 'true',
    DEBUG: process.env.DEBUG === 'true',
    INCLUDE_CHINA_M3U: process.env.CHINAM3U === 'true',
    CUSTOM_M3U: process.env.CUSTOM_M3U,
    CUSTOM_M3U_PROXY: process.env.CUSTOM_M3U_PROXY === 'true',
    CUSTOM_M3U_PROXY_HOST: process.env.CUSTOM_M3U_PROXY_HOST,
    THETV_SOURCE: process.env.THETV_SOURCE,
    AKTV_HOST: process.env.AKTV_HOST,
    AKTV_PORT: process.env.AKTV_PORT,
    AKTV_EXTERNAL_URL: process.env.AKTV_EXTERNAL_URL,
    INCLUDE_ADULT_CONTENT: process.env.INCLUDE_ADULT_CONTENT === 'true',
    CACHE_UPDATE_INTERVAL: parseInt(process.env.CACHE_UPDATE_INTERVAL) || 600000, // 10 minutes
};

// Logging functions
function logDebug(message, req) {
    if (config.DEBUG) {
        const ip = req ? (req.headers['x-forwarded-for'] || req.connection.remoteAddress) : 'N/A';
        const ua = req ? (req.headers['user-agent'] || 'Unknown') : 'N/A';
        console.log(`[DEBUG] [${new Date().toISOString()}] [${ip}] [${ua}] ${message}`);
    }
}

function logInfo(message) {
    console.log(`[INFO] [${new Date().toISOString()}] ${message}`);
}

function logError(message) {
    console.error(`[ERROR] [${new Date().toISOString()}] ${message}`);
}

// Function to add proxy header
function addProxyHeader(originalUrl, encodeUrl = false) {
    if (!originalUrl || !config.VPS_HOST || !config.SECURITY_TOKEN ||
        originalUrl.includes(`${config.VPS_HOST}/${config.SECURITY_TOKEN}/proxy/`)) {
        return originalUrl;
    }

    const proxyUrl = `${config.VPS_HOST}/${config.SECURITY_TOKEN}/proxy/`;
    return proxyUrl + (encodeUrl ? encodeURIComponent(originalUrl) : originalUrl);
}

// Function to detect stream type
function detectStreamType(content) {
    if (content.includes('#EXT-X-KEY') || content.includes('#EXT-X-SESSION-KEY')) {
        return 'hls';
    }
    return 'standard';
}

// Function to handle standard M3U
function handleStandardM3U(content, baseUrl) {
    return content.replace(/(https?:\/\/[^\s\n"]+)/g, (match) => {
        try {
            const fullUrl = new URL(match, baseUrl).href;
            return addProxyHeader(fullUrl);
        } catch (e) {
            return match;
        }
    });
}

// Updated function to handle HLS stream with special handling for encryption keys
function handleHLSStream(content, baseUrl) {
    const lines = content.split('\n');
    return lines.map(line => {
        if (line.startsWith('#EXT-X-KEY')) {
            // Special handling for encryption keys
            return line.replace(/(URI=")(.[^"]+)(")/g, (match, p1, p2, p3) => {
                try {
                    if (p2.includes('127.0.0.1:44124/key')) {
                        // Special handling for TheTV encryption keys
                        return p1 + addProxyHeader(p2) + p3;
                    } else {
                        const fullUrl = new URL(p2, baseUrl).href;
                        return p1 + addProxyHeader(fullUrl, true) + p3;
                    }
                } catch (e) {
                    return match;
                }
            });
        } else if (line.trim().startsWith('http')) {
            try {
                const fullUrl = new URL(line.trim(), baseUrl).href;
                return addProxyHeader(fullUrl);
            } catch (e) {
                return line;
            }
        }
        return line;
    }).join('\n');
}

// Source definitions with updated sources including adult content
const SRC = [
    config.AKTV_HOST && config.AKTV_PORT && {
        name: 'AKTV',
        url: `http://${config.AKTV_HOST}:${config.AKTV_PORT}/live.m3u`,
        noProxy: true,
        mod: (content) => {
            let modifiedContent = content.replace(/\s+tvg-logo="[^"]*"/g, '');
            if (config.AKTV_EXTERNAL_URL) {
                const originalUrl = `http://${config.AKTV_HOST}:${config.AKTV_PORT}`;
                modifiedContent = modifiedContent.replace(new RegExp(originalUrl, 'g'), config.AKTV_EXTERNAL_URL);
            }
            return modifiedContent;
        }
    },
    config.THETV_SOURCE && {
        name: 'TheTV',
        url: config.THETV_SOURCE,
        mod: (content) => {
            content = content.replace(new RegExp(config.THETV_SOURCE, 'g'),
                addProxyHeader(config.THETV_SOURCE));
            
            const lines = content.split('\n');
            return lines.map(line => {
                if (line.startsWith('#EXT-X-KEY')) {
                    return handleHLSStream(line, config.THETV_SOURCE);
                } else if (line.trim().startsWith('http')) {
                    return addProxyHeader(line.trim());
                }
                return line;
            }).join('\n');
        }
    },
    config.INCLUDE_ADULT_CONTENT && {
        name: 'Adult',
        url: 'https://raw.githubusercontent.com/YueChan/Live/main/Adult.m3u',
        mod: (content) => handleStandardM3U(content)
    },
    config.INCLUDE_ADULT_CONTENT && {
        name: 'Adult IPTV',
        url: 'https://raw.githubusercontent.com/reklamalinir/freeadultiptv/master/live_adult_channels.m3u',
        mod: (content) => handleStandardM3U(content)
    }
].filter(Boolean);
// Caches
const m3uCache = new LRU({
    max: 100,
    maxAge: config.CACHE_UPDATE_INTERVAL
});

// Function to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// Function to generate all.m3u content
async function generateAllM3U() {
    let content = `#EXTM3U\n#EXTM3U x-tvg-url="https://assets.livednow.com/epg.xml"\n\n`;

    for (const src of SRC) {
        try {
            logInfo(`Processing source: ${src.name}`);
            const response = await fetchWithTimeout(src.url, {}, 5000);
            let sourceContent = await response.text();

            if (src.mod) {
                sourceContent = src.mod(sourceContent);
            }

            const channels = sourceContent.split(/^#EXT/gm)
                .map(it => '#EXT' + it)
                .filter(it => it.startsWith('#EXTINF'));

            content += `#EXTINF:-1 tvg-name="${src.name}",${src.name}\n`;
            content += channels.join('\n') + '\n';

            logInfo(`Successfully processed ${src.name} with ${channels.length} channels`);
        } catch (error) {
            logError(`Error processing ${src.name}: ${error.message}`);
        }
    }

    await fs.writeFile('all.m3u', content);
    m3uCache.set('all', content);
    logInfo('Generated all.m3u file');
    return content;
}

// Function to handle M3U list requests
async function handleList(req, res) {
    const cachedContent = m3uCache.get('all');

    if (cachedContent) {
        logInfo('Using cached content for all.m3u');
        res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' });
        res.end(cachedContent);
        return;
    }

    const content = await generateAllM3U();
    res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' });
    res.end(content);
}

// Function to handle proxy requests
async function handleProxy(req, res) {
    try {
        const urlParts = req.url.split(`/${config.SECURITY_TOKEN}/proxy/`);
        if (urlParts.length < 2 || !urlParts[1]) {
            throw new Error('Invalid proxy request: missing target URL');
        }

        const targetUrl = decodeURIComponent(urlParts[1]);
        logDebug(`Proxying request to: ${targetUrl}`, req);

        const headers = new Headers(req.headers);
        headers.delete('host');

        if (targetUrl.includes('thetvapp.to')) {
            headers.set('Referer', 'https://thetvapp.to/');
            headers.set('Origin', 'https://thetvapp.to');
        }

        const response = await fetchWithTimeout(targetUrl, {
            method: req.method,
            headers: headers,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
            redirect: 'follow'
        }, 5000);

        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/vnd.apple.mpegurl')) {
            const content = await response.text();
            const streamType = detectStreamType(content);
            const modifiedContent = streamType === 'hls' ?
                handleHLSStream(content, targetUrl) :
                handleStandardM3U(content, targetUrl);

            res.writeHead(200, {
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(modifiedContent);
        } else {
            const responseHeaders = Object.fromEntries(response.headers);
            responseHeaders['Access-Control-Allow-Origin'] = '*';

            res.writeHead(response.status, responseHeaders);
            response.body.pipe(res);
        }
    } catch (error) {
        logError(`Error in handleProxy: ${error.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    }
}

// Main request handler
const server = http.createServer(async (req, res) => {
    logDebug(`Received request for: ${req.url}`, req);

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Range'
        });
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const token = parsedUrl.pathname.split('/')[1];

    if (token === config.SECURITY_TOKEN) {
        if (parsedUrl.pathname.startsWith(`/${config.SECURITY_TOKEN}/proxy/`)) {
            await handleProxy(req, res);
        } else if (parsedUrl.pathname === `/${config.SECURITY_TOKEN}/all.m3u`) {
            await handleList(req, res);
        } else if (parsedUrl.pathname === `/${config.SECURITY_TOKEN}`) {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end(`${config.VPS_HOST}/${config.SECURITY_TOKEN}/all.m3u`);
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
        }
    } else {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
    }
});

// Start the server and initialize
server.listen(config.PORT, async () => {
    console.log(`StreamShield Proxy v2.0.0 is listening on port ${config.PORT}`);

    try {
        // Clear existing cache and file
        await fs.unlink('all.m3u').catch(() => {});
        m3uCache.reset();

        // Verify AKTV configuration
        if (config.AKTV_HOST && config.AKTV_PORT) {
            const aktvUrl = `http://${config.AKTV_HOST}:${config.AKTV_PORT}/live.m3u`;
            try {
                await fetch(aktvUrl);
                logInfo(`AKTV server reachable at ${aktvUrl}`);
            } catch (error) {
                logError(`AKTV server not reachable: ${error.message}`);
            }
        }

        // Generate initial all.m3u file
        await generateAllM3U();
        logInfo('Initial all.m3u file generated successfully');

        // Set up periodic updates
        setInterval(async () => {
            try {
                await generateAllM3U();
                logInfo('Periodic all.m3u update completed');
            } catch (error) {
                logError(`Error in periodic update: ${error.message}`);
            }
        }, config.CACHE_UPDATE_INTERVAL);

    } catch (error) {
        logError(`Error during initialization: ${error.message}`);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logError(`Uncaught Exception: ${error.message}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logError(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
