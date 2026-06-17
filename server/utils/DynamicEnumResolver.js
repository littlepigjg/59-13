const http = require('http');
const https = require('https');
const url = require('url');

class DynamicEnumResolver {
  constructor(options = {}) {
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 5 * 60 * 1000;
    this.timeout = options.timeout || 10000;
    this.maxRetries = options.maxRetries || 2;
  }

  async resolve(rule, context = {}) {
    if (!rule || !rule.dynamic) {
      const options = rule ? (rule.options || []) : [];
      return options.map(item => {
        if (typeof item === 'object' && item !== null) {
          return {
            value: item.value !== undefined ? item.value : item,
            label: item.label !== undefined ? item.label : String(item.value !== undefined ? item.value : item)
          };
        }
        return { value: item, label: String(item) };
      });
    }

    const cacheKey = this.getCacheKey(rule, context);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    let options = [];
    let success = false;
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries && !success; attempt++) {
      try {
        if (rule.dynamic.type === 'api') {
          options = await this.resolveFromApi(rule.dynamic, context);
        } else if (rule.dynamic.type === 'dependent') {
          options = this.resolveDependent(rule.dynamic, context);
        } else {
          throw new Error(`不支持的动态枚举类型: ${rule.dynamic.type}`);
        }

        if (!Array.isArray(options)) {
          throw new Error('动态枚举解析结果必须是数组');
        }

        success = true;
      } catch (error) {
        lastError = error;
        if (attempt < this.maxRetries) {
          await this.delay(500 * (attempt + 1));
        }
      }
    }

    if (!success) {
      console.warn(`动态枚举解析失败，使用降级选项: ${lastError ? lastError.message : '未知错误'}`);
      const fallbackOptions = rule.fallbackOptions || rule.options || [];
      options = fallbackOptions.map(item => {
        if (typeof item === 'object' && item !== null) {
          return {
            value: item.value !== undefined ? item.value : item,
            label: item.label !== undefined ? item.label : String(item.value !== undefined ? item.value : item)
          };
        }
        return { value: item, label: String(item) };
      });
    }

    if (rule.dynamic.cache !== false && success) {
      this.cache.set(cacheKey, {
        data: options,
        timestamp: Date.now()
      });
    }

    return options;
  }

  async resolveFromApi(config, context) {
    const { url: apiUrl, method = 'GET', headers = {}, body = null, path = null, valueField = null, labelField = null } = config;

    if (!apiUrl) {
      throw new Error('动态枚举 API 地址不能为空');
    }

    const processedUrl = this.processTemplate(apiUrl, context);
    const parsedUrl = url.parse(processedUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const processedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      processedHeaders[key] = this.processTemplate(value, context);
    }

    let processedBody = body;
    if (body && typeof body === 'string') {
      processedBody = this.processTemplate(body, context);
    }

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.path,
      method: method.toUpperCase(),
      headers: {
        'Content-Type': 'application/json',
        ...processedHeaders
      },
      timeout: this.timeout
    };

    return new Promise((resolve, reject) => {
      const req = httpModule.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            let result = JSON.parse(data);
            if (path) {
              result = this.getNestedValue(result, path);
            }
            if (!Array.isArray(result)) {
              throw new Error('API 返回数据格式不正确，期望数组');
            }
            const formatted = result.map(item => {
              if (typeof item === 'object' && item !== null) {
                const value = valueField ? item[valueField] : (item.value !== undefined ? item.value : item);
                const label = labelField ? item[labelField] : (item.label !== undefined ? item.label : value);
                return { value, label };
              }
              return { value: item, label: String(item) };
            });
            resolve(formatted);
          } catch (error) {
            reject(new Error(`解析 API 响应失败: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`API 请求失败: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('API 请求超时'));
      });

      if (processedBody && method.toUpperCase() !== 'GET') {
        req.write(typeof processedBody === 'object' ? JSON.stringify(processedBody) : processedBody);
      }

      req.end();
    });
  }

  resolveDependent(config, context) {
    const { dependsOn, optionsMap, defaultOptions = [] } = config;

    if (!dependsOn) {
      throw new Error('依赖枚举必须指定 dependsOn 字段');
    }

    if (!optionsMap) {
      throw new Error('依赖枚举必须指定 optionsMap 配置');
    }

    const dependentValue = context[dependsOn];
    if (dependentValue === undefined || dependentValue === null) {
      return defaultOptions;
    }

    const key = String(dependentValue);
    const options = optionsMap[key];

    if (!options) {
      return defaultOptions;
    }

    return options.map(item => {
      if (typeof item === 'object' && item !== null) {
        return {
          value: item.value !== undefined ? item.value : item,
          label: item.label !== undefined ? item.label : String(item.value !== undefined ? item.value : item)
        };
      }
      return { value: item, label: String(item) };
    });
  }

  getCacheKey(rule, context) {
    if (!rule.dynamic) {
      return JSON.stringify(rule.options || []);
    }

    if (rule.dynamic.type === 'api') {
      return `api:${rule.dynamic.url}:${this.processTemplate(rule.dynamic.url, context)}`;
    } else if (rule.dynamic.type === 'dependent') {
      return `dependent:${rule.dynamic.dependsOn}:${context[rule.dynamic.dependsOn]}`;
    }

    return JSON.stringify(rule);
  }

  processTemplate(template, context) {
    if (typeof template !== 'string') {
      return template;
    }
    return template.replace(/\$\{(\w+)\}/g, (match, key) => {
      return context[key] !== undefined ? String(context[key]) : match;
    });
  }

  getNestedValue(obj, path) {
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
      if (result === null || result === undefined) {
        return undefined;
      }
      result = result[key];
    }
    return result;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheSize() {
    return this.cache.size;
  }
}

module.exports = DynamicEnumResolver;
