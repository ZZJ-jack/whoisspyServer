// 配置
const ROOM_TTL = 10 * 60 * 1000; // 10分钟（毫秒）
const MAX_PLAYERS = 20;

// CORS 头部
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
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
    
    console.log(`请求:${url.pathname}`, body);
    
    // 路由分发
    switch (url.pathname) {
      case '/api/createRoom':
        return handleCreateRoom(body, env);
        
      case '/api/joinRoom':
        return handleJoinRoom(body, env);
        
      case '/api/lockNum':
        return handleLockNum(body, env);
        
      case '/api/getWord':
        return handleGetWord(body, env);
        
      case '/api/resetRoom':
        return handleResetRoom(body, env);
        
      case '/api/cleanupRooms':
        // 清理过期房间的接口（可以定时调用）
        return handleCleanupRooms(env);
        
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
  },
  
  // 定时任务：每小时清理一次过期房间
  async scheduled(event, env, ctx) {
    await handleCleanupRooms(env);
  }
};

// 数据库操作辅助函数
async function getRoom(env, roomId) {
  try {
    const room = await env.DB.prepare(
      'SELECT * FROM rooms WHERE id = ?'
    ).bind(roomId).first();
    
    if (!room) {
      return null;
    }
    
    // 检查房间是否过期
    const now = Date.now();
    const createdAt = new Date(room.created_at).getTime();
    if (now - createdAt > ROOM_TTL) {
      // 删除过期房间
      await env.DB.prepare(
        'DELETE FROM rooms WHERE id = ?'
      ).bind(roomId).run();
      console.log(`房间 ${roomId} 已过期，自动清理`);
      return null;
    }
    
    // 解析JSON字段
    try {
      room.data = JSON.parse(room.data);
    } catch (e) {
      console.error('解析房间数据失败:', e);
      return null;
    }
    
    return room;
  } catch (error) {
    console.error('查询房间失败:', error);
    return null;
  }
}

async function saveRoom(env, roomId, roomData) {
  try {
    const now = new Date().toISOString();
    
    // 检查房间是否已存在
    const existingRoom = await env.DB.prepare(
      'SELECT id FROM rooms WHERE id = ?'
    ).bind(roomId).first();
    
    if (existingRoom) {
      // 更新现有房间
      const result = await env.DB.prepare(
        `UPDATE rooms SET data = ?, updated_at = ? WHERE id = ?`
      ).bind(
        JSON.stringify(roomData),
        now,
        roomId
      ).run();
      
      return result.success;
    } else {
      // 创建新房间
      const result = await env.DB.prepare(
        `INSERT INTO rooms (id, data, created_at, updated_at)
         VALUES (?, ?, ?, ?)`
      ).bind(
        roomId,
        JSON.stringify(roomData),
        now,
        now
      ).run();
      
      return result.success;
    }
  } catch (error) {
    console.error('保存房间失败:', error);
    return false;
  }
}

async function deleteRoom(env, roomId) {
  try {
    await env.DB.prepare(
      'DELETE FROM rooms WHERE id = ?'
    ).bind(roomId).run();
    console.log(`已删除房间: ${roomId}`);
    return true;
  } catch (error) {
    console.error('删除房间失败:', error);
    return false;
  }
}

// 生成6位数字房间号
async function generateRoomId(env) {
  const maxAttempts = 20; // 增加尝试次数
  
  for (let i = 0; i < maxAttempts; i++) {
    const id = Math.floor(100000 + Math.random() * 900000).toString();
    
    // 快速检查房间是否存在
    const existingRoom = await env.DB.prepare(
      'SELECT id FROM rooms WHERE id = ?'
    ).bind(id).first();
    
    if (!existingRoom) {
      return id;
    }
  }
  
  throw new Error('无法生成唯一房间号');
}

// 计算卧底数量
function calculateSpyNum(total) {
  if (total <= 6) {
    return 1;
  } else if (total <= 10) {
    return 2;
  } else if (total <= 16) {
    return 3;
  } else {
    return Math.floor(total / 5);
  }
}

// 处理函数
async function handleCreateRoom(body, env) {
  const { total } = body;
  
  if (!total || total < 2 || total > MAX_PLAYERS) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: `总玩家数必须2~${MAX_PLAYERS}之间` 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  const spyNum = calculateSpyNum(total);
  const civil = total - spyNum;
  
  try {
    const roomId = await generateRoomId(env);
    
    const roomData = {
      isLock: false,
      lockNum: 0,
      total,
      spy: spyNum,
      civil,
      assigned: 0,
      assignedSpyCount: 0,
      assignedCivilCount: 0
    };
    
    const success = await saveRoom(env, roomId, roomData);
    
    if (!success) {
      throw new Error('保存房间到数据库失败');
    }
    
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
  } catch (error) {
    console.error('创建房间失败:', error);
    
    let errorMsg = '服务器内部错误';
    if (error.message.includes('无法生成唯一房间号')) {
      errorMsg = '房间号生成失败，请稍后重试';
    }
    
    return new Response(JSON.stringify({ 
      code: -500, 
      msg: errorMsg 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}

async function handleJoinRoom(body, env) {
  const { roomId } = body;
  
  if (!roomId || roomId.length !== 6) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号必须是6位数字' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const room = await getRoom(env, roomId);
  
  if (!room) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效或已过期' 
    }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '加入房间成功',
    data: {
      isOwner: false,
      lockNum: room.data.lockNum,
      isLock: room.data.isLock,
      total: room.data.total
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

async function handleLockNum(body, env) {
  const { roomId, num } = body;
  
  if (!roomId || roomId.length !== 6) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  if (!num || num < 1 || !Number.isInteger(num)) {
    return new Response(JSON.stringify({ 
      code: -3, 
      msg: '题目编号必须是正整数' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const room = await getRoom(env, roomId);
  
  if (!room) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  room.data.isLock = true;
  room.data.lockNum = num;
  
  const success = await saveRoom(env, roomId, room.data);
  
  if (!success) {
    return new Response(JSON.stringify({ 
      code: -500, 
      msg: '锁定失败' 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  console.log(`房间 ${roomId} 锁定题目编号: ${num}`);
  
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

async function handleGetWord(body, env) {
  const { roomId } = body;
  
  if (!roomId || roomId.length !== 6) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const room = await getRoom(env, roomId);
  
  if (!room) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const roomData = room.data;
  
  if (!roomData.isLock) {
    return new Response(JSON.stringify({ 
      code: -2, 
      msg: '房主尚未锁定题目' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  // 检查是否已经分配完所有身份
  if (roomData.assigned >= roomData.total) {
    return new Response(JSON.stringify({ 
      code: -3, 
      msg: '房间身份已全部分配完毕' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }

  // 随机分配身份，确保卧底数量精确
  let currRole;
  
  // 还剩下多少卧底名额
  const remainingSpySpots = roomData.spy - roomData.assignedSpyCount;
  // 还剩下多少平民名额
  const remainingCivilSpots = roomData.civil - roomData.assignedCivilCount;
  
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
    roomData.assignedSpyCount += 1;
  } else {
    roomData.assignedCivilCount += 1;
  }
  
  roomData.assigned += 1;
  
  console.log(`房间${roomId} 分配身份:${currRole}, 已分配:${roomData.assigned}/${roomData.total}, 卧底:${roomData.assignedSpyCount}/${roomData.spy}, 平民:${roomData.assignedCivilCount}/${roomData.civil}`);
  
  const success = await saveRoom(env, roomId, roomData);
  
  if (!success) {
    return new Response(JSON.stringify({ 
      code: -500, 
      msg: '分配失败' 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  return new Response(JSON.stringify({
    code: 0,
    msg: '身份分配成功',
    data: {
      currRole,
      lockNum: roomData.lockNum
    }
  }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

async function handleResetRoom(body, env) {
  const { roomId } = body;
  
  if (!roomId || roomId.length !== 6) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const room = await getRoom(env, roomId);
  
  if (!room) {
    return new Response(JSON.stringify({ 
      code: -1, 
      msg: '房间号无效' 
    }), {
      status: 404,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  const total = room.data.total;
  const spyNum = calculateSpyNum(total);
  
  const roomData = {
    isLock: false,
    lockNum: 0,
    total,
    spy: spyNum,
    civil: total - spyNum,
    assigned: 0,
    assignedSpyCount: 0,
    assignedCivilCount: 0
  };
  
  const success = await saveRoom(env, roomId, roomData);
  
  if (!success) {
    return new Response(JSON.stringify({ 
      code: -500, 
      msg: '重置失败' 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  console.log(`房间 ${roomId} 已重置`);
  
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

// 清理过期房间
async function handleCleanupRooms(env) {
  try {
    // 清理创建时间超过30分钟的房间
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const result = await env.DB.prepare(
      'DELETE FROM rooms WHERE created_at < ?'
    ).bind(thirtyMinutesAgo).run();
    
    console.log(`清理了 ${result.changes} 个过期房间`);
    
    return new Response(JSON.stringify({
      code: 0,
      msg: `清理了 ${result.changes} 个过期房间`
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('清理房间失败:', error);
    return new Response(JSON.stringify({ 
      code: -500, 
      msg: '清理失败' 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
}