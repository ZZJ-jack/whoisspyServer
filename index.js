// 内存存储房间信息
const roomMap = {};

// 生成6位数字房间号
function generateRoomId() {
  while (true) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    if (!roomMap[id]) return id;
  }
}

// 自动清理超过 5 分钟的房间
function cleanExpiredRooms() {
  const now = Date.now();
  const FIVE_MINUTES = 5 * 60 * 1000; // 5分钟毫秒数

  for (const roomId in roomMap) {
    if (roomMap[roomId].createdAt && now - roomMap[roomId].createdAt > FIVE_MINUTES) {
      delete roomMap[roomId];
      console.log(`房间 ${roomId} 已过期，自动清理`);
    }
  }
}

// CORS 头部
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    // 每次请求进来先清理过期房间
    cleanExpiredRooms();

    const url = new URL(request.url);

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

    console.log(`请求: ${url.pathname}`, body);

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
    lastRole: '',
    createdAt: Date.now() // 记录创建时间，用于过期清理
  };

  console.log(`房间创建成功: ${roomId}, 总人数: ${total}, 卧底数: ${spyNum}`);

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

  // 计算已分配的卧底数量
  const assignedSpy = room.assigned - (room.total - room.spy) + (room.lastRole === 'spy' ? 1 : 0);
  // 严格控制卧底数量
  const currRole = assignedSpy < room.spy ? 'spy' : 'civil';

  room.assigned += 1;
  room.lastRole = currRole;

  console.log(`房间 ${roomId} 分配身份: ${currRole}, 已分配: ${room.assigned}/${room.total}`);

  return new Response(JSON.stringify({
    code: 0,
    msg: '身份分配成功',
    data: {
      currRole,
      lockNum: room.lockNum
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
    lastRole: '',
    createdAt: Date.now() // 重置时刷新创建时间，重新计时
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