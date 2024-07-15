const http = require('http');
const url = require('url');
const fetch = require('node-fetch');
const { Headers, Request } = require('node-fetch'); // 修正解构语法

// 解析环境变量
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || 'default-domain.com';
const SECURITY_TOKEN = process.env.SECURITY_TOKEN || '';
const parsedUrl = url.parse(CUSTOM_DOMAIN);
const protocol = parsedUrl.protocol || (CUSTOM_DOMAIN.startsWith('https') ? 'https:' : 'http:');
const host = parsedUrl.hostname || CUSTOM_DOMAIN.split('/')[2].split(':')[0];
const port = parsedUrl.port || (protocol === 'https:' ? '443' : '80');

// 生成URL
const FOUR_SEASONS_URL = `${protocol}//${host}${port ? `:${port}` : ''}/4gtv.m3u`;
const BEESPORT_URL = `${protocol}//${host}${port ? `:${port}` : ''}/beesport.m3u`;
const YSP_URL = `${protocol}//${host}${port ? `:${port}` : ''}/ysp.m3u`;
const SXG_URL = `${protocol}//${host}${port ? `:${port}` : ''}/sxg.m3u`;
const ITV_PROXY_URL = `${protocol}//${host}${port ? `:${port}` : ''}/itv_proxy.m3u`;
const TPTV_PROXY_URL = `${protocol}//${host}${port ? `:${port}` : ''}/tptv_proxy.m3u`;
const MYTVSUPER_URL = `${protocol}//${host}${port ? `:${port}` : ''}/mytvsuper-tivimate.m3u`;
const PROXY_DOMAIN = host;

// 定义源地址
const SRC = [
  {
    name: '四季',
    url: FOUR_SEASONS_URL,
    mod: (noproxy) => noproxy ? identity : proxify
  },
  {
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
];

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
    it = it.replace(new RegExp('https?://' + dom, 'g'), `${process.env.VPS_HOST}/${SECURITY_TOKEN}/proxy/$&`);
  }
  return it;
}

const server = http.createServer(async (req, res) => {
  console.log(`Received request for: ${req.url}`);
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
    let channels = respText.split(/^\#EXT/gm).map(it => '#EXT' + it).filter(it => it.startsWith('#EXTINF'));

    if (src.filter) {
      const beforeLen = channels.length;
      channels = channels.filter(src.filter);
      const afterLen = channels.length;
      console.log(`filter ${src.name} ${beforeLen} -> ${afterLen}`);
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
    const targetUrl = new URL(req.url.split(`/${SECURITY_TOKEN}/proxy/`)[1]);
    console.log('proxying', targetUrl);

    const resp = await fetch(targetUrl);
    const headers = new Headers(resp.headers);

    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      let location = resp.headers.get('location');
      const newUrl = new URL(location, targetUrl);
      headers.set('location', proxify(newUrl.href));

      res.writeHead(resp.status, Object.fromEntries(headers));
      res.end();
    } else if (resp.headers.get('content-type') === 'application/vnd.apple.mpegurl') {
      let respText = await resp.text();
      respText = proxify(respText);

      res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' });
      res.end(respText);
    } else {
      res.writeHead(resp.status, Object.fromEntries(headers));
      resp.body.pipe(res);
    }
  } catch (error) {
    console.error('Error in handleProxy:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

const PORT = process.env.PORT || 4994;
server.listen(PORT, () => {
  console.log(`StreamShield Proxy is listening on port ${PORT}`);
});
