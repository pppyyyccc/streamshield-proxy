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
const EXTRA_M3U_URLS = (process.env.EXTRA_M3U_URLS || '').split(',').filter(url => url.trim());

// Generate URLs first
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
const DLHD_URL = `${CUSTOM_DOMAIN}/dlhd.m3u`;
const PROXY_DOMAIN = new URL(CUSTOM_DOMAIN).hostname;

// Log environment variables
console.log('Environment variables:');
console.log(`CUSTOM_DOMAIN: ${process.env.CUSTOM_DOMAIN}`);
console.log(`VPS_HOST: ${process.env.VPS_HOST}`);
console.log(`SECURITY_TOKEN: ${process.env.SECURITY_TOKEN}`);
console.log(`INCLUDE_MYTVSUPER: ${process.env.INCLUDE_MYTVSUPER}`);
console.log(`CHINAM3U: ${process.env.CHINAM3U}`);
console.log(`DEBUG: ${process.env.DEBUG}`);

if (INCLUDE_MYTVSUPER) {
  console.log(`MYTVSUPER configuration: ${INCLUDE_MYTVSUPER}`);
  console.log(`MYTVSUPER URL: ${MYTVSUPER_URL}`);
}

if (EXTRA_M3U_URLS.length > 0) {
  console.log('\nExtra VPS M3U URLs (Direct, No Proxy):');
  EXTRA_M3U_URLS.forEach((url, index) => {
    console.log(`VPS ${index + 1}: ${url}`);
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
  '[^/]+\\.v2h-cdn\\.com(:\\d+)?'
];

if (CUSTOM_M3U_PROXY && CUSTOM_M3U_PROXY_HOST) {
  PROXY_DOMAINS.push(CUSTOM_M3U_PROXY_HOST);
}

// 添加额外的VPS源
const extraSources = EXTRA_M3U_URLS.map((url, index) => ({
  name: `VPS Source ${index + 1}`,
  url: url.trim(),
  noProxy: true  // 标记这是VPS源,不需要代理
}));

// Define source addresses
const SRC = [
  ...extraSources,
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

// Log configured sources
logDebug('Configured sources:');
SRC.forEach(src => {
  logDebug(`- ${src.name}: ${src.url}`);
});

function identity(it) { return it; }

function addProxyHeader(originalUrl, encodeUrl = false) {
    if (!originalUrl) return originalUrl;
    
    // 如果已经包含代理头，直接返回
    if (originalUrl.includes(`${VPS_HOST}/${SECURITY_TOKEN}/proxy/`)) {
        return originalUrl;
    }
    
    // 检查是否匹配代理域名
    for (const dom of PROXY_DOMAINS) {
        const regex = new RegExp(`https?://${dom}[^\\s"']*`, 'g');
        if (regex.test(originalUrl)) {
            return `${VPS_HOST}/${SECURITY_TOKEN}/proxy/${encodeUrl ? encodeURIComponent(originalUrl) : originalUrl}`;
        }
    }
    
    return originalUrl;
}

function proxify(it) {
    for (const dom of PROXY_DOMAINS) {
        const regex = new RegExp(`https?://${dom}[^\\s"']*`, 'g');
        it = it.replace(regex, (match) => addProxyHeader(match));
    }
    return it;
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
    response: src.local ? null : fetch(src.url)
  }));

  logInfo(`Starting to fetch and process ${REQ.length} sources`);

  for (const src of REQ) {
    try {
      logDebug(`Processing source: ${src.name}`);
      let respText;
      if (src.local) {
        logDebug(`Reading local file: ${src.url}`);
        respText = await fs.readFile(src.url, 'utf8');
      } else {
        const resp = await src.response;
        respText = await resp.text();
        logDebug(`Fetched content length: ${respText.length}`);
      }

      let channels = respText.split(/^#EXT/gm).map(it => '#EXT' + it).filter(it => it.startsWith('#EXTINF'));
      logDebug(`Found ${channels.length} channels in ${src.name}`);

      if (src.filter) {
        const beforeLen = channels.length;
        channels = channels.filter(src.filter);
        const afterLen = channels.length;
        logDebug(`Filtered ${src.name}: ${beforeLen} -> ${afterLen} channels`);
      }

      // 只对非VPS源应用代理修改
      if (src.mod && !src.noProxy) {
        const noproxy = req.url.indexOf('noproxy') > -1;
        logDebug(`Applying ${noproxy ? 'direct' : 'proxy'} modifications to ${src.name}`);
        channels = channels.map(src.mod(noproxy));
      }

      for (const chan of channels) {
        text += chan;
      }
      logInfo(`Successfully processed ${src.name} with ${channels.length} channels`);
    } catch (error) {
      logError(`Error processing ${src.name}: ${error.message}`);
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

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      redirect: 'manual'  // 手动处理重定向
    });

    // 处理重定向
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
        // DRM 请求直接转发，无需代理
        const drmResponse = await fetch(targetUrl, {
            method: req.method,
            headers: headers
        });
        res.writeHead(drmResponse.status, Object.fromEntries(drmResponse.headers));
        drmResponse.body.pipe(res);
    }
    else if (contentType && contentType.includes('application/vnd.apple.mpegurl')) {
        const m3u8Lines = (await response.text()).split('\n');
        const modifiedLines = [];

        for (const line of m3u8Lines) {
            if (line.startsWith('#EXT-X-KEY')) {
            // 处理 KEY 行，将相对路径的 URI 转换为完整 URL
            let modifiedLine = line.replace(
                /URI="([^"]+)"/,
                (match, uri) => {
                    if (uri.startsWith('/')) {
                        // 相对路径转换为完整 URL
                        const fullUrl = `https://xxx.xx.xxx${uri}`;
                        return `URI="${fullUrl}"`;
                    }
                    return `URI="${uri}"`;
                }
            );
            modifiedLines.push(modifiedLine);
        } else if (line.trim().startsWith('http')) {
            const proxiedUrl = addProxyHeader(line.trim());
            modifiedLines.push(proxiedUrl);
        } else if (!line.startsWith('#') && line.trim().endsWith('.ts')) {
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

const PORT = process.env.PORT || 4994;
server.listen(PORT, () => {
  console.log(`StreamShield Proxy is listening on port ${PORT}`);
});
