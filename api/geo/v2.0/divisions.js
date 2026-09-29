module.exports = async (req, res) => {
  try {
    const upstream = await fetch('https://bdapis.vercel.app/geo/v2.0/divisions');
    const data = await upstream.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    res.status(upstream.status).json(data);
  } catch (error) {
    res.status(502).json({ success: false, error: 'Upstream geo API unavailable' });
  }
};
