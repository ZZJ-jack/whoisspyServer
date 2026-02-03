// src/index.js

// CORS 头部
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 全局变量（仅用于缓存题库）
let wordBank = {};
let validNums = [];
let bankInfo = null;

// 常量定义
const ROOM_EXPIRE_TIME = 6 * 60 * 60 * 1000; // 6小时过期
const MAX_ROOMS = 1000; // 最大房间数

// KV 键名常量
const KV_KEYS = {
  ROOM_PREFIX: 'room_',
  WORD_BANK: 'word_bank_cache',
  BANK_INFO: 'bank_info_cache',
};

// 初始化题库（带缓存机制）
async function initWordBank(env) {
  try {
    // 先检查 KV 中是否有缓存的题库
    const cachedBank = await env.ROOMS_KV.get(KV_KEYS.WORD_BANK, 'json');
    const cachedInfo = await env.ROOMS_KV.get(KV_KEYS.BANK_INFO, 'json');
    
    if (cachedBank && cachedInfo) {
      const now = Date.now();
      const cacheAge = now - cachedInfo.timestamp;
      
      // 如果缓存小于1小时，使用缓存
      if (cacheAge < 60 * 60 * 1000) {
        console.log(`使用缓存的题库，缓存年龄：${Math.floor(cacheAge / 1000)}秒`);
        wordBank = cachedBank;
        validNums = cachedInfo.validNums;
        bankInfo = cachedInfo;
        return true;
      }
    }
    
    // 需要重新加载题库
    console.log('从网络加载题库...');
    const wordBankUrl = 'https://gitee.com/zzj-jack/whoisspyServer/raw/main/title.txt';
    const response = await fetch(wordBankUrl);
    
    if (!response.ok) {
      throw new Error(`题库加载失败: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`题库大小: ${text.length}字符`);
    
    // 清空旧数据
    wordBank = {};
    
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
    bankInfo = {
      total: validNums.length,
      minNum: validNums[0] || 1,
      maxNum: validNums[validNums.length - 1] || 1,
      timestamp: Date.now(),
      validNums: validNums
    };
    
    console.log(`题库加载完成，共${validNums.length}题`);
    
    // 如果题库为空，使用备用题库
    if (validNums.length === 0) {
      console.warn('题库为空，使用备用题库');
      loadFallbackWords();
    } else {
      // 缓存到 KV，设置1小时过期
      await Promise.all([
        env.ROOMS_KV.put(KV_KEYS.WORD_BANK, JSON.stringify(wordBank), { expirationTtl: 3600 }),
        env.ROOMS_KV.put(KV_KEYS.BANK_INFO, JSON.stringify(bankInfo), { expirationTtl: 3600 })
      ]);
      console.log('题库已缓存到 KV');
    }
    
    return true;
  } catch (error) {
    console.error('题库加载错误:', error);
    console.warn('使用备用题库');
    loadFallbackWords();
    return true;
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
  bankInfo = {
    total: validNums.length,
    minNum: validNums[0],
    maxNum: validNums[validNums.length - 1],
    timestamp: Date.now(),
    validNums: validNums
  };
  console.log(`已加载备用题库: ${validNums.length}题`);
}

// 房间管理函数（全部基于 KV）
async function getRoom(roomId, env) {
  const roomData = await env.ROOMS_KV.get(`${KV_KEYS.ROOM_PREFIX}${roomId}`, 'json');
  
  if (!roomData) {
    return null;
  }
  
  // 检查房间是否过期
  const now = Date.now();
  if (roomData.createdAt && (now - roomData.createdAt) > ROOM_EXPIRE_TIME) {
    console.log(`房间 ${roomId} 已过期，自动清理`);
    await deleteRoom(roomId, env);
    return null;
  }
  
  return roomData;
}

async function setRoom(roomId, roomData, env) {
  // 确保有创建时间
  if (!roomData.createdAt) {
    roomData.createdAt = Date.now();
  }
  
  // 更新最后活动时间
  roomData.lastActivity = Date.now();
  
  // 存储到 KV，设置过期时间
  await env.ROOMS_KV.put(
    `${KV_KEYS.ROOM_PREFIX}${roomId}`,
    JSON.stringify(roomData),
    { expirationTtl: Math.ceil(ROOM_EXPIRE_TIME / 1000) }
  );
  
  return roomData;
}

async function deleteRoom(roomId, env) {
  await env.ROOMS_KV.delete(`${KV_KEYS.ROOM_PREFIX}${roomId}`);
  console.log(`房间 ${roomId} 已删除`);
  return true;
}

// 生成唯一的房间ID
async function generateRoomId(env) {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 检查房间是否已存在
    const existingRoom = await getRoom(id, env);
    if (!existingRoom) {
      return id;
    }
    
    attempts++;
  }
  
  // 如果多次尝试都冲突，尝试更随机的ID
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 从URL解析查询参数
function parseQueryParams(url) {
  const params = {};
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

// 计算卧底数量
function calculateSpyNum(total) {
  if (total <= 6) return 1;
  if (total <= 10) return 2;
  if (total <= 16) return 3;
  return Math.floor(total / 5);
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

// API 处理函数 - 支持 GET 请求
async function handleCreateRoom(params, env) {
  const total = parseInt(params.total);
  
  if (!total || total < 2 || total > 20) {
    return createResponse({ code: -1, msg: '总玩家数必须2~20之间' });
  }

  // 计算卧底数量
  const spyNum = calculateSpyNum(total);
  const roomId = await generateRoomId(env);
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
    lastActivity: now,
    players: [] // 记录已加入玩家（可选，用于扩展）
  };
  
  await setRoom(roomId, roomData, env);
  
  console.log(`房间创建成功: ${roomId}, 总人数: ${total}, 卧底数: ${spyNum}`);
  
  return createResponse({
    code: 0,
    msg: '房间创建成功',
    data: { roomId, isOwner: true }
  });
}

async function handleJoinRoom(params, env) {
  const { roomId } = params;
  
  const room = await getRoom(roomId, env);
  if (!room) {
    return createResponse({ code: -1, msg: '房间号无效或已过期' });
  }
  
  // 检查房间是否已满（如果需要限制重复加入）
  // 这里暂时不做限制，允许同一玩家多次加入（会重新分配身份）
  
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

async function handleLockNum(params, env) {
  const { roomId, num } = params;
  
  const room = await getRoom(roomId, env);
  if (!room) {
    return createResponse({ code: -1, msg: '房间号无效' });
  }
  
  const numInt = parseInt(num);
  if (!wordBank[numInt]) {
    return createResponse({ code: -3, msg: '题目编号无效' });
  }
  
  room.isLock = true;
  room.lockNum = numInt;
  
  await setRoom(roomId, room, env);
  
  return createResponse({
    code: 0,
    msg: '题目编号已锁定',
    data: { lockNum: numInt }
  });
}

async function handleGetWord(params, env) {
  const { roomId } = params;
  
  const room = await getRoom(roomId, env);
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
  
  // 随机分配身份（基于剩余名额）
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
  
  // 更新分配计数
  if (currRole === 'spy') {
    room.assignedSpyCount += 1;
  } else {
    room.assignedCivilCount += 1;
  }
  
  room.assigned += 1;
  
  await setRoom(roomId, room, env);
  
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

async function handleResetRoom(params, env) {
  const { roomId } = params;
  
  const room = await getRoom(roomId, env);
  if (!room) {
    return createResponse({ code: -1, msg: '房间号无效' });
  }
  
  const total = room.total;
  const spyNum = calculateSpyNum(total);
  
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
    lastActivity: Date.now(),
    players: [] // 清空玩家列表
  };
  
  await setRoom(roomId, newRoomData, env);
  
  return createResponse({
    code: 0,
    msg: '房间重置成功'
  });
}

async function handleGetWordByNum(params) {
  const { num } = params;
  
  const numInt = parseInt(num);
  if (!num || !wordBank[numInt]) {
    return createResponse({ code: -1, msg: '题目编号无效' });
  }
  
  const [spyWord, civilWord] = wordBank[numInt];
  
  return createResponse({
    code: 0,
    msg: '获取题目成功',
    data: { num: numInt, spyWord, civilWord }
  });
}

async function handleGetBankInfo() {
  if (!bankInfo) {
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
  
  return createResponse({
    code: 0,
    msg: '题库信息',
    data: {
      total: bankInfo.total,
      minNum: bankInfo.minNum,
      maxNum: bankInfo.maxNum,
      sampleCount: Math.min(5, bankInfo.total)
    }
  });
}

// 清理过期房间（可选，定期执行）
async function cleanupExpiredRooms(env) {
  // 注意：这需要遍历所有房间，可能比较耗时
  // 在实际使用中，可以设置一个定时任务或者在创建新房间时偶尔清理
  console.log('清理过期房间功能需要KV的list操作，这里暂不实现');
  return { cleaned: 0 };
}

// 主函数
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // 处理 OPTIONS 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // 只允许 GET 请求
    if (request.method !== 'GET') {
      return createResponse({ code: -405, msg: '方法不允许，请使用GET请求' }, 405);
    }
    
    // 初始化题库（如果尚未初始化）
    if (validNums.length === 0 || !bankInfo) {
      await initWordBank(env);
    }
    
    console.log(`GET 请求: ${pathname}${url.search}`);
    
    // 解析查询参数
    const params = parseQueryParams(request.url);
    let response;
    
    // 路由分发 - 只处理 GET 请求
    try {
      switch (pathname) {
        case '/api/createRoom':
          response = await handleCreateRoom(params, env);
          break;
        case '/api/joinRoom':
          response = await handleJoinRoom(params, env);
          break;
        case '/api/lockNum':
          response = await handleLockNum(params, env);
          break;
        case '/api/getWord':
          response = await handleGetWord(params, env);
          break;
        case '/api/resetRoom':
          response = await handleResetRoom(params, env);
          break;
        case '/api/getWordByNum':
          response = await handleGetWordByNum(params);
          break;
        case '/api/getBankInfo':
          response = await handleGetBankInfo();
          break;
        case '/api/cleanup':
          // 管理员接口，清理过期房间
          const result = await cleanupExpiredRooms(env);
          response = createResponse({ code: 0, msg: '清理完成', data: result });
          break;
        default:
          response = createResponse({ code: -404, msg: '接口不存在', path: pathname }, 404);
      }
    } catch (error) {
      console.error('处理请求时出错:', error);
      response = createResponse({ 
        code: -500, 
        msg: '服务器内部错误',
        error: error.message
      }, 500);
    }
    
    return response;
  }
};