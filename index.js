// src/index.js

// CORS 头部
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 内存缓存（提高性能）
let roomCache = new Map();
let wordBank = {};
let validNums = [];
let cacheLoaded = false;

// 初始化题库
async function initWordBank() {
  try {
    const wordBankUrl = 'https://gitee.com/zzj-jack/whoisspyServer/raw/main/title.txt';
    console.log('正在加载题库...');
    const response = await fetch(wordBankUrl);
    
    if (!response.ok) {
      throw new Error(`题库加载失败: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`题库大小: ${text.length}字符`);
    
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

// 从 KV 加载房间数据
async function loadRoomsFromKV(env) {
  try {
    console.log('从 KV 加载房间数据...');
    const savedData = await env.ROOMS_KV.get('rooms_data');
    if (savedData) {
      const data = JSON.parse(savedData);
      roomCache = new Map(data.rooms || []);
      
      // 清理过期房间（超过6小时）
      const now = Date.now();
      const expireTime = 6 * 60 * 60 * 1000;
      
      for (const [roomId, room] of roomCache.entries()) {
        if (!room.createdAt || (now - room.createdAt) > expireTime) {
          roomCache.delete(roomId);
          console.log(`清理过期房间: ${roomId}`);
        }
      }
      
      console.log(`从 KV 加载了 ${roomCache.size} 个房间`);
    } else {
      console.log('KV 中没有找到房间数据，使用空缓存');
    }
  } catch (error) {
    console.error('从 KV 加载房间数据失败:', error);
  }
}

// 保存房间数据到 KV
async function saveRoomsToKV(env) {
  try {
    // 清理过期房间
    const now = Date.now();
    const expireTime = 6 * 60 * 60 * 1000;
    
    for (const [roomId, room] of roomCache.entries()) {
      if (!room.createdAt || (now - room.createdAt) > expireTime) {
        roomCache.delete(roomId);
      }
    }
    
    // 转换为数组以便存储
    const roomsArray = Array.from(roomCache.entries());
    const data = {
      rooms: roomsArray,
      lastUpdated: now
    };
    
    await env.ROOMS_KV.put('rooms_data', JSON.stringify(data));
    console.log(`房间数据已保存到 KV，共 ${roomCache.size} 个房间`);
  } catch (error) {
    console.error('保存到 KV 失败:', error);
  }
}

// 房间管理函数
function getRoom(roomId) {
  return roomCache.get(roomId);
}

function setRoom(roomId, roomData) {
  roomCache.set(roomId, roomData);
  return roomData;
}

function deleteRoom(roomId) {
  return roomCache.delete(roomId);
}

function generateRoomId() {
  while (true) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    if (!roomCache.has(id)) return id;
  }
}

// API 处理函数
async function handleCreateRoom(body, env) {
  const { total } = body;
  
  if (!total || total < 2) {
    return createResponse({ code: -1, msg: '总玩家数必须≥2' });
  }

  // 计算卧底数量
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

  const roomId = generateRoomId();
  const civil = total - spyNum;
  const now = Date.now();
  
  const roomData = {
    isLock: false,
    lockNum: 0,
    total,
    spy: spyNum,
    civil,
    assigned: 0,
    assignedSpyCount: 0,
    assignedCivilCount: 0,
    createdAt: now,
    lastActivity: now
  };
  
  setRoom(roomId, roomData);
  
  console.log(`房间创建成功: ${roomId}, 总人数: ${total}, 卧底数: ${spyNum}`);
  
  return createResponse({
    code: 0,
    msg: '房间创建成功',
    data: { roomId, isOwner: true }
  });
}

async function handleJoinRoom(body) {
  const { roomId } = body;
  
  const room = getRoom(roomId);
  if (!room) {
    return createResponse({ code: -1, msg: '房间号无效或已过期' });
  }
  
  // 更新最后活动时间
  room.lastActivity = Date.now();
  setRoom(roomId, room);
  
  return createResponse({
    code: 0,
    msg: '加入房间成功',
    data: {
      isOwner: false,
      lockNum: room.lockNum,
      isLock: room.isLock,
      total: room.total
    }
  });
}

async function handleLockNum(body) {
  const { roomId, num } = body;
  
  const room = getRoom(roomId);
  if (!room) {
    return createResponse({ code: -1, msg: '房间号无效' });
  }
  
  if (!wordBank[num]) {
    return createResponse({ code: -3, msg: '题目编号无效' });
  }
  
  room.isLock = true;
  room.lockNum = num;
  room.lastActivity = Date.now();
  setRoom(roomId, room);
  
  return createResponse({
    code: 0,
    msg: '题目编号已锁定',
    data: { lockNum: num }
  });
}

async function handleGetWord(body) {
  const { roomId } = body;
  
  const room = getRoom(roomId);
  if (!room) {
    return createResponse({ code: -1, msg: '房间号无效' });
  }
  
  if (!room.isLock) {
    return createResponse({ code: -2, msg: '房主尚未锁定题目' });
  }

  const lockNum = room.lockNum;
  if (!wordBank[lockNum]) {
    return createResponse({ code: -4, msg: `题库中没有编号为${lockNum}的题目` });
  }

  const assigned = room.assigned;
  
  if (assigned >= room.total) {
    return createResponse({ code: -3, msg: '本房间身份已全部分配完毕' });
  }
  
  // 随机分配身份
  let currRole;
  const remainingSpySpots = room.spy - room.assignedSpyCount;
  const remainingCivilSpots = room.civil - room.assignedCivilCount;
  
  if (remainingSpySpots > 0 && remainingCivilSpots > 0) {
    const spyProbability = remainingSpySpots / (remainingSpySpots + remainingCivilSpots);
    currRole = Math.random() < spyProbability ? 'spy' : 'civil';
  } else if (remainingSpySpots > 0) {
    currRole = 'spy';
  } else {
    currRole = 'civil';
  }
  
  if (currRole === 'spy') {
    room.assignedSpyCount += 1;
  } else {
    room.assignedCivilCount += 1;
  }
  
  room.assigned += 1;
  room.lastActivity = Date.now();
  setRoom(roomId, room);
  
  // 获取词语
  const [spyWord, civilWord] = wordBank[lockNum];
  const word = currRole === 'spy' ? spyWord : civilWord;
  
  console.log(`房间 ${roomId} 分配: ${currRole}, 已分配: ${room.assigned}/${room.total}, 词语: "${word}"`);
  
  return createResponse({
    code: 0,
    msg: '身份分配成功',
    data: {
      currRole,
      lockNum,
      word,
      assigned: room.assigned,
      total: room.total
    }
  });
}

async function handleResetRoom(body) {
  const { roomId } = body;
  
  const room = getRoom(roomId);
  if (!room) {
    return createResponse({ code: -1, msg: '房间号无效' });
  }
  
  const total = room.total;
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
  
  const newRoomData = {
    isLock: false,
    lockNum: 0,
    total,
    spy: spyNum,
    civil: total - spyNum,
    assigned: 0,
    assignedSpyCount: 0,
    assignedCivilCount: 0,
    createdAt: room.createdAt || Date.now(),
    lastActivity: Date.now()
  };
  
  setRoom(roomId, newRoomData);
  
  return createResponse({
    code: 0,
    msg: '房间重置成功'
  });
}

async function handleGetWordByNum(body) {
  const { num } = body;
  
  if (!num || !wordBank[num]) {
    return createResponse({ code: -1, msg: '题目编号无效' });
  }
  
  const [spyWord, civilWord] = wordBank[num];
  
  return createResponse({
    code: 0,
    msg: '获取题目成功',
    data: { num, spyWord, civilWord }
  });
}

async function handleGetBankInfo() {
  return createResponse({
    code: 0,
    msg: '题库信息',
    data: {
      total: validNums.length,
      minNum: validNums[0] || 1,
      maxNum: validNums[validNums.length - 1] || 1,
      sampleCount: Math.min(5, validNums.length)
    }
  });
}

// 创建响应辅助函数
function createResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

// 主函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 只处理 POST 请求
    if (request.method !== 'POST') {
      return createResponse({ code: -405, msg: '方法不允许' }, 405);
    }
    
    // 初始化题库（只在第一次请求时）
    if (validNums.length === 0) {
      await initWordBank();
    }
    
    // 从 KV 加载房间数据（如果还没加载）
    if (!cacheLoaded) {
      await loadRoomsFromKV(env);
      cacheLoaded = true;
    }
    
    // 解析请求体
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return createResponse({ code: -400, msg: '请求体格式错误' }, 400);
    }
    
    console.log(`请求: ${url.pathname}`, JSON.stringify(body).slice(0, 200));
    
    let response;
    
    // 路由分发
    try {
      switch (url.pathname) {
        case '/api/createRoom':
          response = await handleCreateRoom(body, env);
          break;
        case '/api/joinRoom':
          response = await handleJoinRoom(body);
          break;
        case '/api/lockNum':
          response = await handleLockNum(body);
          break;
        case '/api/getWord':
          response = await handleGetWord(body);
          break;
        case '/api/resetRoom':
          response = await handleResetRoom(body);
          break;
        case '/api/getWordByNum':
          response = await handleGetWordByNum(body);
          break;
        case '/api/getBankInfo':
          response = await handleGetBankInfo();
          break;
        default:
          response = createResponse({ code: -404, msg: '接口不存在', path: url.pathname }, 404);
      }
    } catch (error) {
      console.error('处理请求时出错:', error);
      response = createResponse({ 
        code: -500, 
        msg: '服务器内部错误',
        error: error.message
      }, 500);
    }
    
    // 异步保存房间数据到 KV（不阻塞响应）
    if (env.ROOMS_KV && roomCache.size > 0) {
      ctx.waitUntil(saveRoomsToKV(env));
    }
    
    return response;
  }
};