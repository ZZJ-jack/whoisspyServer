// 内存存储房间信息和题库
const roomMap = {};

// 题库数据
let wordBank = {};
let validNums = [];

// 在Worker启动时加载题库
async function initWordBank() {
  try {
    // 从环境变量获取题库URL，或使用默认
    const wordBankUrl = typeof WORD_BANK_URL !== 'undefined' ? WORD_BANK_URL : 'https://gitee.com/zzj-jack/whoisspyServer/raw/main/title.txt';
    
    console.log('正在加载题库...');
    const response = await fetch(wordBankUrl);
    
    if (!response.ok) {
      throw new Error(`题库加载失败: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`题库大小: ${text.length}字符`);
    
    // 解析题库
    const lines = text.split(/\r?\n/).filter(line => {
      const trimLine = line.trim();
      return trimLine !== '' && !trimLine.startsWith('//') && !trimLine.startsWith('#');
    });
    
    lines.forEach((line, idx) => {
      const trimLine = line.trim();
      let separator = '/';
      if (trimLine.includes('|')) separator = '|';
      
      const parts = trimLine.split(separator);
      if (parts.length >= 2) {
        const spyWord = parts[0].trim();
        const civilWord = parts[1].trim();
        if (spyWord && civilWord) {
          wordBank[idx + 1] = [spyWord, civilWord];
        }
      }
    });
    
    validNums = Object.keys(wordBank).map(Number).sort((a, b) => a - b);
    
    console.log(`题库加载完成，共${validNums.length}题`);
    
    // 如果题库为空，使用备用题库
    if (validNums.length === 0) {
      console.warn('题库为空，使用备用题库');
      loadFallbackWords();
    }
    
  } catch (error) {
    console.error('题库加载错误:', error);
    console.warn('使用备用题库');
    loadFallbackWords();
  }
}

// 备用题库
function loadFallbackWords() {
  wordBank = {
    1: ['苹果', '香蕉'],
    2: ['咖啡', '奶茶'],
    3: ['微信', 'QQ'],
    4: ['猫', '狗'],
    5: ['冰箱', '空调'],
    6: ['篮球', '足球'],
    7: ['自行车', '电动车'],
    8: ['电影院', 'KTV'],
    9: ['春节', '中秋节'],
    10: ['长城', '故宫'],
    11: ['米饭', '面条'],
    12: ['火车', '飞机'],
    13: ['手机', '电脑'],
    14: ['游泳', '跑步'],
    15: ['可乐', '雪碧'],
    16: ['太阳', '月亮'],
    17: ['医生', '护士'],
    18: ['钢琴', '小提琴'],
    19: ['夏天', '冬天'],
    20: ['牛奶', '豆浆']
  };
  validNums = Object.keys(wordBank).map(Number).sort((a, b) => a - b);
  console.log(`已加载备用题库: ${validNums.length}题`);
}

// CORS 头部
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 生成6位数字房间号
function generateRoomId() {
  while (true) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    if (!roomMap[id]) return id;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 初始化题库（只在第一次请求时加载）
    if (validNums.length === 0) {
      await initWordBank();
    }
    
    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }
    
    // 只处理 POST 请求
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ 
        code: -405, 
        msg: '方法不允许' 
      }), {
        status: 405,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    
    // 解析请求体
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ 
        code: -400, 
        msg: '请求体格式错误' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
    
    console.log(`请求:${url.pathname}`, body);
    
    // 路由分发
    switch (url.pathname) {
      case '/api/createRoom':
        return handleCreateRoom(body);
        
      case '/api/joinRoom':
        return handleJoinRoom(body);
        
      case '/api/lockNum':
        return handleLockNum(body);
        
      case '/api/getWord':
        return handleGetWord(body);
        
      case '/api/resetRoom':
        return handleResetRoom(body);
        
      case '/api/getWordByNum':
        return handleGetWordByNum(body);
        
      case '/api/getBankInfo':
        return handleGetBankInfo(body);
        
      default:
        return new Response(JSON.stringify({ 
          code: -404, 
          msg: '接口不存在',
          path: url.pathname
        }), {
          status: 404,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
    }
  }
};

// 处理函数
function handleCreateRoom(body) {
  const { total } = body;
  
  if (!total || total < 2) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '总玩家数必须≥2' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  // 谁是卧底标准规则：自动计算卧底数量
  let spyNum;
  if (total <= 6) {
    spyNum = 1;
  } else if (total <= 10) {
    spyNum = 2;
  } else if (total <= 16) {
    spyNum = 3;
  } else {
    spyNum = Math.floor(total / 5); // 超过16人时，每5人配1个卧底
  }

  const roomId = generateRoomId();
  const civil = total - spyNum;
  
  roomMap[roomId] = {
    isLock: false,
    lockNum: 0,
    total,
    spy: spyNum,
    civil,
    assigned: 0,
    assignedSpyCount: 0,
    assignedCivilCount: 0
  };
  
  console.log(`房间创建成功:${roomId}, 总人数:${total}, 卧底数:${spyNum}`);
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '房间创建成功',
    data: {
      roomId,
      isOwner: true
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function handleJoinRoom(body) {
  const { roomId } = body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效或已过期' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const room = roomMap[roomId];
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '加入房间成功',
    data: {
      isOwner: false,
      lockNum: room.lockNum,
      isLock: room.isLock,
      total: room.total
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function handleLockNum(body) {
  const { roomId, num } = body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  // 验证题目编号是否有效
  if (!wordBank[num]) {
    return new Response(JSON.stringify({ 
      code: -3, 
      msg: '题目编号无效' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  roomMap[roomId].isLock = true;
  roomMap[roomId].lockNum = num;
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '题目编号已锁定',
    data: { lockNum: num }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function handleGetWord(body) {
  const { roomId } = body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const room = roomMap[roomId];
  
  if (!room.isLock) {
    return new Response(JSON.stringify({ 
      code: -2, 
      msg: '房主尚未锁定题目' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  // 检查题库是否有该题目
  const lockNum = room.lockNum;
  if (!wordBank[lockNum]) {
    return new Response(JSON.stringify({ 
      code: -4, 
      msg: `题库中没有编号为${lockNum}的题目` 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  // 已分配的人数
  const assigned = room.assigned;
  
  if (assigned >= room.total) {
    return new Response(JSON.stringify({ 
      code: -3, 
      msg: '本房间身份已全部分配完毕' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  // 随机分配身份，确保卧底数量精确
  let currRole;
  
  // 还剩下多少卧底名额
  const remainingSpySpots = room.spy - room.assignedSpyCount;
  // 还剩下多少平民名额
  const remainingCivilSpots = room.civil - room.assignedCivilCount;
  
  // 如果两种身份都还有名额，随机选择一种
  if (remainingSpySpots > 0 && remainingCivilSpots > 0) {
    // 根据概率随机分配，概率基于剩余名额比例
    const spyProbability = remainingSpySpots / (remainingSpySpots + remainingCivilSpots);
    currRole = Math.random() < spyProbability ? 'spy' : 'civil';
  } else if (remainingSpySpots > 0) {
    currRole = 'spy';
  } else {
    currRole = 'civil';
  }
  
  // 更新计数
  if (currRole === 'spy') {
    room.assignedSpyCount += 1;
  } else {
    room.assignedCivilCount += 1;
  }
  
  room.assigned += 1;
  
  // 获取词语
  const [spyWord, civilWord] = wordBank[lockNum];
  const word = currRole === 'spy' ? spyWord : civilWord;
  
  console.log(`房间${roomId} 分配:${currRole}, 已分配:${room.assigned}/${room.total}, 词语:"${word}"`);
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '身份分配成功',
    data: {
      currRole,
      lockNum,
      word,
      assigned: room.assigned,
      total: room.total
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function handleResetRoom(body) {
  const { roomId } = body;
  
  if (!roomMap[roomId]) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const total = roomMap[roomId].total;
  // 重置时重新计算卧底数量
  let spyNum;
  if (total <= 6) {
    spyNum = 1;
  } else if (total <= 10) {
    spyNum = 2;
  } else if (total <= 16) {
    spyNum = 3;
  } else {
    spyNum = Math.floor(total / 5);
  }
  
  roomMap[roomId] = {
    isLock: false,
    lockNum: 0,
    total,
    spy: spyNum,
    civil: total - spyNum,
    assigned: 0,
    assignedSpyCount: 0,
    assignedCivilCount: 0
  };
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '房间重置成功'
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

// 新增：根据编号获取题目
function handleGetWordByNum(body) {
  const { num } = body;
  
  if (!num || !wordBank[num]) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '题目编号无效' 
    }), {
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const [spyWord, civilWord] = wordBank[num];
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '获取题目成功',
    data: {
      num,
      spyWord,
      civilWord
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

// 新增：获取题库信息
function handleGetBankInfo(body) {
  return new Response(JSON.stringify({
    code: 0,
    msg: '题库信息',
    data: {
      total: validNums.length,
      minNum: validNums[0] || 1,
      maxNum: validNums[validNums.length - 1] || 1,
      sampleCount: Math.min(5, validNums.length)
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}