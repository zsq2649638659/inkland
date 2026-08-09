#!/bin/bash
# 测试数据种子脚本 - 使用 curl 直接调用 Supabase REST API

URL="https://azcazuwcrliskkjrvnwa.supabase.co"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Y2F6dXdjcmxpc2tranJ2bndhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NTQ0MjUsImV4cCI6MjA5OTMzMDQyNX0.7QOOapQvhJmOXDRu3VPHGyXZquNHbYapV52cilQDbCY"
REAL_USER_ID="46f57789-ee86-489a-ac9c-650392054a13"

H="apikey: $KEY"
H2="Authorization: Bearer $KEY"
H3="Content-Type: application/json"
H4="Prefer: return=minimal"

echo "=== 开始创建测试数据 ==="
echo "目标用户: $REAL_USER_ID"
echo ""

# 1. 创建测试用户 profiles
echo "--- 创建测试用户 ---"

USERS_JSON='[
  {"id":"a0000000-0000-0000-0000-000000000001","nickname":"墨染青衣","avatar_url":"https://placehold.co/96x96/d4a574/fff?text=%E5%A2%A8","bio":"我是测试用户墨染青衣","role":"user"},
  {"id":"a0000000-0000-0000-0000-000000000002","nickname":"风月无边","avatar_url":"https://placehold.co/96x96/6b8f71/fff?text=%E9%A3%8E","bio":"我是测试用户风月无边","role":"user"},
  {"id":"a0000000-0000-0000-0000-000000000003","nickname":"一叶知秋","avatar_url":"https://placehold.co/96x96/8b5cf6/fff?text=%E5%8F%B6","bio":"我是测试用户一叶知秋","role":"user"},
  {"id":"a0000000-0000-0000-0000-000000000004","nickname":"云深不知处","avatar_url":"https://placehold.co/96x96/e74c3c/fff?text=%E4%BA%91","bio":"我是测试用户云深不知处","role":"user"},
  {"id":"a0000000-0000-0000-0000-000000000005","nickname":"清风明月","avatar_url":"https://placehold.co/96x96/3498db/fff?text=%E6%B8%85","bio":"我是测试用户清风明月","role":"user"}
]'

for row in $(echo "$USERS_JSON" | python3 -c "import json,sys;data=json.load(sys.stdin);[print(json.dumps(d)) for d in data]"); do
  nickname=$(echo "$row" | python3 -c "import json,sys;print(json.loads(sys.stdin.read())['nickname'])" 2>/dev/null || echo "$row" | python3 -c "import json,sys;d=json.loads(sys.stdin.read());print(d['nickname'])")
  code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/profiles" -H "$H" -H "$H2" -H "$H3" -H "$H4" -d "$row")
  echo "  $nickname: $code"
done

# 2. 查询作品
echo ""
echo "--- 查询作品 ---"
POSTS_JSON=$(curl -s "$URL/rest/v1/posts?select=id,title,user_id&user_id=eq.$REAL_USER_ID&status=eq.published&limit=10" -H "$H" -H "$H2")
echo "$POSTS_JSON" | python3 -c "
import json,sys
posts=json.load(sys.stdin)
print(f'作品数: {len(posts)}')
for p in posts:
    print(f'  {p[\"title\"]} ({p[\"id\"]})')
"

POST_COUNT=$(echo "$POSTS_JSON" | python3 -c "import json,sys;print(len(json.load(sys.stdin)))")
if [ "$POST_COUNT" = "0" ]; then
  echo "⚠️ 没有发布的作品，跳过交互"
  exit 0
fi

# 3. 创建交互数据
echo ""
echo "--- 创建交互 ---"

TEST_IDS=("a0000000-0000-0000-0000-000000000001" "a0000000-0000-0000-0000-000000000002" "a0000000-0000-0000-0000-000000000003" "a0000000-0000-0000-0000-000000000004" "a0000000-0000-0000-0000-000000000005")
TEST_NAMES=("墨染青衣" "风月无边" "一叶知秋" "云深不知处" "清风明月")

COMMENTS=("写得真好，期待下一章！" "这个设定太有意思了，追了！" "文笔细腻，人物刻画很到位" "好看！一口气读完了" "剧情转折好精彩，完全没想到" "太喜欢这个角色了" "画面感很强，像在看电影" "催更催更！" "细节描写太棒了" "每一章都让人期待")

POST_IDS=()
POST_TITLES=()
while IFS= read -r line; do
  POST_IDS+=("$line")
done < <(echo "$POSTS_JSON" | python3 -c "import json,sys;posts=json.load(sys.stdin);[print(p['id']) for p in posts]")

while IFS= read -r line; do
  POST_TITLES+=("$line")
done < <(echo "$POSTS_JSON" | python3 -c "import json,sys;posts=json.load(sys.stdin);[print(p['title']) for p in posts]")

for i in "${!TEST_IDS[@]}"; do
  uid="${TEST_IDS[$i]}"
  name="${TEST_NAMES[$i]}"
  echo ""
  echo "[$name]"

  for j in "${!POST_IDS[@]}"; do
    pid="${POST_IDS[$j]}"
    ptitle="${POST_TITLES[$j]}"

    # 点赞
    lc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/likes" -H "$H" -H "$H2" -H "$H3" -H "$H4" -d "{\"post_id\":\"$pid\",\"user_id\":\"$uid\"}" 2>/dev/null || echo "fail")
    # 收藏
    bc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/bookmarks" -H "$H" -H "$H2" -H "$H3" -H "$H4" -d "{\"post_id\":\"$pid\",\"user_id\":\"$uid\"}" 2>/dev/null || echo "fail")
    # 评论
    cidx=$(( (i * ${#POST_IDS[@]} + j) % ${#COMMENTS[@]} ))
    ctext="${COMMENTS[$cidx]}"
    cc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/comments" -H "$H" -H "$H2" -H "$H3" -H "$H4" -d "{\"post_id\":\"$pid\",\"user_id\":\"$uid\",\"content\":\"$ctext\"}" 2>/dev/null || echo "fail")
    echo "  赞/收/评《$ptitle》: $lc/$bc/$cc"
  done

  # 关注
  fc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/follows" -H "$H" -H "$H2" -H "$H3" -H "$H4" -d "{\"follower_id\":\"$uid\",\"following_id\":\"$REAL_USER_ID\"}" 2>/dev/null || echo "fail")
  echo "  关注: $fc"
done

# 4. 创建通知
echo ""
echo "--- 创建通知 ---"
NOW=$(date +%s)

for i in "${!TEST_IDS[@]}"; do
  uid="${TEST_IDS[$i]}"
  name="${TEST_NAMES[$i]}"
  pidx=$(( i % ${#POST_IDS[@]} ))
  pid="${POST_IDS[$pidx]}"
  ptitle="${POST_TITLES[$pidx]}"

  # 评论通知
  t1=$((NOW - (5 - i) * 60))
  t1s=$(date -u -r $t1 +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || python3 -c "import datetime;print((datetime.datetime.utcfromtimestamp($t1)).isoformat()+'Z')")
  cc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/notifications" -H "$H" -H "$H2" -H "$H3" -H "$H4" \
    -d "{\"user_id\":\"$REAL_USER_ID\",\"type\":\"comment\",\"actor_id\":\"$uid\",\"post_id\":\"$pid\",\"content\":\"评论了你的作品《$ptitle》\",\"read\":false,\"created_at\":\"$t1s\"}" 2>/dev/null || echo "fail")

  # 点赞通知
  t2=$((NOW - (5 - i) * 120))
  t2s=$(date -u -r $t2 +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || python3 -c "import datetime;print((datetime.datetime.utcfromtimestamp($t2)).isoformat()+'Z')")
  lc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/notifications" -H "$H" -H "$H2" -H "$H3" -H "$H4" \
    -d "{\"user_id\":\"$REAL_USER_ID\",\"type\":\"like\",\"actor_id\":\"$uid\",\"post_id\":\"$pid\",\"content\":\"赞了你的作品《$ptitle》\",\"read\":false,\"created_at\":\"$t2s\"}" 2>/dev/null || echo "fail")

  # 收藏通知
  t3=$((NOW - (5 - i) * 180))
  t3s=$(date -u -r $t3 +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || python3 -c "import datetime;print((datetime.datetime.utcfromtimestamp($t3)).isoformat()+'Z')")
  bc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/notifications" -H "$H" -H "$H2" -H "$H3" -H "$H4" \
    -d "{\"user_id\":\"$REAL_USER_ID\",\"type\":\"bookmark\",\"actor_id\":\"$uid\",\"post_id\":\"$pid\",\"content\":\"收藏了你的作品《$ptitle》\",\"read\":false,\"created_at\":\"$t3s\"}" 2>/dev/null || echo "fail")

  # 关注通知
  t4=$((NOW - (5 - i) * 240))
  t4s=$(date -u -r $t4 +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || python3 -c "import datetime;print((datetime.datetime.utcfromtimestamp($t4)).isoformat()+'Z')")
  fc=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/rest/v1/notifications" -H "$H" -H "$H2" -H "$H3" -H "$H4" \
    -d "{\"user_id\":\"$REAL_USER_ID\",\"type\":\"follow\",\"actor_id\":\"$uid\",\"content\":\"关注了你\",\"read\":false,\"created_at\":\"$t4s\"}" 2>/dev/null || echo "fail")

  echo "  $name: 评论=$cc 点赞=$lc 收藏=$bc 关注=$fc"
done

echo ""
echo "=== 完成！刷新页面即可看到效果 ==="