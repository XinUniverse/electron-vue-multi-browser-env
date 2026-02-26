import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlatformApiError } from '../services/platform-adapters.js';

// 平台内容格式限制配置
const PLATFORM_LIMITS = {
  '抖音': {
    titleMaxLength: 55,
    bodyMaxLength: 2000,
    maxImages: 9,
    minImages: 1,
  },
  '小红书': {
    titleMaxLength: 20,
    bodyMaxLength: 1000,
    maxImages: 9,
    minImages: 1,
  },
  '头条': {
    titleMaxLength: 30,
    bodyMaxLength: 5000,
    maxImages: 20,
    minImages: 0,
  },
};

// 默认敏感词词库（可通过配置文件覆盖）
let sensitiveWordList = [
  '违禁词',
  '敏感内容',
  '政治',
  '暴力',
  '色情',
];

/**
 * 从配置文件加载敏感词词库
 * @param {string} configPath - 配置文件路径
 * @returns {string[]} 敏感词列表
 */
export function loadSensitiveWords(configPath) {
  try {
    const content = readFileSync(configPath, 'utf-8');
    const words = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // 过滤空行和注释
    
    if (words.length > 0) {
      sensitiveWordList = words;
    }
    
    return sensitiveWordList;
  } catch (error) {
    // 如果配置文件不存在或读取失败，使用默认词库
    console.warn(`无法加载敏感词配置文件 ${configPath}:`, error.message);
    return sensitiveWordList;
  }
}

/**
 * 检查内容是否包含敏感词
 * @param {string} content - 待检查的内容
 * @param {string[]} wordList - 敏感词列表（可选，默认使用全局词库）
 * @returns {{ hasSensitiveWords: boolean, foundWords: string[] }} 检查结果
 */
export function checkSensitiveWords(content, wordList = null) {
  if (!content || typeof content !== 'string') {
    return { hasSensitiveWords: false, foundWords: [] };
  }

  const wordsToCheck = wordList || sensitiveWordList;
  const foundWords = [];

  for (const word of wordsToCheck) {
    if (content.includes(word)) {
      foundWords.push(word);
    }
  }

  return {
    hasSensitiveWords: foundWords.length > 0,
    foundWords,
  };
}

/**
 * 验证内容格式是否符合平台要求
 * @param {Object} content - 内容对象
 * @param {string} content.title - 标题
 * @param {string} content.body - 正文
 * @param {string[]} content.images - 图片URL列表
 * @param {string} platform - 平台名称
 * @returns {{ isValid: boolean, errors: string[] }} 验证结果
 */
export function validateContentFormat(content, platform) {
  const errors = [];

  // 检查平台是否支持
  const limits = PLATFORM_LIMITS[platform];
  if (!limits) {
    errors.push(`不支持的平台: ${platform}`);
    return { isValid: false, errors };
  }

  // 检查内容对象
  if (!content || typeof content !== 'object') {
    errors.push('内容对象无效');
    return { isValid: false, errors };
  }

  // 检查标题
  if (content.title) {
    if (typeof content.title !== 'string') {
      errors.push('标题必须是字符串');
    } else if (content.title.length > limits.titleMaxLength) {
      errors.push(`标题长度超过限制（最大 ${limits.titleMaxLength} 字符，当前 ${content.title.length} 字符）`);
    }
  }

  // 检查正文
  if (content.body) {
    if (typeof content.body !== 'string') {
      errors.push('正文必须是字符串');
    } else if (content.body.length > limits.bodyMaxLength) {
      errors.push(`正文长度超过限制（最大 ${limits.bodyMaxLength} 字符，当前 ${content.body.length} 字符）`);
    }
  }

  // 检查图片数量
  if (content.images) {
    if (!Array.isArray(content.images)) {
      errors.push('图片列表必须是数组');
    } else {
      const imageCount = content.images.length;
      if (imageCount < limits.minImages) {
        errors.push(`图片数量不足（最少 ${limits.minImages} 张，当前 ${imageCount} 张）`);
      }
      if (imageCount > limits.maxImages) {
        errors.push(`图片数量超过限制（最多 ${limits.maxImages} 张，当前 ${imageCount} 张）`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 综合验证内容合规性（敏感词 + 格式）
 * @param {Object} content - 内容对象
 * @param {string} platform - 平台名称
 * @param {string[]} wordList - 敏感词列表（可选）
 * @throws {PlatformApiError} 如果内容不合规
 */
export function validateContentCompliance(content, platform, wordList = null) {
  // 检查敏感词
  const fullText = `${content.title || ''} ${content.body || ''}`;
  const sensitiveCheck = checkSensitiveWords(fullText, wordList);
  
  if (sensitiveCheck.hasSensitiveWords) {
    throw new PlatformApiError(
      `内容包含敏感词: ${sensitiveCheck.foundWords.join(', ')}`,
      PlatformApiError.CONTENT_VIOLATION
    );
  }

  // 检查格式
  const formatCheck = validateContentFormat(content, platform);
  
  if (!formatCheck.isValid) {
    throw new PlatformApiError(
      `内容格式不符合要求: ${formatCheck.errors.join('; ')}`,
      PlatformApiError.INVALID_PAYLOAD
    );
  }
}

/**
 * 获取当前敏感词词库
 * @returns {string[]} 敏感词列表
 */
export function getSensitiveWordList() {
  return [...sensitiveWordList];
}

/**
 * 设置敏感词词库（用于测试或动态更新）
 * @param {string[]} words - 敏感词列表
 */
export function setSensitiveWordList(words) {
  if (Array.isArray(words)) {
    sensitiveWordList = words;
  }
}

/**
 * 获取平台内容格式限制
 * @param {string} platform - 平台名称
 * @returns {Object|null} 平台限制配置
 */
export function getPlatformLimits(platform) {
  return PLATFORM_LIMITS[platform] || null;
}
