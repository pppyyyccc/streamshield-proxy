const http = require('http');
const url = require('url');
const fetch = require('node-fetch');
const { Headers, Request } = require('node-fetch');
const { Transform, PassThrough } = require('stream');
const LRU = require('lru-cache');
const fs = require('fs').promises;
const xml2js = require('xml2js');

// Log environment variables
console.log('Environment variables:');
console.log(`CUSTOM_DOMAIN: ${process.env.CUSTOM_DOMAIN}`);
console.log(`VPS_HOST: ${process.env.VPS_HOST}`);
console.log(`SECURITY_TOKEN: ${process.env.SECURITY_TOKEN}`);
console.log(`INCLUDE_MYTVSUPER: ${process.env.INCLUDE_MYTVSUPER}`);
console.log(`CHINAM3U: ${process.env.CHINAM3U}`);

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

console.log(`INCLUDE_CHINA_M3U: ${INCLUDE_CHINA_M3U}`);

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

// Generate URLs
const FOUR_SEASONS_URL = `${CUSTOM_DOMAIN}/4gtv.m3u`;
const BEESPORT_URL = `${CUSTOM_DOMAIN}/beesport.m3u`;
const YSP_URL = `${CUSTOM_DOMAIN}/ysp.m3u`;
const ITV_PROXY_URL = `${CUSTOM_DOMAIN}/itv_proxy.m3u`;
const TPTV_PROXY_URL = `${CUSTOM_DOMAIN}/tptv_proxy.m3u`;
const MYTVSUPER_URL = `${CUSTOM_DOMAIN}/mytvsuper-tivimate.m3u`;
const THETV_URL = `${CUSTOM_DOMAIN}/thetv.m3u`;
const MYTVFREE_URL = INCLUDE_MYTVSUPER === 'free' ? './mytvfree.m3u' : null;
const CUSTOM_M3U_URL = CUSTOM_M3U ? `${CUSTOM_DOMAIN}/${CUSTOM_M3U}` : null;
const DLHD_URL = `${CUSTOM_DOMAIN}/dlhd.m3u`;
const PROXY_DOMAIN = new URL(CUSTOM_DOMAIN).hostname;

// Define source addresses, considering environment variables
const SRC = [
  {
    name: '四季',
    url: FOUR_SEASONS_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  INCLUDE_MYTVSUPER === 'free' && {
    name: 'MytvSuper Free',
    url: MYTVFREE_URL,
    mod: (noproxy) => noproxy ? identity : proxify,
    local: true
  },
  INCLUDE_MYTVSUPER === 'true' && {
    name: 'MytvSuper 直播源',
    url: MYTVSUPER_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  {
    name: 'TheTV',
    url: THETV_URL,
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
    name: 'DLHD 测试频道',
    url: DLHD_URL
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
  }
].filter(Boolean);

// Define proxy domains and include custom domains
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
  '[^/]+\\.thetv-ts\\.[^/]+(:\\d+)?',
  '[^/]+\\.digicert\\.com(:\\d+)?',
  '[^/]+\\.v2h-cdn\\.com(:\\d+)?'
];

if (CUSTOM_M3U_PROXY && CUSTOM_M3U_PROXY_HOST) {
  PROXY_DOMAINS.push(CUSTOM_M3U_PROXY_HOST);
}

function identity(it) { return it; }

function proxify(it) {
  for (const dom of PROXY_DOMAINS) {
    const regex = new RegExp(`https?://${dom}[^\\s"']*`, 'g');
    it = it.replace(regex, (match) => `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${match}`);
  }
  return it;
}

// Create LRU cache for m3u content
const m3uCache = new LRU({
  max: 100,
  maxAge: 1000 * 60 * 5 // 5 minutes
});

// Create LRU cache for proxy responses
const proxyCache = new LRU({
  max: 1000,
  maxAge: 1000 * 60 * 1 // 1 minute
});

const server = http.createServer(async (req, res) => {
  logDebug(`Received request for: ${req.url}`);

  // Handle OPTIONS requests
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
      res.writeHead(403, { 'Content-Type': 'text/plain', 'Connection': 'keep-alive', 'Keep-Alive': 'timeout=20' });
      res.end('Forbidden');
    }
  } else {
    logDebug(`403 Forbidden: ${req.url}`);
    res.writeHead(403, { 'Content-Type': 'text/plain', 'Connection': 'keep-alive', 'Keep-Alive': 'timeout=20' });
    res.end('Forbidden');
  }
});

async function handleList(req, res) {
  const cacheKey = req.url;
  const cachedContent = m3uCache.get(cacheKey);

  if (cachedContent) {
    res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' });
    res.end(cachedContent);
    return;
  }

  let text = `#EXTM3U\n#EXTM3U x-tvg-url="https://assets.livednow.com/epg.xml"\n\n`;
  const REQ = SRC.map(src => ({
    ...src,
    response: src.local ? null : fetch(src.url)
  }));

  for (const src of REQ) {
    try {
      console.log(`Processing source: ${src.name}, URL: ${src.url}`);
      let respText;
      if (src.local) {
        respText = await fs.readFile(src.url, 'utf8');
      } else {
        const resp = await src.response;
        respText = await resp.text();
      }

      let channels = respText.split(/^#EXT/gm).map(it => '#EXT' + it).filter(it => it.startsWith('#EXTINF'));

      if (src.filter) {
        const beforeLen = channels.length;
        channels = channels.filter(src.filter);
        const afterLen = channels.length;
        logDebug(`filter ${src.name} ${beforeLen} -> ${afterLen}`);
      }

      if (src.mod) {
        const noproxy = req.url.indexOf('noproxy') > -1;
        channels = channels.map(channel => src.mod(noproxy)(channel, src.url));
      }

      for (const chan of channels) {
        text += chan;
      }
      console.log(`Processed ${channels.length} channels from ${src.name}`);
    } catch (error) {
      console.error(`Error fetching or processing ${src.name}: ${error}`);
    }
  }

  console.log(`Total channels in final output: ${text.split('#EXTINF').length - 1}`);

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

    const targetUrl = new URL(urlParts[1]);
    logDebug('proxying URL', targetUrl);

    const headers = new Headers(req.headers);
    headers.delete('host');

    const proxyReq = new Request(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      redirect: 'manual'
    });

    const resp = await fetch(proxyReq);

    // Handle redirects
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get('location');
      if (!location) {
        throw new Error('Redirect response without Location header.');
      }

      let newLocation = new URL(location, targetUrl).href;
      newLocation = `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${newLocation}`;

      const newHeaders = new Headers(resp.headers);
      newHeaders.set('location', newLocation);

      res.writeHead(resp.status, Object.fromEntries(newHeaders));
      res.end();
      return;
    }

    const contentType = resp.headers.get('content-type');

    if (contentType === 'application/vnd.apple.mpegurl' || contentType === 'application/x-mpegURL') {
      // Handle HLS (M3U8) content
      let body = await resp.text();
      body = handleHls(body, targetUrl);
      res.writeHead(resp.status, {
        ...Object.fromEntries(resp.headers),
        'content-length': Buffer.byteLength(body)
      });
      res.end(body);
    } else if (contentType === 'application/dash+xml') {
      // Handle MPEG-DASH (MPD) content
      let body = await resp.text();
      body = await handleDash(body, targetUrl);
      res.writeHead(resp.status, {
        ...Object.fromEntries(resp.headers),
        'content-length': Buffer.byteLength(body)
      });
      res.end(body);
    } else {
      // For other content, pipe directly to client without processing
      res.writeHead(resp.status, Object.fromEntries(resp.headers));
      resp.body.pipe(res);
    }

    logInfo(`Request for ${targetUrl.href} succeeded with status ${resp.status}`);
  } catch (error) {
    logError(`Error in handleProxy: ${error.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

function handleHls(body, targetUrl) {
  // Handle AES-128 encryption for HLS
  body = body.replace(
    /(#EXT-X-KEY:.*?URI=")([^"]+)(".*)/g,
    (match, p1, p2, p3) => {
      const keyUrl = new URL(p2, targetUrl).href;
      return `${p1}${VPS_HOST}/${SECURITY_TOKEN}/proxy/${keyUrl}${p3}`;
    }
  );

  // Handle other URLs in the HLS content
  body = body.replace(
    /(#EXT-X-MEDIA:.*?URI=")([^"]+)(".*)/g,
    (match, p1, p2, p3) => {
      const mediaUrl = new URL(p2, targetUrl).href;
      return `${p1}${VPS_HOST}/${SECURITY_TOKEN}/proxy/${mediaUrl}${p3}`;
    }
  );

  // Handle segment URLs
  body = body.replace(
    /^(?!#)(.*\.ts|.*\.m4s)/gm,
    (match) => {
      const segmentUrl = new URL(match, targetUrl).href;
      return `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${segmentUrl}`;
    }
  );

  return body;
}

async function handleDash(body, targetUrl) {
  // Parse the MPD XML
  const parser = new xml2js.Parser();
  let mpd;
  try {
    mpd = await parser.parseStringPromise(body);
  } catch (error) {
    logError(`Error parsing MPD: ${error}`);
    return proxyAllUrls(body);
  }

  // Function to recursively process MPD elements
  function processMpdElement(element) {
    if (typeof element === 'object') {
      for (const key in element) {
        if (Array.isArray(element[key])) {
          element[key] = element[key].map(processMpdElement);
        } else if (typeof element[key] === 'object') {
          processMpdElement(element[key]);
        }
      }

      // Process URL attributes
      const urlAttributes = ['sourceURL', 'media', 'initialization'];
      for (const attr of urlAttributes) {
        if (element['$'] && element['$'][attr]) {
          const fullUrl = new URL(element['$'][attr], targetUrl).href;
          element['$'][attr] = `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${fullUrl}`;
        }
      }
    }
    return element;
  }

  // Process the entire MPD
  processMpdElement(mpd);

  // Convert back to XML
  const builder = new xml2js.Builder();
  const processedBody = builder.buildObject(mpd);

  return processedBody;
}

function proxyAllUrls(content) {
  return content.replace(
    /https?:\/\/[^"\s]+/g,
    (match) => `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${match}`
  );
}

const port = process.env.PORT || 4994;
server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
