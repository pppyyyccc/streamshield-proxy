const http = require('http');
const https = require('https');
const url = require('url');
const fetch = require('node-fetch');
const { Headers } = require('node-fetch');
const LRU = require('lru-cache');
const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const { Readable } = require('stream');

// 添加全局配置对象
const globalConfig = {
  proxyHandler: null,
  tvgManager: null
};

// 添加编码处理
const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

// 定义基础配置目录常量
const BASE_CONFIG_DIR = '/app/config';

// 环境变量
const PORT = process.env.PORT || 4994;
const CUSTOM_DOMAIN = process.env.CUSTOM_DOMAIN || 'default-domain.com';
const SECURITY_TOKEN = process.env.SECURITY_TOKEN || 'test123';
const VPS_HOST = process.env.VPS_HOST;
const DEBUG = process.env.DEBUG === 'true';
const CACHE_UPDATE_INTERVAL = parseInt(process.env.CACHE_UPDATE_INTERVAL) || 600000;
const USE_DEFAULT_SOURCES = process.env.USE_DEFAULT_SOURCES !== 'false';
const EPG_URL = process.env.EPG_URL || 'https://assets.livednow.com/epg.xml';

// TVG URL管理类优化
class TvgUrlManager {
  constructor() {
    this.urls = new Set();
  }

  addUrl(url) {
    if (url && typeof url === 'string') {
      url.split(',').forEach(u => this.urls.add(u.trim()));
    }
  }

  getUrlString() {
    return Array.from(this.urls).join(',');
  }

  clear() {
    this.urls.clear();
  }
}

// 代理处理类优化
class ProxyHandler {
  constructor(proxyHosts, vpsHost, securityToken) {
    this.proxyHosts = proxyHosts;
    this.vpsHost = vpsHost;
    this.securityToken = securityToken;
  }

  shouldProxy(url) {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      const fullHost = parsedUrl.host;
      const shouldProxy = this.proxyHosts.some(host =>
        hostname.includes(host) || fullHost.includes(host)
      );

      log(`检查URL是否需要代理: ${url}, 结果: ${shouldProxy}`);
      return shouldProxy;
    } catch (error) {
      logError(`检查代理时出错: ${error.message}`);
      return false;
    }
  }

  addProxyHeader(url, encodeUrl = false) {
    if (!url || !this.vpsHost || !this.securityToken) return url;
    if (url.includes(`${this.vpsHost}/${this.securityToken}/proxy/`)) return url;
    const proxyUrl = `${this.vpsHost}/${this.securityToken}/proxy/${encodeUrl ? encodeURIComponent(url) : url}`;
    log(`添加代理头: ${url} -> ${proxyUrl}`);
    return proxyUrl;
  }
}

// 内容验证器优化
class ContentValidator {
  static validateM3UContent(content) {
    if (!content || typeof content !== 'string') {
      throw new Error('无效的 M3U 内容');
    }
    const validatedContent = decoder.decode(encoder.encode(content.trim()));
    if (!validatedContent) {
      throw new Error('内容验证后为空');
    }
    return validatedContent;
  }

  static validateLine(line) {
    if (!line || typeof line !== 'string') {
      return '';
    }
    return decoder.decode(encoder.encode(line.trim()));
  }

  static validateUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// 日志函数优化
function log(...args) {
  if (DEBUG) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
}

function logInfo(...args) {
  console.log('[INFO]', new Date().toISOString(), ...args);
}

function logError(...args) {
  console.error('[ERROR]', new Date().toISOString(), ...args);
}

// 配置加载优化
async function loadConfig() {
  log('开始加载配置');
  const config = {
    PORT,
    CUSTOM_DOMAIN,
    SECURITY_TOKEN,
    VPS_HOST,
    DEBUG,
    CACHE_UPDATE_INTERVAL,
    USE_DEFAULT_SOURCES,
    EPG_URL,
  };

  // 加载代理 hosts
  config.PROXY_HOSTS = await loadProxyHosts();

  // 初始化全局代理处理器
  globalConfig.proxyHandler = new ProxyHandler(config.PROXY_HOSTS, config.VPS_HOST, config.SECURITY_TOKEN);

  // 初始化全局 TVG 管理器
  globalConfig.tvgManager = new TvgUrlManager();
  globalConfig.tvgManager.addUrl(config.EPG_URL);

  // 加载M3U源
  await loadM3USources(config);

  return config;
}

async function loadProxyHosts() {
  const defaultHosts = await readFileContent(path.join(BASE_CONFIG_DIR, 'proxy_hosts/default.txt'));
  try {
    const userHosts = await readFileContent(path.join(BASE_CONFIG_DIR, 'proxy_hosts/user_defined.txt'));
    return [...new Set([...defaultHosts, ...userHosts])]; // 去重
  } catch (error) {
    handleConfigError(error, 'proxy hosts');
    return defaultHosts;
  }
}

async function loadM3USources(config) {
  config.REMOTE_M3U_NO_PROXY = [];
  if (config.USE_DEFAULT_SOURCES) {
    config.REMOTE_M3U_NO_PROXY = await loadRemoteSources(path.join(BASE_CONFIG_DIR, 'remote_m3u/no_proxy/default_sources.txt'));
  }

  try {
    const userSources = await loadRemoteSources(path.join(BASE_CONFIG_DIR, 'remote_m3u/no_proxy/sources.txt'));
    config.REMOTE_M3U_NO_PROXY = config.REMOTE_M3U_NO_PROXY.concat(userSources);
  } catch (error) {
    handleConfigError(error, 'no-proxy sources');
  }

  try {
    config.REMOTE_M3U_PROXY = await loadRemoteSources(path.join(BASE_CONFIG_DIR, 'remote_m3u/proxy_needed/sources.txt'));
  } catch (error) {
    handleConfigError(error, 'proxy-needed sources');config.REMOTE_M3U_PROXY = [];
  }

  config.LOCAL_M3U_PROXY = await listFilesInDirectory(path.join(BASE_CONFIG_DIR, 'local_m3u/proxy_needed'));
  config.LOCAL_M3U_NO_PROXY = await listFilesInDirectory(path.join(BASE_CONFIG_DIR, 'local_m3u/no_proxy'));
}
function handleConfigError(error, sourceType) {
  if (error.code === 'ENOENT') {
    logInfo(`未找到${sourceType}文件`);} else {
    logError(`读取${sourceType}时出错: ${error.message}`);
  }
}

// 远程源加载优化
async function loadRemoteSources(filePath) {
  log(`从以下位置加载远程源: ${filePath}`);
  try {
    const content = await readFileContent(filePath);
    return content
      .map(line => parseLine(line))
      .filter(item => item !== null);
  } catch (error) {
    logError(`加载远程源时出错: ${error.message}`);
    return [];
  }
}

function parseLine(line) {
  try {
    if (line.includes(',http')) {
      return parseDirectChannel(line);
    }
    return parseSourceUrl(line);
  } catch (error) {
    logError(`解析行时出错: ${line},错误: ${error.message}`);
    return null;
  }
}

function parseDirectChannel(line) {
  const [name, url] = line.split(',');
  if (!ContentValidator.validateUrl(url.trim())) {
    throw new Error('无效的URL');
  }
  return {
    url: url.trim(),
    name: name.trim(),isDirectChannel: true
  };
}

function parseSourceUrl(line) {
  const urlObj = new URL(line);
  validateUrl(urlObj);
  return {
    url: urlObj.toString(),
    groupTitle: urlObj.searchParams.get('group-title'),
    removeTvLogo: urlObj.searchParams.get('remove-tv-logo') === 'true',
    originalUrl: line
  };
}

function validateUrl(urlObj) {
  if (urlObj.hostname === '127.0.0.1' || urlObj.hostname === 'localhost') {
    log(`警告: 检测到本地URL: ${urlObj.toString()}`);
  }
}

// 文件处理优化
async function readFileContent(filePath) {
  log(`读取文件内容: ${filePath}`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .replace(/\r\n/g, '\n')
      .split('\n')
      .filter(line => line.trim())
      .map(line => ContentValidator.validateLine(line));
  } catch (error) {
    logError(`读取文件出错 ${filePath}: ${error.message}`);
    return [];
  }
}

async function writeFileContent(filePath, content) {
  log(`写入文件内容: ${filePath}`);
  try {
    const validatedContent = ContentValidator.validateM3UContent(content);
    await fs.writeFile(filePath, validatedContent, 'utf8');
  } catch (error) {
    logError(`写入文件出错 ${filePath}: ${error.message}`);throw error;
  }
}
// 文件处理相关函数需要放在配置加载之前
async function listFilesInDirectory(dirPath) {
  log(`列出目录中的文件: ${dirPath}`);
  try {
    const files = await fs.readdir(dirPath);
    return files.map(file => path.join(dirPath, file));
  } catch (error) {
    if (error.code === 'ENOENT') {
      logInfo(`目录不存在: ${dirPath}`);return [];
    }
    logError(`列出目录文件时出错 ${dirPath}: ${error.message}`);
    return [];
  }
}

// 文件读取函数
async function readFileContent(filePath) {
  log(`读取文件内容: ${filePath}`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.replace(/\r\n/g, '\n')
      .split('\n')
      .filter(line => line.trim())
      .map(line => ContentValidator.validateLine(line));
  } catch (error) {
    if (error.code === 'ENOENT') {
      logInfo(`文件不存在: ${filePath}`);
      return [];
    }
    logError(`读取文件出错 ${filePath}: ${error.message}`);
    return [];
  }
}

// 文件写入函数
async function writeFileContent(filePath, content) {
  log(`写入文件内容: ${filePath}`);
  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const validatedContent = ContentValidator.validateM3UContent(content);
    await fs.writeFile(filePath, validatedContent, 'utf8');} catch (error) {
    logError(`写入文件出错 ${filePath}: ${error.message}`);throw error;
  }
}

// 内容解析和组织函数
function parseAndGroupContent(content) {
  const lines = content.split('\n');
  let result = new Map();
  let currentGroup = '';
  let currentInfo = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 跳过EXTM3U头
    if (line.startsWith('#EXTM3U')) continue;

    // 处理分组标记
    if (line.includes('#genre#')) {
      currentGroup = line.split(',')[0].trim();
      if (!result.has(currentGroup)) {
        result.set(currentGroup, new Set());
      }
      continue;
    }

    // 处理EXTINF行
    if (line.startsWith('#EXTINF:')) {
      currentInfo = line;
      // 从EXTINF行提取分组信息
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) {
        currentGroup = groupMatch[1];
        if (!result.has(currentGroup)) {
          result.set(currentGroup, new Set());
        }
      }
    } else if (line.startsWith('http') && currentInfo) {
      // 添加频道信息和URL到分组
      const channelInfo = `${currentInfo}\n${line}`;
      if (!result.has(currentGroup)) {
        result.set(currentGroup, new Set());
      }
      result.get(currentGroup).add(channelInfo);
      currentInfo = '';
    }
  }

  return result;
}

// 生成最终内容函数
function generateFinalContent(groupedContent, tvgUrl) {
  let content = [`#EXTM3U x-tvg-url="${tvgUrl}"`];

  // 按分组组织内容
  for (const [group, channels] of groupedContent) {
    // 添加分组标记
    if (group) {
      content.push(`\n#EXTINF:-1 group-title="${group}",=== ${group} ===`);
    }

    // 添加该分组的所有频道
    channels.forEach(channel => {
      content.push(channel);
    });
  }

  return content.join('\n');
}

// 文件处理相关函数需要放在配置加载之前
async function listFilesInDirectory(dirPath) {
  log(`列出目录中的文件: ${dirPath}`);
  try {
    const files = await fs.readdir(dirPath);
    return files.map(file => path.join(dirPath, file));
  } catch (error) {
    if (error.code === 'ENOENT') {
      logInfo(`目录不存在: ${dirPath}`);return [];
    }
    logError(`列出目录文件时出错 ${dirPath}: ${error.message}`);
    return [];
  }
}

// 文件读取函数
async function readFileContent(filePath) {
  log(`读取文件内容: ${filePath}`);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.replace(/\r\n/g, '\n')
      .split('\n')
      .filter(line => line.trim())
      .map(line => ContentValidator.validateLine(line));
  } catch (error) {
    if (error.code === 'ENOENT') {
      logInfo(`文件不存在: ${filePath}`);
      return [];
    }
    logError(`读取文件出错 ${filePath}: ${error.message}`);
    return [];
  }
}

// 文件写入函数
async function writeFileContent(filePath, content) {
  log(`写入文件内容: ${filePath}`);
  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const validatedContent = ContentValidator.validateM3UContent(content);
    await fs.writeFile(filePath, validatedContent, 'utf8');} catch (error) {
    logError(`写入文件出错 ${filePath}: ${error.message}`);throw error;
  }
}


// M3U 处理核心功能优化
async function parseAndModifyM3U(content, sourceUrl, options = {}, proxyHosts) {
  log(`开始解析和修改M3U内容: ${sourceUrl}`);
  try {
    if (!content || !content.trim()) {
      log('内容为空，返回原始内容');
      return content;
    }

    const lines = content.split('\n');
    let modifiedContent = [];
    let currentGenre = '';
    let channelNumber = 1000;
    let headerProcessed = false;

    // 处理每一行
    for (let i = 0; i < lines.length; i++) {
      const line = ContentValidator.validateLine(lines[i]);

      // 跳过空行
      if (!line) continue;

      // 处理EXTM3U头
      if (line.startsWith('#EXTM3U')) {
        if (!headerProcessed) {
          const tvgMatch = line.match(/x-tvg-url="([^"]+)"/);
          if (tvgMatch) {
            globalConfig.tvgManager.addUrl(tvgMatch[1]);
          }
          headerProcessed = true;
        }
        continue;
      }

      // 处理分类标记
      if (line.includes('#genre#')) {
        currentGenre = line.split(',')[0].trim();
        log(`找到分类: ${currentGenre}`);
        continue;
      }

      // 处理EXTINF行
      if (line.startsWith('#EXTINF:')) {
        const modifiedLine = processExtInfLine(line, currentGenre, channelNumber++);
        modifiedContent.push(modifiedLine);

        // 处理下一行URL
        if (i + 1 < lines.length) {
          const nextLine = ContentValidator.validateLine(lines[++i]);
          if (ContentValidator.validateUrl(nextLine)) {
            modifiedContent.push(processUrl(nextLine));
          } else {
            i--; // URL无效，回退索引
          }
        }}// 处理URL行
      else if (ContentValidator.validateUrl(line)) {
        const prevLine = lines[i - 1]?.trim();
        if (!prevLine?.startsWith('#EXTINF:')) {
          // 为没有EXTINF的URL创建一个
          const channelName = prevLine || `Channel ${channelNumber}`;
          modifiedContent.push(
            `#EXTINF:-1 group-title="${currentGenre}" tvg-chno="${channelNumber++}",${channelName}`
          );
        }
        modifiedContent.push(processUrl(line));
      }}

    // 构建最终内容
    const finalContent = [
      `#EXTM3U x-tvg-url="${globalConfig.tvgManager.getUrlString()}"`,
      ...modifiedContent].join('\n');

    return finalContent.trim();
  } catch (error) {
    logError(`处理M3U内容时出错: ${error.message}`);
    return content; // 出错时返回原始内容
  }
}

// URL处理优化
function processUrl(url) {
  try {
    return globalConfig.proxyHandler.shouldProxy(url) ?
      globalConfig.proxyHandler.addProxyHeader(url) : url;
  } catch (error) {
    logError(`处理URL时出错: ${error.message}`);
    return url;
  }
}

// EXTINF行处理优化
function processExtInfLine(line, genre, channelNumber) {
  let modifiedLine = line;

  // 更新或添加group-title
  if (genre) {
    modifiedLine = modifiedLine.includes('group-title=') ?
      modifiedLine.replace(/group-title="[^"]*"/, `group-title="${genre}"`) :
      modifiedLine.replace('#EXTINF:', `#EXTINF:-1 group-title="${genre}"`);
  }

  // 更新或添加tvg-chno
  if (!modifiedLine.includes('tvg-chno=')) {
    modifiedLine = modifiedLine.replace('#EXTINF:', `#EXTINF:-1 tvg-chno="${channelNumber}"`);
  }

  return modifiedLine;
}
// 源处理优化
const processSource = async (source) => {
  log(`开始处理源: ${typeof source === 'string' ? source : JSON.stringify(source)}`);
  try {
    let sourceContent;
    let sourceUrl;
    let options = {};

    // 处理直接频道
    if (source.isDirectChannel) {
      return `#EXTINF:-1 tvg-name="${source.name}",${source.name}\n${source.url}\n`;
    }

    // 获取源内容
    sourceContent = await getSourceContent(source);
    if (!sourceContent) {
      throw new Error('获取源内容失败');
    }

    // 如果是特殊格式(#genre#),进行相应处理
    if (sourceContent.includes('#genre#')) {
      const lines = sourceContent.split('\n');
      let result = [];
      let currentGenre = '';

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.includes('#genre#')) {
          currentGenre = line.split(',')[0].trim();
          continue;
        }

        if (line.includes(',http')) {
          const [name, url] = line.split(',').map(item => item.trim());
          result.push(`#EXTINF:-1 group-title="${currentGenre}",${name}`);
          result.push(processUrl(url));// 使用现有的processUrl处理URL
        }
      }

      return result.length ? `#EXTM3U\n${result.join('\n')}` : '';
    }

    // 标准M3U格式,使用现有的parseAndModifyM3U处理
    return await parseAndModifyM3U(
      sourceContent,
      sourceUrl,
      options,
      config.PROXY_HOSTS
    );

  } catch (error) {
    logError(`处理源时出错: ${error.message}`);
    logError(`错误堆栈: ${error.stack}`);
    return '';
  }
};

// 源内容获取优化
async function getSourceContent(source) {
  if (typeof source === 'string') {
    // 本地文件
    const content = await fs.readFile(source, 'utf8');
    log(`读取本地文件: ${source}, 内容长度: ${content.length}`);
    return content;
  } else if (typeof source === 'object' && source.url) {
    // 远程源
    const response = await fetchWithTimeout(source.url, {},30000);
    if (!response.ok) {
      throw new Error(`HTTP错误! 状态: ${response.status}`);
    }
    const content = await response.text();
    log(`获取远程内容完成: ${source.url}, 内容长度: ${content.length}`);
    return content;
  }
  return null;
}

// 网络请求处理优化
async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  log(`开始获取URL内容(带超时): ${url}`);
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false
  });

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      agent: url.startsWith('https') ? httpsAgent : null,
      redirect: 'follow'
    });
    clearTimeout(id);
    log(`URL内容获取完成: ${url}, 状态: ${response.status}`);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时: ${url}`);
    }
    throw error;
  }
}

// 请求处理器优化
class RequestHandler {
  constructor(config) {
    this.config = config;
  }

  async handleRequest(req, res) {
    const parsedUrl = url.parse(req.url, true);
    const pathParts = parsedUrl.pathname.split('/').filter(part => part);

    log(`收到请求: ${req.method} ${req.url}`);
    try {
      if (!this.validateToken(pathParts[0])) {
        throw new Error('无效的访问令牌');
      }

      switch(pathParts[1]) {
        case 'health':
          return this.handleHealthCheck(res);
        case 'proxy':
          return await this.handleProxy(req, res);
        case 'all.m3u':default:
          return await this.handleM3UList(req, res);
      }
    } catch (error) {
      this.handleError(error, res);
    }
  }

  validateToken(token) {
    return token === this.config.SECURITY_TOKEN;
  }

  handleHealthCheck(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'OK',
      timestamp: new Date().toISOString()
    }));
  }

  async handleM3UList(req, res) {
    try {
      let content = m3uCache.get('all');
      if (!content) {
        content = await generateAggregatedM3U(this.config);
        m3uCache.set('all', content);
      }
      res.writeHead(200, { 'Content-Type': 'application/x-mpegURL' });
      res.end(content);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async handleProxy(req, res) {
    try {
      const urlParts = req.url.split(`/${this.config.SECURITY_TOKEN}/proxy/`);
      if (urlParts.length < 2) {
        throw new Error('无效的代理请求');
      }

      const targetUrl = decodeURIComponent(urlParts[1]);
      const response = await fetchWithTimeout(targetUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined
      });

      res.writeHead(response.status, response.headers.raw());
      response.body.pipe(res);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  handleError(error, res) {
    logError(`请求处理错误: ${error.message}`);
    const status = error.message.includes('无效的访问令牌') ? 403 : 500;
    res.writeHead(status, { 'Content-Type': 'text/plain' });
    res.end(error.message);
  }
}

// 优化后的 generateAggregatedM3U 函数
async function generateAggregatedM3U(config) {
  logInfo('开始生成聚合M3U内容...');
  const tvgManager = new TvgUrlManager();
  tvgManager.addUrl(config.EPG_URL);
  const groupedContent = new Map();

  // 处理所有来源
  const sources = [
    ...config.LOCAL_M3U_PROXY,
    ...config.LOCAL_M3U_NO_PROXY,
    ...config.REMOTE_M3U_PROXY,
    ...config.REMOTE_M3U_NO_PROXY
  ];

  log(`开始处理 ${sources.length} 个源`);
  for (const source of sources) {
    try {
      log(`处理源: ${typeof source === 'string' ? source : JSON.stringify(source)}`);
      const content = await processSource(source);
      if (content && content.trim()) {
        // 提取 TVG URLs
        const tvgMatch = content.match(/x-tvg-url="([^"]+)"/);
        if (tvgMatch) {
          tvgManager.addUrl(tvgMatch[1]);
        }

        // 解析并按分组存储内容
        const parsedContent = parseAndGroupContent(content);
        for (const [group, channels] of parsedContent) {
          if (!groupedContent.has(group)) {
            groupedContent.set(group, new Set());
          }
          channels.forEach(channel => {
            groupedContent.get(group).add(channel);
          });
        }

        log(`成功添加源内容到分组`);
      } else {
        log(`源${JSON.stringify(source)} 返回空内容`);
      }
    } catch (error) {
      logError(`处理源时出错${JSON.stringify(source)}: ${error.message}`);
    }
  }

  // 生成最终内容
  const finalContent = generateFinalContent(groupedContent, tvgManager.getUrlString());

  // 确保目录存在并写入文件
  try {
    const outputDir = path.join(BASE_CONFIG_DIR, 'generated');
    await fs.mkdir(outputDir, { recursive: true });
    await writeFileContent(
      path.join(outputDir,'all.m3u'),
      finalContent
    );
    log(`内容已写入文件,总长度: ${finalContent.length}`);
  } catch (error) {
    logError(`写入聚合内容时出错: ${error.message}`);
  }

  return finalContent;
}


// 缓存优化
const m3uCache = new LRU({
  max: 100,
  maxAge: 1000 * 60 * 5
});

// 主程序入口优化
async function main() {
  logInfo('启动 StreamShield Proxy...');
  try {
    // 加载配置
    config = await loadConfig();

    // 初始化缓存
    const initialContent = await generateAggregatedM3U(config);
    m3uCache.set('all', initialContent);

    // 创建请求处理器
    const requestHandler = new RequestHandler(config);

    // 启动服务器
    const server = http.createServer((req, res) => requestHandler.handleRequest(req, res));
    server.listen(config.PORT, () => {
      logInfo(`StreamShield Proxy v2.0.0 运行在端口 ${config.PORT}`);
    });

    // 设置定期更新
    setInterval(async () => {
      try {
        const updatedContent = await generateAggregatedM3U(config);
        m3uCache.set('all', updatedContent);
        logInfo(`定期更新完成, 新内容长度: ${updatedContent.length}`);
      } catch (error) {
        logError(`定期更新错误: ${error.message}`);
      }
    }, config.CACHE_UPDATE_INTERVAL);} catch (error) {
    logError(`初始化错误: ${error.message}`);process.exit(1);
  }
}

// 启动应用
main().catch(error => {
  logError(`启动错误: ${error.message}`);
  process.exit(1);
});/
