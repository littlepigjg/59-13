const DynamicEnumResolver = require('./server/utils/DynamicEnumResolver');
const ModelParser = require('./server/models/ModelParser');
const DataGenerator = require('./server/generator/DataGenerator');

console.log('=== 调试测试 ===\n');

const resolver = new DynamicEnumResolver();
const parser = new ModelParser();
const generator = new DataGenerator(12345);

const rule = {
  dynamic: {
    type: 'dependent',
    dependsOn: 'department',
    optionsMap: {
      '技术部': ['前端工程师', '后端工程师'],
      '产品部': ['产品经理']
    },
    defaultOptions: ['员工', '专员']
  },
  fallbackOptions: ['未知岗位']
};

console.log('1. 测试 DynamicEnumResolver...');
resolver.resolve(rule, { department: '技术部' })
  .then(options => {
    console.log('解析结果:', options);
    console.log('类型:', typeof options[0], '内容:', options[0]);
  })
  .catch(err => {
    console.error('错误:', err.message);
  });

console.log('\n2. 测试 ModelParser.parseEnumRule...');
try {
  const parsed = parser.parseEnumRule(rule, 'test');
  console.log('解析成功:', JSON.stringify(parsed, null, 2));
} catch (err) {
  console.error('解析失败:', err.message);
}

console.log('\n3. 测试 DataGenerator.generateEnum...');
const RandomGenerator = require('./server/utils/random');
const rng = new RandomGenerator(12345);
generator.generateEnum(rule, rng, { department: '技术部' })
  .then(result => {
    console.log('生成结果:', result);
  })
  .catch(err => {
    console.error('生成错误:', err.message);
    console.error(err.stack);
  });
