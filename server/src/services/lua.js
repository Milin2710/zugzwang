// Lua scripts run atomically inside Redis, which is what makes matchmaking safe
// when several server instances are racing to pair the same players.


/**
 * Shared Lua helpers, inlined into every script that needs them (a script can't import another).
 * Expects these locals to exist already: prefix, now, startFen, initialMs, incMs, firstMoveMs, ttl, and KEYS[3].
 */
const SHARED_LUA = `
local function activeGame(user)
  local gid = redis.call('GET', prefix .. 'user:' .. user .. ':game')
  if not gid then return nil end
  if redis.call('HGET', prefix .. 'game:' .. gid, 'status') == 'active' then return gid end
  redis.call('DEL', prefix .. 'user:' .. user .. ':game') -- stale pointer
  return nil
end

local function createGame(gameId, white, black, wr, br)
  local gkey = prefix .. 'game:' .. gameId
  redis.call('HSET', gkey,
    'id', gameId, 'white', white, 'black', black,
    'whiteRating', wr, 'blackRating', br,
    'fen', startFen, 'turn', 'w', 'moveCount', 0,
    'whiteMs', initialMs, 'blackMs', initialMs, 'incMs', incMs,
    'lastMoveAt', now, 'startedAt', now, 'status', 'active',
    'drawOffer', '', 'drawOfferPlyW', -1, 'drawOfferPlyB', -1,
    'disconnectW', 0, 'disconnectB', 0)
  redis.call('EXPIRE', gkey, ttl)
  redis.call('SET', prefix .. 'user:' .. white .. ':game', gameId, 'EX', ttl)
  redis.call('SET', prefix .. 'user:' .. black .. ':game', gameId, 'EX', ttl)
  redis.call('ZADD', KEYS[3], now + firstMoveMs, gameId)
end
`;

/**
 * Either pair the caller with the best waiting opponent and create the game,
 * or put the caller into the queue.
 *
 * KEYS: 1 queue(zset username->rating)  2 entries(hash username->json)  3 clock-deadlines(zset)
 * ARGV: 1 prefix 2 username 3 rating 4 socketId 5 now 6 baseWindow 7 growthPerSec
 *       8 gameId 9 startFen 10 initialMs 11 incMs 12 firstMoveMs 13 flip(0|1) 14 ttlSec
 * Returns: {"matched", gameId} | {"queued"} | {"in_game", gameId}
 */
export const MATCH_OR_QUEUE = `
local prefix = ARGV[1]
local username = ARGV[2]
local rating = tonumber(ARGV[3])
local socketId = ARGV[4]
local now = tonumber(ARGV[5])
local baseWindow = tonumber(ARGV[6])
local growth = tonumber(ARGV[7])
local gameId = ARGV[8]
local startFen = ARGV[9]
local initialMs = ARGV[10]
local incMs = ARGV[11]
local firstMoveMs = tonumber(ARGV[12])
local flip = tonumber(ARGV[13])
local ttl = tonumber(ARGV[14])

${SHARED_LUA}
local current = activeGame(username)
if current then return {'in_game', current} end

local best, bestDiff, bestTs, bestRating
local members = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
for i = 1, #members, 2 do
  local name = members[i]
  local score = tonumber(members[i + 1])
  if name ~= username then
    local raw = redis.call('HGET', KEYS[2], name)
    if (not raw) or activeGame(name) then
      redis.call('ZREM', KEYS[1], name) -- orphan / already playing
      redis.call('HDEL', KEYS[2], name)
    else
      local e = cjson.decode(raw)
      -- the longer someone waits, the wider the rating gap they accept
      local window = baseWindow + growth * ((now - e.ts) / 1000)
      local diff = math.abs(score - rating)
      if diff <= window and ((not best) or diff < bestDiff or (diff == bestDiff and e.ts < bestTs)) then
        best, bestDiff, bestTs, bestRating = name, diff, e.ts, score
      end
    end
  end
end

if best then
  redis.call('ZREM', KEYS[1], best, username)
  redis.call('HDEL', KEYS[2], best, username)
  local white, black, wr, br
  if flip == 0 then white, black, wr, br = best, username, bestRating, rating
  else white, black, wr, br = username, best, rating, bestRating end
  createGame(gameId, white, black, wr, br)
  return {'matched', gameId}
end

local existing = redis.call('HGET', KEYS[2], username)
local ts = now
if existing then ts = cjson.decode(existing).ts end
redis.call('HSET', KEYS[2], username, cjson.encode({socketId = socketId, rating = rating, ts = ts}))
redis.call('ZADD', KEYS[1], rating, username)
return {'queued'}
`;

/**
 * Remove a user from the queue. If socketId is non-empty, only when that socket
 * is the one that queued (so a closed old tab can't cancel a newer tab's search).
 * KEYS: 1 queue  2 entries   ARGV: 1 username  2 socketId|''
 */
export const DEQUEUE = `
local raw = redis.call('HGET', KEYS[2], ARGV[1])
if not raw then return 0 end
if ARGV[2] ~= '' and cjson.decode(raw).socketId ~= ARGV[2] then return 0 end
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('HDEL', KEYS[2], ARGV[1])
return 1
`;

/** Release a lock only if we still own it. KEYS: 1 lock  ARGV: 1 token */
export const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/**
 * A matchmaking pass with no caller: pair people who are ALREADY waiting.
 * Needed because the accepted rating gap grows with waiting time, but MATCH_OR_QUEUE only
 * runs when somebody new joins. Oldest waiter first; each takes the closest rating within
 * their own (widest) window. Runs once per sweeper tick, so it stays cheap when the queue is small.
 *
 * KEYS: 1 queue  2 entries  3 clock-deadlines
 * ARGV: 1 prefix 2 now 3 baseWindow 4 growthPerSec 5 startFen 6 initialMs 7 incMs 8 firstMoveMs 9 ttlSec
 *       10.. repeated pairs: gameId, flip(0|1)   (one pair per game that may be created)
 * Returns: list of created game ids
 */
export const MATCH_PASS = `
local prefix = ARGV[1]
local now = tonumber(ARGV[2])
local baseWindow = tonumber(ARGV[3])
local growth = tonumber(ARGV[4])
local startFen = ARGV[5]
local initialMs = ARGV[6]
local incMs = ARGV[7]
local firstMoveMs = tonumber(ARGV[8])
local ttl = tonumber(ARGV[9])

if redis.call('ZCARD', KEYS[1]) < 2 then return {} end

${SHARED_LUA}

local waiting = {}
local members = redis.call('ZRANGE', KEYS[1], 0, -1, 'WITHSCORES')
for i = 1, #members, 2 do
  local name = members[i]
  local raw = redis.call('HGET', KEYS[2], name)
  if (not raw) or activeGame(name) then
    redis.call('ZREM', KEYS[1], name) -- orphan / already playing
    redis.call('HDEL', KEYS[2], name)
  else
    waiting[#waiting + 1] = { name = name, rating = tonumber(members[i + 1]), ts = cjson.decode(raw).ts }
  end
end
table.sort(waiting, function(a, b)
  if a.ts ~= b.ts then return a.ts < b.ts end
  return a.name < b.name
end)

local used = {}
local created = {}
local nextArg = 10
for i = 1, #waiting do
  local a = waiting[i]
  if (not used[a.name]) and nextArg + 1 <= #ARGV then
    local window = baseWindow + growth * ((now - a.ts) / 1000)
    local best, bestDiff
    for j = i + 1, #waiting do
      local b = waiting[j]
      if not used[b.name] then
        local diff = math.abs(a.rating - b.rating)
        if diff <= window and ((not best) or diff < bestDiff) then best, bestDiff = b, diff end
      end
    end
    if best then
      used[a.name] = true
      used[best.name] = true
      redis.call('ZREM', KEYS[1], a.name, best.name)
      redis.call('HDEL', KEYS[2], a.name, best.name)
      local gameId = ARGV[nextArg]
      local flip = tonumber(ARGV[nextArg + 1])
      nextArg = nextArg + 2
      if flip == 0 then createGame(gameId, a.name, best.name, a.rating, best.rating)
      else createGame(gameId, best.name, a.name, best.rating, a.rating) end
      created[#created + 1] = gameId
    end
  end
end
return created
`;
