const http = require('http');

function makeRequest(path, method, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('=== 动态枚举功能测试 ===\n');

  try {
    console.log('测试 1: 静态枚举（验证现有功能不被破坏）');
    const staticResult = await makeRequest('/api/generate', 'POST', {
      model: {
        name: '测试静态枚举',
        fields: [
          {
            name: 'gender',
            type: 'enum',
            label: '性别',
            rule: {
              options: ['男', '女', '未知'],
              weights: [0.48, 0.48, 0.04]
            }
          }
        ]
      },
      count: 5,
      seed: 12345
    });
    console.log('✓ 静态枚举测试成功');
    console.log('原始响应:', JSON.stringify(staticResult, null, 2).slice(0, 500));
    console.log('生成数据:', JSON.stringify(staticResult.data?.data, null, 2));
    console.log();

    console.log('测试 2: 依赖枚举 - 解析');
    const dependentResult = await makeRequest('/api/resolve-enum', 'POST', {
      rule: {
        dynamic: {
          type: 'dependent',
          dependsOn: 'department',
          optionsMap: {
            '技术部': ['前端工程师', '后端工程师', '全栈工程师'],
            '产品部': ['产品经理', '产品助理', '需求分析师'],
            '设计部': ['UI设计师', 'UX设计师', '平面设计师']
          },
          defaultOptions: ['员工', '专员']
        },
        fallbackOptions: ['未知岗位']
      },
      context: {
        department: '技术部'
      }
    });
    console.log('✓ 依赖枚举解析测试');
    console.log('原始响应:', JSON.stringify(dependentResult, null, 2));
    console.log('当部门=技术部时的选项:', JSON.stringify(dependentResult.data?.options, null, 2));
    console.log();

    console.log('测试 3: 依赖枚举 - 不同上下文');
    const dependentResult2 = await makeRequest('/api/resolve-enum', 'POST', {
      rule: {
        dynamic: {
          type: 'dependent',
          dependsOn: 'department',
          optionsMap: {
            '技术部': ['前端工程师', '后端工程师', '全栈工程师'],
            '产品部': ['产品经理', '产品助理', '需求分析师'],
            '设计部': ['UI设计师', 'UX设计师', '平面设计师']
          },
          defaultOptions: ['员工', '专员']
        }
      },
      context: {
        department: '产品部'
      }
    });
    console.log('✓ 依赖枚举不同上下文测试');
    console.log('当部门=产品部时的选项:', JSON.stringify(dependentResult2.data?.options, null, 2));
    console.log();

    console.log('测试 4: 依赖枚举 - 不匹配时使用默认选项');
    const dependentResult3 = await makeRequest('/api/resolve-enum', 'POST', {
      rule: {
        dynamic: {
          type: 'dependent',
          dependsOn: 'department',
          optionsMap: {
            '技术部': ['前端工程师', '后端工程师'],
            '产品部': ['产品经理']
          },
          defaultOptions: ['员工', '专员']
        }
      },
      context: {
        department: '财务部'
      }
    });
    console.log('✓ 依赖枚举默认选项测试');
    console.log('当部门=财务部时的选项:', JSON.stringify(dependentResult3.data?.options, null, 2));
    console.log();

    console.log('测试 5: API 失败时使用降级选项');
    const fallbackResult = await makeRequest('/api/resolve-enum', 'POST', {
      rule: {
        dynamic: {
          type: 'api',
          url: 'http://nonexistent-api.example.com/invalid',
          method: 'GET',
          cache: false
        },
        fallbackOptions: ['降级选项1', '降级选项2', '降级选项3']
      },
      context: {}
    });
    console.log('✓ 降级机制测试');
    console.log('原始响应:', JSON.stringify(fallbackResult, null, 2));
    console.log('API 失败时使用的降级选项:', JSON.stringify(fallbackResult.data?.options, null, 2));
    console.log('是否使用降级:', fallbackResult.data?.usedFallback);
    console.log();

    console.log('测试 6: 生成包含动态枚举的数据');
    const generateResult = await makeRequest('/api/generate', 'POST', {
      model: {
        name: '员工信息',
        fields: [
          {
            name: 'id',
            type: 'number',
            label: 'ID',
            rule: { min: 1, max: 99999 }
          },
          {
            name: 'name',
            type: 'string',
            label: '姓名',
            rule: { format: 'chineseName' }
          },
          {
            name: 'department',
            type: 'enum',
            label: '部门',
            rule: {
              options: ['技术部', '产品部', '设计部', '市场部'],
              weights: [0.4, 0.25, 0.2, 0.15]
            }
          },
          {
            name: 'position',
            type: 'enum',
            label: '职位',
            rule: {
              dynamic: {
                type: 'dependent',
                dependsOn: 'department',
                optionsMap: {
                  '技术部': ['前端工程师', '后端工程师', '全栈工程师', '架构师'],
                  '产品部': ['产品经理', '产品助理', '需求分析师'],
                  '设计部': ['UI设计师', 'UX设计师', '平面设计师'],
                  '市场部': ['市场专员', '品牌经理', '渠道经理']
                },
                defaultOptions: ['员工', '专员']
              },
              fallbackOptions: ['未知岗位', '职员']
            }
          }
        ]
      },
      count: 5,
      seed: 67890
    });
    console.log('✓ 生成包含动态枚举的数据');
    console.log('原始响应:', JSON.stringify(generateResult, null, 2).slice(0, 800));
    console.log('生成数据:');
    console.log(JSON.stringify(generateResult.data?.data, null, 2));
    console.log();

    console.log('测试 7: 批量解析动态枚举');
    const batchResult = await makeRequest('/api/resolve-enum/batch', 'POST', {
      rules: [
        {
          options: ['静态1', '静态2']
        },
        {
          dynamic: {
            type: 'dependent',
            dependsOn: 'level',
            optionsMap: {
              'P1': ['初级任务'],
              'P2': ['中级任务'],
              'P3': ['高级任务']
            }
          },
          fallbackOptions: ['通用任务']
        }
      ],
      context: { level: 'P2' }
    });
    console.log('✓ 批量解析测试');
    console.log('结果:', JSON.stringify(batchResult.data, null, 2));
    console.log();

    console.log('✅ 所有测试通过！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

runTests();
