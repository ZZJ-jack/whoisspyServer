# 谁是卧底 API 服务

这是一个用于"谁是卧底"游戏的在线 API 服务，提供房间管理、题库获取和身份分配等功能。

## 🌐 API 基础信息

**基础 URL**: `https://spyapi.zzjjack.us.kg`  
**服务端源代码**: 
- [Gitee](https://gitee.com/zzj-jack/whoisspyServer)
- [GitHub](https://github.com/ZZJ-jack/whoisspyServer)

---

## 📚 API 接口概览

### 房间管理
| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/createRoom` | GET | 创建新房间 |
| `/api/joinRoom` | GET | 加入现有房间 |
| `/api/lockNum` | GET | 锁定题目编号 |
| `/api/getWord` | GET | 获取身份和词语 |
| `/api/resetRoom` | GET | 重置房间状态 |

### 题库相关
| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/getWordByNum` | GET | 根据编号获取词语 |
| `/api/getBankInfo` | GET | 获取题库信息 |

### 系统管理
| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/cleanup` | GET | 清理过期房间（管理员用） |

---

## 🔧 详细接口说明

### 1. 创建房间
```
GET /api/createRoom?total={人数}
```

**参数**:
- `total` (必需): 游戏总人数，范围 2-20

**成功响应**:
```json
{
  "code": 0,
  "msg": "房间创建成功",
  "data": {
    "roomId": "123456",
    "isOwner": true
  }
}
```

**错误响应**:
```json
{
  "code": -1,
  "msg": "总玩家数必须2~20之间"
}
```

**说明**:
- 自动计算卧底数量：≤6人1卧底，≤10人2卧底，≤16人3卧底，其他约1/5
- 房间6小时后自动过期
- 创建者为房主（isOwner=true）

---

### 2. 加入房间
```
GET /api/joinRoom?roomId={房间号}
```

**参数**:
- `roomId` (必需): 6位数字房间号

**成功响应**:
```json
{
  "code": 0,
  "msg": "加入房间成功",
  "data": {
    "isOwner": false,
    "lockNum": 0,
    "isLock": false,
    "total": 8
  }
}
```

**错误响应**:
```json
{
  "code": -1,
  "msg": "房间号无效或已过期"
}
```

**说明**:
- 返回房间当前状态
- `isLock` 表示房主是否已锁定题目

---

### 3. 锁定题目
```
GET /api/lockNum?roomId={房间号}&num={题目编号}
```

**参数**:
- `roomId` (必需): 房间号
- `num` (必需): 题目编号（从题库信息中获取）

**成功响应**:
```json
{
  "code": 0,
  "msg": "题目编号已锁定",
  "data": {
    "lockNum": 42
  }
}
```

**错误响应**:
- `code: -1`: 房间号无效
- `code: -3`: 题目编号无效

**说明**:
- 仅房主可调用
- 锁定后所有玩家看到的题目相同

---

### 4. 获取身份和词语
```
GET /api/getWord?roomId={房间号}
```

**参数**:
- `roomId` (必需): 房间号

**成功响应**:
```json
{
  "code": 0,
  "msg": "身份分配成功",
  "data": {
    "currRole": "spy",
    "lockNum": 42,
    "word": "苹果",
    "assigned": 3,
    "total": 8
  }
}
```

**错误响应**:
- `code: -1`: 房间号无效
- `code: -2`: 房主尚未锁定题目
- `code: -3`: 本房间身份已全部分配完毕
- `code: -4`: 题库中没有对应编号的题目

**说明**:
- `currRole`: "spy"（卧底）或 "civil"（平民）
- `assigned/total`: 当前已分配人数/总人数
- 每人调用一次，身份随机分配，保证卧底数量准确

---

### 5. 重置房间
```
GET /api/resetRoom?roomId={房间号}
```

**参数**:
- `roomId` (必需): 房间号

**成功响应**:
```json
{
  "code": 0,
  "msg": "房间重置成功"
}
```

**说明**:
- 重置房间状态，可用于新一局游戏
- 保留总人数，重新计算卧底数

---

### 6. 根据编号获取词语
```
GET /api/getWordByNum?num={题目编号}
```

**参数**:
- `num` (必需): 题目编号

**成功响应**:
```json
{
  "code": 0,
  "msg": "获取题目成功",
  "data": {
    "num": 42,
    "spyWord": "苹果",
    "civilWord": "香蕉"
  }
}
```

**说明**:
- 查看题库具体内容
- 可用于房主选择题目

---

### 7. 获取题库信息
```
GET /api/getBankInfo
```

**成功响应**:
```json
{
  "code": 0,
  "msg": "题库信息",
  "data": {
    "total": 100,
    "minNum": 1,
    "maxNum": 100,
    "sampleCount": 5
  }
}
```

**说明**:
- 获取题库统计信息
- 题库从 Gitee 同步，每小时缓存更新

---

## 🎮 游戏流程

### 标准游戏流程：
1. **房主创建房间** → `/api/createRoom?total=8`
2. **分享房间号**给其他玩家
3. **玩家加入房间** → `/api/joinRoom?roomId=123456`
4. **房主选择题目** → `/api/getBankInfo` → `/api/getWordByNum?num=42`
5. **房主锁定题目** → `/api/lockNum?roomId=123456&num=42`
6. **所有玩家获取身份** → `/api/getWord?roomId=123456`
7. **开始游戏讨论**
8. **如需再来一局** → `/api/resetRoom?roomId=123456`

### 简化流程（推荐）：
1. 房主：创建房间 → 选择题目 → 锁定题目
2. 玩家：加入房间 → 获取身份
3. 开始游戏

---

## 📊 错误代码对照表

| 代码 | 说明 |
|------|------|
| 0 | 成功 |
| -1 | 参数错误/房间无效 |
| -2 | 题目未锁定 |
| -3 | 身份已分配完毕/题目无效 |
| -4 | 题库中无此题目 |
| -405 | 请求方法错误 |
| -404 | 接口不存在 |
| -500 | 服务器内部错误 |

---

## ⚙️ 技术说明

### 缓存机制
- 题库每小时从 Gitee 更新一次
- 房间数据存储6小时自动过期
- 最大支持1000个房间

### 网络要求
- 所有请求使用 GET 方法
- 支持 CORS 跨域访问
- JSON 格式响应

### 备份机制
- 远程题库失败时自动使用本地备用题库（20个题目）

---

## 💻 使用示例

### 使用 curl 测试：
```bash
# 创建房间
curl "https://spyapi.zzjjack.us.kg/api/createRoom?total=8"

# 获取题库信息
curl "https://spyapi.zzjjack.us.kg/api/getBankInfo"

# 获取题目内容
curl "https://spyapi.zzjjack.us.kg/api/getWordByNum?num=15"
```

### 前端 JavaScript 调用：
```javascript
async function createRoom(total) {
  const response = await fetch(`https://spyapi.zzjjack.us.kg/api/createRoom?total=${total}`);
  const data = await response.json();
  return data;
}

async function joinRoom(roomId) {
  const response = await fetch(`https://spyapi.zzjjack.us.kg/api/joinRoom?roomId=${roomId}`);
  const data = await response.json();
  return data;
}
```

---

## ⚠️ 注意事项

1. 房间号为6位数字，有效期6小时
2. 题目编号必须存在于题库中
3. 同一玩家可多次加入房间（会重新分配身份）
4. 建议前端在获取身份后隐藏房间号，防止作弊
5. 卧底身份随机分配，保证概率准确
6. 所有接口均使用 GET 方法，参数通过查询字符串传递

---

## 📞 支持与反馈

如有问题或建议，请通过以下方式联系：
- 在源代码仓库提交 Issue
- 电子邮箱：zzjjack@zzjjack.us.kg

---

**最后更新**: 2026年2月4日