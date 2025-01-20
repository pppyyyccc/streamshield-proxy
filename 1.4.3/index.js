const http = require('http');
const url = require('url');
const fetch = require('node-fetch');
const { Headers, Request } = require('node-fetch');
const { Transform, PassThrough } = require('stream');
const LRU = require('lru-cache');
const fs = require('fs').promises;

// Parse environment variables
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || 'default-domain.com';
const SECURITY_TOKEN = process.env.SECURITY_TOKEN || 'test123';
const VPS_HOST = process.env.VPS_HOST;
const INCLUDE_MYTVSUPER = process.env.INCLUDE_MYTVSUPER;
const DEBUG = process.env.DEBUG === 'true';
const INCLUDE_CHINA_M3U = process.env.CHINAM3U === 'true';
const CUSTOM_M3U = process.env.CUSTOM_M3U;
const CUSTOM_M3U_PROXY = process.env.CUSTOM_M3U_PROXY === 'true';
const CUSTOM_M3U_PROXY_HOST = process.env.CUSTOM_M3U_PROXY_HOST;
const THETV_SOURCE = process.env.THETV_SOURCE;
const AKTV_HOST = process.env.AKTV_HOST;
const AKTV_PORT = process.env.AKTV_PORT;
const AKTV_EXTERNAL_URL = process.env.AKTV_EXTERNAL_URL;
const INCLUDE_ADULT_CONTENT = process.env.INCLUDE_ADULT_CONTENT === 'true';

// 修改 EXTRA_M3U_URLS 处理
const EXTRA_M3U_URLS = (process.env.EXTRA_M3U_URLS || '').split(',').filter(url => url.trim()).map(url => ({
  url: url.trim(),
  noProxy: true
}));

// Generate URLs first
const FOUR_SEASONS_URL = `${CUSTOM_DOMAIN}/4gtv.m3u`;
const BEESPORT_URL = `${CUSTOM_DOMAIN}/beesport.m3u`;
const YSP_URL = `${CUSTOM_DOMAIN}/ysp.m3u`;
const SXG_URL = `${CUSTOM_DOMAIN}/sxg.m3u`;
const ITV_PROXY_URL = `${CUSTOM_DOMAIN}/itv_proxy.m3u`;
const TPTV_PROXY_URL = `${CUSTOM_DOMAIN}/tptv_proxy.m3u`;
const MYTVSUPER_URL = `${CUSTOM_DOMAIN}/mytvsuper-tivimate.m3u`;
const CUSTOM_M3U_URL = CUSTOM_M3U ? `${CUSTOM_DOMAIN}/${CUSTOM_M3U}` : null;
const DLHD_URL = `${CUSTOM_DOMAIN}/dlhd.m3u`;
const PROXY_DOMAIN = new URL(CUSTOM_DOMAIN).hostname;
const AKTV_URL = process.env.AKTV_DEFAULT_SOURCE || (AKTV_HOST && AKTV_PORT ? `http://${AKTV_HOST}:${AKTV_PORT}/live.m3u` : null);

// Adult content URLs
const ADULT_SOURCES = [
  {
    name: 'Adult Content 1',
    url: 'https://raw.githubusercontent.com/YueChan/Live/main/Adult.m3u',
    noProxy: true,
    mod: (noproxy) => (content) => {
      return content.replace(/group-title="[^"]*"/g, 'group-title="XXX"');
    }
  },
  {
    name: 'Adult Content 2',
    url: 'https://raw.githubusercontent.com/reklamalinir/freeadultiptv/master/live_adult_channels.m3u',
    noProxy: true,
    mod: (noproxy) => (content) => {
      return content.replace(/group-title="[^"]*"/g, 'group-title="XXX"');
    }
  }
];

// Log environment variables
console.log('Environment variables:');
console.log(`CUSTOM_DOMAIN: ${process.env.CUSTOM_DOMAIN}`);
console.log(`VPS_HOST: ${process.env.VPS_HOST}`);
console.log(`SECURITY_TOKEN: ${process.env.SECURITY_TOKEN}`);
console.log(`INCLUDE_MYTVSUPER: ${process.env.INCLUDE_MYTVSUPER}`);
console.log(`CHINAM3U: ${process.env.CHINAM3U}`);
console.log(`DEBUG: ${process.env.DEBUG}`);
console.log(`THETV_SOURCE: ${THETV_SOURCE}`);
console.log(`AKTV_HOST: ${AKTV_HOST}`);
console.log(`AKTV_PORT: ${AKTV_PORT}`);
console.log(`AKTV_EXTERNAL_URL: ${AKTV_EXTERNAL_URL}`);
console.log(`AKTV_DEFAULT_SOURCE: ${process.env.AKTV_DEFAULT_SOURCE}`);
console.log(`INCLUDE_ADULT_CONTENT: ${INCLUDE_ADULT_CONTENT}`);

if (INCLUDE_MYTVSUPER) {
  console.log(`MYTVSUPER configuration: ${INCLUDE_MYTVSUPER}`);
  console.log(`MYTVSUPER URL: ${MYTVSUPER_URL}`);
}

if (EXTRA_M3U_URLS.length > 0) {
  console.log('\nExtra VPS M3U URLs (Direct, No Proxy):');
  EXTRA_M3U_URLS.forEach((src, index) => {
    console.log(`VPS ${index + 1}: ${src.url}`);
  });
  console.log('');
}

if (!VPS_HOST) {
  console.error('Error: VPS_HOST environment variable is not set.');
  process.exit(1);
}

// Logging functions
function logDebug(message) {
  if (DEBUG) {
    console.log(message);
    console.log('\n');
  }
}

function logInfo(message) {
  console.log(message);
  console.log('\n');
}

function logError(message) {
  console.error(message);
  console.error('\n');
}
// Define proxy domains
const PROXY_DOMAINS = [
  PROXY_DOMAIN,
  '[^/]+\\.hinet\\.net(:\\d+)?',
  '[^/]+\\.googlevideo\\.com(:\\d+)?',
  '[^/]+\\.tvb.com(:\\d+)?',
  '[^/]+\\.livednow\\.com(:\\d+)?',
  '[^/]+\\.orz-7\\.com(:\\d+)?',
  '[^/]+\\.4gtv\\.tv(:\\d+)?',
  '[^/]+\\.ofiii\\.com(:\\d+)?',
  '[^/]+\\.youtube\\.com(:\\d+)?',
  '[^/]+\\.mytvsuper\\.com(:\\d+)?',
  '[^/]+\\.beesport\\.livednow\\.com(:\\d+)?',
  '[^/]+\\.thetvapp\\.to(:\\d+)?',
  '[^/]+\\.pki\\.goog(:\\d+)?',
  'thetv-ts\\.wx\\.sb',
  '[^/]+\\.v2h-cdn\\.com(:\\d+)?',
  'v12.thetvapp.to',
  'thetvapp\\.to'
];

if (CUSTOM_M3U_PROXY && CUSTOM_M3U_PROXY_HOST) {
  PROXY_DOMAINS.push(CUSTOM_M3U_PROXY_HOST);
}

// Define source addresses
const SRC = [
  AKTV_URL && {
    name: 'AKTV',
    url: AKTV_URL,
    noProxy: true,
    mod: (noproxy) => (content) => {
      let modifiedContent = content;
      // Remove tvg-logo attributes from AKTV content
      modifiedContent = modifiedContent.replace(/\s+tvg-logo="[^"]*"/g, '');
      
      if (AKTV_EXTERNAL_URL && !process.env.AKTV_DEFAULT_SOURCE) {
        const originalUrl = `http://${AKTV_HOST}:${AKTV_PORT}`;
        modifiedContent = modifiedContent.replace(new RegExp(originalUrl, 'g'), AKTV_EXTERNAL_URL);
      }
      return modifiedContent;
    }
  },
  ...EXTRA_M3U_URLS,
  {
    name: '四季',
    url: FOUR_SEASONS_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  INCLUDE_MYTVSUPER === 'true' && {
    name: 'MytvSuper 直播源',
    url: MYTVSUPER_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  THETV_SOURCE && {
    name: 'TheTV',
    url: THETV_SOURCE,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  {
    name: 'Beesport 直播源',
    url: BEESPORT_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  INCLUDE_CHINA_M3U && {
    name: '央视频',
    url: YSP_URL
  },
  INCLUDE_CHINA_M3U && {
    name: '蜀小果',
    url: SXG_URL
  },
  INCLUDE_CHINA_M3U && {
    name: '中国移动 iTV 平台',
    url: ITV_PROXY_URL
  },
  INCLUDE_CHINA_M3U && {
    name: '江苏移动魔百盒 TPTV',
    url: TPTV_PROXY_URL
  },
  CUSTOM_M3U && {
    name: '自定义 M3U',
    url: CUSTOM_M3U_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  // Add adult content sources only if enabled
  ...(INCLUDE_ADULT_CONTENT ? ADULT_SOURCES : [])
].filter(Boolean);

// Log configured sources
logDebug('Configured sources:');
SRC.forEach(src => {
  logDebug(`- ${src.name || 'Extra M3U'}: ${src.url}`);
});

function identity(it) { return it; }

function addProxyHeader(originalUrl, encodeUrl = false) {
    if (!originalUrl) return originalUrl;

    if (originalUrl.includes(`${VPS_HOST}/${SECURITY_TOKEN}/proxy/`)) {
        return originalUrl;
    }

    for (const dom of PROXY_DOMAINS) {
        const regex = new RegExp(`^https?://${dom}`, 'i');
        if (regex.test(originalUrl)) {
            return `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${encodeUrl ? encodeURIComponent(originalUrl) : originalUrl}`;
        }
    }

    return originalUrl;
}

function proxify(it) {
    return it.replace(/https?:\/\/[^\s"']*/g, (match) => {
        if (match.startsWith(`${VPS_HOST}/${SECURITY_TOKEN}/proxy/`)) {
            return match;
        }
        return addProxyHeader(match);
    });
}

// Create LRU cache
const m3uCache = new LRU({
  max: 100,
  maxAge: 1000 * 60 * 5 // 5 minutes
});

const proxyCache = new LRU({
  max: 1000,
  maxAge: 1000 * 60 * 1 // 1 minute
});

async function fetchWithTimeout(url, options = {}, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const response = await fetch(url, {
    ...options,
    signal: controller.signal
  });
  clearTimeout(id);
  return response;
}

async function handleList(req, res) {
  const cacheKey = req.url;
  const cachedContent = m3uCache.get(cacheKey);

  if (cachedContent) {
    logInfo(`Using cached content for ${cacheKey}`);
    res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' });
    res.end(cachedContent);
    return;
  }

  let text = `#EXTM3U\n#EXTM3U x-tvg-url="https://assets.livednow.com/epg.xml"\n\n`;
  const REQ = SRC.map(src => ({
    ...src,
    response: src.local ? null : fetchWithTimeout(src.url, {}, 5000).catch(error => {
      logError(`Error fetching ${src.name || 'Unknown source'}: ${error.message}`);
      return null;
    })
  }));

  logInfo(`Starting to fetch and process ${REQ.length} sources`);

  for (const src of REQ) {
    try {
      logDebug(`Processing source: ${src.name || 'Extra M3U'}`);
      if (src.name === 'AKTV' && process.env.AKTV_DEFAULT_SOURCE) {
        logInfo(`Using default AKTV source: ${process.env.AKTV_DEFAULT_SOURCE}`);
      }
      let respText;
      if (src.local) {
        logDebug(`Reading local file: ${src.url}`);
        respText = await fs.readFile(src.url, 'utf8');
      } else {
        if (!src.response) {
          logError(`No response for ${src.name || 'Unknown source'}, skipping`);
          continue;
        }
        const resp = await src.response;
        if (!resp) {
          logError(`Failed to fetch ${src.name || 'Unknown source'}, skipping`);
          continue;
        }
        respText = await resp.text();
        logDebug(`Fetched content length: ${respText.length}`);
      }

      let channels = respText.split(/^#EXT/gm).map(it => '#EXT' + it).filter(it => it.startsWith('#EXTINF'));
      logDebug(`Found ${channels.length} channels in ${src.name || 'Extra M3U'}`);

      if (src.filter) {
        const beforeLen = channels.length;
        channels = channels.filter(src.filter);
        const afterLen = channels.length;
        logDebug(`Filtered ${src.name || 'Extra M3U'}: ${beforeLen} -> ${afterLen} channels`);
      }

      if (src.mod) {
        const noproxy = req.url.indexOf('noproxy') > -1;
        logDebug(`Applying ${noproxy ? 'direct' : 'proxy'} modifications to ${src.name || 'Extra M3U'}`);
        channels = channels.map(src.mod(noproxy));
      }

      for (const chan of channels) {
        text += chan + '\n';
      }
      logInfo(`Successfully processed ${src.name || 'Extra M3U'} with ${channels.length} channels`);
    } catch (error) {
      logError(`Error processing ${src.name || 'Extra M3U'}: ${error.message}`);
      logError(`Stack trace: ${error.stack}`);
    }
  }

  logInfo(`Total content length: ${text.length}`);
  m3uCache.set(cacheKey, text);
  res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' });
  res.end(text);
}

async function handleProxy(req, res) {
  try {
    const urlParts = req.url.split(`/${SECURITY_TOKEN}/proxy/`);
    if (urlParts.length < 2 || !urlParts[1]) {
      throw new Error('Invalid proxy request: missing target URL');
    }

    const targetUrl = decodeURIComponent(urlParts[1]);
    logDebug(`Proxying request to: ${targetUrl}`);

    const headers = new Headers(req.headers);
    headers.delete('host');

    if (targetUrl.includes('v12.thetvapp.to')) {
      headers.set('Referer', 'https://v12.thetvapp.to/');
      headers.set('Origin', 'https://v12.thetvapp.to');
    }

    const response = await fetchWithTimeout(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      redirect: 'manual'
    }, 5000);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        logDebug(`Got redirect to: ${location}`);
        const newLocation = new URL(location, targetUrl).href;
        const newHeaders = new Headers(response.headers);
        newHeaders.set('location', addProxyHeader(newLocation));
        res.writeHead(response.status, Object.fromEntries(newHeaders));
        res.end();
        return;
      }
    }

    const contentType = response.headers.get('content-type');

    if (targetUrl.includes('/thetv/drm')) {
        const drmResponse = await fetchWithTimeout(targetUrl, {
            method: req.method,
            headers: headers
        }, 5000);
        res.writeHead(drmResponse.status, Object.fromEntries(drmResponse.headers));
        drmResponse.body.pipe(res);
    }
    else if (contentType && contentType.includes('application/vnd.apple.mpegurl')) {
        const m3u8Lines = (await response.text()).split('\n');
        const modifiedLines = [];

        for (const line of m3u8Lines) {
            if (line.startsWith('#EXT-X-KEY')) {
                let modifiedLine = line.replace(
                    /URI="([^"]+)"/,
                    (match, uri) => {
                        if (uri.includes('thetv')) {
                            let fullUrl;
                            if (uri.startsWith('http')) {
                                fullUrl = uri;
                            } else if (uri.startsWith('/')) {
                                fullUrl = new URL(uri, 'https://thetvapp.to').href;
                            } else {
                                fullUrl = new URL(uri, targetUrl).href;
                            }
                            return `URI="${addProxyHeader(fullUrl)}"`;
                        }
                        return `URI="${uri}"`;
                    }
                );
                modifiedLines.push(modifiedLine);
            } else if (line.trim().startsWith('http')) {
                const proxiedUrl = addProxyHeader(line.trim());
                modifiedLines.push(proxiedUrl);
            } else if (!line.startsWith('#') && line.trim()) {
                const absoluteUrl = new URL(line.trim(), targetUrl).href;
                const proxiedUrl = addProxyHeader(absoluteUrl);
                modifiedLines.push(proxiedUrl);
            } else {
                modifiedLines.push(line);
            }
        }

        const modifiedM3u8 = modifiedLines.join('\n');
        res.writeHead(200, {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(modifiedM3u8);
    } else {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        response.body.pipe(res);
    }
  } catch (error) {
    logError(`Error in handleProxy: ${error.message}`);
    logError(`Stack trace: ${error.stack}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

const server = http.createServer(async (req, res) => {
  logDebug(`Received request for: ${req.url}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Range'
    });
    res.end();
    return;
  }

  const token = req.url.split('/')[1];
  if (token === SECURITY_TOKEN) {
    if (req.url.startsWith(`/${SECURITY_TOKEN}/proxy`)) {
      await handleProxy(req, res);
    } else if (req.url.startsWith(`/${SECURITY_TOKEN}`)) {
      await handleList(req, res);
    } else {
      logDebug(`403 Forbidden: ${req.url}`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    }
  } else {
    logDebug(`403 Forbidden: ${req.url}`);
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
  }
});

const PORT = process.env.PORT || 4994;
server.listen(PORT, () => {
  console.log(`StreamShield Proxy is listening on port ${PORT}`);
});
