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
const INCLUDE_CHINA_M3U = process.env.chinam3u === 'true';
const CUSTOM_M3U = process.env.CUSTOM_M3U;
const CUSTOM_M3U_PROXY = process.env.CUSTOM_M3U_PROXY === 'true';
const CUSTOM_M3U_PROXY_HOST = process.env.CUSTOM_M3U_PROXY_HOST;

if (!VPS_HOST) {
  console.error('Error: VPS_HOST environment variable is not set.');
  process.exit(1);
}

// Logging functions
function logDebug(message) {
  if (DEBUG) {
    console.log(message);
    console.log('\n'); // Add a newline to force flush
  }
}

function logInfo(message) {
  console.log(message);
  console.log('\n'); // Add a newline to force flush
}

function logError(message) {
  console.error(message);
  console.error('\n'); // Add a newline to force flush
}

// Generate URLs
const FOUR_SEASONS_URL = `${CUSTOM_DOMAIN}/4gtv.m3u`;
const BEESPORT_URL = `${CUSTOM_DOMAIN}/beesport.m3u`;
const YSP_URL = `${CUSTOM_DOMAIN}/ysp.m3u`;
const SXG_URL = `${CUSTOM_DOMAIN}/sxg.m3u`;
const ITV_PROXY_URL = `${CUSTOM_DOMAIN}/itv_proxy.m3u`;
const TPTV_PROXY_URL = `${CUSTOM_DOMAIN}/tptv_proxy.m3u`;
const MYTVSUPER_URL = `${CUSTOM_DOMAIN}/mytvsuper-tivimate.m3u`;
const THETV_URL = `${CUSTOM_DOMAIN}/thetv.m3u`;
const MYTVFREE_URL = INCLUDE_MYTVSUPER === 'free' ? './mytvfree.m3u' : null;
const CUSTOM_M3U_URL = CUSTOM_M3U ? `${CUSTOM_DOMAIN}/${CUSTOM_M3U}` : null;
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
  maxAge: 1000 * 60 * 1 // 1 minutes
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
        channels = channels.map(src.mod(noproxy));
      }

      for (const chan of channels) {
        text += chan;
      }
    } catch (error) {
      logError(`Error fetching or processing ${src.name}: ${error}`);
    }
  }

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

    let targetUrl = new URL(decodeURIComponent(urlParts[1]));
    const headers = new Headers(req.headers);
    headers.delete('host');

    // 设置自动跟随重定向
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      redirect: 'follow', // 自动跟随重定向
      follow: 5 // 最多跟随5次重定向
    });

    const contentType = response.headers.get('content-type');

    if (contentType && contentType.includes('application/vnd.apple.mpegurl')) {
      // 处理 m3u8 文件
      let m3u8Content = await response.text();
      
      // 替换 #EXT-X-KEY 行中的 URI
      m3u8Content = m3u8Content.replace(
        /(#EXT-X-KEY:.*URI=")([^"]+)(".*)/g,
        (match, p1, p2, p3) => {
          let newUrl = new URL(p2, targetUrl).href;
          return `${p1}${VPS_HOST}/${SECURITY_TOKEN}/proxy/${encodeURIComponent(newUrl)}${p3}`;
        }
      );

      // 替换 ts 文件 URL
      m3u8Content = m3u8Content.replace(
        /(https?:\/\/[^\s"]+\.ts[^\s"]*)/g,
        (match) => {
          return `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${encodeURIComponent(match)}`;
        }
      );

      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
      res.end(m3u8Content);
    } else {
      // 处理其他类型的响应
      res.writeHead(response.status, Object.fromEntries(response.headers));
      response.body.pipe(res);
    }

  } catch (error) {
    logError(`Error in handleProxy: ${error.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

const PORT = process.env.PORT || 4994;
server.listen(PORT, () => {
  console.log(`StreamShield Proxy is listening on port ${PORT}`);
});
