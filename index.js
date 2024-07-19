const http = require('http');
const url = require('url');
const fetch = require('node-fetch');
const { Headers, Request } = require('node-fetch');  // 修正解构语法

// 解析环境变量
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || 'default-domain.com';
const SECURITY_TOKEN = process.env.SECURITY_TOKEN || 'test123';
const VPS_HOST = process.env.VPS_HOST;
const INCLUDE_MYTVSUPER = process.env.INCLUDE_MYTVSUPER === 'true';
const DEBUG = process.env.DEBUG === 'true';  // 新增调试模式开关

if (!VPS_HOST) {
  console.error('Error: VPS_HOST environment variable is not set.');
  process.exit(1);
}

// 日志函数
function logDebug(message) {
  if (DEBUG) {
    console.log(message);
  }
}

function logInfo(message) {
  console.log(message);
}

// 生成URL
const FOUR_SEASONS_URL = `${CUSTOM_DOMAIN}/4gtv.m3u`;
const BEESPORT_URL = `${CUSTOM_DOMAIN}/beesport.m3u`;
const YSP_URL = `${CUSTOM_DOMAIN}/ysp.m3u`;
const SXG_URL = `${CUSTOM_DOMAIN}/sxg.m3u`;
const ITV_PROXY_URL = `${CUSTOM_DOMAIN}/itv_proxy.m3u`;
const TPTV_PROXY_URL = `${CUSTOM_DOMAIN}/tptv_proxy.m3u`;
const MYTVSUPER_URL = `${CUSTOM_DOMAIN}/mytvsuper-tivimate.m3u`;
const PROXY_DOMAIN = new URL(CUSTOM_DOMAIN).hostname;

// 定义源地址，考虑环境变量 INCLUDE_MYTVSUPER
const SRC = [
  {
    name: '四季',
    url: FOUR_SEASONS_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  INCLUDE_MYTVSUPER && {
    name: 'MytvSuper 直播源',
    url: MYTVSUPER_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  {
    name: 'Beesport 直播源',
    url: BEESPORT_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  {
    name: '央视频',
    url: YSP_URL
  },
  {
    name: '蜀小果',
    url: SXG_URL
  },
  {
    name: '中国移动 iTV 平台',
    url: ITV_PROXY_URL
  },
  {
    name: '江苏移动魔百盒 TPTV',
    url: TPTV_PROXY_URL
  }
].filter(Boolean);

// 定义代理域名
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
  '[^/]+\\.beesport\\.livednow\\.com(:\\d+)?'
];

function identity(it) { return it; }

function proxify(it) {
  for (const dom of PROXY_DOMAINS) {
    it = it.replace(new RegExp('https?://' + dom, 'g'), `${VPS_HOST}/${SECURITY_TOKEN}/proxy/$&`);
  }
  return it;
}

const server = http.createServer(async (req, res) => {
  logDebug(`Received request for: ${req.url}`);

  // 处理 OPTIONS 请求
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
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
    }
  } else {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
  }
});

async function handleList(req, res) {
  let text = `#EXTM3U\n#EXTM3U x-tvg-url="https://assets.livednow.com/epg.xml"\n\n`;
  const REQ = SRC.map(src => ({
    ...src,
    response: fetch(src.url)
  }));

  for (const src of REQ) {
    const resp = await src.response;
    const respText = await resp.text();
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
  }

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

    // 转发原始请求头
    const headers = new Headers(req.headers);
    headers.delete('host');  // 删除 host 头，让 fetch 自动设置

    const proxyReq = new Request(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
      redirect: 'manual'
    });

    const resp = await fetch(proxyReq);

    // 处理重定向
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get('location');
      if (!location) {
        throw new Error('Redirect response without Location header.');
      }

      const newHeaders = new Headers(resp.headers);
      newHeaders.set('location', proxify(location));

      res.writeHead(resp.status, Object.fromEntries(newHeaders));
      res.end();
      return;
    }

    // 获取内容类型
    const contentType = resp.headers.get('content-type');
    
    // 如果是特定类型，修改其中的 URL
    if (contentType === 'application/dash+xml' || contentType === 'application/x-mpegURL' || contentType === 'application/vnd.apple.mpegurl') {
      let respText = await resp.text();
      logDebug(`Original content: \n${respText}\n`);
      respText = proxify(respText);
      logDebug(`Proxied content: \n${respText}\n`);
      res.writeHead(resp.status, Object.fromEntries(resp.headers));
      res.end(respText);
    } else {
      // 对于其他内容（包括媒体段），直接转发
      res.writeHead(resp.status, Object.fromEntries(resp.headers));
      resp.body.pipe(res);
    }
    
    logInfo(`Request for ${targetUrl.href} succeeded with status ${resp.status}`);
  } catch (error) {
    console.error('Error in handleProxy:', error.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

const PORT = process.env.PORT || 4994;
server.listen(PORT, () => {
  console.log(`StreamShield Proxy is listening on port ${PORT}`);
});
