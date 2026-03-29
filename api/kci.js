export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { title, page, displayCount } = req.query;
  const key = '94351029';
  const url = `https://open.kci.go.kr/po/openapi/openApiSearch.kci?apiCode=articleSearch&key=${key}&title=${encodeURIComponent(title || '')}&displayCount=${displayCount || 10}&page=${page || 1}`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(text);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}