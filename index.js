const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

let wordBank = {};
let validNums = [];
let bankInfo = null;

const ROOM_EXPIRE_TIME = 1 * 60 * 60 * 1000;

const KV_KEYS = {
  WORD_BANK: 'word_bank_cache',
  BANK_INFO: 'bank_info_cache',
};

async function initWordBank(env) {
  try {
    const cachedBank = await env.ROOMS_KV.get(KV_KEYS.WORD_BANK, 'json');
    const cachedInfo = await env.ROOMS_KV.get(KV_KEYS.BANK_INFO, 'json');
    
    if (cachedBank && cachedInfo) {
      const now = Date.now();
      const cacheAge = now - cachedInfo.timestamp;
      
      if (cacheAge < 60 * 60 * 1000) {
        console.log(`使用缓存的题库，缓存年龄：${Math.floor(cacheAge / 1000)}秒`);
        wordBank = cachedBank;
        validNums = cachedInfo.validNums;
        bankInfo = cachedInfo;
        return true;
      }
    }
    
    console.log('从Github加载题库...');
    const wordBankUrl = 'https://raw.githubusercontent.com/ZZJ-jack/whoisspyServer/refs/heads/main/title.txt';
    const response = await fetch(wordBankUrl);
    
    if (!response.ok) {
      throw new Error(`题库加载失败: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`题库大小: ${text.length}字符`);
    
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
    
    if (validNums.length === 0) {
      console.warn('题库为空，使用备用题库');
      loadFallbackWords();
    } else {
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

function calculateSpyNum(total) {
  if (total <= 6) return 1;
  if (total <= 10) return 2;
  if (total <= 16) return 3;
  return Math.floor(total / 5);
}

function createResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

function parseQueryParams(url) {
  const params = {};
  const urlObj = new URL(url);
  urlObj.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

export class RoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.wordBank = null;
  }

  async ensureWordBank() {
    if (this.wordBank) return;
    
    try {
      const cachedBank = await this.env.ROOMS_KV.get(KV_KEYS.WORD_BANK, 'json');
      if (cachedBank) {
        this.wordBank = cachedBank;
        return;
      }
    } catch (e) {
      console.error('从KV获取题库失败:', e);
    }
    
    this.wordBank = {
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
  }

  async getRoomData(roomId) {
    const key = `room:${roomId}`;
    return await this.env.ROOMS_KV.get(key, 'json');
  }

  async saveRoomData(roomId, data) {
    const key = `room:${roomId}`;
    await this.env.ROOMS_KV.put(key, JSON.stringify(data), { expirationTtl: 3600 });
  }

  async deleteRoomData(roomId) {
    const key = `room:${roomId}`;
    await this.env.ROOMS_KV.delete(key);
  }

  getPublicRoomData(roomData) {
    if (!roomData) return null;
    return {
      roomId: roomData.roomId,
      total: roomData.total,
      spy: roomData.spy,
      civil: roomData.civil,
      isLock: roomData.isLock,
      lockNum: roomData.lockNum,
      assigned: roomData.assigned
    };
  }

  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    await this.ensureWordBank();

    const params = parseQueryParams(request.url);
    const roomId = params.roomId;

    if (pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return createResponse({ code: -400, msg: 'Expected WebSocket' }, 400);
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      this.handleSession(server, roomId);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    if (pathname === '/init') {
      return await this.handleInit(params);
    }

    if (pathname === '/status') {
      return await this.handleStatus(roomId);
    }

    if (pathname === '/lockNum') {
      return await this.handleLockNum(params);
    }

    if (pathname === '/getWord') {
      return await this.handleGetWord(roomId);
    }

    if (pathname === '/reset') {
      return await this.handleReset(roomId);
    }

    return createResponse({ code: -404, msg: 'Not found' }, 404);
  }

  handleSession(webSocket, roomId) {
    webSocket.accept();
    this.sessions.add(webSocket);

    webSocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          webSocket.send(JSON.stringify({ type: 'pong' }));
        }
      } catch (e) {
        console.error('WebSocket message error:', e);
      }
    });

    webSocket.addEventListener('close', () => {
      this.sessions.delete(webSocket);
    });

    webSocket.addEventListener('error', () => {
      this.sessions.delete(webSocket);
    });

    (async () => {
      const roomData = await this.getRoomData(roomId);
      if (roomData) {
        webSocket.send(JSON.stringify({
          type: 'init',
          data: this.getPublicRoomData(roomData)
        }));
      }
    })();
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    for (const session of this.sessions) {
      try {
        session.send(messageStr);
      } catch (e) {
        this.sessions.delete(session);
      }
    }
  }

  async handleInit(params) {
    const total = parseInt(params.total);
    const roomId = params.roomId;
    
    if (!total || total < 2 || total > 20) {
      return createResponse({ code: -1, msg: '总玩家数必须2~20之间' });
    }

    const spyNum = calculateSpyNum(total);

    const roomData = {
      roomId,
      total,
      spy: spyNum,
      civil: total - spyNum,
      isLock: false,
      lockNum: 0,
      assigned: 0,
      assignedSpyCount: 0,
      assignedCivilCount: 0
    };

    await this.saveRoomData(roomId, roomData);

    this.broadcast({
      type: 'roomCreated',
      data: this.getPublicRoomData(roomData)
    });

    return createResponse({
      code: 0,
      msg: '房间创建成功',
      data: this.getPublicRoomData(roomData)
    });
  }

  async handleStatus(roomId) {
    const roomData = await this.getRoomData(roomId);
    
    if (!roomData) {
      return createResponse({ code: -1, msg: '房间不存在或已过期' });
    }

    return createResponse({
      code: 0,
      msg: '获取状态成功',
      data: this.getPublicRoomData(roomData)
    });
  }

  async handleLockNum(params) {
    const roomId = params.roomId;
    const roomData = await this.getRoomData(roomId);
    
    if (!roomData) {
      return createResponse({ code: -1, msg: '房间不存在或已过期' });
    }

    const numInt = parseInt(params.num);
    if (!this.wordBank[numInt]) {
      return createResponse({ code: -3, msg: '题目编号无效' });
    }

    roomData.isLock = true;
    roomData.lockNum = numInt;

    await this.saveRoomData(roomId, roomData);

    this.broadcast({
      type: 'topicLocked',
      data: {
        lockNum: numInt,
        isLock: true
      }
    });

    return createResponse({
      code: 0,
      msg: '题目编号已锁定',
      data: { lockNum: numInt }
    });
  }

  async handleGetWord(roomId) {
    const roomData = await this.getRoomData(roomId);
    
    if (!roomData) {
      return createResponse({ code: -1, msg: '房间不存在或已过期' });
    }

    if (!roomData.isLock) {
      return createResponse({ code: -2, msg: '房主尚未锁定题目' });
    }

    const lockNum = roomData.lockNum;
    if (!this.wordBank[lockNum]) {
      return createResponse({ code: -4, msg: `题库中没有编号为${lockNum}的题目` });
    }

    if (roomData.assigned >= roomData.total) {
      return createResponse({ code: -3, msg: '本房间身份已全部分配完毕' });
    }

    let currRole;
    const remainingSpySpots = roomData.spy - roomData.assignedSpyCount;
    const remainingCivilSpots = roomData.civil - roomData.assignedCivilCount;

    if (remainingSpySpots > 0 && remainingCivilSpots > 0) {
      const spyProbability = remainingSpySpots / (remainingSpySpots + remainingCivilSpots);
      currRole = Math.random() < spyProbability ? 'spy' : 'civil';
    } else if (remainingSpySpots > 0) {
      currRole = 'spy';
    } else {
      currRole = 'civil';
    }

    if (currRole === 'spy') {
      roomData.assignedSpyCount += 1;
    } else {
      roomData.assignedCivilCount += 1;
    }

    roomData.assigned += 1;

    await this.saveRoomData(roomId, roomData);

    const [spyWord, civilWord] = this.wordBank[lockNum];
    const word = currRole === 'spy' ? spyWord : civilWord;

    this.broadcast({
      type: 'playerAssigned',
      data: {
        assigned: roomData.assigned,
        total: roomData.total
      }
    });

    return createResponse({
      code: 0,
      msg: '身份分配成功',
      data: {
        currRole,
        lockNum,
        word,
        assigned: roomData.assigned,
        total: roomData.total
      }
    });
  }

  async handleReset(roomId) {
    const roomData = await this.getRoomData(roomId);
    
    if (!roomData) {
      return createResponse({ code: -1, msg: '房间不存在或已过期' });
    }

    const total = roomData.total;
    const spyNum = calculateSpyNum(total);

    const newRoomData = {
      roomId,
      total,
      spy: spyNum,
      civil: total - spyNum,
      isLock: false,
      lockNum: 0,
      assigned: 0,
      assignedSpyCount: 0,
      assignedCivilCount: 0
    };

    await this.saveRoomData(roomId, newRoomData);

    this.broadcast({
      type: 'roomReset',
      data: this.getPublicRoomData(newRoomData)
    });

    return createResponse({
      code: 0,
      msg: '房间重置成功',
      data: this.getPublicRoomData(newRoomData)
    });
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (validNums.length === 0 || !bankInfo) {
      await initWordBank(env);
    }

    if (pathname === '/api/getBankInfo') {
      return createResponse({
        code: 0,
        msg: '题库信息',
        data: {
          total: bankInfo.total,
          minNum: bankInfo.minNum,
          maxNum: bankInfo.maxNum
        }
      });
    }

    if (pathname === '/api/getWordByNum') {
      const params = parseQueryParams(request.url);
      const numInt = parseInt(params.num);
      if (!params.num || !wordBank[numInt]) {
        return createResponse({ code: -1, msg: '题目编号无效' });
      }
      const [spyWord, civilWord] = wordBank[numInt];
      return createResponse({
        code: 0,
        msg: '获取题目成功',
        data: { num: numInt, spyWord, civilWord }
      });
    }

    if (pathname === '/api/createRoom') {
      const params = parseQueryParams(request.url);
      const total = parseInt(params.total);
      
      if (!total || total < 2 || total > 20) {
        return createResponse({ code: -1, msg: '总玩家数必须2~20之间' });
      }

      const roomId = Math.floor(100000 + Math.random() * 900000).toString();
      const id = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(id);

      const initUrl = new URL(request.url);
      initUrl.pathname = '/init';
      initUrl.searchParams.set('roomId', roomId);

      const response = await stub.fetch(new Request(initUrl, { method: 'GET' }));
      const result = await response.json();

      if (result.code === 0) {
        result.data.roomId = roomId;
      }

      return createResponse(result.code === 0 ? {
        code: 0,
        msg: '房间创建成功',
        data: { roomId }
      } : result);
    }

    if (pathname === '/api/joinRoom') {
      const params = parseQueryParams(request.url);
      const roomId = params.roomId;

      if (!roomId || roomId.length !== 6) {
        return createResponse({ code: -1, msg: '房间号格式无效' });
      }

      const id = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(id);

      const statusUrl = new URL(request.url);
      statusUrl.pathname = '/status';
      statusUrl.searchParams.set('roomId', roomId);

      const response = await stub.fetch(new Request(statusUrl, { method: 'GET' }));
      return response;
    }

    if (pathname === '/api/ws') {
      const params = parseQueryParams(request.url);
      const roomId = params.roomId;

      if (!roomId) {
        return createResponse({ code: -1, msg: '缺少房间号' }, 400);
      }

      const id = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(id);

      const wsUrl = new URL(request.url);
      wsUrl.pathname = '/ws';
      wsUrl.searchParams.set('roomId', roomId);

      return stub.fetch(new Request(wsUrl, {
        headers: request.headers
      }));
    }

    if (pathname === '/api/lockNum') {
      const params = parseQueryParams(request.url);
      const roomId = params.roomId;

      if (!roomId) {
        return createResponse({ code: -1, msg: '缺少房间号' });
      }

      const id = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(id);

      const lockUrl = new URL(request.url);
      lockUrl.pathname = '/lockNum';
      lockUrl.searchParams.set('roomId', roomId);

      return stub.fetch(new Request(lockUrl, { method: 'GET' }));
    }

    if (pathname === '/api/getWord') {
      const params = parseQueryParams(request.url);
      const roomId = params.roomId;

      if (!roomId) {
        return createResponse({ code: -1, msg: '缺少房间号' });
      }

      const id = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(id);

      const wordUrl = new URL(request.url);
      wordUrl.pathname = '/getWord';
      wordUrl.searchParams.set('roomId', roomId);

      return stub.fetch(new Request(wordUrl, { method: 'GET' }));
    }

    if (pathname === '/api/resetRoom') {
      const params = parseQueryParams(request.url);
      const roomId = params.roomId;

      if (!roomId) {
        return createResponse({ code: -1, msg: '缺少房间号' });
      }

      const id = env.ROOM_DO.idFromName(roomId);
      const stub = env.ROOM_DO.get(id);

      const resetUrl = new URL(request.url);
      resetUrl.pathname = '/reset';
      resetUrl.searchParams.set('roomId', roomId);

      return stub.fetch(new Request(resetUrl, { method: 'GET' }));
    }

    return createResponse({ code: -404, msg: '接口不存在' }, 404);
  }
};
