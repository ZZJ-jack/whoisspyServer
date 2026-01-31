// 引入核心依赖
const express = require('express');
const cors = require('cors');

// 初始化Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// ===================== 1. 跨域配置（解决CORS问题） =====================
const corsOptions = {
  // 允许的前端域名（替换为你的前端实际域名）
  origin: 'https://whoisspy.zzjjack.us.kg',
  methods: ['GET', 'POST', 'OPTIONS'], // 必须包含OPTIONS预请求
  allowedHeaders: ['Content-Type', 'Origin', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // 预请求缓存1天
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // 兜底处理所有OPTIONS请求

// ===================== 2. 中间件配置 =====================
app.use(express.json()); // 解析JSON请求体
app.use(express.urlencoded({ extended: true })); // 解析表单请求体

// ===================== 3. 内存存储房间数据（核心） =====================
// 房间数据结构：{ roomId: { total, lockNum, isLock, usedCount } }
let roomStore = {};

// ===================== 4. 工具函数 =====================
/**
 * 生成6位唯一随机房间号
 * @returns {string} 6位数字房间号
 */
function generateUniqueRoomId() {
  let roomId;
  // 循环生成，确保房间号唯一
  do {
    roomId = Math.floor(100000 + Math.random() * 900000).toString();
  } while (roomStore[roomId]);
  return roomId;
}

/**
 * 校验房间号是否存在
 * @param {string} roomId 6位房间号
 * @returns {boolean} 是否存在
 */
function isRoomExist(roomId) {
  return !!roomStore[roomId];
}

// ===================== 5. 接口实现（与前端一一对应） =====================

/**
 * 接口1：创建房间（房主）
 * POST /api/createRoom
 * 请求体：{ total: 数字 }
 * 返回：{ code: 0/错误码, msg: 提示, data: { roomId } }
 */
app.post('/api/createRoom', (req, res) => {
  try {
    const { total } = req.body;
    // 参数校验
    if (!total || isNaN(total) || total < 2) {
      return res.json({
        code: -1,
        msg: '总玩家数必须≥2，请输入有效数字'
      });
    }
    // 生成唯一房间号
    const roomId = generateUniqueRoomId();
    // 初始化房间数据
    roomStore[roomId] = {
      total: parseInt(total), // 总人数
      lockNum: 0, // 锁定的题目编号（0为未锁定）
      isLock: false, // 是否锁定题目
      usedCount: 0 // 已领取词语的人数
    };
    // 返回成功结果
    res.json({
      code: 0,
      msg: '创建成功',
      data: { roomId }
    });
  } catch (err) {
    console.error('创建房间失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

/**
 * 接口2：加入房间（玩家）
 * POST /api/joinRoom
 * 请求体：{ roomId: 字符串 }
 * 返回：{ code: 0/错误码, msg: 提示, data: { isLock, lockNum, total } }
 */
app.post('/api/joinRoom', (req, res) => {
  try {
    const { roomId } = req.body;
    // 参数校验
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '请输入6位有效数字房间号'
      });
    }
    // 校验房间是否存在
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -2,
        msg: '房间号不存在，请检查输入'
      });
    }
    // 获取房间状态
    const { isLock, lockNum, total } = roomStore[roomId];
    // 返回成功结果
    res.json({
      code: 0,
      msg: '加入房间成功',
      data: { isLock, lockNum, total }
    });
  } catch (err) {
    console.error('加入房间失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

/**
 * 接口3：锁定题目编号（房主）
 * POST /api/lockNum
 * 请求体：{ roomId: 字符串, num: 数字 }
 * 返回：{ code: 0/错误码, msg: 提示 }
 */
app.post('/api/lockNum', (req, res) => {
  try {
    const { roomId, num } = req.body;
    // 参数校验
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '房间号格式错误'
      });
    }
    if (!num || isNaN(num) || num < 1) {
      return res.json({
        code: -2,
        msg: '请输入有效题目编号'
      });
    }
    // 校验房间是否存在
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -3,
        msg: '房间不存在'
      });
    }
    // 更新房间锁定状态
    roomStore[roomId].lockNum = parseInt(num);
    roomStore[roomId].isLock = true;
    // 返回成功结果
    res.json({
      code: 0,
      msg: '题目编号锁定成功'
    });
  } catch (err) {
    console.error('锁定编号失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

/**
 * 接口4：获取专属词语（分配身份）
 * POST /api/getWord
 * 请求体：{ roomId: 字符串 }
 * 返回：{ code: 0/错误码, msg: 提示, data: { currRole, lockNum } }
 */
app.post('/api/getWord', (req, res) => {
  try {
    const { roomId } = req.body;
    // 参数校验
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '房间号格式错误'
      });
    }
    // 校验房间是否存在
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -2,
        msg: '房间不存在，请重新加入'
      });
    }

    const room = roomStore[roomId];
    // 校验房间是否已锁定题目
    if (!room.isLock) {
      return res.json({
        code: -3,
        msg: '房主尚未锁定题目，请等待'
      });
    }
    // 校验是否已达总人数上限
    if (room.usedCount >= room.total) {
      return res.json({
        code: -4,
        msg: '当前房间人数已达上限，无法领取词语'
      });
    }

    // 分配身份：1个卧底，其余平民（总人数≥2）
    let currRole = 'civilian'; // 默认平民
    if (room.usedCount === 0) {
      currRole = 'spy'; // 第一个领取的是卧底（也可随机，这里简化逻辑）
    }

    // 更新已领取人数
    room.usedCount += 1;

    // 返回结果（身份 + 锁定编号）
    res.json({
      code: 0,
      msg: '身份获取成功',
      data: {
        currRole, // spy=卧底，civilian=平民
        lockNum: room.lockNum
      }
    });
  } catch (err) {
    console.error('获取词语失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

/**
 * 接口5：重置房间（房主）
 * POST /api/resetRoom
 * 请求体：{ roomId: 字符串 }
 * 返回：{ code: 0/错误码, msg: 提示 }
 */
app.post('/api/resetRoom', (req, res) => {
  try {
    const { roomId } = req.body;
    // 参数校验
    if (!roomId || roomId.length !== 6 || isNaN(roomId)) {
      return res.json({
        code: -1,
        msg: '房间号格式错误'
      });
    }
    // 校验房间是否存在
    if (!isRoomExist(roomId)) {
      return res.json({
        code: -2,
        msg: '房间不存在'
      });
    }
    // 重置房间状态（保留总人数，重置锁定和已领取人数）
    roomStore[roomId].lockNum = 0;
    roomStore[roomId].isLock = false;
    roomStore[roomId].usedCount = 0;

    res.json({
      code: 0,
      msg: '房间重置成功'
    });
  } catch (err) {
    console.error('重置房间失败：', err);
    res.json({
      code: -99,
      msg: '服务器内部错误'
    });
  }
});

// ===================== 6. 健康检查接口（可选） =====================
app.get('/health', (req, res) => {
  res.json({ code: 0, msg: '服务器运行正常', data: { port: PORT } });
});

// ===================== 7. 启动服务 =====================
app.listen(PORT, () => {
  console.log(`✅ 后端服务已启动，运行在端口：${PORT}`);
  console.log(`✅ 跨域允许：https://whoisspy.zzjjack.us.kg`);
  console.log(`✅ 健康检查地址：http://localhost:${PORT}/health`);
});

// 兜底处理404
app.use('*', (req, res) => {
  res.json({ code: -404, msg: '接口不存在' });
});