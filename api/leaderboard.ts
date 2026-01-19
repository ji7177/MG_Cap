
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return new Response(JSON.stringify({ error: 'Redis configuration missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const key = 'hat_stacker_global_leaderboard';

  try {
    // GET: Fetch top scores
    if (req.method === 'GET') {
      const redisRes = await fetch(`${url}/ZRANGE/${key}/0/99/REV/WITHSCORES`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await redisRes.json();
      
      if (!data.result) return new Response(JSON.stringify([]), { status: 200 });

      const leaderboard = [];
      for (let i = 0; i < data.result.length; i += 2) {
        leaderboard.push({
          nickname: data.result[i],
          highScore: parseInt(data.result[i + 1], 10),
        });
      }
      return new Response(JSON.stringify(leaderboard), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST: Save score
    if (req.method === 'POST') {
      const body = await req.json();
      const { nickname, score } = body;

      if (!nickname || score === undefined) {
        return new Response(JSON.stringify({ error: 'Invalid data' }), { status: 400 });
      }

      // Using ZADD with GT flag to only update if score is higher
      await fetch(`${url}/`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(['ZADD', key, 'GT', score, nickname.toUpperCase()]),
      });

      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
}
