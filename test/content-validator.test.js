import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSensitiveWords,
  validateContentFormat,
  validateContentCompliance,
  loadSensitiveWords,
  getSensitiveWordList,
  setSensitiveWordList,
  getPlatformLimits,
} from '../src/main/utils/content-validator.js';
import { PlatformApiError } from '../src/main/services/platform-adapters.js';

// checkSensitiveWords tests
test('checkSensitiveWords - should detect sensitive words in content', () => {
  setSensitiveWordList(['违禁词', '敏感内容', '政治', '暴力', '色情']);
  const result = checkSensitiveWords('这是一段包含违禁词的内容');
  assert.strictEqual(result.hasSensitiveWords, true);
  assert.ok(result.foundWords.includes('违禁词'));
});

test('checkSensitiveWords - should detect multiple sensitive words', () => {
  setSensitiveWordList(['违禁词', '敏感内容', '政治', '暴力', '色情']);
  const result = checkSensitiveWords('这段内容包含暴力和色情内容');
  assert.strictEqual(result.hasSensitiveWords, true);
  assert.strictEqual(result.foundWords.length, 2);
  assert.ok(result.foundWords.includes('暴力'));
  assert.ok(result.foundWords.includes('色情'));
});

test('checkSensitiveWords - should return no sensitive words for clean content', () => {
  setSensitiveWordList(['违禁词', '敏感内容', '政治', '暴力', '色情']);
  const result = checkSensitiveWords('这是一段正常的内容');
  assert.strictEqual(result.hasSensitiveWords, false);
  assert.strictEqual(result.foundWords.length, 0);
});

test('checkSensitiveWords - should handle empty content', () => {
  const result = checkSensitiveWords('');
  assert.strictEqual(result.hasSensitiveWords, false);
  assert.strictEqual(result.foundWords.length, 0);
});

test('checkSensitiveWords - should handle null content', () => {
  const result = checkSensitiveWords(null);
  assert.strictEqual(result.hasSensitiveWords, false);
  assert.strictEqual(result.foundWords.length, 0);
});

test('checkSensitiveWords - should use custom word list when provided', () => {
  const customWords = ['自定义敏感词', '测试词'];
  const result = checkSensitiveWords('包含自定义敏感词的内容', customWords);
  assert.strictEqual(result.hasSensitiveWords, true);
  assert.ok(result.foundWords.includes('自定义敏感词'));
});

// validateContentFormat tests
test('validateContentFormat - should validate content for 抖音 platform', () => {
  const content = {
    title: '正常标题',
    body: '正常内容',
    images: ['img1.jpg', 'img2.jpg'],
  };
  const result = validateContentFormat(content, '抖音');
  assert.strictEqual(result.isValid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validateContentFormat - should reject title exceeding max length for 抖音', () => {
  const content = {
    title: 'a'.repeat(60), // 超过55字符限制
    body: '正常内容',
    images: ['img1.jpg'],
  };
  const result = validateContentFormat(content, '抖音');
  assert.strictEqual(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('标题长度超过限制')));
});

test('validateContentFormat - should reject body exceeding max length for 小红书', () => {
  const content = {
    title: '标题',
    body: 'a'.repeat(1100), // 超过1000字符限制
    images: ['img1.jpg'],
  };
  const result = validateContentFormat(content, '小红书');
  assert.strictEqual(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('正文长度超过限制')));
});

test('validateContentFormat - should reject too many images for 抖音', () => {
  const content = {
    title: '标题',
    body: '内容',
    images: Array(10).fill('img.jpg'), // 超过9张限制
  };
  const result = validateContentFormat(content, '抖音');
  assert.strictEqual(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('图片数量超过限制')));
});

test('validateContentFormat - should reject too few images for 小红书', () => {
  const content = {
    title: '标题',
    body: '内容',
    images: [], // 少于1张
  };
  const result = validateContentFormat(content, '小红书');
  assert.strictEqual(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('图片数量不足')));
});

test('validateContentFormat - should reject unsupported platform', () => {
  const content = {
    title: '标题',
    body: '内容',
    images: ['img1.jpg'],
  };
  const result = validateContentFormat(content, '未知平台');
  assert.strictEqual(result.isValid, false);
  assert.ok(result.errors.some(e => e.includes('不支持的平台')));
});

test('validateContentFormat - should handle content without images for 头条', () => {
  const content = {
    title: '标题',
    body: '内容',
    images: [],
  };
  const result = validateContentFormat(content, '头条');
  assert.strictEqual(result.isValid, true); // 头条允许0张图片
});

// validateContentCompliance tests
test('validateContentCompliance - should throw CONTENT_VIOLATION error for sensitive words', () => {
  setSensitiveWordList(['违禁词', '敏感内容']);
  const content = {
    title: '包含违禁词的标题',
    body: '正常内容',
    images: ['img1.jpg'],
  };
  
  assert.throws(
    () => validateContentCompliance(content, '抖音'),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === PlatformApiError.CONTENT_VIOLATION &&
        err.message.includes('敏感词');
    }
  );
});

test('validateContentCompliance - should throw INVALID_PAYLOAD error for format violations', () => {
  setSensitiveWordList(['违禁词', '敏感内容']);
  const content = {
    title: 'a'.repeat(60), // 超过限制
    body: '正常内容',
    images: ['img1.jpg'],
  };
  
  assert.throws(
    () => validateContentCompliance(content, '抖音'),
    (err) => {
      return err instanceof PlatformApiError &&
        err.code === PlatformApiError.INVALID_PAYLOAD &&
        err.message.includes('格式不符合要求');
    }
  );
});

test('validateContentCompliance - should pass for compliant content', () => {
  setSensitiveWordList(['违禁词', '敏感内容']);
  const content = {
    title: '正常标题',
    body: '正常内容',
    images: ['img1.jpg', 'img2.jpg'],
  };
  
  assert.doesNotThrow(() => {
    validateContentCompliance(content, '抖音');
  });
});

// loadSensitiveWords tests
test('loadSensitiveWords - should load words from config file', () => {
  const words = loadSensitiveWords('data/sensitive-words.txt');
  assert.ok(Array.isArray(words));
  assert.ok(words.length > 0);
});

test('loadSensitiveWords - should return default words if file not found', () => {
  const words = loadSensitiveWords('non-existent-file.txt');
  assert.ok(Array.isArray(words));
  assert.ok(words.length > 0);
});

// getSensitiveWordList tests
test('getSensitiveWordList - should return current word list', () => {
  setSensitiveWordList(['测试词1', '测试词2']);
  const words = getSensitiveWordList();
  assert.deepStrictEqual(words, ['测试词1', '测试词2']);
});

// getPlatformLimits tests
test('getPlatformLimits - should return limits for supported platform', () => {
  const limits = getPlatformLimits('抖音');
  assert.ok(limits !== null);
  assert.strictEqual(limits.titleMaxLength, 55);
  assert.strictEqual(limits.bodyMaxLength, 2000);
});

test('getPlatformLimits - should return null for unsupported platform', () => {
  const limits = getPlatformLimits('未知平台');
  assert.strictEqual(limits, null);
});
